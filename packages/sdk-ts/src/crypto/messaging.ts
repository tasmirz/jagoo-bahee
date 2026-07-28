/**
 * Hybrid first-message encryption for Forum DMs (MS-01/MSG-09).
 *
 * X25519 and ML-KEM-768 secrets are combined through HKDF. Breaking either primitive is
 * insufficient to recover the ChaCha20-Poly1305 key. The 12-byte nonce is prefixed to the
 * ciphertext because ForumMessageSend intentionally has one opaque ciphertext field.
 */
import { chacha20poly1305 } from '@noble/ciphers/chacha';
import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, randomBytes } from '@noble/hashes/utils';
import { ml_kem768 } from '@noble/post-quantum/ml-kem';

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
  return hkdf(sha256, concatBytes(classical, postQuantum), undefined, info, 32);
}

export function messagingKeyPair(
  x25519Seed: Uint8Array = randomBytes(32),
  mlKemSeed: Uint8Array = randomBytes(64),
): MessagingKeyPair {
  if (x25519Seed.length !== 32) throw new Error('X25519 seed must be 32 bytes');
  if (mlKemSeed.length !== 64) throw new Error('ML-KEM-768 seed must be 64 bytes');
  const kem = ml_kem768.keygen(mlKemSeed);
  return {
    publicKey: {
      x25519: x25519.getPublicKey(x25519Seed),
      mlKem768: kem.publicKey,
    },
    secretKey: { x25519: x25519Seed, mlKem768: kem.secretKey },
  };
}

export function sealFirstMessage(
  recipient: MessagingPublicKey,
  plaintext: Uint8Array,
  aad: Uint8Array = new Uint8Array(),
  ephemeralSeed: Uint8Array = randomBytes(32),
  kemMessage: Uint8Array = randomBytes(32),
  nonce: Uint8Array = randomBytes(12),
): HybridCiphertext {
  const ephemeralX25519 = x25519.getPublicKey(ephemeralSeed);
  const classical = x25519.getSharedSecret(ephemeralSeed, recipient.x25519);
  const kem = ml_kem768.encapsulate(recipient.mlKem768, kemMessage);
  const key = sessionKey(classical, kem.sharedSecret);
  return {
    kemCiphertext: kem.cipherText,
    ephemeralX25519,
    ciphertext: concatBytes(nonce, chacha20poly1305(key, nonce, aad).encrypt(plaintext)),
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
  const classical = x25519.getSharedSecret(recipient.x25519, message.ephemeralX25519);
  const postQuantum = ml_kem768.decapsulate(message.kemCiphertext, recipient.mlKem768);
  return chacha20poly1305(sessionKey(classical, postQuantum), nonce, aad).decrypt(encrypted);
}
