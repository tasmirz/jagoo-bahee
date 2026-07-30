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
    if (lockPassphrase.length < 8) throw new Error('app passphrase must be at least 8 characters');
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
    await SecureStore.setItemAsync(
      ROOT_KEY,
      JSON.stringify({
        version: 1,
        salt: base64(salt),
        nonce: base64(nonce),
        ciphertext: base64(ciphertext),
      } satisfies VaultPayload),
      storeOptions,
    );
    await SecureStore.setItemAsync(CHANNEL_MAP_KEY, '{}', storeOptions);
    return new SecureSignalSigner(
      wrappingKey,
      mnemonicToSeed(mnemonic, recoveryPassphrase),
    );
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
    return new SecureSignalSigner(
      wrappingKey,
      mnemonicToSeed(mnemonic, recoveryPassphrase),
    );
  }

  static async exists(): Promise<boolean> {
    return (await SecureStore.getItemAsync(ROOT_KEY, storeOptions)) !== null;
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

  async certificateBody(
    validFromMs = BigInt(Date.now() - 60_000),
    validUntilMs = BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000),
  ): Promise<Uint8Array> {
    const seed = await this.contextSeed({ kind: 'device' });
    try {
      const deviceKey = ed25519.derivePublicKey(seed);
      const pq = mldsa.generateKeyPair(
        await digest(concat(text.encode('jb:signal:certificate:pq:v1\0'), seed)),
      );
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

  async channelPqPublicKey(channel: string): Promise<Uint8Array> {
    const seed = await this.contextSeed({ kind: 'channel', channelId: channel });
    try {
      const pq = mldsa.generateKeyPair(
        await digest(concat(text.encode('jb:signal:channel:pq:v1\0'), seed)),
      );
      try {
        return Uint8Array.from(pq.publicKey);
      } finally {
        pq.secretKey.fill(0);
      }
    } finally {
      seed.fill(0);
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

export async function createSignalIdentity(
  lockPassphrase: string,
): Promise<{ readonly recoveryPhrase: string; readonly identityId: string }> {
  const recoveryPhrase = generateRootMnemonic();
  activeSigner?.lock();
  activeSigner = await SecureSignalSigner.create(lockPassphrase, recoveryPhrase);
  activeAccessToken = null;
  return {
    recoveryPhrase,
    identityId: (await activeSigner.identity({ kind: 'device' })).id,
  };
}

export async function importSignalIdentity(
  recoveryPhrase: string,
  lockPassphrase: string,
): Promise<string> {
  if (!isValidMnemonic(recoveryPhrase.trim())) throw new Error('Enter a valid 24-word phrase');
  activeSigner?.lock();
  activeSigner = await SecureSignalSigner.create(
    lockPassphrase,
    recoveryPhrase.trim().replace(/\s+/g, ' '),
  );
  activeAccessToken = null;
  return (await activeSigner.identity({ kind: 'device' })).id;
}

export async function unlockSignalIdentity(lockPassphrase: string): Promise<string> {
  activeSigner?.lock();
  activeSigner = await SecureSignalSigner.unlock(lockPassphrase);
  activeAccessToken = null;
  return (await activeSigner.identity({ kind: 'device' })).id;
}

export function lockSignalIdentity(): void {
  activeSigner?.lock();
  activeSigner = null;
  activeAccessToken = null;
}

export async function registerSignalIdentity(
  baseUrl: string,
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Signal identity first');
  const identity = await activeSigner.identity({ kind: 'device' });
  const challenge = await requestJson<PowChallengeJson>(baseUrl, '/v1/credits/challenge', {
    method: 'POST',
    body: JSON.stringify({ author_key: base64(identity.publicKey) }),
  });
  const pow = await solvePow(challenge, identity.publicKey);
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

export async function signalSessionRequest<T>(baseUrl: string, path: string): Promise<T> {
  if (!activeAccessToken) throw new Error('Authenticate the Signal identity first');
  return requestJson<T>(baseUrl, path, {
    headers: { Authorization: `Bearer ${activeAccessToken}` },
  });
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
  const channel = await activeSigner.createChannelIdentity();
  const messaging = await activeSigner.messagingPublicKey();
  const powChallenge = await requestJson<PowChallengeJson>(baseUrl, '/v1/credits/challenge', {
    method: 'POST',
    body: JSON.stringify({ author_key: base64(channel.publicKey) }),
  });
  const pow = await solvePow(powChallenge, channel.publicKey);
  const body = ChannelDeclare.encode(
    ChannelDeclare.fromPartial({
      channel_name: input.name,
      description: input.description,
      kind: ChannelKind.CHANNEL_KIND_ORGANISATION,
      signing_key: channel.publicKey,
      kem_public_key: messaging.mlKem768,
      pq_key: await activeSigner.channelPqPublicKey(channel.channelId),
      language: input.language,
      valid_from: BigInt(Date.now()),
    }),
  ).finish();
  const published = await publishSignalEnvelope(
    baseUrl,
    {
      context: { kind: 'channel', channelId: channel.channelId },
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
  const replacement = await activeSigner.createChannelIdentity();
  const messaging = await activeSigner.messagingPublicKey();
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
