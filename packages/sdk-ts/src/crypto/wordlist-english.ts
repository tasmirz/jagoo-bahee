/**
 * The BIP-39 English word list — 2048 words, and nothing else.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────────
 * `bip39.ts` implements mnemonic semantics over `CryptoBackend` primitives so that there is
 * exactly one implementation of "how a mnemonic becomes a seed" across every platform. It
 * needs the word list, and the word list happens to ship inside `@scure/bip39` — which every
 * other file is forbidden to import.
 *
 * A word list is DATA, not an algorithm: no key material passes through it, nothing about it
 * is timing-sensitive, and it is byte-identical in every BIP-39 implementation ever written.
 * So it gets a single, narrow, named exception in the lint rule rather than being vendored as
 * a 13 KB literal that would then need its own checksum test to prove it had not drifted.
 */

export { wordlist as ENGLISH_WORDLIST } from '@scure/bip39/wordlists/english';
