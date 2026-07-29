/**
 * The crypto seam state — one interface, swappable per platform (ADR-017).
 *
 * ── Why a seam and not a fork ──────────────────────────────────────────────────────
 * This package is consumed by three toolchains from ONE built artefact: the NestJS node, the
 * Expo client, and the cross-language vector gate. The bytes signed on a phone must be the
 * bytes verified by a node, so there cannot be a "mobile crypto" copy of any of this — a
 * second implementation of canonical hashing or signing is precisely the ambiguity the whole
 * rebuild exists to foreclose. What can differ is who *computes* the primitive, and that is
 * all this interface abstracts.
 *
 * ── Every method is synchronous, and that is load-bearing ──────────────────────────
 * `contentId`, `verifyEnvelope`, `verifyReceipt`, `verifyProvenance` and `sealStateFor` are
 * synchronous today, and they are called from React `useMemo` and from pure pipeline steps.
 * Making any of them async would ripple through every call site and every render path, so the
 * native implementation is required to expose synchronous JSI functions rather than a
 * promise-returning bridge. A backend that cannot answer synchronously does not belong here.
 *
 * ── Primitives only ───────────────────────────────────────────────────────────────
 * No method here knows what an envelope is, what a plane is, or what a nullifier means. BIP39
 * and BIP32/BIP85 semantics live in `bip39.ts` and `bip32.ts` as shared logic over these
 * primitives, so there is exactly one implementation of the *meaning* and only the arithmetic
 * changes per platform. Two implementations of "how a mnemonic becomes a seed" is how the two
 * silently disagree, and a user whose identity derives differently on a new phone has lost it.
 *
 * ── Failure semantics ─────────────────────────────────────────────────────────────
 * Verification returns `false` and never throws: a bad signature from a hostile peer is an
 * ordinary rejection at pipeline step 9, and an exception there is a trivial denial of
 * service. AEAD `open` DOES throw on tag failure, because a caller that ignores a forged
 * ciphertext has a much worse bug than one that catches.
 */

export interface KeyPairBytes {
  readonly publicKey: Uint8Array;
  readonly secretKey: Uint8Array;
}

export interface KemEncapsulation {
  readonly cipherText: Uint8Array;
  readonly sharedSecret: Uint8Array;
}

export interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly dkLen: number;
}

export interface Argon2idParams {
  readonly memoryKiB: number;
  readonly iterations: number;
  readonly parallelism: number;
  readonly dkLen: number;
}

export interface CryptoBackend {
  /**
   * Which implementation this is. Surfaced by the on-device parity suite and in diagnostics,
   * so "is this phone actually using the native module" is an observable fact rather than an
   * assumption. Never branched on by library code — that would be the transport-ID ban
   * (NFR-M03) wearing a different hat.
   */
  readonly id: string;

  // ── Randomness ──────────────────────────────────────────────────────────────────
  /** A CSPRNG. Never `Math.random`, on any platform, for any length. */
  randomBytes(length: number): Uint8Array;

  // ── Hashes and KDFs ─────────────────────────────────────────────────────────────
  sha256(data: Uint8Array): Uint8Array;
  sha512(data: Uint8Array): Uint8Array;
  hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array;
  /** `salt` may be omitted — HKDF then uses a zero-filled salt of the hash length. */
  hkdfSha256(
    ikm: Uint8Array,
    salt: Uint8Array | undefined,
    info: Uint8Array,
    length: number,
  ): Uint8Array;
  pbkdf2Sha512(
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    length: number,
  ): Uint8Array;
  /** The identity vault's KDF. N = 2^16 in this app, so this is the slowest call in it. */
  scrypt(password: Uint8Array, salt: Uint8Array, params: ScryptParams): Uint8Array;
  /** Anti-abuse proof of work (AB-02). Memory-hard on purpose. */
  argon2id(password: Uint8Array, salt: Uint8Array, params: Argon2idParams): Uint8Array;

  // ── Ed25519 — every per-message signature in the system ─────────────────────────
  /** `seed` is the 32-byte RFC 8032 private key, NOT a 64-byte expanded key. */
  ed25519PublicKey(seed: Uint8Array): Uint8Array;
  ed25519Sign(message: Uint8Array, seed: Uint8Array): Uint8Array;
  ed25519Verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;

  // ── X25519 — the classical half of the hybrid ───────────────────────────────────
  x25519PublicKey(secret: Uint8Array): Uint8Array;
  x25519SharedSecret(secret: Uint8Array, publicKey: Uint8Array): Uint8Array;

  // ── AEAD ────────────────────────────────────────────────────────────────────────
  /** IETF ChaCha20-Poly1305, 12-byte nonce. Returns ciphertext ‖ 16-byte tag. */
  chacha20poly1305Seal(
    key: Uint8Array,
    nonce: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array,
  ): Uint8Array;
  /** Throws on tag failure. A forged ciphertext must never be mistaken for empty plaintext. */
  chacha20poly1305Open(
    key: Uint8Array,
    nonce: Uint8Array,
    ciphertext: Uint8Array,
    aad: Uint8Array,
  ): Uint8Array;
  /** XChaCha20-Poly1305, 24-byte nonce. The at-rest identity vault uses this. */
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

  // ── Post-quantum ────────────────────────────────────────────────────────────────
  /** `seed` is 64 bytes (d ‖ z). Keygen MUST be deterministic in it. */
  mlKem768KeyPair(seed: Uint8Array): KeyPairBytes;
  /** `message` is the 32-byte encapsulation randomness, so this is deterministic too. */
  mlKem768Encapsulate(publicKey: Uint8Array, message: Uint8Array): KemEncapsulation;
  mlKem768Decapsulate(cipherText: Uint8Array, secretKey: Uint8Array): Uint8Array;
  /** `seed` is the 32-byte ξ. Certificates only — never per message (KY-05). */
  mlDsa44KeyPair(seed: Uint8Array): KeyPairBytes;
  mlDsa44Sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array;
  mlDsa44Verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;
}

let active: CryptoBackend | null = null;

/**
 * Install a backend. Called once, before anything signs.
 *
 * The default is resolved lazily by `cryptoBackend()` so that Node and the vector gate need
 * no installation step at all, and so that installing the native one on a phone is a single
 * call at app start rather than a change to every consumer.
 */
export function setCryptoBackend(backend: CryptoBackend): void {
  active = backend;
}

let fallback: (() => CryptoBackend) | null = null;

/**
 * Register the default. `js-backend.ts` calls this on import; nothing else may.
 *
 * Indirected through a registration hook rather than imported directly, because a static
 * import of the JS backend from here would pull `@noble` and `@scure` into every bundle that
 * touches the seam — including a native build that has no use for them.
 */
export function registerDefaultCryptoBackend(factory: () => CryptoBackend): void {
  fallback ??= factory;
}

export function cryptoBackend(): CryptoBackend {
  if (active) return active;
  if (!fallback) {
    throw new Error(
      'no crypto backend installed: import "@jagoo/sdk/crypto" or call setCryptoBackend()',
    );
  }
  active = fallback();
  return active;
}

/** Test-only: forget the installed backend so a spec can prove the seam is consulted. */
export function resetCryptoBackendForTesting(): void {
  active = null;
}
