/**
 * BIP-39 mnemonic semantics, over `CryptoBackend` primitives.
 *
 * ── Why this is shared logic and not a backend method ──────────────────────────────
 * A user's entire identity is the mnemonic. If Android turned a mnemonic into one seed and
 * iOS turned the same mnemonic into another, that user would restore on a new phone into an
 * account that is not theirs — silently, with no error, and with no way back. Two
 * implementations of this is the single worst place in the system to have two implementations.
 *
 * So the *meaning* lives here, once: which bits are the checksum, how words map to indices,
 * what the PBKDF2 salt is. Only the arithmetic — SHA-256 and PBKDF2-HMAC-SHA512 — is taken
 * from the backend, and that is exactly what the parity suite compares byte for byte.
 *
 * PBKDF2 at 2048 iterations is also the reason this matters for speed: `rootSeed()` runs it on
 * every signature, so it is the most-executed expensive primitive in the client.
 *
 * Specification: BIP-39 · Plans/01-IDENTITY-PLANES.md §2.1
 */

import { cryptoBackend } from './backend.js';
import { ENGLISH_WORDLIST } from './wordlist-english.js';

const text = new TextEncoder();

/**
 * NFKD, when the runtime has it.
 *
 * BIP-39 normalises both the mnemonic and the passphrase to NFKD. Hermes builds without full
 * ICU do not always provide `String.prototype.normalize`, and a missing method must not take
 * the app down at identity-creation time. For the English word list this is a no-op — every
 * word is ASCII — so falling through is exact rather than approximate. A non-ASCII passphrase
 * on such a build would normalise differently, which is why the fallback is narrow and
 * deliberate rather than silent: `normalizesUnicode` reports it.
 */
export const normalizesUnicode: boolean = typeof String.prototype.normalize === 'function';

function nfkd(value: string): string {
  return normalizesUnicode ? value.normalize('NFKD') : value;
}

/** AUTH-01 — 24 words, 256 bits of entropy. There is no server-side recovery. */
export function generateMnemonic(strengthBits = 256): string {
  if (strengthBits % 32 !== 0 || strengthBits < 128 || strengthBits > 256) {
    throw new Error('mnemonic strength must be 128, 160, 192, 224 or 256 bits');
  }
  return entropyToMnemonic(cryptoBackend().randomBytes(strengthBits / 8));
}

export function entropyToMnemonic(entropy: Uint8Array): string {
  if (entropy.length % 4 !== 0 || entropy.length < 16 || entropy.length > 32) {
    throw new Error('entropy must be 16, 20, 24, 28 or 32 bytes');
  }
  // The checksum is the first `bits/32` bits of SHA-256(entropy), appended to the entropy;
  // the result divides exactly into 11-bit groups, one per word.
  const checksumBits = (entropy.length * 8) / 32;
  const checksum = cryptoBackend().sha256(entropy);
  const bits = [...toBits(entropy), ...toBits(checksum).slice(0, checksumBits)];

  const words: string[] = [];
  for (let index = 0; index < bits.length; index += 11) {
    let value = 0;
    for (let offset = 0; offset < 11; offset += 1) value = (value << 1) | (bits[index + offset] ?? 0);
    const word = ENGLISH_WORDLIST[value];
    if (word === undefined) throw new Error('mnemonic index outside the word list');
    words.push(word);
  }
  return words.join(' ');
}

/** AUTH-02 — import with word-list AND checksum validation. */
export function validateMnemonic(mnemonic: string): boolean {
  try {
    return entropyToMnemonic(mnemonicToEntropy(mnemonic)) === normalisedWords(mnemonic).join(' ');
  } catch {
    return false;
  }
}

export function mnemonicToEntropy(mnemonic: string): Uint8Array {
  const words = normalisedWords(mnemonic);
  if (words.length % 3 !== 0 || words.length < 12 || words.length > 24) {
    throw new Error('a mnemonic must be 12, 15, 18, 21 or 24 words');
  }
  const bits: number[] = [];
  for (const word of words) {
    const index = ENGLISH_WORDLIST.indexOf(word);
    if (index < 0) throw new Error(`"${word}" is not a BIP-39 word`);
    for (let offset = 10; offset >= 0; offset -= 1) bits.push((index >> offset) & 1);
  }
  const entropyBits = (bits.length * 32) / 33;
  if (entropyBits % 8 !== 0) throw new Error('mnemonic length does not divide into whole bytes');

  const entropy = new Uint8Array(entropyBits / 8);
  for (let index = 0; index < entropy.length; index += 1) {
    let value = 0;
    for (let offset = 0; offset < 8; offset += 1) value = (value << 1) | (bits[index * 8 + offset] ?? 0);
    entropy[index] = value;
  }
  return entropy;
}

/**
 * AUTH-03 — the optional BIP-39 passphrase is the 25th word.
 *
 * PBKDF2-HMAC-SHA512, 2048 iterations, salt `"mnemonic" ‖ passphrase`, 64-byte output. Every
 * constant here is normative; none of them is a tuning knob.
 */
export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  return cryptoBackend().pbkdf2Sha512(
    text.encode(nfkd(normalisedWords(mnemonic).join(' '))),
    text.encode(nfkd(`mnemonic${passphrase}`)),
    2048,
    64,
  );
}

function normalisedWords(mnemonic: string): string[] {
  return nfkd(mnemonic).trim().split(/\s+/).filter(Boolean);
}

function toBits(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let offset = 7; offset >= 0; offset -= 1) bits.push((byte >> offset) & 1);
  }
  return bits;
}
