/**
 * Signal-plane key vault.
 *
 * ADR-012: this file has a separate SecureStore root, wrapping key and active instance.
 * It never imports the Forum signer and never accepts a Forum recovery phrase.
 */
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import type * as ExpoNotifications from 'expo-notifications';
import {
  SIGNAL_PATH,
  cryptoBackend,
  deriveSignalKey,
  ed25519,
  generateRootMnemonic,
  isValidMnemonic,
  messagingKeyPair,
  mnemonicToSeed,
  mldsa,
  openFirstMessage,
  sealFirstMessage,
  signalPrekeySignatureBytes,
  type HybridCiphertext,
  type MessagingPublicKey,
} from '@jagoo/sdk/crypto';
import {
  Plane,
  buildEnvelope,
  canonicalBytes,
  certificateSelfSignatureBytes,
  channelId,
  contentId as computeContentId,
  decodeSignedEnvelope,
  identityId,
  pqAttestationBytes,
  revocationAuthorizationBytes,
  sealEnvelope,
  type AuditCertificate,
  type ContextOf,
  type PublicIdentity,
  type SessionHandle,
  type SignalSigner,
  type SignedEnvelope,
} from '@jagoo/sdk';
import {
  ChannelDeclare,
  ChannelRetire,
  ChannelRotate,
  ChannelSubscribe,
  ChannelUpdate,
  ChannelVouch,
  ChannelKind,
  BroadcastEmit,
  BroadcastRevoke,
  CheckIn,
  MissingPersonReport,
  KeyCertificate,
  KeyRevocation,
  PrekeyBundle,
  ResourceReport,
  type RevokeReason,
  RevocationKind,
  SignalSessionInit,
  SignalMessage,
  SignalDeliveryReceipt,
  SignalGroupCreate,
  SignalGroupUpdate,
  SignalDirectoryProfile,
} from '@jagoo/sdk/proto';
import type { DiscoveredService } from '../data/node-config';
import { networkRequest } from '../data/request';
import { solvePow, type PowChallengeJson } from '../data/pow';
import {
  cacheSignalPrekey,
  cacheSignalInbox,
  clearSignalLocalData,
  loadCachedSignalInbox,
  loadCachedSignalPrekey,
  type CachedSignalSession,
} from '../features/signal/storage';
import { clearOutboxPlane, submitSignedEnvelope } from '../offline/outbox';

const ROOT_KEY = 'jb.signal.root.v1';
const CHANNEL_MAP_KEY = 'jb.signal.channels.v1';
const text = new TextEncoder();
const RNS_BINDING_PREFIX = text.encode('jb:signal:lxmf-binding:v1\0');
/** X25519 || Ed25519 — a Reticulum identity's public half. Mirrors the node's check. */
const RNS_PUBLIC_KEY_BYTES = 64;
const LXMF_DESTINATION_BYTES = 16;
const storeOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const base64 = (value: Uint8Array): string => globalThis.btoa(String.fromCharCode(...value));
const unbase64 = (value: string): Uint8Array =>
  Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));
const concat = (...values: readonly Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
};
async function digest(value: Uint8Array): Promise<Uint8Array> {
  return cryptoBackend().sha256(value);
}

interface VaultPayload {
  readonly version: 1;
  readonly salt: string;
  readonly nonce: string;
  readonly ciphertext: string;
  /**
   * Detects a wrong recovery salt on unlock.
   *
   * The BIP-39 recovery passphrase is deliberately NOT stored — a 25th word you keep on the
   * device is not a 25th word. But that creates the classic footgun: every salt is "valid",
   * so mistyping one silently derives a different identity instead of failing, and the user
   * discovers it when nobody can reach them. This is an HKDF output over the derived seed
   * under its own info label, so it proves the salt without revealing anything about it.
   *
   * Optional: vaults created before this field existed unlock without the check.
   */
  readonly seedCheck?: string;
}

const SEED_CHECK_INFO = text.encode('jb:signal:vault-seed-check:v1');

function seedCheckOf(rootSeed: Uint8Array): string {
  return base64(cryptoBackend().hkdfSha256(rootSeed, undefined, SEED_CHECK_INFO, 32));
}

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await networkRequest(new URL(path, `${baseUrl.replace(/\/+$/, '')}/`).toString(), {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as T & { readonly detail?: string };
  if (!response.ok) throw new Error(payload.detail ?? `Node request failed with HTTP ${response.status}`);
  return payload;
}

export class SecureSignalSigner implements SignalSigner {
  readonly plane = Plane.SIGNAL;

  private constructor(
    private readonly wrappingKey: Uint8Array,
    private readonly rootSeedCache: Uint8Array,
  ) {}

  static async create(
    lockPassphrase: string,
    mnemonic = generateRootMnemonic(),
    recoveryPassphrase = '',
  ): Promise<SecureSignalSigner> {
    // Empty is allowed; short is not. Someone standing up an emergency identity under
    // pressure should not be blocked by a passphrase field, but a four-character one buys
    // nothing while looking like protection — the honest options are none or a real one.
    if (lockPassphrase.length > 0 && lockPassphrase.length < 8) {
      throw new Error('app passphrase must be at least 8 characters, or left empty');
    }
    if (!isValidMnemonic(mnemonic)) throw new Error('invalid Signal recovery phrase');
    const salt = await Crypto.getRandomBytesAsync(16);
    const nonce = await Crypto.getRandomBytesAsync(24);
    const wrappingKey = cryptoBackend().scrypt(text.encode(lockPassphrase), salt, {
      N: 1 << 16,
      r: 8,
      p: 1,
      dkLen: 32,
    });
    const ciphertext = cryptoBackend().xchacha20poly1305Seal(
      wrappingKey,
      nonce,
      text.encode(mnemonic.normalize('NFKD')),
      new Uint8Array(),
    );
    const rootSeed = mnemonicToSeed(mnemonic, recoveryPassphrase);
    await SecureStore.setItemAsync(
      ROOT_KEY,
      JSON.stringify({
        version: 1,
        salt: base64(salt),
        nonce: base64(nonce),
        ciphertext: base64(ciphertext),
        seedCheck: seedCheckOf(rootSeed),
      } satisfies VaultPayload),
      storeOptions,
    );
    await SecureStore.setItemAsync(CHANNEL_MAP_KEY, '{}', storeOptions);
    return new SecureSignalSigner(wrappingKey, rootSeed);
  }

  static async unlock(
    lockPassphrase: string,
    recoveryPassphrase = '',
  ): Promise<SecureSignalSigner> {
    const encoded = await SecureStore.getItemAsync(ROOT_KEY, storeOptions);
    if (!encoded) throw new Error('Signal identity is not configured');
    const payload = JSON.parse(encoded) as VaultPayload;
    if (payload.version !== 1) throw new Error('unsupported Signal vault version');
    const wrappingKey = cryptoBackend().scrypt(
      text.encode(lockPassphrase),
      unbase64(payload.salt),
      {
        N: 1 << 16,
        r: 8,
        p: 1,
        dkLen: 32,
      },
    );
    let mnemonic = '';
    try {
      mnemonic = new TextDecoder().decode(
        cryptoBackend().xchacha20poly1305Open(
          wrappingKey,
          unbase64(payload.nonce),
          unbase64(payload.ciphertext),
          new Uint8Array(),
        ),
      );
      if (!isValidMnemonic(mnemonic)) throw new Error('invalid recovered mnemonic');
    } catch {
      wrappingKey.fill(0);
      throw new Error('app passphrase is incorrect');
    }

    const rootSeed = mnemonicToSeed(mnemonic, recoveryPassphrase);
    // Without this, a mistyped recovery salt produces a perfectly valid DIFFERENT identity
    // and the user finds out when nobody can reach them.
    if (payload.seedCheck && payload.seedCheck !== seedCheckOf(rootSeed)) {
      wrappingKey.fill(0);
      rootSeed.fill(0);
      throw new Error(
        recoveryPassphrase
          ? 'recovery salt is incorrect for this vault'
          : 'this vault was created with a recovery salt — enter it to unlock',
      );
    }
    return new SecureSignalSigner(wrappingKey, rootSeed);
  }

  static async exists(): Promise<boolean> {
    return (await SecureStore.getItemAsync(ROOT_KEY, storeOptions)) !== null;
  }

  /**
   * Decrypt and return the stored mnemonic, for showing a backup the user still owes.
   *
   * Deliberately not a method on an unlocked instance: an instance holds a root seed, not a
   * mnemonic, and adding one would mean keeping the mnemonic alive for the session. The
   * wrapping key is zeroed on every path out of here, success included.
   */
  static async recoveryPhrase(lockPassphrase: string, recoveryPassphrase = ''): Promise<string> {
    const encoded = await SecureStore.getItemAsync(ROOT_KEY, storeOptions);
    if (!encoded) throw new Error('Signal identity is not configured');
    const payload = JSON.parse(encoded) as VaultPayload;
    if (payload.version !== 1) throw new Error('unsupported Signal vault version');
    const wrappingKey = cryptoBackend().scrypt(
      text.encode(lockPassphrase),
      unbase64(payload.salt),
      { N: 1 << 16, r: 8, p: 1, dkLen: 32 },
    );
    try {
      const mnemonic = new TextDecoder().decode(
        cryptoBackend().xchacha20poly1305Open(
          wrappingKey,
          unbase64(payload.nonce),
          unbase64(payload.ciphertext),
          new Uint8Array(),
        ),
      );
      if (!isValidMnemonic(mnemonic)) throw new Error('invalid recovered mnemonic');
      // Same guard as `unlock`: a wrong recovery salt otherwise yields a perfectly valid
      // phrase for a DIFFERENT identity, which someone would then write down as theirs.
      const rootSeed = mnemonicToSeed(mnemonic, recoveryPassphrase);
      const check = payload.seedCheck && payload.seedCheck !== seedCheckOf(rootSeed);
      rootSeed.fill(0);
      if (check) throw new Error('recovery salt is incorrect for this vault');
      return mnemonic;
    } catch (error) {
      throw error instanceof Error && /recovery salt/.test(error.message)
        ? error
        : new Error('app passphrase is incorrect');
    } finally {
      wrappingKey.fill(0);
    }
  }

  /** CRS-19: available before unlock and deletes only the Signal-plane vault. */
  static async panicConfiguredVault(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ROOT_KEY, storeOptions),
      SecureStore.deleteItemAsync(CHANNEL_MAP_KEY, storeOptions),
    ]);
  }

  private async rootSeed(): Promise<Uint8Array> {
    return Uint8Array.from(this.rootSeedCache);
  }

  private async channelMap(): Promise<Record<string, number>> {
    return JSON.parse((await SecureStore.getItemAsync(CHANNEL_MAP_KEY, storeOptions)) ?? '{}') as Record<
      string,
      number
    >;
  }

  private async contextSeed(ctx: ContextOf<Plane.SIGNAL>): Promise<Uint8Array> {
    const root = await this.rootSeed();
    try {
      if (ctx.kind === 'device') return deriveSignalKey(root, SIGNAL_PATH.DEVICE);
      const index = (await this.channelMap())[ctx.channelId];
      if (index === undefined) throw new Error('channel signing key is not present in this vault');
      return deriveSignalKey(root, SIGNAL_PATH.CHANNEL, index);
    } finally {
      root.fill(0);
    }
  }

  /**
   * The channels this vault can sign for. IDs only — no key material leaves the signer.
   *
   * This, not the node's channel list, is the authoritative set for any "which channel am I
   * publishing as" control: `contextSeed` throws `channel signing key is not present in this
   * vault` for anything absent here, so offering a channel the node knows but this device
   * cannot sign for would offer a choice that always fails.
   */
  async ownedChannelIds(): Promise<readonly string[]> {
    return Object.keys(await this.channelMap());
  }

  async createChannelIdentity(index?: number): Promise<PublicIdentity & { readonly channelId: string }> {
    const mapping = await this.channelMap();
    const nextIndex = index ?? Math.max(-1, ...Object.values(mapping)) + 1;
    const root = await this.rootSeed();
    try {
      const seed = deriveSignalKey(root, SIGNAL_PATH.CHANNEL, nextIndex);
      try {
        const publicKey = ed25519.derivePublicKey(seed);
        const id = channelId(publicKey);
        mapping[id] = nextIndex;
        await SecureStore.setItemAsync(CHANNEL_MAP_KEY, JSON.stringify(mapping), storeOptions);
        return { id: identityId(publicKey), channelId: id, publicKey, plane: Plane.SIGNAL };
      } finally {
        seed.fill(0);
      }
    } finally {
      root.fill(0);
    }
  }

  async adoptChannelRotation(previousChannel: string, nextChannel: string): Promise<void> {
    const mapping = await this.channelMap();
    const nextIndex = mapping[nextChannel];
    if (nextIndex === undefined) throw new Error('replacement channel key is not present in this vault');
    mapping[previousChannel] = nextIndex;
    await SecureStore.setItemAsync(CHANNEL_MAP_KEY, JSON.stringify(mapping), storeOptions);
  }

  async identity(ctx: ContextOf<Plane.SIGNAL>): Promise<PublicIdentity> {
    const seed = await this.contextSeed(ctx);
    try {
      const publicKey = ed25519.derivePublicKey(seed);
      return { id: identityId(publicKey), publicKey, plane: Plane.SIGNAL };
    } finally {
      seed.fill(0);
    }
  }

  async sign(ctx: ContextOf<Plane.SIGNAL>, bytes: Uint8Array): Promise<Uint8Array> {
    const seed = await this.contextSeed(ctx);
    try {
      return ed25519.sign(bytes, seed);
    } finally {
      seed.fill(0);
    }
  }

  async seal(
    ctx: ContextOf<Plane.SIGNAL>,
    input: {
      readonly domain: string;
      readonly body: Uint8Array;
      readonly scope?: string;
      readonly parent?: string;
      readonly antiAbuse?: Parameters<typeof buildEnvelope>[0]['antiAbuse'];
      readonly nowMs?: bigint;
    },
  ): Promise<{ envelope: SignedEnvelope; contentId: string; wireBytes: Uint8Array }> {
    const identity = await this.identity(ctx);
    const unsigned = buildEnvelope({
      domain: input.domain,
      plane: Plane.SIGNAL,
      authorKey: identity.publicKey,
      body: input.body,
      nowMs: input.nowMs ?? BigInt(Date.now()),
      nonce: await Crypto.getRandomBytesAsync(16),
      scope: input.scope,
      parent: input.parent,
      antiAbuse: input.antiAbuse,
    });
    return sealEnvelope(unsigned, await this.sign(ctx, canonicalBytes(unsigned)));
  }

  /**
   * The ML-DSA-44 key a context certifies itself with.
   *
   * One derivation, two callers, deliberately: `ChannelDeclare.pq_key` and the channel's
   * certificate MUST name the same post-quantum key, or a subscriber verifying against the
   * declaration and a node verifying against the certificate hold two different PQ
   * identities for one channel. The separators differ per context and are unchanged from
   * where each used to live.
   */
  private async certificatePqKeyPair(ctx: ContextOf<Plane.SIGNAL>) {
    const seed = await this.contextSeed(ctx);
    try {
      const separator =
        ctx.kind === 'channel' ? 'jb:signal:channel:pq:v1\0' : 'jb:signal:certificate:pq:v1\0';
      return mldsa.generateKeyPair(await digest(concat(text.encode(separator), seed)));
    } finally {
      seed.fill(0);
    }
  }

  /**
   * A self-signed certificate for ANY Signal context, not only the device.
   *
   * A channel's signing key is derived per channel (`m/83696968'/21'/c'`, Plans/01 §4) and
   * arrives at the node having never been seen. Pipeline step 10 rejects it — "author key is
   * not certified" — so `jb:channel:declare:v1` could not be published at all, and neither
   * could any broadcast, update, rotation or retirement, because every one of those is
   * signed by the channel key too. The bootstrap exception `jb:key:certify:signal:v1` exists
   * for exactly this and was simply never pointed at a channel.
   */
  async certificateBody(
    ctx: ContextOf<Plane.SIGNAL> = { kind: 'device' },
    validFromMs = BigInt(Date.now() - 60_000),
    validUntilMs = BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000),
  ): Promise<Uint8Array> {
    const seed = await this.contextSeed(ctx);
    try {
      const deviceKey = ed25519.derivePublicKey(seed);
      const pq = await this.certificatePqKeyPair(ctx);
      try {
        const fields = {
          plane: Plane.SIGNAL,
          deviceKey,
          pqKey: pq.publicKey,
          validFrom: validFromMs,
          validUntil: validUntilMs,
        };
        const attestation = mldsa.attest(pqAttestationBytes(fields), pq.secretKey);
        return KeyCertificate.encode(
          KeyCertificate.fromPartial({
            plane: 2,
            device_key: deviceKey,
            pq_key: pq.publicKey,
            pq_attestation: attestation,
            valid_from: validFromMs,
            valid_until: validUntilMs,
            self_signature: ed25519.sign(
              certificateSelfSignatureBytes(fields, attestation),
              seed,
            ),
          }),
        ).finish();
      } finally {
        pq.secretKey.fill(0);
      }
    } finally {
      seed.fill(0);
    }
  }

  private async messagingKeys() {
    const root = await this.rootSeed();
    try {
      const xSeed = deriveSignalKey(root, SIGNAL_PATH.MESSAGING, 0);
      const kemSeed = concat(
        deriveSignalKey(root, SIGNAL_PATH.MESSAGING, 1),
        deriveSignalKey(root, SIGNAL_PATH.MESSAGING, 2),
      );
      try {
        return messagingKeyPair(xSeed, kemSeed);
      } finally {
        xSeed.fill(0);
        kemSeed.fill(0);
      }
    } finally {
      root.fill(0);
    }
  }

  async messagingPublicKey(): Promise<MessagingPublicKey> {
    const keys = await this.messagingKeys();
    try {
      return {
        x25519: Uint8Array.from(keys.publicKey.x25519),
        mlKem768: Uint8Array.from(keys.publicKey.mlKem768),
      };
    } finally {
      keys.secretKey.x25519.fill(0);
      keys.secretKey.mlKem768.fill(0);
    }
  }

  /**
   * Reticulum identities are X25519 || Ed25519 private material.  This tree never shares
   * the legacy custom-message or prekey keys, so attaching an LXMF address cannot link
   * those two protocols cryptographically.
   */
  async rnsTransportIdentity(): Promise<{
    readonly privateKey: Uint8Array;
    readonly publicKey: Uint8Array;
  }> {
    const root = await this.rootSeed();
    try {
      const x25519 = deriveSignalKey(root, SIGNAL_PATH.RNS_TRANSPORT, 0);
      const ed25519Seed = deriveSignalKey(root, SIGNAL_PATH.RNS_TRANSPORT, 1);
      try {
        return {
          privateKey: concat(x25519, ed25519Seed),
          publicKey: concat(cryptoBackend().x25519PublicKey(x25519), ed25519.derivePublicKey(ed25519Seed)),
        };
      } finally {
        x25519.fill(0);
        ed25519Seed.fill(0);
      }
    } finally {
      root.fill(0);
    }
  }

  async channelPqPublicKey(channel: string): Promise<Uint8Array> {
    // Shares `certificatePqKeyPair` so the key in `ChannelDeclare.pq_key` is the same one
    // the channel's certificate attests. Two derivations here would be two PQ identities.
    const pq = await this.certificatePqKeyPair({ kind: 'channel', channelId: channel });
    try {
      return Uint8Array.from(pq.publicKey);
    } finally {
      pq.secretKey.fill(0);
    }
  }

  async prekeyBody(validUntilMs = BigInt(Date.now() + 30 * 24 * 60 * 60 * 1000)): Promise<Uint8Array> {
    const deviceSeed = await this.contextSeed({ kind: 'device' });
    const root = await this.rootSeed();
    try {
      const identityKey = ed25519.derivePublicKey(deviceSeed);
      const signedPrekeySeed = deriveSignalKey(root, SIGNAL_PATH.PREKEY, 0);
      const messaging = await this.messagingKeys();
      const oneTimeSeed = deriveSignalKey(root, SIGNAL_PATH.PREKEY, 1);
      try {
        const signedPrekey = cryptoBackend().x25519PublicKey(signedPrekeySeed);
        const kemPublicKey = messaging.publicKey.mlKem768;
        const signature = ed25519.sign(
          signalPrekeySignatureBytes({
            identityKey,
            signedPrekey,
            kemPublicKey,
            validUntilMs,
          }),
          deviceSeed,
        );
        return PrekeyBundle.encode(
          PrekeyBundle.fromPartial({
            identity_key: identityKey,
            signed_prekey: signedPrekey,
            signed_prekey_sig: signature,
            kem_public_key: kemPublicKey,
            one_time_prekeys: [cryptoBackend().x25519PublicKey(oneTimeSeed)],
            valid_until_ms: validUntilMs,
          }),
        ).finish();
      } finally {
        signedPrekeySeed.fill(0);
        oneTimeSeed.fill(0);
        messaging.secretKey.x25519.fill(0);
        messaging.secretKey.mlKem768.fill(0);
      }
    } finally {
      deviceSeed.fill(0);
      root.fill(0);
    }
  }

  async sealFirstMessage(
    recipient: MessagingPublicKey,
    plaintext: Uint8Array,
    sessionContext: string,
  ): Promise<HybridCiphertext> {
    return sealFirstMessage(
      recipient,
      plaintext,
      text.encode(sessionContext.normalize('NFC')),
      await Crypto.getRandomBytesAsync(32),
      await Crypto.getRandomBytesAsync(32),
      await Crypto.getRandomBytesAsync(12),
    );
  }

  async openFirstMessage(
    message: HybridCiphertext,
    sessionContext: string,
  ): Promise<Uint8Array> {
    const root = await this.rootSeed();
    const messaging = await this.messagingKeys();
    const prekeySeed = deriveSignalKey(root, SIGNAL_PATH.PREKEY, 0);
    try {
      return openFirstMessage(
        {
          x25519: prekeySeed,
          mlKem768: messaging.secretKey.mlKem768,
        },
        message,
        text.encode(sessionContext.normalize('NFC')),
      );
    } finally {
      root.fill(0);
      prekeySeed.fill(0);
      messaging.secretKey.x25519.fill(0);
      messaging.secretKey.mlKem768.fill(0);
    }
  }

  async agree(_peer: PublicIdentity, _kemCiphertext?: Uint8Array): Promise<SessionHandle> {
    throw new Error('use the published hybrid prekey bundle to create a Signal session');
  }

  async prepareDuressRevocation(): Promise<Uint8Array> {
    const seed = await this.contextSeed({ kind: 'device' });
    try {
      const revokedKey = ed25519.derivePublicKey(seed);
      const effectiveFromMs = BigInt(Date.now());
      const fields = {
        plane: Plane.SIGNAL,
        revokedKey,
        kind: RevocationKind.REVOCATION_KIND_DURESS,
        effectiveFromMs,
        replacementKey: new Uint8Array(),
      };
      return KeyRevocation.encode(
        KeyRevocation.fromPartial({
          plane: 2,
          revoked_key: revokedKey,
          kind: fields.kind,
          effective_from_ms: effectiveFromMs,
          authorization_signature: ed25519.sign(revocationAuthorizationBytes(fields), seed),
        }),
      ).finish();
    } finally {
      seed.fill(0);
    }
  }

  async panic(): Promise<void> {
    await SecureSignalSigner.panicConfiguredVault();
    this.lock();
  }

  lock(): void {
    this.rootSeedCache.fill(0);
    this.wrappingKey.fill(0);
  }
}

let activeSigner: SecureSignalSigner | null = null;
let activeAccessToken: string | null = null;

export interface SignalSessionSummary {
  readonly configured: boolean;
  readonly unlocked: boolean;
  readonly authenticated: boolean;
  readonly identityId?: string;
  readonly identityKeyHex?: string;
}

async function submit(
  baseUrl: string,
  wireBytes: Uint8Array,
  auditServices: readonly DiscoveredService[],
  _authorization?: string,
): Promise<{
  readonly contentId: string;
  readonly pending: boolean;
  readonly certificate?: AuditCertificate;
}> {
  const envelope = decodeSignedEnvelope(wireBytes);
  const result = await submitSignedEnvelope({
    baseUrl,
    wireBytes,
    contentId: computeContentId(envelope),
    plane: envelope.plane,
    priority: envelope.priority,
    auditServices,
  });
  return {
    contentId: result.contentId,
    pending: result.pending,
    ...(result.certificate ? { certificate: result.certificate } : {}),
  };
}

/**
 * Reopen the Signal vault after a cold start. The Forum plane has always had this; Signal
 * never did, and that asymmetry is the whole bug.
 *
 * ── What it looked like ─────────────────────────────────────────────────────────────
 * `activeSigner` is module state and starts every launch empty, so after the process died
 * — a reload, a swipe-away, an OS kill — every Signal action threw
 * `Unlock your Signal identity first`: sending a message, emitting a broadcast, declaring a
 * channel, publishing prekeys. Nothing said "signed out"; each surface reported its own
 * failure, so one missing restore read as several unrelated broken features. The only way
 * back was to find Signal → "Your identity and code" and unlock by hand, which nothing on
 * the failing screens told you.
 *
 * ── Why it opens silently, and when it must not ─────────────────────────────────────
 * The empty passphrase is tried and ONLY the empty passphrase. A vault created with
 * device-lock protection is wrapped under it and reopens with no prompt, exactly as
 * `restoreForumSession` does for its plane. A vault the person put a passphrase on throws
 * here and stays locked — that is the protection they asked for, and the Signal identity
 * screen prompts for it. A recovery salt likewise cannot be guessed, so a salted vault
 * stays locked too.
 *
 * Every failure is swallowed and reported through the summary. Being offline, or having a
 * passphrase, is the ordinary case and must not surface as an error.
 */
export async function restoreSignalSession(
  baseUrl: string | null,
  auditServices: readonly DiscoveredService[] = [],
): Promise<SignalSessionSummary> {
  if (!(await SecureSignalSigner.exists())) return signalSessionSummary();
  if (!activeSigner) {
    try {
      activeSigner = await SecureSignalSigner.unlock('');
    } catch {
      // Passphrase- or salt-protected. The identity screen asks; nothing else may.
      return signalSessionSummary();
    }
  }
  if (baseUrl && !activeAccessToken) {
    try {
      await authenticateSignalIdentity(baseUrl);
    } catch {
      // The node has never seen this key, or it is unreachable. Certifying is the one
      // recovery that is safe to attempt unprompted: it is idempotent, it publishes only
      // this key's own self-signed certificate, and without it authentication can never
      // succeed on a node that was reinstalled or switched.
      try {
        await registerSignalIdentity(baseUrl, auditServices);
        await authenticateSignalIdentity(baseUrl);
      } catch {
        // Offline. The vault is open, which is what the local screens need.
      }
    }
  }
  return signalSessionSummary();
}

export async function signalSessionSummary(): Promise<SignalSessionSummary> {
  const configured = await SecureSignalSigner.exists();
  const identity = activeSigner ? await activeSigner.identity({ kind: 'device' }) : null;
  return {
    configured,
    unlocked: activeSigner !== null,
    authenticated: activeAccessToken !== null,
    ...(identity
      ? {
          identityId: identity.id,
          identityKeyHex: [...identity.publicKey]
            .map((value) => value.toString(16).padStart(2, '0'))
            .join(''),
        }
      : {}),
  };
}

/**
 * The optional BIP-39 recovery salt — the "25th word".
 *
 * It is mixed into seed derivation and never stored, so the same 24 words with and without
 * it are two unrelated identities. That is the point: a coerced disclosure of the phrase
 * alone does not yield the identity. It also means losing it is unrecoverable, which is why
 * every entry point takes it explicitly rather than defaulting silently.
 */
export async function createSignalIdentity(
  lockPassphrase: string,
  recoverySalt = '',
): Promise<{ readonly recoveryPhrase: string; readonly identityId: string }> {
  const recoveryPhrase = generateRootMnemonic();
  activeSigner?.lock();
  activeSigner = await SecureSignalSigner.create(lockPassphrase, recoveryPhrase, recoverySalt);
  activeAccessToken = null;
  return {
    recoveryPhrase,
    identityId: (await activeSigner.identity({ kind: 'device' })).id,
  };
}

export async function importSignalIdentity(
  recoveryPhrase: string,
  lockPassphrase: string,
  recoverySalt = '',
): Promise<string> {
  if (!isValidMnemonic(recoveryPhrase.trim())) throw new Error('Enter a valid 24-word phrase');
  activeSigner?.lock();
  activeSigner = await SecureSignalSigner.create(
    lockPassphrase,
    recoveryPhrase.trim().replace(/\s+/g, ' '),
    recoverySalt,
  );
  activeAccessToken = null;
  return (await activeSigner.identity({ kind: 'device' })).id;
}

export async function unlockSignalIdentity(
  lockPassphrase: string,
  recoverySalt = '',
): Promise<string> {
  activeSigner?.lock();
  activeSigner = await SecureSignalSigner.unlock(lockPassphrase, recoverySalt);
  activeAccessToken = null;
  return (await activeSigner.identity({ kind: 'device' })).id;
}

/**
 * Read the Signal recovery phrase back out of the vault, for the backup onboarding deferred.
 *
 * The passphrase is required again rather than the phrase being kept in memory after
 * unlock. Only the root SEED is memoised for an unlocked signer (and zeroed on lock or
 * panic); holding the mnemonic — from which every future key can be re-derived, and which
 * a person could be compelled to reveal — for the whole life of a session would be a
 * strictly larger secret held strictly longer, to save one prompt. For a device-lock vault
 * the passphrase is the empty string, so there is no prompt to save.
 *
 * The phrase is returned, never logged and never persisted anywhere by this function.
 */
export async function revealSignalRecoveryPhrase(
  lockPassphrase = '',
  recoverySalt = '',
): Promise<string> {
  return SecureSignalSigner.recoveryPhrase(lockPassphrase, recoverySalt);
}

export function lockSignalIdentity(): void {
  activeSigner?.lock();
  activeSigner = null;
  activeAccessToken = null;
}

/**
 * A proof-of-work challenge for one author key. Each is bound to the key that will sign, so
 * an envelope signed by a channel key cannot reuse the device key's challenge.
 */
async function powChallengeFor(baseUrl: string, authorKey: Uint8Array): Promise<PowChallengeJson> {
  return requestJson<PowChallengeJson>(baseUrl, '/v1/credits/challenge', {
    method: 'POST',
    body: JSON.stringify({ author_key: base64(authorKey) }),
  });
}

export async function registerSignalIdentity(
  baseUrl: string,
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  const identity = await activeSigner.identity({ kind: 'device' });
  const pow = await solvePow(
    await powChallengeFor(baseUrl, identity.publicKey),
    identity.publicKey,
  );
  const certificate = await activeSigner.seal(
    { kind: 'device' },
    {
      domain: 'jb:key:certify:signal:v1',
      body: await activeSigner.certificateBody(),
      antiAbuse: {
        credential: new Uint8Array(),
        nullifier: new Uint8Array(),
        epoch: 0,
        pow,
      },
    },
  );
  await submit(baseUrl, certificate.wireBytes, auditServices);
  return identity.id;
}

export async function authenticateSignalIdentity(baseUrl: string): Promise<void> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  const identity = await activeSigner.identity({ kind: 'device' });
  const challenge = await requestJson<{
    readonly challenge: string;
    readonly claim: string;
  }>(
    baseUrl,
    `/v1/auth/challenge?public_key=${encodeURIComponent(base64(identity.publicKey))}`,
  );
  const challengeBytes = unbase64(challenge.challenge);
  const signature = await activeSigner.sign(
    { kind: 'device' },
    concat(text.encode('jb-auth-v1\0login\0'), identity.publicKey, challengeBytes),
  );
  const tokens = await requestJson<{ readonly accessToken: string }>(baseUrl, '/v1/auth', {
    method: 'POST',
    body: JSON.stringify({
      public_key: base64(identity.publicKey),
      challenge: challenge.challenge,
      claim: challenge.claim,
      signature: base64(signature),
    }),
  });
  activeAccessToken = tokens.accessToken;
}

/**
 * An authenticated Signal read, with one silent re-authentication on a rejected token.
 *
 * ── Why a retry rather than a longer-lived token ────────────────────────────────────
 * Access tokens are HMACed with `AUTH_ACCESS_SECRET`, and a node started without one
 * generates a fresh random key per boot (`backend/.env.example`) — so every node restart
 * invalidates every outstanding token. Nothing recovered from that: the vault stayed
 * unlocked, `activeAccessToken` stayed set, and every guarded read answered
 * `access token is invalid` for ever, because the only code that mints a token runs when
 * there is NO token. Re-authenticating needs no user input — it is a signature over a
 * challenge with a key this device already holds unlocked — so the honest behaviour is to
 * do it and retry, not to report a protocol error to someone who was starting a
 * conversation.
 *
 * Exactly one retry. A node that rejects a freshly minted token is saying something real
 * (the key is not certified there, or it is revoked) and that must surface, not spin.
 */
export async function signalSessionRequest<T>(baseUrl: string, path: string): Promise<T> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  if (!activeAccessToken) await authenticateSignalIdentity(baseUrl);
  try {
    return await requestJson<T>(baseUrl, path, {
      headers: { Authorization: `Bearer ${activeAccessToken}` },
    });
  } catch (error) {
    if (!isInvalidTokenError(error)) throw error;
    activeAccessToken = null;
    await authenticateSignalIdentity(baseUrl);
    return requestJson<T>(baseUrl, path, {
      headers: { Authorization: `Bearer ${activeAccessToken}` },
    });
  }
}

/**
 * `requestJson` throws the node's `detail` string, so the 401 is recognised by what the node
 * said rather than by a status code the caller no longer has. Both auth-guarded controllers
 * answer with one of these two.
 */
function isInvalidTokenError(error: unknown): boolean {
  const detail = error instanceof Error ? error.message.toLowerCase() : '';
  return detail.includes('access token is invalid') || detail.includes('token has expired');
}

export async function publishSignalEnvelope(
  baseUrl: string,
  input: {
    readonly context: ContextOf<Plane.SIGNAL>;
    readonly domain: string;
    readonly body: Uint8Array;
    readonly scope?: string;
    readonly antiAbuse?: Parameters<typeof buildEnvelope>[0]['antiAbuse'];
  },
  auditServices: readonly DiscoveredService[] = [],
): Promise<{
  readonly contentId: string;
  readonly pending: boolean;
  readonly certificate?: AuditCertificate;
}> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  const sealed = await activeSigner.seal(input.context, input);
  return submit(baseUrl, sealed.wireBytes, auditServices, activeAccessToken ?? undefined);
}

/** Channel IDs this device holds a signing key for. Empty when the vault is locked. */
export async function ownedSignalChannels(): Promise<readonly string[]> {
  return activeSigner ? activeSigner.ownedChannelIds() : [];
}

export async function signalRnsTransportIdentity(): Promise<{
  readonly privateKey: Uint8Array;
  readonly publicKey: Uint8Array;
}> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  return activeSigner.rnsTransportIdentity();
}

export interface SignalDirectoryProfileInput {
  readonly displayName: string;
  readonly bio?: string;
  readonly claims?: readonly { readonly kind: number; readonly value: string; readonly proof?: string; readonly assertedAtMs?: bigint }[];
  readonly languages?: readonly string[];
  readonly discoverable: boolean;
  readonly revision: bigint;
  /**
   * Optional. Present only when a Reticulum stack is running and has announced a
   * destination; the profile is complete and searchable without it.
   *
   * It used to be required, which made claiming a username a Reticulum feature by
   * accident: the hash can only come from a live RNS stack, RNS runs on an Android
   * development build and nowhere else, and so nobody on iOS could be found by name at all
   * — while the search that finds them and the messaging that reaches them need no radio.
   */
  readonly lxmfDestinationHash?: Uint8Array;
}

/** Publish the searchable Signal-only profile, binding it to LXMF when one is running. */
export async function publishSignalDirectoryProfile(
  baseUrl: string,
  input: SignalDirectoryProfileInput,
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  const signer = activeSigner;
  const destination = input.lxmfDestinationHash;
  // The RNS transport key is derived from the Signal seed and needs no running stack, but
  // deriving it at all is pointless with no destination to bind it to — and an unbound key
  // in the envelope is a partial binding, which the node rejects.
  const transport = destination ? await signer.rnsTransportIdentity() : null;
  try {
    /*
      Check the binding's shape HERE, not at the node.

      `SignalDirectoryProfileHandler.validate` accepts a binding that is wholly absent or
      wholly valid and rejects everything between, so a transport key that is not exactly
      64 bytes (X25519 || Ed25519) comes back as `rns_public_key must be 64 bytes` — a
      server-side protocol error surfaced to someone who was typing a username, with no
      indication that the mesh transport is what went wrong. Whatever produced the wrong
      length is on this device, so this device is where it has to be named.
    */
    if (transport && destination) {
      if (transport.publicKey.length !== RNS_PUBLIC_KEY_BYTES) {
        throw new Error(
          `The mesh transport key is ${transport.publicKey.length} bytes, not ${RNS_PUBLIC_KEY_BYTES}. ` +
            'Your username can still be published without a mesh address — stop RNS and try again.',
        );
      }
      if (destination.length !== LXMF_DESTINATION_BYTES) {
        throw new Error(
          `The LXMF destination is ${destination.length} bytes, not ${LXMF_DESTINATION_BYTES}. ` +
            'Restart the Signal transport and try again.',
        );
      }
    }
    const bound = transport && destination
      ? {
          rns_public_key: transport.publicKey,
          lxmf_destination_hash: destination,
          transport_binding_sig: await signer.sign(
            { kind: 'device' },
            concat(RNS_BINDING_PREFIX, transport.publicKey, destination),
          ),
        }
      : {};
    const body = SignalDirectoryProfile.encode(
      SignalDirectoryProfile.fromPartial({
        display_name: input.displayName,
        bio: input.bio ?? '',
        claims: input.claims?.map((claim) => ({
          kind: claim.kind,
          value: claim.value,
          proof: claim.proof ?? '',
          asserted_at_ms: claim.assertedAtMs ?? 0n,
        })) ?? [],
        ...bound,
        languages: [...(input.languages ?? [])],
        discoverable: input.discoverable,
        revision: input.revision,
      }),
    ).finish();
    return (
      await publishSignalEnvelope(
        baseUrl,
        { context: { kind: 'device' }, domain: 'jb:signal:profile:v1', body },
        auditServices,
      )
    ).contentId;
  } finally {
    transport?.privateKey.fill(0);
    transport?.publicKey.fill(0);
  }
}

export async function publishSignalPrekeys(
  baseUrl: string,
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  return (
    await publishSignalEnvelope(
      baseUrl,
      {
        context: { kind: 'device' },
        domain: 'jb:message:prekeys:v1',
        body: await activeSigner.prekeyBody(),
      },
      auditServices,
    )
  ).contentId;
}

async function nativePushToken(): Promise<string> {
  if (!Device.isDevice) throw new Error('Push delivery requires a physical device');
  // Push is explicit opt-in, so ordinary Signal startup does not eagerly load
  // the notification provider runtime. Metro supports a deferred CommonJS
  // require here, while the project's TypeScript module target rejects import().
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Notifications = require('expo-notifications') as typeof ExpoNotifications;
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (permission.status !== 'granted') {
    throw new Error('Notification permission was not granted');
  }
  const token = await Notifications.getDevicePushTokenAsync();
  return typeof token.data === 'string' ? token.data : JSON.stringify(token.data);
}

/**
 * SB-02: this is deliberately separate from local filtering. Calling it discloses a provider
 * token to the selected home node, and the UI must obtain explicit consent first.
 */
export async function publishSignalPushSubscription(
  baseUrl: string,
  channel: string,
  enabled: boolean,
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  if (!activeAccessToken) throw new Error('Authenticate the Signal identity first');
  const token = enabled ? text.encode(await nativePushToken()) : new Uint8Array();
  return (
    await publishSignalEnvelope(
      baseUrl,
      {
        context: { kind: 'device' },
        domain: 'jb:channel:subscribe:v1',
        scope: channel,
        body: ChannelSubscribe.encode(
          ChannelSubscribe.fromPartial({
            channel,
            push: enabled,
            push_token: token,
          }),
        ).finish(),
      },
      auditServices,
    )
  ).contentId;
}

/**
 * Publish a channel key's self-signed certificate. Must precede anything that key signs.
 *
 * ── Why a channel needs this at all ─────────────────────────────────────────────────
 * A channel signs with its OWN derived key (Plans/01 §4, `m/83696968'/21'/c'`), not the
 * device key `registerSignalIdentity` certified. That key reaches the node having never been
 * seen, so pipeline step 10 rejects with "author key is not certified" — the declaration
 * first, and then every broadcast, update, rotation and retirement after it, because all of
 * those are signed by the channel key too.
 *
 * `jb:key:certify:signal:v1` is the bootstrap exception built for precisely this
 * (`requires_certificate: false`, ADR-004). It is safe here for the same reason it is safe
 * for a device: the handler re-establishes everything step 10 would have checked — the
 * certificate is ABOUT the key that signed the envelope, its Ed25519 self-signature
 * verifies, and its ML-DSA attestation verifies. It had simply never been pointed at a
 * channel.
 *
 * Its proof of work is separate because a PoW challenge is bound to one author key, and this
 * envelope is signed by the channel key rather than the device key.
 */
async function certifySignalChannelKey(
  baseUrl: string,
  channel: { readonly channelId: string; readonly publicKey: Uint8Array },
  auditServices: readonly DiscoveredService[],
): Promise<void> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  const context = { kind: 'channel', channelId: channel.channelId } as const;
  const pow = await solvePow(await powChallengeFor(baseUrl, channel.publicKey), channel.publicKey);
  await publishSignalEnvelope(
    baseUrl,
    {
      context,
      domain: 'jb:key:certify:signal:v1',
      body: await activeSigner.certificateBody(context),
      antiAbuse: {
        credential: new Uint8Array(),
        nullifier: new Uint8Array(),
        epoch: 0,
        pow,
      },
    },
    auditServices,
  );
}

export async function declareSignalChannel(
  baseUrl: string,
  input: {
    readonly name: string;
    readonly description: string;
    readonly language: string;
  },
  auditServices: readonly DiscoveredService[] = [],
): Promise<{ readonly channelId: string; readonly contentId: string }> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  const signer = activeSigner;
  const channel = await signer.createChannelIdentity();
  const context = { kind: 'channel', channelId: channel.channelId } as const;
  const messaging = await signer.messagingPublicKey();

  // Two proofs of work, because each is bound to one author key. Declaring a channel is
  // documented as one-time and expensive (Plans/04 §5).
  await certifySignalChannelKey(baseUrl, channel, auditServices);

  const pow = await solvePow(await powChallengeFor(baseUrl, channel.publicKey), channel.publicKey);
  const body = ChannelDeclare.encode(
    ChannelDeclare.fromPartial({
      channel_name: input.name,
      description: input.description,
      kind: ChannelKind.CHANNEL_KIND_ORGANISATION,
      signing_key: channel.publicKey,
      kem_public_key: messaging.mlKem768,
      pq_key: await signer.channelPqPublicKey(channel.channelId),
      language: input.language,
      valid_from: BigInt(Date.now()),
    }),
  ).finish();
  const published = await publishSignalEnvelope(
    baseUrl,
    {
      context,
      domain: 'jb:channel:declare:v1',
      body,
      antiAbuse: {
        credential: new Uint8Array(),
        nullifier: new Uint8Array(),
        epoch: 0,
        pow,
      },
    },
    auditServices,
  );
  return { channelId: channel.channelId, contentId: published.contentId };
}

export async function publishSignalCheckIn(
  baseUrl: string,
  input: {
    readonly status: number;
    readonly note: string;
    readonly area?: {
      readonly latE5: number;
      readonly lonE5: number;
      readonly radiusM: number;
      readonly placeName: string;
    };
  },
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  return (
    await publishSignalEnvelope(
      baseUrl,
      {
        context: { kind: 'device' },
        domain: 'jb:checkin:post:v1',
        body: CheckIn.encode(
          CheckIn.fromPartial({
            status: input.status,
            note: input.note,
            area: input.area
              ? {
                  lat_e5: input.area.latE5,
                  lon_e5: input.area.lonE5,
                  radius_m: input.area.radiusM,
                  place_name: input.area.placeName,
                }
              : undefined,
          }),
        ).finish(),
      },
      auditServices,
    )
  ).contentId;
}

export async function publishMissingPerson(
  baseUrl: string,
  input: {
    readonly name: string;
    readonly age: number;
    readonly description: string;
    readonly lastSeenPlace: string;
    readonly contactChannel: string;
    readonly status: number;
  },
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  return (
    await publishSignalEnvelope(
      baseUrl,
      {
        context: { kind: 'device' },
        domain: 'jb:missing:report:v1',
        body: MissingPersonReport.encode(
          MissingPersonReport.fromPartial({
            name: input.name,
            age: input.age,
            description: input.description,
            last_seen_place: input.lastSeenPlace,
            last_seen_at_ms: BigInt(Date.now()),
            contact_channel: input.contactChannel,
            status: input.status,
          }),
        ).finish(),
      },
      auditServices,
    )
  ).contentId;
}

export async function publishSignalResource(
  baseUrl: string,
  input: {
    readonly kind: number;
    readonly state: number;
    readonly detail: string;
    readonly latE5: number;
    readonly lonE5: number;
    readonly radiusM: number;
    readonly placeName: string;
  },
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  return (
    await publishSignalEnvelope(
      baseUrl,
      {
        context: { kind: 'device' },
        domain: 'jb:resource:report:v1',
        body: ResourceReport.encode(
          ResourceReport.fromPartial({
            kind: input.kind,
            state: input.state,
            detail: input.detail,
            area: {
              lat_e5: input.latE5,
              lon_e5: input.lonE5,
              radius_m: input.radiusM,
              place_name: input.placeName,
            },
            observed_at_ms: BigInt(Date.now()),
          }),
        ).finish(),
      },
      auditServices,
    )
  ).contentId;
}

export async function publishSignalBroadcast(
  baseUrl: string,
  input: {
    readonly channelId: string;
    readonly sequence: bigint;
    readonly severity: number;
    readonly category: number;
    readonly headline: string;
    readonly detail: string;
    readonly language: string;
    readonly expiresAtMs: bigint;
  },
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  return (
    await publishSignalEnvelope(
      baseUrl,
      {
        context: { kind: 'channel', channelId: input.channelId },
        domain: 'jb:broadcast:emit:v1',
        scope: input.channelId,
        body: BroadcastEmit.encode(
          BroadcastEmit.fromPartial({
            channel: input.channelId,
            sequence: input.sequence,
            severity: input.severity,
            category: input.category,
            headline: input.headline,
            detail: input.detail,
            language: input.language,
            expires_at_ms: input.expiresAtMs,
          }),
        ).finish(),
      },
      auditServices,
    )
  ).contentId;
}

export async function revokeSignalBroadcast(
  baseUrl: string,
  input: { readonly channelId: string; readonly target: string; readonly reason: RevokeReason; readonly note: string },
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  return (
    await publishSignalEnvelope(
      baseUrl,
      {
        context: { kind: 'channel', channelId: input.channelId },
        domain: 'jb:broadcast:revoke:v1',
        scope: input.channelId,
        body: BroadcastRevoke.encode(BroadcastRevoke.fromPartial({
          channel: input.channelId, target: input.target, reason: input.reason, note: input.note,
        })).finish(),
      },
      auditServices,
    )
  ).contentId;
}

async function publishSignalBody(
  baseUrl: string,
  domain: string,
  body: Uint8Array,
  auditServices: readonly DiscoveredService[],
  channelId?: string,
): Promise<string> {
  return (
    await publishSignalEnvelope(
      baseUrl,
      {
        context: channelId ? { kind: 'channel', channelId } : { kind: 'device' },
        domain,
        body,
        ...(channelId ? { scope: channelId } : {}),
      },
      auditServices,
    )
  ).contentId;
}

export const updateSignalChannel = (baseUrl: string, input: ChannelUpdate, audit: readonly DiscoveredService[] = []) =>
  publishSignalBody(baseUrl, 'jb:channel:update:v1', ChannelUpdate.encode(ChannelUpdate.fromPartial(input)).finish(), audit, input.channel);

export const rotateSignalChannel = (baseUrl: string, input: ChannelRotate, audit: readonly DiscoveredService[] = []) =>
  publishSignalBody(baseUrl, 'jb:channel:rotate:v1', ChannelRotate.encode(ChannelRotate.fromPartial(input)).finish(), audit, input.channel);

export async function updateOwnedSignalChannel(
  baseUrl: string,
  input: {
    readonly channel: string;
    readonly name: string;
    readonly description: string;
    readonly language: string;
  },
  audit: readonly DiscoveredService[] = [],
): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  const signing = await activeSigner.identity({ kind: 'channel', channelId: input.channel });
  const messaging = await activeSigner.messagingPublicKey();
  return updateSignalChannel(
    baseUrl,
    {
      channel: input.channel,
      patch: {
        channel_name: input.name,
        description: input.description,
        kind: ChannelKind.CHANNEL_KIND_ORGANISATION,
        categories: [],
        claims: [],
        signing_key: signing.publicKey,
        kem_public_key: messaging.mlKem768,
        pq_key: await activeSigner.channelPqPublicKey(input.channel),
        language: input.language,
        valid_from: BigInt(Date.now()),
      },
    },
    audit,
  );
}

export async function rotateOwnedSignalChannel(
  baseUrl: string,
  channel: string,
  audit: readonly DiscoveredService[] = [],
): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  const signer = activeSigner;
  const replacement = await signer.createChannelIdentity();
  const messaging = await signer.messagingPublicKey();
  // The replacement key signs every envelope after the rotation takes effect, so it needs
  // its own certificate for exactly the reason the declaration did. Certifying it first also
  // means KY-04 holds through the handover: the old key is still valid while the new one is
  // already certified, so there is no window in which the channel cannot publish at all.
  await certifySignalChannelKey(baseUrl, replacement, audit);
  const contentId = await rotateSignalChannel(
    baseUrl,
    {
      channel,
      new_signing_key: replacement.publicKey,
      new_kem_key: messaging.mlKem768,
      effective_from_ms: BigInt(Date.now() + 1_000),
    },
    audit,
  );
  await activeSigner.adoptChannelRotation(channel, replacement.channelId);
  return contentId;
}

export const retireSignalChannel = (baseUrl: string, input: ChannelRetire, audit: readonly DiscoveredService[] = []) =>
  publishSignalBody(baseUrl, 'jb:channel:retire:v1', ChannelRetire.encode(ChannelRetire.fromPartial(input)).finish(), audit, input.channel);

export const vouchSignalChannel = (baseUrl: string, input: ChannelVouch, audit: readonly DiscoveredService[] = []) =>
  publishSignalBody(baseUrl, 'jb:channel:vouch:v1', ChannelVouch.encode(ChannelVouch.fromPartial(input)).finish(), audit, input.channel);

export const sendSignalMessage = (baseUrl: string, input: SignalMessage, audit: readonly DiscoveredService[] = []) =>
  publishSignalBody(baseUrl, 'jb:message:signal:v1', SignalMessage.encode(SignalMessage.fromPartial(input)).finish(), audit);

export const publishSignalDeliveryReceipt = (baseUrl: string, input: SignalDeliveryReceipt, audit: readonly DiscoveredService[] = []) =>
  publishSignalBody(baseUrl, 'jb:message:receipt:v1', SignalDeliveryReceipt.encode(SignalDeliveryReceipt.fromPartial(input)).finish(), audit);

export const createSignalGroup = (baseUrl: string, input: SignalGroupCreate, audit: readonly DiscoveredService[] = []) =>
  publishSignalBody(baseUrl, 'jb:group:create:v1', SignalGroupCreate.encode(SignalGroupCreate.fromPartial(input)).finish(), audit);

export const updateSignalGroup = (baseUrl: string, input: SignalGroupUpdate, audit: readonly DiscoveredService[] = []) =>
  publishSignalBody(baseUrl, 'jb:group:update:v1', SignalGroupUpdate.encode(SignalGroupUpdate.fromPartial(input)).finish(), audit);

export async function revokeSignalKey(baseUrl: string, audit: readonly DiscoveredService[] = []): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  return publishSignalBody(baseUrl, 'jb:key:revoke:signal:v1', await activeSigner.prepareDuressRevocation(), audit);
}

interface NodePrekeyBundle {
  readonly identityKey: string;
  readonly signedPrekey: string;
  readonly signedPrekeySignature: string;
  readonly kemPublicKey: string;
  readonly oneTimePrekeys: readonly string[];
  readonly validUntilMs: number;
}

async function verifiedSignalPrekey(
  baseUrl: string,
  recipientKeyHex: string,
): Promise<NodePrekeyBundle> {
  const key = recipientKeyHex.toLowerCase();
  let prekey: NodePrekeyBundle;
  try {
    prekey = await requestJson<NodePrekeyBundle>(
      baseUrl,
      `/v1/signal/prekeys/${encodeURIComponent(key)}`,
    );
    verifyNodePrekey(key, prekey);
    await cacheSignalPrekey(key, prekey);
  } catch (error) {
    const cached = await loadCachedSignalPrekey(key);
    if (!cached) throw error;
    prekey = cached;
  }
  verifyNodePrekey(key, prekey);
  return prekey;
}

async function wrappedSignalGroupKey(
  baseUrl: string,
  memberKeys: readonly string[],
  context: string,
): Promise<Uint8Array> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  const senderKey = await Crypto.getRandomBytesAsync(32);
  try {
    const wraps = await Promise.all(
      memberKeys.map(async (recipient) => {
        if (!/^[0-9a-f]{64}$/i.test(recipient)) {
          throw new Error('Every group member key must be 64 hexadecimal characters.');
        }
        const prekey = await verifiedSignalPrekey(baseUrl, recipient);
        const encrypted = await activeSigner!.sealFirstMessage(
          {
            x25519: unbase64(prekey.signedPrekey),
            mlKem768: unbase64(prekey.kemPublicKey),
          },
          senderKey,
          `signal-group:${context}:${recipient.toLowerCase()}`,
        );
        return {
          recipient: recipient.toLowerCase(),
          kemCiphertext: base64(encrypted.kemCiphertext),
          ephemeralX25519: base64(encrypted.ephemeralX25519),
          ciphertext: base64(encrypted.ciphertext),
        };
      }),
    );
    return text.encode(JSON.stringify({ version: 1, algorithm: 'X25519+ML-KEM-768', wraps }));
  } finally {
    senderKey.fill(0);
  }
}

export async function createSecureSignalGroup(
  baseUrl: string,
  name: string,
  members: readonly string[],
  audit: readonly DiscoveredService[] = [],
): Promise<string> {
  const normalized = [...new Set(members.map((item) => item.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length < 2 || normalized.length > 64) {
    throw new Error('A Signal group needs 2 to 64 unique member keys.');
  }
  return createSignalGroup(
    baseUrl,
    {
      name: name.trim(),
      member_keys: normalized.map((item) => Uint8Array.from(BufferFromHex(item))),
      group_key_wrapped: await wrappedSignalGroupKey(baseUrl, normalized, `new:${name.trim()}`),
    },
    audit,
  );
}

export async function updateSecureSignalGroup(
  baseUrl: string,
  input: {
    readonly group: string;
    readonly currentMembers: readonly string[];
    readonly add: readonly string[];
    readonly remove: readonly string[];
  },
  audit: readonly DiscoveredService[] = [],
): Promise<string> {
  const additions = [...new Set(input.add.map((item) => item.trim().toLowerCase()).filter(Boolean))];
  const removals = new Set(input.remove.map((item) => item.trim().toLowerCase()).filter(Boolean));
  const next = [
    ...new Set([
      ...input.currentMembers.map((item) => item.toLowerCase()).filter((item) => !removals.has(item)),
      ...additions,
    ]),
  ];
  if (next.length < 2 || next.length > 64) throw new Error('The updated group needs 2 to 64 members.');
  return updateSignalGroup(
    baseUrl,
    {
      group: input.group,
      add: additions.map((item) => Uint8Array.from(BufferFromHex(item))),
      remove: [...removals].map((item) => Uint8Array.from(BufferFromHex(item))),
      rekey_wrapped: await wrappedSignalGroupKey(baseUrl, next, `rekey:${input.group}`),
    },
    audit,
  );
}

function verifyNodePrekey(recipientKeyHex: string, prekey: NodePrekeyBundle): void {
  const identityKey = Uint8Array.from(BufferFromHex(prekey.identityKey));
  const signedPrekey = unbase64(prekey.signedPrekey);
  const kemPublicKey = unbase64(prekey.kemPublicKey);
  if (
    prekey.identityKey.toLowerCase() !== recipientKeyHex.toLowerCase() ||
    identityKey.length !== 32 ||
    signedPrekey.length !== 32 ||
    !Number.isSafeInteger(prekey.validUntilMs) ||
    prekey.validUntilMs <= Date.now() ||
    !ed25519.verify(
      unbase64(prekey.signedPrekeySignature),
      signalPrekeySignatureBytes({
        identityKey,
        signedPrekey,
        kemPublicKey,
        validUntilMs: BigInt(prekey.validUntilMs),
      }),
      identityKey,
    )
  ) {
    throw new Error('recipient prekey bundle failed local signature or expiry verification');
  }
}

export async function startSignalSession(
  baseUrl: string,
  recipientKeyHex: string,
  plaintext: string,
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  if (!/^[0-9a-f]{64}$/i.test(recipientKeyHex)) throw new Error('recipient key must be 64 hex characters');
  const key = recipientKeyHex.toLowerCase();
  const prekey = await verifiedSignalPrekey(baseUrl, key);
  const context = `signal:${recipientKeyHex.toLowerCase()}`;
  const encrypted = await activeSigner.sealFirstMessage(
    {
      x25519: unbase64(prekey.signedPrekey),
      mlKem768: unbase64(prekey.kemPublicKey),
    },
    text.encode(plaintext),
    context,
  );
  return (
    await publishSignalEnvelope(
      baseUrl,
      {
        context: { kind: 'device' },
        domain: 'jb:message:session:v1',
        body: SignalSessionInit.encode(
          SignalSessionInit.fromPartial({
            recipient_key: Uint8Array.from(BufferFromHex(recipientKeyHex)),
            kem_ciphertext: encrypted.kemCiphertext,
            ephemeral_x25519: encrypted.ephemeralX25519,
            used_prekey_id:
              prekey.oneTimePrekeys.length > 0 ? unbase64(prekey.oneTimePrekeys[0]!) : undefined,
            ciphertext: encrypted.ciphertext,
          }),
        ).finish(),
      },
      auditServices,
    )
  ).contentId;
}

interface NodeSignalMessage {
  readonly id: string;
  readonly session: string;
  readonly senderKey: string;
  readonly recipientKey: string;
  readonly counter: string;
  readonly header: string;
  readonly ciphertext: string;
  readonly attachmentRefs: readonly string[];
  readonly createdAtMs: number;
  readonly deliveryState: number;
  readonly deliveryUpdatedAtMs: number;
}

export interface DecryptedSignalMessage extends NodeSignalMessage {
  readonly plaintext: string | null;
}

export async function continueSignalSession(
  baseUrl: string,
  input: {
    readonly session: string;
    readonly recipientKey: string;
    readonly counter: bigint;
    readonly plaintext: string;
    readonly attachmentRefs?: readonly string[];
  },
  audit: readonly DiscoveredService[] = [],
): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  const prekey = await verifiedSignalPrekey(baseUrl, input.recipientKey);
  const encrypted = await activeSigner.sealFirstMessage(
    {
      x25519: unbase64(prekey.signedPrekey),
      mlKem768: unbase64(prekey.kemPublicKey),
    },
    text.encode(input.plaintext),
    `signal-message:${input.session}:${input.counter}`,
  );
  // Compact binary framing avoids adding roughly 500 bytes of JSON/base64 expansion to
  // every constrained DIRECT message. ML-KEM-768 is fixed at 1088 bytes and X25519 at 32.
  const header = concat(new Uint8Array([1]), encrypted.kemCiphertext, encrypted.ephemeralX25519);
  return sendSignalMessage(
    baseUrl,
    {
      session: input.session,
      counter: input.counter,
      header,
      ciphertext: encrypted.ciphertext,
      attachment_refs: input.attachmentRefs?.slice() ?? [],
    },
    audit,
  );
}

export async function loadSignalMessages(
  baseUrl: string,
  identityKeyHex: string,
): Promise<readonly DecryptedSignalMessage[]> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  const response = await signalSessionRequest<{ readonly items: readonly NodeSignalMessage[] }>(
    baseUrl,
    '/v1/signal/me/messages?limit=100',
  );
  return Promise.all(
    response.items.map(async (message) => {
      if (message.recipientKey.toLowerCase() !== identityKeyHex.toLowerCase()) {
        return { ...message, plaintext: null };
      }
      try {
        const header = unbase64(message.header);
        if (header.length !== 1121 || header[0] !== 1) {
          throw new Error('unsupported Signal ratchet header');
        }
        const opened = await activeSigner!.openFirstMessage(
          {
            kemCiphertext: header.slice(1, 1089),
            ephemeralX25519: header.slice(1089),
            ciphertext: unbase64(message.ciphertext),
          },
          `signal-message:${message.session}:${message.counter}`,
        );
        return { ...message, plaintext: new TextDecoder().decode(opened) };
      } catch {
        return { ...message, plaintext: null };
      }
    }),
  );
}

type NodeSignalSession = CachedSignalSession;

export interface DecryptedSignalSession extends NodeSignalSession {
  readonly plaintext: string | null;
}

export async function loadSignalInbox(baseUrl: string): Promise<readonly DecryptedSignalSession[]> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  let sessions: readonly NodeSignalSession[];
  try {
    const response = await signalSessionRequest<{ readonly items: readonly NodeSignalSession[] }>(
      baseUrl,
      '/v1/signal/me/sessions',
    );
    sessions = response.items;
    await cacheSignalInbox(sessions);
  } catch (error) {
    sessions = await loadCachedSignalInbox();
    if (sessions.length === 0) throw error;
  }
  return Promise.all(
    sessions.map(async (session) => {
      try {
        const plaintext = await activeSigner!.openFirstMessage(
          {
            kemCiphertext: unbase64(session.kemCiphertext),
            ephemeralX25519: unbase64(session.ephemeralX25519),
            ciphertext: unbase64(session.ciphertext),
          },
          `signal:${session.recipientKey}`,
        );
        return { ...session, plaintext: new TextDecoder().decode(plaintext) };
      } catch {
        return { ...session, plaintext: null };
      }
    }),
  );
}

function BufferFromHex(value: string): number[] {
  return value.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? [];
}

/** CV-03: compare fingerprints locally; no server request and no cross-plane state. */
export function verifySignalQrFingerprint(
  expectedPublicKey: Uint8Array,
  scannedBase64: string,
): boolean {
  const scanned = unbase64(scannedBase64);
  return scanned.length === 32 && scanned.every((value, index) => value === expectedPublicKey[index]);
}

export async function panicSignal(): Promise<void> {
  if (activeSigner) await activeSigner.panic();
  else await SecureSignalSigner.panicConfiguredVault();
  await clearSignalLocalData();
  await clearOutboxPlane(Plane.SIGNAL);
  activeSigner = null;
  activeAccessToken = null;
}
