/**
 * Forum key vault. Raw mnemonic and derived seeds never leave this module (SG-01).
 * SecureStore keeps the root device-bound and unavailable while the phone is locked.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { scryptAsync } from '@noble/hashes/scrypt';
import {
  FORUM_PATH,
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
  identityId,
  pqAttestationBytes,
  revocationAuthorizationBytes,
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

const ROOT_KEY = 'jb.forum.root.v1';
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
  const bytes = Uint8Array.from(value);
  return new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes.buffer));
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
    private readonly recoveryPassphrase: string,
    private readonly credentialKey?: BlindCredentialPublicKey,
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
    const wrappingKey = await scryptAsync(text.encode(lockPassphrase), salt, {
      N: 1 << 16,
      r: 8,
      p: 1,
      dkLen: 32,
    });
    const ciphertext = xchacha20poly1305(wrappingKey, nonce).encrypt(
      text.encode(mnemonic.normalize('NFKD')),
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
    return new SecureForumSigner(wrappingKey, recoveryPassphrase);
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
    const wrappingKey = await scryptAsync(text.encode(lockPassphrase), unbase64(payload.salt), {
      N: 1 << 16,
      r: 8,
      p: 1,
      dkLen: 32,
    });
    try {
      const mnemonic = new TextDecoder().decode(
        xchacha20poly1305(wrappingKey, unbase64(payload.nonce)).decrypt(
          unbase64(payload.ciphertext),
        ),
      );
      if (!isValidMnemonic(mnemonic)) throw new Error('invalid recovered mnemonic');
    } catch {
      wrappingKey.fill(0);
      throw new Error('app passphrase is incorrect');
    }
    return new SecureForumSigner(wrappingKey, recoveryPassphrase, credentialKey);
  }

  static async exists(): Promise<boolean> {
    return (await SecureStore.getItemAsync(ROOT_KEY, storeOptions)) !== null;
  }

  private async rootSeed(): Promise<Uint8Array> {
    const encoded = await SecureStore.getItemAsync(ROOT_KEY, storeOptions);
    if (!encoded) throw new Error('Forum identity is not configured');
    const payload = JSON.parse(encoded) as {
      version: number;
      nonce: string;
      ciphertext: string;
    };
    const mnemonic = new TextDecoder().decode(
      xchacha20poly1305(this.wrappingKey, unbase64(payload.nonce)).decrypt(
        unbase64(payload.ciphertext),
      ),
    );
    return mnemonicToSeed(mnemonic, this.recoveryPassphrase);
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
    await SecureStore.deleteItemAsync(ROOT_KEY, storeOptions);
    this.wrappingKey.fill(0);
  }
}
