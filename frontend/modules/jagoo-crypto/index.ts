import { requireOptionalNativeModule } from 'expo';

export interface NativeKeyPair {
  readonly publicKey: Uint8Array;
  readonly secretKey: Uint8Array;
}

export interface NativeKemEncapsulation {
  readonly cipherText: Uint8Array;
  readonly sharedSecret: Uint8Array;
}

export interface JagooCryptoNativeModule {
  readonly backendId: string;
  randomBytes(length: number): Uint8Array;
  sha256(data: Uint8Array): Uint8Array;
  sha512(data: Uint8Array): Uint8Array;
  hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array;
  hkdfSha256(
    ikm: Uint8Array,
    salt: Uint8Array | null,
    info: Uint8Array,
    length: number,
  ): Uint8Array;
  pbkdf2Sha512(
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    length: number,
  ): Uint8Array;
  scrypt(
    password: Uint8Array,
    salt: Uint8Array,
    n: number,
    r: number,
    p: number,
    length: number,
  ): Uint8Array;
  argon2id(
    password: Uint8Array,
    salt: Uint8Array,
    memoryKiB: number,
    iterations: number,
    parallelism: number,
    length: number,
  ): Uint8Array;
  ed25519PublicKey(seed: Uint8Array): Uint8Array;
  ed25519Sign(message: Uint8Array, seed: Uint8Array): Uint8Array;
  ed25519Verify(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
  ): boolean;
  x25519PublicKey(secret: Uint8Array): Uint8Array;
  x25519SharedSecret(secret: Uint8Array, publicKey: Uint8Array): Uint8Array;
  chacha20poly1305Seal(
    key: Uint8Array,
    nonce: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array,
  ): Uint8Array;
  chacha20poly1305Open(
    key: Uint8Array,
    nonce: Uint8Array,
    ciphertext: Uint8Array,
    aad: Uint8Array,
  ): Uint8Array;
  xchacha20poly1305Seal(
    key: Uint8Array,
    nonce: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array,
  ): Uint8Array;
  xchacha20poly1305Open(
    key: Uint8Array,
    nonce: Uint8Array,
    ciphertext: Uint8Array,
    aad: Uint8Array,
  ): Uint8Array;
  mlKem768KeyPair(seed: Uint8Array): NativeKeyPair;
  mlKem768Encapsulate(
    publicKey: Uint8Array,
    message: Uint8Array,
  ): NativeKemEncapsulation;
  mlKem768Decapsulate(cipherText: Uint8Array, secretKey: Uint8Array): Uint8Array;
  mlDsa44KeyPair(seed: Uint8Array): NativeKeyPair;
  mlDsa44Sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array;
  mlDsa44Verify(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
  ): boolean;
}

function loadNativeModule(): JagooCryptoNativeModule | null {
  try {
    // jest-expo replaces the optional loader with a strict mock lookup. Treat that the same
    // as an absent iOS implementation so ordinary tests exercise the JS backend.
    return requireOptionalNativeModule<JagooCryptoNativeModule>('JagooCrypto');
  } catch {
    return null;
  }
}

export default loadNativeModule();
