/**
 * Forum key vault. Raw mnemonic and derived seeds never leave this module (SG-01).
 * SecureStore keeps the root device-bound and unavailable while the phone is locked.
 */
import * as Crypto from 'expo-crypto';
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
  PostCreate,
  PostKind,
  TargetKind,
  VoteCast,
} from '@jagoo/sdk/proto';
import { solvePow, type PowChallengeJson } from '../data/pow';
import type { DiscoveredService } from '../data/node-config';
import { submitSignedEnvelope } from '../offline/outbox';

const ROOT_KEY = 'jb.forum.root.v1';
const FORUM_CREDENTIAL_KEY = 'jb.forum.credential.v1';
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
      ROOT_KEY,
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
    const encoded = await SecureStore.getItemAsync(ROOT_KEY, storeOptions);
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
    return (await SecureStore.getItemAsync(ROOT_KEY, storeOptions)) !== null;
  }

  /** CRS-19: callable from the locked emergency surface. */
  static async panicConfiguredVault(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ROOT_KEY, storeOptions),
      SecureStore.deleteItemAsync(FORUM_CREDENTIAL_KEY, storeOptions),
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
let activeCredential: Credential | null = null;

export interface ForumSessionSummary {
  readonly configured: boolean;
  readonly unlocked: boolean;
  readonly authenticated: boolean;
  readonly identityId?: string;
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
  const response = await fetch(new URL(path, `${baseUrl.replace(/\/+$/, '')}/`).toString(), {
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
  const configured = await SecureForumSigner.exists();
  const identity = activeSigner ? await activeSigner.identity({ kind: 'device' }) : null;
  return {
    configured,
    unlocked: activeSigner !== null,
    authenticated: activeAccessToken !== null,
    ...(identity ? { identityId: identity.id } : {}),
  };
}

/**
 * Makes an authenticated read without exposing the bearer token outside the signer boundary.
 * Feature workspaces use this for profile, notification, message, and operator projections.
 */
export async function forumSessionRequest<T>(baseUrl: string, path: string): Promise<T> {
  if (!activeAccessToken) {
    throw new Error('Register and authenticate this Forum identity first');
  }
  return requestJson<T>(baseUrl, path, {
    headers: { Authorization: `Bearer ${activeAccessToken}` },
  });
}

export async function createForumIdentity(
  lockPassphrase: string,
): Promise<{ readonly recoveryPhrase: string; readonly identityId: string }> {
  const recoveryPhrase = generateRootMnemonic();
  activeSigner?.lock();
  activeSigner = await SecureForumSigner.create(lockPassphrase, recoveryPhrase);
  activeAccessToken = null;
  activeCredential = null;
  await SecureStore.deleteItemAsync(FORUM_CREDENTIAL_KEY, storeOptions);
  const identity = await activeSigner.identity({ kind: 'device' });
  return { recoveryPhrase, identityId: identity.id };
}

export async function importForumIdentity(
  recoveryPhrase: string,
  lockPassphrase: string,
): Promise<string> {
  if (!isValidMnemonic(recoveryPhrase.trim())) throw new Error('Enter a valid 24-word phrase');
  activeSigner?.lock();
  activeSigner = await SecureForumSigner.create(
    lockPassphrase,
    recoveryPhrase.trim().replace(/\s+/g, ' '),
  );
  activeAccessToken = null;
  activeCredential = null;
  await SecureStore.deleteItemAsync(FORUM_CREDENTIAL_KEY, storeOptions);
  return (await activeSigner.identity({ kind: 'device' })).id;
}

export async function unlockForumIdentity(lockPassphrase: string): Promise<string> {
  activeSigner?.lock();
  activeSigner = await SecureForumSigner.unlock(lockPassphrase);
  activeAccessToken = null;
  const storedCredential = await SecureStore.getItemAsync(FORUM_CREDENTIAL_KEY, storeOptions);
  activeCredential = storedCredential ? { bytes: unbase64(storedCredential) } : null;
  return (await activeSigner.identity({ kind: 'device' })).id;
}

export function lockForumIdentity(): void {
  activeSigner?.lock();
  activeSigner = null;
  activeAccessToken = null;
  activeCredential = null;
}

export async function checkCaptchaReachability(
  baseUrl: string,
  mcaptchaServices: readonly DiscoveredService[] = [],
): Promise<{ reachable: boolean; statusDetails: string }> {
  console.log('[Captcha Check] Probing captcha service reachability...', {
    baseUrl,
    mcaptchaServicesCount: mcaptchaServices.length,
    services: mcaptchaServices,
  });

  if (mcaptchaServices.length === 0) {
    console.log(
      '[Captcha Check] No dedicated mCaptcha service advertised in node discovery. Node uses proof-of-work anti-abuse.',
    );
    return {
      reachable: false,
      statusDetails: 'No mCaptcha endpoint advertised by node discovery.',
    };
  }

  for (const service of mcaptchaServices) {
    try {
      console.log(`[Captcha Check] Probing mCaptcha endpoint at ${service.address}...`);
      const response = await fetch(service.address, { method: 'GET' });
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
  mcaptchaServices: readonly DiscoveredService[] = [],
): Promise<string> {
  if (!activeSigner) throw new Error('Unlock your Forum identity first');
  console.log('[Register] Starting Forum Identity registration & authentication flow...');

  // Verbose logging for Captcha reachability check
  const captchaStatus = await checkCaptchaReachability(baseUrl, mcaptchaServices);
  console.log('[Register] Captcha Status:', captchaStatus);

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

  console.log('[Register] Requesting auth challenge from /v1/auth/challenge...');
  const challenge = await requestJson<{
    readonly challenge: string;
    readonly claim: string;
  }>(baseUrl, `/v1/auth/challenge?public_key=${encodeURIComponent(base64(identity.publicKey))}`);

  const challengeBytes = unbase64(challenge.challenge);
  const signature = await signer.sign(
    { kind: 'device' },
    authBytes(identity.publicKey, challengeBytes),
  );

  console.log('[Register] Authenticating via POST /v1/auth...');
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
  console.log('[Register] Auth token obtained.');

  console.log('[Register] Requesting blind credential parameters...');
  const parameters = await requestJson<BlindCredentialPublicKey>(
    baseUrl,
    '/v1/credentials/parameters',
  );
  signer.configureCredentialKey(parameters);

  console.log('[Register] Requesting blind credential issue...');
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
    FORUM_CREDENTIAL_KEY,
    base64(activeCredential.bytes),
    storeOptions,
  );
  console.log('[Register] Registration and credential issuance complete for:', identity.id);
  return identity.id;
}

export async function publishForumPost(
  baseUrl: string,
  input: {
    readonly title: string;
    readonly bodyMarkdown: string;
    readonly communityId?: string;
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
          kind: PostKind.POST_KIND_TEXT,
          body_markdown: input.bodyMarkdown,
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
