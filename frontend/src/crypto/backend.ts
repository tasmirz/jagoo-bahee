import {
  jsCryptoBackend,
  setCryptoBackend,
  type CryptoBackend,
} from '@jagoo/sdk/crypto';
import JagooCrypto from '../../modules/jagoo-crypto';

function nativeBackend(): CryptoBackend | null {
  const native = JagooCrypto;
  if (!native) return null;
  return {
    id: native.backendId,
    randomBytes: (length) => native.randomBytes(length),
    sha256: (data) => native.sha256(data),
    sha512: (data) => native.sha512(data),
    hmacSha512: (key, data) => native.hmacSha512(key, data),
    hkdfSha256: (ikm, salt, info, length) =>
      native.hkdfSha256(ikm, salt ?? null, info, length),
    pbkdf2Sha512: (password, salt, iterations, length) =>
      native.pbkdf2Sha512(password, salt, iterations, length),
    scrypt: (password, salt, params) =>
      native.scrypt(password, salt, params.N, params.r, params.p, params.dkLen),
    argon2id: (password, salt, params) =>
      native.argon2id(
        password,
        salt,
        params.memoryKiB,
        params.iterations,
        params.parallelism,
        params.dkLen,
      ),
    ed25519PublicKey: (seed) => native.ed25519PublicKey(seed),
    ed25519Sign: (message, seed) => native.ed25519Sign(message, seed),
    ed25519Verify: (signature, message, publicKey) =>
      native.ed25519Verify(signature, message, publicKey),
    x25519PublicKey: (secret) => native.x25519PublicKey(secret),
    x25519SharedSecret: (secret, publicKey) =>
      native.x25519SharedSecret(secret, publicKey),
    chacha20poly1305Seal: (key, nonce, plaintext, aad) =>
      native.chacha20poly1305Seal(key, nonce, plaintext, aad),
    chacha20poly1305Open: (key, nonce, ciphertext, aad) =>
      native.chacha20poly1305Open(key, nonce, ciphertext, aad),
    xchacha20poly1305Seal: (key, nonce, plaintext, aad) =>
      native.xchacha20poly1305Seal(key, nonce, plaintext, aad),
    xchacha20poly1305Open: (key, nonce, ciphertext, aad) =>
      native.xchacha20poly1305Open(key, nonce, ciphertext, aad),
    mlKem768KeyPair: (seed) => native.mlKem768KeyPair(seed),
    mlKem768Encapsulate: (publicKey, message) =>
      native.mlKem768Encapsulate(publicKey, message),
    mlKem768Decapsulate: (cipherText, secretKey) =>
      native.mlKem768Decapsulate(cipherText, secretKey),
    mlDsa44KeyPair: (seed) => native.mlDsa44KeyPair(seed),
    mlDsa44Sign: (message, secretKey) => native.mlDsa44Sign(message, secretKey),
    mlDsa44Verify: (signature, message, publicKey) =>
      native.mlDsa44Verify(signature, message, publicKey),
  };
}

export const androidCryptoBackend = nativeBackend();
export const installedCryptoBackend = androidCryptoBackend ?? jsCryptoBackend;

// Module evaluation happens before any screen or signer can run. iOS and Jest intentionally
// retain the portable backend; Android development and release clients install the native one.
setCryptoBackend(installedCryptoBackend);

export function cryptoBackendDiagnostics(): {
  readonly active: string;
  readonly nativeAvailable: boolean;
} {
  return {
    active: installedCryptoBackend.id,
    nativeAvailable: androidCryptoBackend !== null,
  };
}
