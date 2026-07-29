/**
 * BIP-32 HARDENED private-key derivation, over `CryptoBackend` primitives.
 *
 * ── Hardened only, and that is sufficient here ─────────────────────────────────────
 * Every path this system derives is fully hardened: BIP-85 is `m/83696968'/{app}'/{index}'`,
 * and `bip85.ts` uses nothing else. Hardened derivation needs no elliptic-curve point
 * arithmetic at all — it is HMAC-SHA512 plus one addition modulo the secp256k1 group order:
 *
 *     I  = HMAC-SHA512(c_par, 0x00 ‖ k_par ‖ ser32(i))
 *     k  = (IL + k_par) mod n
 *     c  = IR
 *
 * A non-hardened step would require serialising the public point, which needs secp256k1
 * scalar multiplication and therefore a curve implementation. Rather than pull one in for a
 * path this system never takes, `derive` REJECTS a non-hardened index. If a future feature
 * needs one, that is a deliberate addition with its own vectors — not a silent fallback that
 * quietly produces a different key.
 *
 * ── Why this replaced `@scure/bip32` ───────────────────────────────────────────────
 * Not because that library is wrong; it is a reference-quality implementation, and
 * `bip32.spec.ts` checks this file against it over a sweep of seeds and paths. It is because
 * `HDKey` computes its HMAC-SHA512 internally, so with it in the path the single most
 * frequently executed hash in the client — `rootSeed()` runs a full derivation on every
 * signature — could never reach native code. Expressing the standard over the seam moves it
 * there, with the reference kept as the thing that proves the move was exact (L-02).
 *
 * Specification: BIP-32 · BIP-85 · Plans/01-IDENTITY-PLANES.md §2.2
 */

import { cryptoBackend } from './backend.js';

const text = new TextEncoder();

/** The secp256k1 group order. `k` must be reduced modulo this at every step (BIP-32). */
const SECP256K1_ORDER =
  0xfffffffffffffffffffffffffffffffe_baaedce6_af48a03b_bfd25e8c_d0364141n;

const HARDENED = 0x8000_0000;

export interface ExtendedPrivateKey {
  readonly privateKey: Uint8Array;
  readonly chainCode: Uint8Array;
}

/** `I = HMAC-SHA512("Bitcoin seed", seed)` — IL is the master key, IR the chain code. */
export function masterKey(seed: Uint8Array): ExtendedPrivateKey {
  if (seed.length < 16 || seed.length > 64) {
    throw new Error('bip32: seed must be between 16 and 64 bytes');
  }
  const material = cryptoBackend().hmacSha512(text.encode('Bitcoin seed'), seed);
  const privateKey = material.slice(0, 32);
  if (!isValidScalar(privateKey)) {
    // Probability ~2^-127. BIP-32 says to treat the seed as invalid rather than to fudge it.
    throw new Error('bip32: master key is not a valid secp256k1 scalar');
  }
  return { privateKey, chainCode: material.slice(32) };
}

export function deriveHardenedChild(
  parent: ExtendedPrivateKey,
  index: number,
): ExtendedPrivateKey {
  if (!Number.isInteger(index) || index < 0 || index >= HARDENED) {
    throw new Error('bip32: hardened index must be an integer in [0, 2^31)');
  }
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0x00; // hardened: the PRIVATE key goes in, prefixed with a zero byte
  data.set(parent.privateKey, 1);
  new DataView(data.buffer).setUint32(33, index + HARDENED, false);

  const material = cryptoBackend().hmacSha512(parent.chainCode, data);
  data.fill(0);

  const tweak = material.slice(0, 32);
  if (!isValidScalar(tweak)) {
    throw new Error(`bip32: derived tweak at ${index}' is not a valid scalar`);
  }
  const derived = (toBigInt(tweak) + toBigInt(parent.privateKey)) % SECP256K1_ORDER;
  tweak.fill(0);
  if (derived === 0n) throw new Error(`bip32: derived key at ${index}' is zero`);

  return { privateKey: toBytes(derived, 32), chainCode: material.slice(32) };
}

/**
 * Derive along a fully hardened path such as `m/83696968'/10'/0'`.
 *
 * Every component must carry the `'` (or `h`/`H`) marker. An unmarked component is an error,
 * not an implicit non-hardened step — see the header.
 */
export function derivePath(seed: Uint8Array, path: string): ExtendedPrivateKey {
  const parts = path.trim().split('/');
  if ((parts.shift() ?? '').toLowerCase() !== 'm') {
    throw new Error(`bip32: path must start with "m": ${path}`);
  }
  let node = masterKey(seed);
  for (const part of parts) {
    if (part.length === 0) continue;
    const hardened = /['hH]$/.test(part);
    if (!hardened) {
      throw new Error(
        `bip32: non-hardened component "${part}" — this build derives hardened paths only`,
      );
    }
    const index = Number(part.slice(0, -1));
    if (!Number.isInteger(index)) throw new Error(`bip32: bad path component "${part}"`);
    const next = deriveHardenedChild(node, index);
    node.privateKey.fill(0);
    node = next;
  }
  return node;
}

function isValidScalar(value: Uint8Array): boolean {
  const scalar = toBigInt(value);
  return scalar > 0n && scalar < SECP256K1_ORDER;
}

function toBigInt(value: Uint8Array): bigint {
  let result = 0n;
  for (const byte of value) result = (result << 8n) | BigInt(byte);
  return result;
}

function toBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let remaining = value;
  for (let index = length - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}
