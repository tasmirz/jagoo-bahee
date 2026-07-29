/**
 * Hybrid first-message encryption for Forum DMs (MS-01/MSG-09).
 *
 * X25519 and ML-KEM-768 secrets are combined through HKDF. Breaking either primitive is
 * insufficient to recover the ChaCha20-Poly1305 key. The 12-byte nonce is prefixed to the
 * ciphertext because ForumMessageSend intentionally has one opaque ciphertext field.
 */
import { concatBytes } from '../core/wire.js';
import { cryptoBackend } from './backend.js';

const info = new TextEncoder().encode('jb:forum:message:hybrid:v1');

export interface MessagingPublicKey {
  readonly x25519: Uint8Array;
  readonly mlKem768: Uint8Array;
}

export interface MessagingSecretKey {
  readonly x25519: Uint8Array;
  readonly mlKem768: Uint8Array;
}

export interface MessagingKeyPair {
  readonly publicKey: MessagingPublicKey;
  readonly secretKey: MessagingSecretKey;
}

export interface HybridCiphertext {
  readonly kemCiphertext: Uint8Array;
  readonly ephemeralX25519: Uint8Array;
  /** nonce || ChaCha20-Poly1305 ciphertext and tag. */
  readonly ciphertext: Uint8Array;
}

function sessionKey(classical: Uint8Array, postQuantum: Uint8Array): Uint8Array {
  return cryptoBackend().hkdfSha256(
    concatBytes(classical, postQuantum),
    undefined,
    info,
    32,
  );
}

export function messagingKeyPair(
  x25519Seed: Uint8Array = cryptoBackend().randomBytes(32),
  mlKemSeed: Uint8Array = cryptoBackend().randomBytes(64),
): MessagingKeyPair {
  if (x25519Seed.length !== 32) throw new Error('X25519 seed must be 32 bytes');
  if (mlKemSeed.length !== 64) throw new Error('ML-KEM-768 seed must be 64 bytes');
  const backend = cryptoBackend();
  const kem = backend.mlKem768KeyPair(mlKemSeed);
  return {
    publicKey: {
      x25519: backend.x25519PublicKey(x25519Seed),
      mlKem768: kem.publicKey,
    },
    secretKey: { x25519: x25519Seed, mlKem768: kem.secretKey },
  };
}

export function sealFirstMessage(
  recipient: MessagingPublicKey,
  plaintext: Uint8Array,
  aad: Uint8Array = new Uint8Array(),
  ephemeralSeed: Uint8Array = cryptoBackend().randomBytes(32),
  kemMessage: Uint8Array = cryptoBackend().randomBytes(32),
  nonce: Uint8Array = cryptoBackend().randomBytes(12),
): HybridCiphertext {
  const backend = cryptoBackend();
  const ephemeralX25519 = backend.x25519PublicKey(ephemeralSeed);
  const classical = backend.x25519SharedSecret(ephemeralSeed, recipient.x25519);
  const kem = backend.mlKem768Encapsulate(recipient.mlKem768, kemMessage);
  const key = sessionKey(classical, kem.sharedSecret);
  return {
    kemCiphertext: kem.cipherText,
    ephemeralX25519,
    ciphertext: concatBytes(
      nonce,
      backend.chacha20poly1305Seal(key, nonce, plaintext, aad),
    ),
  };
}

export function openFirstMessage(
  recipient: MessagingSecretKey,
  message: HybridCiphertext,
  aad: Uint8Array = new Uint8Array(),
): Uint8Array {
  if (message.ciphertext.length < 12 + 16) throw new Error('ciphertext is truncated');
  const nonce = message.ciphertext.slice(0, 12);
  const encrypted = message.ciphertext.slice(12);
  const backend = cryptoBackend();
  const classical = backend.x25519SharedSecret(recipient.x25519, message.ephemeralX25519);
  const postQuantum = backend.mlKem768Decapsulate(message.kemCiphertext, recipient.mlKem768);
  return backend.chacha20poly1305Open(
    sessionKey(classical, postQuantum),
    nonce,
    encrypted,
    aad,
  );
}
