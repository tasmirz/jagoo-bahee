/**
 * Forum key vault. Raw mnemonic and derived seeds never leave this module (SG-01).
 * SecureStore keeps the root device-bound and unavailable while the phone is locked.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import {
  FORUM_PATH,
  cryptoBackend,
  deriveForumKey,
  ed25519,
  generateRootMnemonic,
  isValidMnemonic,
  mnemonicToSeed,
  messagingKeyPair,
  mldsa,
  openFirstMessage,
  sealFirstMessage,
  type HybridCiphertext,
  type MessagingPublicKey,
} from '@jagoo/sdk/crypto';
import {
  Plane,
  buildEnvelope,
  canonicalBytes,
  certificateSelfSignatureBytes,
  contentId as computeContentId,
  decodeSignedEnvelope,
  identityId,
  pqAttestationBytes,
  revocationAuthorizationBytes,
  type AuditCertificate,
  type AuditReceiptJson,
  sealEnvelope,
  blindCredential,
  unblindCredential,
  type BlindCredentialPublicKey,
  type BlindCredentialState,
  type BlindState,
  type ContextOf,
  type Credential,
  type ForumSigner,
  type PublicIdentity,
  type SessionHandle,
  type SignedEnvelope,
} from '@jagoo/sdk';
import { KeyCertificate, KeyRevocation, RevocationKind } from '@jagoo/sdk/proto';
import {
  CommentCreate,
  CommentDelete,
  CommentUpdate,
  CommunityArchive,
  CommunityCreate,
  CommunityUpdate,
  ModAction,
  ReportCreate,
  ReportResolve,
  RoleAssign,
  RoleDefine,
  RoleRevoke,
  ProfileUpdate,
  FollowIdentity,
  BlockIdentity,
  FeedPreferences,
  AwardGive,
  AwardTypeDefine,
  AttachmentClaim,
  ForumMessageSend,
  Label,
  MembershipJoin,
  MembershipLeave,
  PostCreate,
  PostDelete,
  PostUpdate,
  SaveContent,
  PostKind,
  TargetKind,
  VoteCast,
} from '@jagoo/sdk/proto';
import { solvePow, type PowChallengeJson } from '../data/pow';
import type { DiscoveredService } from '../data/node-config';
import { networkRequest } from '../data/request';
import { submitSignedEnvelope } from '../offline/outbox';

const ROOT_KEY = 'jb.forum.root.v1';
const FORUM_CREDENTIAL_KEY = 'jb.forum.credential.v1';
const FORUM_DEVICE_LOCK_KEY = 'jb.forum.device-lock.v1';
/**
 * Deliberate sign-out is device state and must outlive the process, otherwise the next cold
 * start silently unlocks a device-lock vault and the person is signed back in against their
 * wishes. It lives in AsyncStorage rather than SecureStore because it is a preference, not a
 * secret — nothing about "this device is signed out" is worth a keystore slot.
 */
const FORUM_SIGNED_OUT_KEY = 'jb.forum.signed-out.v1';
export const LEGACY_FORUM_VAULT_ID = 'legacy';
let activeVaultId = LEGACY_FORUM_VAULT_ID;

function assertVaultId(vaultId: string): string {
  const value = vaultId.trim();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error('Invalid Forum identity vault ID.');
  return value;
}

function vaultKey(base: string, vaultId = activeVaultId): string {
  return vaultId === LEGACY_FORUM_VAULT_ID ? base : `${base}.${assertVaultId(vaultId)}`;
}
const text = new TextEncoder();
const storeOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const concat = (...parts: readonly Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};

const base64 = (value: Uint8Array): string => globalThis.btoa(String.fromCharCode(...value));
const unbase64 = (value: string): Uint8Array =>
  Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));

async function digest(value: Uint8Array): Promise<Uint8Array> {
  return cryptoBackend().sha256(value);
}

function encodeBlindState(state: BlindCredentialState): Uint8Array {
  return text.encode(
    JSON.stringify({
      token: base64(state.token),
      inverse: base64(state.inverse),
      publicKey: state.publicKey,
    }),
  );
}

function decodeBlindState(value: Uint8Array): BlindCredentialState {
  const parsed = JSON.parse(new TextDecoder().decode(value)) as {
    token: string;
    inverse: string;
    publicKey: BlindCredentialPublicKey;
  };
  return {
    token: unbase64(parsed.token),
    inverse: unbase64(parsed.inverse),
    publicKey: parsed.publicKey,
  };
}

export class SecureForumSigner implements ForumSigner {
  readonly plane = Plane.FORUM;

  private constructor(
    private readonly wrappingKey: Uint8Array,
    private readonly rootSeedCache: Uint8Array,
    private credentialKey?: BlindCredentialPublicKey,
  ) {}

  static async create(
    lockPassphrase: string,
    mnemonic = generateRootMnemonic(),
    recoveryPassphrase = '',
  ): Promise<SecureForumSigner> {
    if (lockPassphrase.length < 8) throw new Error('app passphrase must be at least 8 characters');
    if (!isValidMnemonic(mnemonic)) throw new Error('invalid 24-word recovery phrase');
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
      vaultKey(ROOT_KEY),
      JSON.stringify({
        version: 1,
        salt: base64(salt),
        nonce: base64(nonce),
        ciphertext: base64(ciphertext),
      }),
      storeOptions,
    );
    return new SecureForumSigner(
      wrappingKey,
      mnemonicToSeed(mnemonic, recoveryPassphrase),
    );
  }

  static async unlock(
    lockPassphrase: string,
    recoveryPassphrase = '',
    credentialKey?: BlindCredentialPublicKey,
  ): Promise<SecureForumSigner> {
    const encoded = await SecureStore.getItemAsync(vaultKey(ROOT_KEY), storeOptions);
    if (!encoded) throw new Error('Forum identity is not configured');
    const payload = JSON.parse(encoded) as {
      version: number;
      salt: string;
      nonce: string;
      ciphertext: string;
    };
    if (payload.version !== 1) throw new Error('unsupported Forum key-vault version');
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
    return new SecureForumSigner(
      wrappingKey,
      mnemonicToSeed(mnemonic, recoveryPassphrase),
      credentialKey,
    );
  }

  static async exists(): Promise<boolean> {
    return (await SecureStore.getItemAsync(vaultKey(ROOT_KEY), storeOptions)) !== null;
  }

  /** CRS-19: callable from the locked emergency surface. */
  static async panicConfiguredVault(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(vaultKey(ROOT_KEY), storeOptions),
      SecureStore.deleteItemAsync(vaultKey(FORUM_CREDENTIAL_KEY), storeOptions),
      SecureStore.deleteItemAsync(vaultKey(FORUM_DEVICE_LOCK_KEY), storeOptions),
    ]);
  }

  configureCredentialKey(value: BlindCredentialPublicKey): void {
    this.credentialKey = value;
  }

  private async rootSeed(): Promise<Uint8Array> {
    // PBKDF2-HMAC-SHA512 and vault decryption happen once at unlock. Every caller gets a
    // disposable copy because context derivation zeroes its input in a finally block.
    return Uint8Array.from(this.rootSeedCache);
  }

  private async contextSeed(ctx: ContextOf<Plane.FORUM>): Promise<Uint8Array> {
    const root = await this.rootSeed();
    try {
      if (ctx.kind === 'device') return deriveForumKey(root, FORUM_PATH.DEVICE);
      if (ctx.kind === 'epoch') return deriveForumKey(root, FORUM_PATH.EPOCH, ctx.epoch);
      const hash = await digest(text.encode(ctx.communityId.normalize('NFC')));
      const index = new DataView(hash.buffer, hash.byteOffset, 4).getUint32(0, false) & 0x7fffffff;
      return deriveForumKey(root, FORUM_PATH.COMMUNITY, index);
    } finally {
      root.fill(0);
    }
  }

  async identity(ctx: ContextOf<Plane.FORUM>): Promise<PublicIdentity> {
    const seed = await this.contextSeed(ctx);
    try {
      const publicKey = ed25519.derivePublicKey(seed);
      return { id: identityId(publicKey), publicKey, plane: Plane.FORUM };
    } finally {
      seed.fill(0);
    }
  }

  async sign(ctx: ContextOf<Plane.FORUM>, canonicalBytes: Uint8Array): Promise<Uint8Array> {
    const seed = await this.contextSeed(ctx);
    try {
      return ed25519.sign(canonicalBytes, seed);
    } finally {
      seed.fill(0);
    }
  }

  async seal(
    ctx: ContextOf<Plane.FORUM>,
    input: {
      readonly domain: string;
      readonly body: Uint8Array;
      readonly scope?: string;
      readonly parent?: string;
      readonly antiAbuse?: Parameters<typeof buildEnvelope>[0]['antiAbuse'];
      readonly nowMs?: bigint;
    },
  ): Promise<{ envelope: SignedEnvelope; contentId: string; wireBytes: Uint8Array }> {
    const author = await this.identity(ctx);
    const unsigned = buildEnvelope({
      domain: input.domain,
      plane: Plane.FORUM,
      authorKey: author.publicKey,
      body: input.body,
      nowMs: input.nowMs ?? BigInt(Date.now()),
      nonce: await Crypto.getRandomBytesAsync(16),
      parent: input.parent,
      scope: input.scope,
      antiAbuse: input.antiAbuse,
    });
    return sealEnvelope(unsigned, await this.sign(ctx, canonicalBytes(unsigned)));
  }

  async certificateBody(
    ctx: ContextOf<Plane.FORUM> = { kind: 'device' },
    validFromMs = BigInt(Date.now() - 60_000),
    validUntilMs = BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000),
  ): Promise<Uint8Array> {
    const deviceSeed = await this.contextSeed(ctx);
    try {
      const deviceKey = ed25519.derivePublicKey(deviceSeed);
      const pq = mldsa.generateKeyPair(
        await digest(concat(text.encode('jb:certificate:pq-seed:v1\0'), deviceSeed)),
      );
      try {
        const fields = {
          plane: Plane.FORUM,
          deviceKey,
          pqKey: pq.publicKey,
          validFrom: validFromMs,
          validUntil: validUntilMs,
        };
        // Kept in the shared SDK so the node verifies exactly these bytes.
        const attestation = mldsa.attest(pqAttestationBytes(fields), pq.secretKey);
        return KeyCertificate.encode(
          KeyCertificate.fromPartial({
            plane: 1,
            device_key: deviceKey,
            pq_key: pq.publicKey,
            pq_attestation: attestation,
            valid_from: validFromMs,
            valid_until: validUntilMs,
            self_signature: ed25519.sign(
              certificateSelfSignatureBytes(fields, attestation),
              deviceSeed,
            ),
          }),
        ).finish();
      } finally {
        pq.secretKey.fill(0);
      }
    } finally {
      deviceSeed.fill(0);
    }
  }

  async nullifier(epoch: number, scope: string): Promise<Uint8Array> {
    const epochSecret = await this.contextSeed({ kind: 'epoch', epoch });
    try {
      return digest(
        concat(
          text.encode('jb:nullifier:v1\0'),
          text.encode(scope.normalize('NFC')),
          text.encode('\0'),
          epochSecret,
        ),
      );
    } finally {
      epochSecret.fill(0);
    }
  }

  async blind(message: Uint8Array): Promise<{ blinded: Uint8Array; state: BlindState }> {
    if (!this.credentialKey) throw new Error('credential issuer parameters are not configured');
    const result = blindCredential(
      this.credentialKey,
      message,
      await Crypto.getRandomBytesAsync(this.credentialKey.width),
    );
    return { blinded: result.blinded, state: { blindingFactor: encodeBlindState(result.state) } };
  }

  async unblind(state: BlindState, blindSignature: Uint8Array): Promise<Credential> {
    return { bytes: unblindCredential(decodeBlindState(state.blindingFactor), blindSignature) };
  }

  async prepareDuressRevocation(): Promise<Uint8Array> {
    const seed = await this.contextSeed({ kind: 'device' });
    try {
      const revokedKey = ed25519.derivePublicKey(seed);
      const effectiveFromMs = BigInt(Date.now());
      const fields = {
        plane: Plane.FORUM,
        revokedKey,
        kind: RevocationKind.REVOCATION_KIND_DURESS,
        effectiveFromMs,
        replacementKey: new Uint8Array(),
      };
      return KeyRevocation.encode(
        KeyRevocation.fromPartial({
          plane: 1,
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

  private async messagingKeys() {
    const root = await this.rootSeed();
    try {
      const xSeed = deriveForumKey(root, FORUM_PATH.MESSAGING, 0);
      const kemSeed = concat(
        deriveForumKey(root, FORUM_PATH.MESSAGING, 1),
        deriveForumKey(root, FORUM_PATH.MESSAGING, 2),
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
    return (await this.messagingKeys()).publicKey;
  }

  async sealMessage(
    recipient: MessagingPublicKey,
    plaintext: Uint8Array,
    thread: string,
    ratchetIndex = 0,
  ): Promise<HybridCiphertext> {
    return sealFirstMessage(
      recipient,
      plaintext,
      text.encode(`${thread.normalize('NFC')}:${ratchetIndex}`),
      await Crypto.getRandomBytesAsync(32),
      await Crypto.getRandomBytesAsync(32),
      await Crypto.getRandomBytesAsync(12),
    );
  }

  async openMessage(
    message: HybridCiphertext,
    thread: string,
    ratchetIndex = 0,
  ): Promise<Uint8Array> {
    const keys = await this.messagingKeys();
    return openFirstMessage(
      keys.secretKey,
      message,
      text.encode(`${thread.normalize('NFC')}:${ratchetIndex}`),
    );
  }

  async agree(_peer: PublicIdentity, _kemCiphertext?: Uint8Array): Promise<SessionHandle> {
    throw new Error('hybrid messaging sessions require a published prekey bundle');
  }

  async panic(): Promise<void> {
    await SecureForumSigner.panicConfiguredVault();
    this.lock();
  }

  lock(): void {
    this.rootSeedCache.fill(0);
    this.wrappingKey.fill(0);
  }
}

let activeSigner: SecureForumSigner | null = null;
let activeAccessToken: string | null = null;
/**
 * The identity the current access token belongs to, or null when signed out.
 *
 * Exists so a React Query key can name its viewer WITHOUT the token leaving this module. A
 * cache keyed only by URL cannot tell an anonymous response from an authenticated one, and
 * the anonymous one arrives first on every cold start — see `forumViewerId`.
 */
let activeViewerId: string | null = null;
let activeCredential: Credential | null = null;

export function selectForumIdentityVault(vaultId: string): void {
  const next = assertVaultId(vaultId);
  if (next === activeVaultId) return;
  lockForumIdentity();
  activeVaultId = next;
}

export async function deleteForumIdentityVault(vaultId: string): Promise<void> {
  const target = assertVaultId(vaultId);
  if (target === activeVaultId) lockForumIdentity();
  await Promise.all([
    SecureStore.deleteItemAsync(vaultKey(ROOT_KEY, target), storeOptions),
    SecureStore.deleteItemAsync(vaultKey(FORUM_CREDENTIAL_KEY, target), storeOptions),
    SecureStore.deleteItemAsync(vaultKey(FORUM_DEVICE_LOCK_KEY, target), storeOptions),
  ]);
}

export interface ForumSessionSummary {
  readonly configured: boolean;
  readonly unlocked: boolean;
  readonly authenticated: boolean;
  /** True only after a deliberate sign-out, so a cold start does not undo it. */
  readonly signedOut: boolean;
  readonly identityId?: string;
  readonly identityKeyHex?: string;
}

export interface PublishedPost {
  readonly contentId: string;
  readonly leafIndex?: number;
  readonly certificate?: AuditCertificate;
  readonly auditCopies: number;
  readonly auditPending: number;
  readonly pending: boolean;
}

export type PublishedAction = PublishedPost;

function authBytes(key: Uint8Array, challenge: Uint8Array): Uint8Array {
  return concat(text.encode('jb-auth-v1\0login\0'), key, challenge);
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
  if (!response.ok) {
    throw new Error(payload.detail ?? `Node request failed with HTTP ${response.status}`);
  }
  return payload;
}

async function submitAuditedEnvelope(
  baseUrl: string,
  wireBytes: Uint8Array,
  auditServices: readonly DiscoveredService[],
  _authorization?: string,
): Promise<{
  readonly receipt?: AuditReceiptJson;
  readonly certificate?: AuditCertificate;
  readonly auditCopies: number;
  readonly auditPending: number;
  readonly contentId: string;
  readonly pending: boolean;
}> {
  const envelope = decodeSignedEnvelope(wireBytes);
  return submitSignedEnvelope({
    baseUrl,
    wireBytes,
    contentId: computeContentId(envelope),
    plane: envelope.plane,
    priority: envelope.priority,
    auditServices,
  });
}

export async function forumSessionSummary(): Promise<ForumSessionSummary> {
  const [configured, signedOut] = await Promise.all([
    SecureForumSigner.exists(),
    isForumSignedOut(),
  ]);
  const identity = activeSigner ? await activeSigner.identity({ kind: 'device' }) : null;
  return {
    configured,
    unlocked: activeSigner !== null,
    authenticated: activeAccessToken !== null,
    signedOut,
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
 * Makes an authenticated read without exposing the bearer token outside the signer boundary.
 * Feature workspaces use this for profile, notification, message, and operator projections.
 */
export async function forumSessionRequest<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!activeAccessToken) {
    throw new Error('Register and authenticate this Forum identity first');
  }
  const send = () =>
    requestJson<T>(baseUrl, path, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${activeAccessToken}`,
      },
    });
  try {
    return await send();
  } catch (error) {
    /*
      One silent re-authentication on a rejected token — the same gap as the Signal plane's.

      Access tokens are HMACed with `AUTH_ACCESS_SECRET`, and a node with none configured
      mints a fresh random key per boot, so every node restart invalidates every outstanding
      token. Nothing recovered: the vault stayed unlocked, the token stayed set, and the only
      code that mints one runs when there is NO token. Re-authenticating is a signature over
      a challenge with a key already held unlocked, so it needs nothing from the person.

      Exactly one retry — a node that rejects a freshly minted token is saying something
      real, and that must surface rather than spin.
    */
    const detail = error instanceof Error ? error.message.toLowerCase() : '';
    if (!detail.includes('access token is invalid') && !detail.includes('token has expired')) {
      throw error;
    }
    activeAccessToken = null;
    await authenticateForumIdentity(baseUrl);
    return send();
  }
}

/**
 * The bearer header for an otherwise-public read that should be hydrated with the caller's
 * own `myVote`/`saved`/`joined` fields (the additive viewer reads added alongside this
 * rebuild). Returns `undefined` rather than throwing when signed out, since these reads must
 * still work anonymously — the header is optional, not required. Kept inside the signer
 * boundary rather than exposing `activeAccessToken` itself to `OfflineApi`.
 */
export function forumViewerHeaders(): { readonly Authorization: string } | undefined {
  return activeAccessToken ? { Authorization: `Bearer ${activeAccessToken}` } : undefined;
}

/**
 * Who the viewer reads below will be answered AS. Safe to put in a cache key: it is a public
 * identity ID, never the bearer token.
 *
 * ── Why a cache key has to carry this ───────────────────────────────────────────────
 * `/v1/communities/:id` returns `joined` only for an authenticated caller, and the same URL
 * anonymously returns the row WITHOUT it. On a cold start the launch restore is still in
 * flight when the first screens mount, so the anonymous answer is what lands in the cache —
 * and since the URL did not change, nothing ever refetched it. The result was a community
 * the person had created showing a "Join" button on every relaunch.
 *
 * Keying on the viewer makes the two answers different cache entries, so authenticating is a
 * key change and refetches by construction rather than by remembering to invalidate.
 */
export function forumViewerId(): string | null {
  return activeViewerId;
}

export async function createForumIdentity(
  lockPassphrase?: string,
  recoveryPassphrase = '',
  vaultId = activeVaultId,
): Promise<{ readonly recoveryPhrase: string; readonly identityId: string }> {
  selectForumIdentityVault(vaultId);
  const recoveryPhrase = generateRootMnemonic();
  const vaultPassphrase = await resolveVaultPassphrase(lockPassphrase, true);
  activeSigner?.lock();
  activeSigner = await SecureForumSigner.create(vaultPassphrase, recoveryPhrase, recoveryPassphrase);
  activeAccessToken = null;
  activeViewerId = null;
  activeCredential = null;
  await SecureStore.deleteItemAsync(vaultKey(FORUM_CREDENTIAL_KEY), storeOptions);
  await AsyncStorage.removeItem(vaultKey(FORUM_SIGNED_OUT_KEY));
  const identity = await activeSigner.identity({ kind: 'device' });
  return { recoveryPhrase, identityId: identity.id };
}

export async function importForumIdentity(
  recoveryPhrase: string,
  lockPassphrase?: string,
  recoveryPassphrase = '',
  vaultId = activeVaultId,
): Promise<string> {
  selectForumIdentityVault(vaultId);
  if (!isValidMnemonic(recoveryPhrase.trim())) throw new Error('Enter a valid 24-word phrase');
  const vaultPassphrase = await resolveVaultPassphrase(lockPassphrase, true);
  activeSigner?.lock();
  activeSigner = await SecureForumSigner.create(
    vaultPassphrase,
    recoveryPhrase.trim().replace(/\s+/g, ' '),
    recoveryPassphrase,
  );
  activeAccessToken = null;
  activeViewerId = null;
  activeCredential = null;
  await SecureStore.deleteItemAsync(vaultKey(FORUM_CREDENTIAL_KEY), storeOptions);
  await AsyncStorage.removeItem(vaultKey(FORUM_SIGNED_OUT_KEY));
  return (await activeSigner.identity({ kind: 'device' })).id;
}

export async function unlockForumIdentity(
  lockPassphrase?: string,
  recoveryPassphrase = '',
): Promise<string> {
  const vaultPassphrase = await resolveVaultPassphrase(lockPassphrase, false);
  activeSigner?.lock();
  activeSigner = await SecureForumSigner.unlock(vaultPassphrase, recoveryPassphrase);
  activeAccessToken = null;
  activeViewerId = null;
  const storedCredential = await SecureStore.getItemAsync(
    vaultKey(FORUM_CREDENTIAL_KEY),
    storeOptions,
  );
  activeCredential = storedCredential ? { bytes: unbase64(storedCredential) } : null;
  await AsyncStorage.removeItem(vaultKey(FORUM_SIGNED_OUT_KEY));
  return (await activeSigner.identity({ kind: 'device' })).id;
}

/**
 * A device-lock-only vault still encrypts the mnemonic; its high-entropy wrapping secret is held
 * in the platform keystore. Supplying an app password deliberately removes that device secret.
 */
async function resolveVaultPassphrase(
  passphrase: string | undefined,
  creating: boolean,
): Promise<string> {
  if (passphrase?.trim()) {
    if (passphrase.length < 8) throw new Error('Use at least 8 characters for the app password');
    await SecureStore.deleteItemAsync(vaultKey(FORUM_DEVICE_LOCK_KEY), storeOptions);
    return passphrase;
  }
  const existing = await SecureStore.getItemAsync(vaultKey(FORUM_DEVICE_LOCK_KEY), storeOptions);
  if (existing) return existing;
  if (!creating) throw new Error('This identity needs its app password to unlock');
  const generated = base64(await Crypto.getRandomBytesAsync(32));
  await SecureStore.setItemAsync(vaultKey(FORUM_DEVICE_LOCK_KEY), generated, storeOptions);
  return generated;
}

export function lockForumIdentity(): void {
  activeSigner?.lock();
  activeSigner = null;
  activeAccessToken = null;
  activeViewerId = null;
  activeCredential = null;
}

async function isForumSignedOut(): Promise<boolean> {
  return (await AsyncStorage.getItem(vaultKey(FORUM_SIGNED_OUT_KEY))) === 'true';
}

/**
 * Sign out without destroying anything. The vault, its credential, and the home node all
 * stay — signing back in must not require the recovery phrase, because a person who has to
 * dig out 24 words to read a feed will either stop signing out or stop using the app.
 * Use `deleteForumIdentityVault` for "remove this identity from the device".
 */
export async function signOutForumIdentity(): Promise<void> {
  lockForumIdentity();
  await AsyncStorage.setItem(vaultKey(FORUM_SIGNED_OUT_KEY), 'true');
}

/**
 * Mint an access token from a signed challenge. This is the whole of "sign in": it does not
 * certify a key and it never pays proof of work, because neither is what returning to an
 * identity the node already knows costs.
 */
export async function authenticateForumIdentity(baseUrl: string): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Forum identity first');
  const signer = activeSigner;
  const identity = await signer.identity({ kind: 'device' });
  const challenge = await requestJson<{
    readonly challenge: string;
    readonly claim: string;
  }>(baseUrl, `/v1/auth/challenge?public_key=${encodeURIComponent(base64(identity.publicKey))}`);
  const signature = await signer.sign(
    { kind: 'device' },
    authBytes(identity.publicKey, unbase64(challenge.challenge)),
  );
  const session = await requestJson<{ readonly accessToken: string }>(baseUrl, '/v1/auth', {
    method: 'POST',
    body: JSON.stringify({
      public_key: base64(identity.publicKey),
      challenge: challenge.challenge,
      claim: challenge.claim,
      signature: base64(signature),
    }),
  });
  activeAccessToken = session.accessToken;
  activeViewerId = identity.id;
  await AsyncStorage.removeItem(vaultKey(FORUM_SIGNED_OUT_KEY));
  return identity.id;
}

/** Acquire a blind publishing credential if this vault is not already holding one. */
async function ensureForumCredential(baseUrl: string): Promise<void> {
  if (activeCredential || !activeSigner || !activeAccessToken) return;
  const signer = activeSigner;
  const parameters = await requestJson<BlindCredentialPublicKey>(
    baseUrl,
    '/v1/credentials/parameters',
  );
  signer.configureCredentialKey(parameters);
  const blinded = await signer.blind(await Crypto.getRandomBytesAsync(32));
  const issued = await requestJson<{ readonly blindSignature: string }>(
    baseUrl,
    '/v1/credentials/request',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${activeAccessToken}` },
      body: JSON.stringify({ blinded: base64(blinded.blinded) }),
    },
  );
  activeCredential = await signer.unblind(blinded.state, unbase64(issued.blindSignature));
  await SecureStore.setItemAsync(
    vaultKey(FORUM_CREDENTIAL_KEY),
    base64(activeCredential.bytes),
    storeOptions,
  );
}

/**
 * Sign an unlocked vault in to `baseUrl`, registering only if the node does not know the key.
 *
 * Restoring a recovery phrase used to drop straight into the registration path, which
 * re-certified an already-certified key and made returning to your own identity look and cost
 * exactly like creating a new one. Authentication is tried first for that reason; the fall
 * back to full registration is for the genuinely new case — a phrase restored onto a node that
 * has never seen it — and is not reached otherwise.
 */
export async function signInForumIdentity(
  baseUrl: string,
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Forum identity first');
  let identityId: string;
  try {
    identityId = await authenticateForumIdentity(baseUrl);
  } catch {
    identityId = await registerForumIdentity(baseUrl, auditServices);
    await AsyncStorage.removeItem(vaultKey(FORUM_SIGNED_OUT_KEY));
    return identityId;
  }
  await ensureForumCredential(baseUrl);
  return identityId;
}

/**
 * Reopen the session a previous run left behind. Called once per launch.
 *
 * `activeSigner` and `activeAccessToken` are module state, so before this existed every cold
 * start left a fully registered device holding a locked vault and no token: the feed rendered,
 * every signed action failed with "Unlock your Forum identity first", and the only way back
 * was the onboarding flow. Nothing here is fatal — a device-lock vault that cannot reach its
 * node stays unlocked and offline rather than bouncing the person to a sign-in wall, which is
 * the whole point of a client that assumes the network is missing.
 */
export async function restoreForumSession(
  baseUrl: string | null,
  auditServices: readonly DiscoveredService[] = [],
): Promise<ForumSessionSummary> {
  if (!(await SecureForumSigner.exists())) return forumSessionSummary();
  if (await isForumSignedOut()) return forumSessionSummary();
  if (!activeSigner) {
    try {
      // No argument: only a vault whose wrapping secret is in the device keystore opens
      // silently. A password-protected vault throws here and the caller shows its unlock
      // screen, which is exactly the protection the person asked for.
      await unlockForumIdentity();
    } catch {
      return forumSessionSummary();
    }
  }
  if (baseUrl && !activeAccessToken) {
    try {
      await signInForumIdentity(baseUrl, auditServices);
    } catch {
      // Offline, or the node is down. The vault is open and reads come from cache.
    }
  }
  return forumSessionSummary();
}

/**
 * The advertised anti-abuse services, set once when a home node is selected.
 *
 * This is deliberately module state rather than a parameter. `registerForumIdentity` used
 * to take `mcaptchaServices` as an optional THIRD positional argument and not one of its
 * seven call sites passed it, so the reachability probe reported "no mCaptcha endpoint
 * advertised" on every node including ones that advertised one — and the default made it
 * a silent, type-checked lie. Threading it properly would mean carrying a second array
 * through thirty publishing signatures that have no interest in it; configuring it beside
 * `configureAuditIssueReporting` matches how the audit services are already handled.
 */
let mcaptchaServices: readonly DiscoveredService[] = [];

export function configureAntiAbuseServices(services: readonly DiscoveredService[]): void {
  mcaptchaServices = services;
}

export async function checkCaptchaReachability(
  baseUrl: string,
  services: readonly DiscoveredService[] = mcaptchaServices,
): Promise<{ reachable: boolean; statusDetails: string }> {
  if (services.length === 0) {
    // Not a failure. The node's anti-abuse is argon2id proof-of-work plus blind
    // credentials; a captcha is an optional extra that most nodes do not run.
    return {
      reachable: false,
      statusDetails: 'No mCaptcha endpoint advertised by node discovery.',
    };
  }

  for (const service of services) {
    try {
      console.log(`[Captcha Check] Probing mCaptcha endpoint at ${service.address}...`);
      const response = await networkRequest(service.address, { method: 'GET' });
      console.log(
        `[Captcha Check] Response from ${service.address}: HTTP ${response.status} ${response.statusText}`,
      );
      if (response.ok || response.status < 500) {
        console.log(`[Captcha Check] mCaptcha service at ${service.address} IS REACHABLE.`);
        return {
          reachable: true,
          statusDetails: `Reachable at ${service.address} (HTTP ${response.status})`,
        };
      }
    } catch (error) {
      console.warn(`[Captcha Check] Failed to reach mCaptcha service at ${service.address}:`, error);
    }
  }

  console.warn('[Captcha Check] All advertised mCaptcha services are UNREACHABLE.');
  return { reachable: false, statusDetails: 'Advertised mCaptcha services are unreachable.' };
}

export async function registerForumIdentity(
  baseUrl: string,
  auditServices: readonly DiscoveredService[] = [],
): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Forum identity first');

  // Reads the services configured for the active home node. An unreachable captcha is not
  // fatal — registration proceeds on proof of work either way — so this only records why.
  const captchaStatus = await checkCaptchaReachability(baseUrl);
  console.log('[Register] Captcha status:', captchaStatus.statusDetails);

  const signer = activeSigner;
  const identity = await signer.identity({ kind: 'device' });
  console.log('[Register] Public Identity derived:', identity.id);

  console.log('[Register] Requesting PoW challenge from /v1/credits/challenge...');
  const powChallenge = await requestJson<PowChallengeJson>(baseUrl, '/v1/credits/challenge', {
    method: 'POST',
    body: JSON.stringify({ author_key: base64(identity.publicKey) }),
  });

  console.log('[Register] PoW challenge received:', powChallenge);
  const pow = await solvePow(powChallenge, identity.publicKey);
  console.log('[Register] PoW solution created successfully.');

  console.log('[Register] Sealing key certification envelope...');
  const certificate = await signer.seal(
    { kind: 'device' },
    {
      domain: 'jb:key:certify:forum:v1',
      body: await signer.certificateBody(),
      antiAbuse: {
        credential: new Uint8Array(0),
        nullifier: new Uint8Array(0),
        epoch: 0,
        pow,
      },
    },
  );

  console.log('[Register] Submitting audited certificate envelope to node...');
  await submitAuditedEnvelope(baseUrl, certificate.wireBytes, auditServices);
  console.log('[Register] Certificate envelope accepted.');

  console.log('[Register] Authenticating with a signed challenge...');
  await authenticateForumIdentity(baseUrl);
  console.log('[Register] Auth token obtained.');

  console.log('[Register] Requesting blind credential issue...');
  await ensureForumCredential(baseUrl);
  console.log('[Register] Registration and credential issuance complete for:', identity.id);
  return identity.id;
}

export async function publishForumPost(
  baseUrl: string,
  input: {
    readonly title: string;
    readonly bodyMarkdown: string;
    readonly communityId?: string;
    readonly kind?: PostKind;
    readonly url?: string;
    readonly attachments?: readonly string[];
    readonly poll?: {
      readonly question: string;
      readonly options: readonly string[];
      readonly multiple: boolean;
      readonly closesAtMs: bigint;
    };
    readonly crosspostOf?: string;
    readonly flair?: string;
    readonly flags?: {
      readonly nsfw: boolean;
      readonly spoiler: boolean;
      readonly oc: boolean;
    };
  },
  auditServices: readonly DiscoveredService[] = [],
): Promise<PublishedPost> {
  if (!activeSigner) throw new Error('Unlock your Forum identity first');
  if (!activeCredential) {
    await registerForumIdentity(baseUrl, auditServices);
  }
  const communityId =
    input.communityId ??
    (
      await requestJson<{
        readonly items: readonly { readonly id: string }[];
      }>(baseUrl, '/v1/communities?sort=members&limit=1')
    ).items[0]?.id;
  if (!communityId) {
    throw new Error('This node has no community yet. Run the demo seed or create one first.');
  }
  const epoch = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const sealed = await activeSigner.seal(
    { kind: 'device' },
    {
      domain: 'jb:post:create:v1',
      body: PostCreate.encode(
        PostCreate.fromPartial({
          title: input.title,
          kind: input.kind ?? PostKind.POST_KIND_TEXT,
          body_markdown: input.bodyMarkdown,
          url: input.url ?? '',
          attachments: input.attachments?.slice() ?? [],
          poll: input.poll
            ? {
                question: input.poll.question,
                options: input.poll.options.slice(),
                multiple: input.poll.multiple,
                closes_at_ms: input.poll.closesAtMs,
              }
            : undefined,
          crosspost_of: input.crosspostOf ?? '',
          flair: input.flair ?? '',
          flags: input.flags,
        }),
      ).finish(),
      scope: communityId,
      antiAbuse: {
        credential: activeCredential!.bytes,
        // Nullifiers are domain-separated on device; the server independently binds the
        // claim to this envelope's epoch and community scope.
        nullifier: await activeSigner.nullifier(epoch, 'jb:post:create:v1'),
        epoch,
        pow: new Uint8Array(0),
      },
    },
  );
  const audited = await submitAuditedEnvelope(
    baseUrl,
    sealed.wireBytes,
    auditServices,
    activeAccessToken ?? undefined,
  );
  return {
    contentId: audited.contentId,
    ...(audited.receipt ? { leafIndex: audited.receipt.leaf_index } : {}),
    ...(audited.certificate ? { certificate: audited.certificate } : {}),
    auditCopies: audited.auditCopies,
    auditPending: audited.auditPending,
    pending: audited.pending,
  };
}

export async function publishCommunity(
  baseUrl: string,
  input: {
    readonly name: string;
    readonly title: string;
    readonly description: string;
    readonly rulesMarkdown: string;
    readonly isPrivate: boolean;
    readonly isNsfw: boolean;
  },
  auditServices: readonly DiscoveredService[] = [],
): Promise<PublishedPost> {
  console.log('[publishCommunity] Starting community creation...');
  if (!activeSigner) throw new Error('Unlock your Forum identity first');
  if (!activeCredential) {
    console.log('[publishCommunity] Registering forum identity...');
    await registerForumIdentity(baseUrl, auditServices);
    console.log('[publishCommunity] Identity registered.');
  }
  const epoch = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  console.log('[publishCommunity] Building and sealing envelope for jb:community:create:v1...');

  const sealed = await activeSigner.seal(
    { kind: 'device' },
    {
      domain: 'jb:community:create:v1',
      body: CommunityCreate.encode(
        CommunityCreate.fromPartial({
          name: input.name,
          title: input.title,
          description: input.description,
          rules_markdown: input.rulesMarkdown,
          is_private: input.isPrivate,
          is_nsfw: input.isNsfw,
          settings: {
            allow_text_posts: true,
            allow_link_posts: true,
            allow_image_posts: true,
            allow_video_posts: true,
            require_post_approval: false,
            allow_crossposts: true,
            minimum_karma_to_post: 0,
            minimum_account_age_days: 0,
          },
          theme: {
            primary: '#E85D2C',
            accent: '#F2A93D',
            background: '#0E0F11',
            foreground: '#F2F1EE',
          },
        }),
      ).finish(),
      scope: '',
      antiAbuse: {
        credential: activeCredential!.bytes,
        nullifier: await activeSigner.nullifier(epoch, 'jb:community:create:v1'),
        epoch,
        pow: new Uint8Array(0),
      },
    },
  );
  console.log('[publishCommunity] Envelope sealed. Submitting audited envelope...');
  const audited = await submitAuditedEnvelope(
    baseUrl,
    sealed.wireBytes,
    auditServices,
    activeAccessToken ?? undefined,
  );
  console.log('[publishCommunity] Audited envelope submitted successfully.', audited);
  return {
    contentId: audited.contentId,
    ...(audited.receipt ? { leafIndex: audited.receipt.leaf_index } : {}),
    ...(audited.certificate ? { certificate: audited.certificate } : {}),
    auditCopies: audited.auditCopies,
    auditPending: audited.auditPending,
    pending: audited.pending,
  };
}

async function publishForumAction(
  baseUrl: string,
  input: {
    readonly body: Uint8Array;
    readonly domain: string;
    readonly parent?: string;
    readonly scope?: string;
  },
  auditServices: readonly DiscoveredService[] = [],
): Promise<PublishedAction> {
  if (!activeSigner) throw new Error('Unlock your Forum identity first');
  if (!activeCredential) {
    await registerForumIdentity(baseUrl, auditServices);
  }
  const epoch = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const sealed = await activeSigner.seal(
    { kind: 'device' },
    {
      domain: input.domain,
      body: input.body,
      parent: input.parent,
      scope: input.scope,
      antiAbuse: {
        credential: activeCredential!.bytes,
        nullifier: await activeSigner.nullifier(epoch, input.domain),
        epoch,
        pow: new Uint8Array(0),
      },
    },
  );
  const audited = await submitAuditedEnvelope(
    baseUrl,
    sealed.wireBytes,
    auditServices,
    activeAccessToken ?? undefined,
  );
  return {
    contentId: audited.contentId,
    ...(audited.receipt ? { leafIndex: audited.receipt.leaf_index } : {}),
    ...(audited.certificate ? { certificate: audited.certificate } : {}),
    auditCopies: audited.auditCopies,
    auditPending: audited.auditPending,
    pending: audited.pending,
  };
}

export async function createForumCommunity(
  baseUrl: string,
  input: {
    readonly name: string;
    readonly title: string;
    readonly description: string;
    readonly rulesMarkdown: string;
    readonly isPrivate: boolean;
    readonly isNsfw: boolean;
  },
  auditServices: readonly DiscoveredService[] = [],
): Promise<PublishedAction> {
  if (!activeSigner) throw new Error('Unlock your Forum identity first');
  if (!activeCredential) await registerForumIdentity(baseUrl, auditServices);
  const identity = await activeSigner.identity({ kind: 'device' });
  const challenge = await requestJson<PowChallengeJson>(baseUrl, '/v1/credits/challenge', {
    method: 'POST',
    body: JSON.stringify({ author_key: base64(identity.publicKey) }),
  });
  const pow = await solvePow(challenge, identity.publicKey);
  const epoch = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const sealed = await activeSigner.seal(
    { kind: 'device' },
    {
      domain: 'jb:community:create:v1',
      body: CommunityCreate.encode(
        CommunityCreate.fromPartial({
          name: input.name,
          title: input.title,
          description: input.description,
          rules_markdown: input.rulesMarkdown,
          is_private: input.isPrivate,
          is_nsfw: input.isNsfw,
        }),
      ).finish(),
      antiAbuse: {
        credential: activeCredential!.bytes,
        nullifier: await activeSigner.nullifier(epoch, 'jb:community:create:v1'),
        epoch,
        pow,
      },
    },
  );
  const result = await submitAuditedEnvelope(baseUrl, sealed.wireBytes, auditServices);
  return {
    contentId: result.contentId,
    ...(result.receipt ? { leafIndex: result.receipt.leaf_index } : {}),
    ...(result.certificate ? { certificate: result.certificate } : {}),
    auditCopies: result.auditCopies,
    auditPending: result.auditPending,
    pending: result.pending,
  };
}

export async function setForumMembership(
  baseUrl: string,
  communityId: string,
  joined: boolean,
  auditServices: readonly DiscoveredService[] = [],
): Promise<PublishedAction> {
  return publishForumAction(
    baseUrl,
    {
      domain: joined ? 'jb:membership:join:v1' : 'jb:membership:leave:v1',
      scope: communityId,
      body: joined
        ? MembershipJoin.encode(MembershipJoin.fromPartial({ community: communityId })).finish()
        : MembershipLeave.encode(MembershipLeave.fromPartial({ community: communityId })).finish(),
    },
    auditServices,
  );
}

export async function updateForumPost(
  baseUrl: string,
  input: { readonly communityId: string; readonly target: string; readonly bodyMarkdown: string; readonly flair?: string },
  auditServices: readonly DiscoveredService[] = [],
): Promise<PublishedAction> {
  return publishForumAction(baseUrl, {
    domain: 'jb:post:update:v1', scope: input.communityId, parent: input.target,
    body: PostUpdate.encode(PostUpdate.fromPartial({ target: input.target, body_markdown: input.bodyMarkdown, flair: input.flair ?? '' })).finish(),
  }, auditServices);
}

export async function deleteForumPost(
  baseUrl: string,
  input: { readonly communityId: string; readonly target: string; readonly reason: string },
  auditServices: readonly DiscoveredService[] = [],
): Promise<PublishedAction> {
  return publishForumAction(baseUrl, {
    domain: 'jb:post:delete:v1', scope: input.communityId, parent: input.target,
    body: PostDelete.encode(PostDelete.fromPartial({ target: input.target, reason: input.reason })).finish(),
  }, auditServices);
}

export async function setForumSaved(
  baseUrl: string,
  input: { readonly target: string; readonly targetKind: 'post' | 'comment'; readonly save: boolean; readonly collection?: string },
  auditServices: readonly DiscoveredService[] = [],
): Promise<PublishedAction> {
  return publishForumAction(baseUrl, {
    domain: 'jb:social:save:v1', parent: input.target,
    body: SaveContent.encode(SaveContent.fromPartial({
      target: input.target,
      target_kind: input.targetKind === 'post' ? TargetKind.TARGET_KIND_POST : TargetKind.TARGET_KIND_COMMENT,
      save: input.save,
      collection: input.collection ?? '',
    })).finish(),
  }, auditServices);
}

export const updateForumComment = (baseUrl: string, input: CommentUpdate & { readonly communityId: string }, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:comment:update:v1', scope: input.communityId, parent: input.target, body: CommentUpdate.encode(CommentUpdate.fromPartial({ target: input.target, body_markdown: input.body_markdown })).finish() }, audit);

export const deleteForumComment = (baseUrl: string, input: CommentDelete & { readonly communityId: string }, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:comment:delete:v1', scope: input.communityId, parent: input.target, body: CommentDelete.encode(CommentDelete.fromPartial({ target: input.target, reason: input.reason })).finish() }, audit);

export const updateForumCommunity = (baseUrl: string, input: CommunityUpdate, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:community:update:v1', scope: input.target, body: CommunityUpdate.encode(CommunityUpdate.fromPartial(input)).finish() }, audit);

export const archiveForumCommunity = (baseUrl: string, input: CommunityArchive, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:community:archive:v1', scope: input.target, body: CommunityArchive.encode(CommunityArchive.fromPartial(input)).finish() }, audit);

export const publishForumModeration = (baseUrl: string, communityId: string, input: ModAction, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:mod:action:v1', scope: communityId, parent: input.target, body: ModAction.encode(ModAction.fromPartial(input)).finish() }, audit);

export const createForumReport = (baseUrl: string, communityId: string, input: ReportCreate, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:report:create:v1', scope: communityId, parent: input.target, body: ReportCreate.encode(ReportCreate.fromPartial(input)).finish() }, audit);

export const resolveForumReport = (baseUrl: string, communityId: string, input: ReportResolve, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:report:resolve:v1', scope: communityId, parent: input.target, body: ReportResolve.encode(ReportResolve.fromPartial(input)).finish() }, audit);

export const defineForumRole = (baseUrl: string, input: RoleDefine, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:role:define:v1', scope: input.community, body: RoleDefine.encode(RoleDefine.fromPartial(input)).finish() }, audit);

export const assignForumRole = (baseUrl: string, input: RoleAssign, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:role:assign:v1', scope: input.community, body: RoleAssign.encode(RoleAssign.fromPartial(input)).finish() }, audit);

export const revokeForumRole = (baseUrl: string, input: RoleRevoke, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:role:revoke:v1', scope: input.community, body: RoleRevoke.encode(RoleRevoke.fromPartial(input)).finish() }, audit);

export const updateForumProfile = (baseUrl: string, input: ProfileUpdate, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:profile:update:v1', body: ProfileUpdate.encode(ProfileUpdate.fromPartial(input)).finish() }, audit);

export const followForumIdentity = (baseUrl: string, input: FollowIdentity, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:social:follow:v1', body: FollowIdentity.encode(FollowIdentity.fromPartial(input)).finish() }, audit);

export const blockForumIdentity = (baseUrl: string, input: BlockIdentity, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:social:block:v1', body: BlockIdentity.encode(BlockIdentity.fromPartial(input)).finish() }, audit);

export const updateForumFeedPreferences = (baseUrl: string, input: FeedPreferences, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:prefs:feed:v1', body: FeedPreferences.encode(FeedPreferences.fromPartial(input)).finish() }, audit);

export const giveForumAward = (baseUrl: string, communityId: string, input: AwardGive, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:award:give:v1', scope: communityId, parent: input.target, body: AwardGive.encode(AwardGive.fromPartial(input)).finish() }, audit);

export const defineForumAwardType = (baseUrl: string, input: AwardTypeDefine, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:award:type:v1', body: AwardTypeDefine.encode(AwardTypeDefine.fromPartial(input)).finish() }, audit);

export const claimForumAttachment = (baseUrl: string, input: AttachmentClaim, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:attachment:claim:v1', body: AttachmentClaim.encode(AttachmentClaim.fromPartial(input)).finish() }, audit);

export async function uploadAndClaimForumAttachment(
  baseUrl: string,
  input: {
    readonly uri: string;
    readonly mime: string;
    readonly size: number;
    readonly altText: string;
  },
  audit: readonly DiscoveredService[] = [],
): Promise<PublishedAction> {
  if (!Number.isSafeInteger(input.size) || input.size <= 0) {
    throw new Error('The selected file has no readable content.');
  }
  const encoded = await FileSystem.readAsStringAsync(input.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = unbase64(encoded);
  const hash = new Uint8Array(
    await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, Uint8Array.from(bytes).buffer),
  );
  const ticket = await forumSessionRequest<{
    readonly url: string;
    readonly key: string;
    readonly headers?: Readonly<Record<string, string>>;
  }>(baseUrl, '/v1/attachments/upload-url', {
    method: 'POST',
    body: JSON.stringify({
      mime: input.mime,
      size: input.size,
      sha256: base64(hash),
    }),
  });
  if (ticket.url.startsWith('memory://')) {
    throw new Error('This development node uses an in-memory blob adapter that is not uploadable from a device.');
  }
  const uploadUrl = new URL(ticket.url, `${baseUrl.replace(/\/+$/, '')}/`).toString();
  const upload = await FileSystem.uploadAsync(uploadUrl, input.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { ...ticket.headers },
  });
  if (upload.status < 200 || upload.status >= 300) {
    throw new Error(`Attachment upload failed with HTTP ${upload.status}.`);
  }
  await forumSessionRequest(baseUrl, '/v1/attachments/confirm', {
    method: 'POST',
    body: JSON.stringify({
      key: ticket.key,
      mime: input.mime,
      size: input.size,
      sha256: base64(hash),
    }),
  });
  return claimForumAttachment(
    baseUrl,
    {
      storage_key: ticket.key,
      content_sha256: hash,
      mime: input.mime,
      size_bytes: BigInt(input.size),
      width: 0,
      height: 0,
      duration_ms: 0,
      alt_text: input.altText.trim(),
    },
    audit,
  );
}

export const sendForumMessage = (baseUrl: string, input: ForumMessageSend, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:message:forum:v1', body: ForumMessageSend.encode(ForumMessageSend.fromPartial(input)).finish() }, audit);

export async function sendEncryptedForumMessage(
  baseUrl: string,
  input: {
    readonly recipientKeyHex: string;
    readonly recipientX25519Base64: string;
    readonly recipientKemBase64: string;
    readonly plaintext: string;
    readonly thread: string;
    readonly ratchetIndex?: number;
  },
  audit: readonly DiscoveredService[] = [],
): Promise<PublishedAction> {
  if (!activeSigner) throw new Error('Unlock your Forum identity first');
  if (!/^[0-9a-f]{64}$/i.test(input.recipientKeyHex)) {
    throw new Error('Recipient Forum key must be 64 hexadecimal characters.');
  }
  const ratchetIndex = input.ratchetIndex ?? 0;
  const encrypted = await activeSigner.sealMessage(
    {
      x25519: unbase64(input.recipientX25519Base64),
      mlKem768: unbase64(input.recipientKemBase64),
    },
    text.encode(input.plaintext),
    input.thread,
    ratchetIndex,
  );
  return sendForumMessage(
    baseUrl,
    {
      recipient_key: Uint8Array.from(
        input.recipientKeyHex.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? [],
      ),
      kem_ciphertext: encrypted.kemCiphertext,
      ephemeral_x25519: encrypted.ephemeralX25519,
      ciphertext: encrypted.ciphertext,
      thread: input.thread,
      ratchet_index: ratchetIndex,
    },
    audit,
  );
}

export async function forumMessagingBundle(): Promise<{
  readonly x25519: string;
  readonly mlKem768: string;
}> {
  if (!activeSigner) throw new Error('Unlock your Forum identity first');
  const keys = await activeSigner.messagingPublicKey();
  return {
    x25519: base64(keys.x25519),
    mlKem768: base64(keys.mlKem768),
  };
}

interface ForumMessageDocument {
  readonly id: string;
  readonly senderKey: string;
  readonly recipientKey: string;
  readonly ciphertext: string;
  readonly kemCiphertext: string;
  readonly ephemeralX25519: string;
  readonly thread: string;
  readonly ratchetIndex: number;
  readonly createdAtMs: number;
}

export interface DecryptedForumMessage extends ForumMessageDocument {
  readonly plaintext: string | null;
}

export async function loadDecryptedForumMessages(
  baseUrl: string,
  identityKeyHex: string,
): Promise<readonly DecryptedForumMessage[]> {
  if (!activeSigner) throw new Error('Unlock your Forum identity first');
  const response = await forumSessionRequest<{ readonly items: readonly ForumMessageDocument[] }>(
    baseUrl,
    '/v1/me/messages?limit=100',
  );
  return Promise.all(
    response.items.map(async (message) => {
      if (message.recipientKey.toLowerCase() !== identityKeyHex.toLowerCase()) {
        return { ...message, plaintext: null };
      }
      try {
        const opened = await activeSigner!.openMessage(
          {
            kemCiphertext: unbase64(message.kemCiphertext),
            ephemeralX25519: unbase64(message.ephemeralX25519),
            ciphertext: unbase64(message.ciphertext),
          },
          message.thread,
          message.ratchetIndex,
        );
        return { ...message, plaintext: new TextDecoder().decode(opened) };
      } catch {
        return { ...message, plaintext: null };
      }
    }),
  );
}

export const emitForumLabel = (baseUrl: string, communityId: string, input: Label, audit: readonly DiscoveredService[] = []) =>
  publishForumAction(baseUrl, { domain: 'jb:label:emit:v1', scope: communityId, parent: input.target, body: Label.encode(Label.fromPartial(input)).finish() }, audit);

export async function revokeForumKey(baseUrl: string, audit: readonly DiscoveredService[] = []): Promise<PublishedAction> {
  if (!activeSigner) throw new Error('Unlock your Forum identity first');
  return publishForumAction(baseUrl, { domain: 'jb:key:revoke:forum:v1', body: await activeSigner.prepareDuressRevocation() }, audit);
}

export async function publishForumVote(
  baseUrl: string,
  input: {
    readonly communityId: string;
    readonly target: string;
    readonly targetKind: 'post' | 'comment';
    readonly value: -1 | 0 | 1;
  },
  auditServices: readonly DiscoveredService[] = [],
): Promise<PublishedAction> {
  return publishForumAction(
    baseUrl,
    {
      domain: 'jb:vote:cast:v1',
      body: VoteCast.encode(
        VoteCast.fromPartial({
          target: input.target,
          target_kind:
            input.targetKind === 'post'
              ? TargetKind.TARGET_KIND_POST
              : TargetKind.TARGET_KIND_COMMENT,
          value: input.value,
        }),
      ).finish(),
      parent: input.target,
      scope: input.communityId,
    },
    auditServices,
  );
}

export async function publishForumComment(
  baseUrl: string,
  input: {
    readonly bodyMarkdown: string;
    readonly communityId: string;
    readonly parentComment?: string;
    readonly postId: string;
  },
  auditServices: readonly DiscoveredService[] = [],
): Promise<PublishedAction> {
  const bodyMarkdown = input.bodyMarkdown.trim();
  if (!bodyMarkdown) throw new Error('Write a reply before publishing it');
  return publishForumAction(
    baseUrl,
    {
      domain: 'jb:comment:create:v1',
      body: CommentCreate.encode(
        CommentCreate.fromPartial({
          post: input.postId,
          parent_comment: input.parentComment ?? '',
          body_markdown: bodyMarkdown,
        }),
      ).finish(),
      parent: input.parentComment ?? input.postId,
      scope: input.communityId,
    },
    auditServices,
  );
}
