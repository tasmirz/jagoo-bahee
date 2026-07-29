/**
 * The portable JavaScript crypto backend (ADR-017).
 *
 * ── This is the ONLY file in the repository allowed to import `@noble` or `@scure` ──
 * Enforced by `no-restricted-imports` in `eslint.config.mjs`, and that rule is itself
 * exercised by a test that writes a violating file and requires ESLint to reject it (L-11: a
 * gate that is only configured is not a gate). The point is not that the JS implementations
 * are bad — they are excellent — it is that once native code exists there must be exactly one
 * place where the choice is made, or a well-meaning import quietly puts the slow path back on
 * a phone and nothing fails.
 *
 * ── Who runs this ─────────────────────────────────────────────────────────────────
 * The NestJS node, the cross-language vector gate, every Jest and vitest run, and iOS — where
 * `frontend/modules/jagoo-crypto` ships no implementation. So this is not a fallback for
 * unusual cases; it is the majority of executions, and it stays first-class.
 */

import { chacha20poly1305, xchacha20poly1305 } from '@noble/ciphers/chacha';
import { ed25519 as nobleEd25519, x25519 as nobleX25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { scrypt } from '@noble/hashes/scrypt';
import { sha256, sha512 } from '@noble/hashes/sha2';
import { argon2id } from '@noble/hashes/argon2';
import { ml_kem768 } from '@noble/post-quantum/ml-kem';
import { ml_dsa44 } from '@noble/post-quantum/ml-dsa';
import { randomBytes as nobleRandomBytes } from '@noble/hashes/utils';
import {
  registerDefaultCryptoBackend,
  type Argon2idParams,
  type CryptoBackend,
  type KemEncapsulation,
  type KeyPairBytes,
  type ScryptParams,
} from './backend-state.js';

export const jsCryptoBackend: CryptoBackend = {
  id: 'js',

  randomBytes: (length) => nobleRandomBytes(length),

  sha256: (data) => sha256(data),
  sha512: (data) => sha512(data),
  hmacSha512: (key, data) => hmac(sha512, key, data),
  hkdfSha256: (ikm, salt, info, length) => hkdf(sha256, ikm, salt, info, length),
  pbkdf2Sha512: (password, salt, iterations, length) =>
    pbkdf2(sha512, password, salt, { c: iterations, dkLen: length }),
  scrypt: (password, salt, params: ScryptParams) =>
    scrypt(password, salt, { N: params.N, r: params.r, p: params.p, dkLen: params.dkLen }),
  argon2id: (password, salt, params: Argon2idParams) =>
    argon2id(password, salt, {
      m: params.memoryKiB,
      t: params.iterations,
      p: params.parallelism,
      dkLen: params.dkLen,
    }),

  ed25519PublicKey: (seed) => nobleEd25519.getPublicKey(seed),
  ed25519Sign: (message, seed) => nobleEd25519.sign(message, seed),
  ed25519Verify: (signature, message, publicKey) => {
    // Never throws — a malformed signature from a hostile peer is an ordinary rejection at
    // pipeline step 9, and an exception there would be a trivial denial of service.
    try {
      return nobleEd25519.verify(signature, message, publicKey);
    } catch {
      return false;
    }
  },

  x25519PublicKey: (secret) => nobleX25519.getPublicKey(secret),
  x25519SharedSecret: (secret, publicKey) => nobleX25519.getSharedSecret(secret, publicKey),

  chacha20poly1305Seal: (key, nonce, plaintext, aad) =>
    chacha20poly1305(key, nonce, aad).encrypt(plaintext),
  chacha20poly1305Open: (key, nonce, ciphertext, aad) =>
    chacha20poly1305(key, nonce, aad).decrypt(ciphertext),
  xchacha20poly1305Seal: (key, nonce, plaintext, aad) =>
    xchacha20poly1305(key, nonce, aad).encrypt(plaintext),
  xchacha20poly1305Open: (key, nonce, ciphertext, aad) =>
    xchacha20poly1305(key, nonce, aad).decrypt(ciphertext),

  mlKem768KeyPair: (seed): KeyPairBytes => {
    const keys = ml_kem768.keygen(seed);
    return { publicKey: keys.publicKey, secretKey: keys.secretKey };
  },
  mlKem768Encapsulate: (publicKey, message): KemEncapsulation => {
    const result = ml_kem768.encapsulate(publicKey, message);
    return { cipherText: result.cipherText, sharedSecret: result.sharedSecret };
  },
  mlKem768Decapsulate: (cipherText, secretKey) => ml_kem768.decapsulate(cipherText, secretKey),

  mlDsa44KeyPair: (seed): KeyPairBytes => {
    const keys = ml_dsa44.keygen(seed);
    return { publicKey: keys.publicKey, secretKey: keys.secretKey };
  },
  mlDsa44Sign: (message, secretKey) => ml_dsa44.sign(secretKey, message),
  mlDsa44Verify: (signature, message, publicKey) => {
    try {
      return ml_dsa44.verify(publicKey, message, signature);
    } catch {
      return false;
    }
  },
};

registerDefaultCryptoBackend(() => jsCryptoBackend);
