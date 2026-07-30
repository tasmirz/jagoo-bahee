/**
 * BIP85 child-entropy derivation.
 *
 * AUTH-04: replaces v1's BIP-32-only derivation, so one root secret can produce keys for
 * multiple algorithms — Ed25519 for signing, X25519 for key agreement, ML-KEM for the
 * post-quantum half — without any of them being derivable from another.
 *
 * ── SEP-01, the invariant that matters most here ────────────────────────────────────
 * `M_forum` and `M_signal` MUST be independent secrets. Deriving both planes from one
 * mnemonic is FORBIDDEN: a device seizure would then let an adversary who already knows
 * the public Signal identity derive the Forum identity and deanonymise its entire
 * history. That is a catastrophic, irreversible leak in exactly the population this
 * system exists to protect.
 *
 * This module therefore takes a seed and a plane, and has no function that produces both
 * planes' keys from one input. `deriveForumKey` and `deriveSignalKey` are separate
 * entry points on purpose.
 *
 * Specification: Plans/01-IDENTITY-PLANES.md §2.2, §3.2 · Plans/requirements/R2 §3
 */

import { cryptoBackend } from './backend.js';
import { derivePath } from './bip32.js';
import {
  generateMnemonic,
  mnemonicToSeed as mnemonicToSeedBytes,
  validateMnemonic,
} from './bip39.js';

/** BIP85 application root. */
const BIP85_PURPOSE = 83696968;

/** Forum-plane derivation paths (Plans/01 §2.2). */
export const FORUM_PATH = {
  /** m/83696968'/10'/0' — device identity, root of this plane. */
  DEVICE: 10,
  /** m/83696968'/11'/n' — per-community identity, unlinkable across communities (AUTH-17). */
  COMMUNITY: 11,
  /** m/83696968'/12'/e' — per-epoch posting secret, the nullifier source (AUTH-19). */
  EPOCH: 12,
  /** m/83696968'/13'/0' — DM key agreement (X25519 + ML-KEM-768). */
  MESSAGING: 13,
  /** m/83696968'/14'/0' — credential blinding secret (AUTH-18). */
  CREDENTIAL: 14,
} as const;

/** Signal-plane derivation paths (Plans/01 §3.2). Separate root secret — SEP-01. */
export const SIGNAL_PATH = {
  /** m/83696968'/20'/0' — device identity. */
  DEVICE: 20,
  /** m/83696968'/21'/c' — channel signing key; an org may run several channels. */
  CHANNEL: 21,
  /** m/83696968'/22'/0' — messaging key agreement. */
  MESSAGING: 22,
  /** m/83696968'/23'/0' — signed prekey batch seed. */
  PREKEY: 23,
  /**
   * m/83696968'/24'/n' — Reticulum transport material.
   *
   * This is intentionally distinct from the legacy Jagoo message/prekey tree. Reticulum
   * identities contain an X25519 key followed by an Ed25519 key, and reusing either
   * legacy key would create a cross-protocol correlation point.
   */
  RNS_TRANSPORT: 24,
} as const;

export type ForumPath = (typeof FORUM_PATH)[keyof typeof FORUM_PATH];
export type SignalPath = (typeof SIGNAL_PATH)[keyof typeof SIGNAL_PATH];

/** AUTH-01: 24 words, 256-bit. There is no server-side recovery — the mnemonic is it. */
export function generateRootMnemonic(): string {
  return generateMnemonic(256);
}

/** AUTH-02: import with word-list validation. */
export function isValidMnemonic(mnemonic: string): boolean {
  return validateMnemonic(mnemonic);
}

/** AUTH-03: the optional BIP-39 passphrase is the 25th word. */
export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  return mnemonicToSeedBytes(mnemonic, passphrase);
}

/**
 * BIP85 entropy at m/83696968'/{application}'/{index}'.
 *
 * Returns 32 bytes of child entropy, suitable as a private key for any algorithm.
 * Per BIP85 the derived key is run through HMAC-SHA512 with the "bip-entropy-from-k"
 * key, so the output is independent of the BIP-32 key structure it came from.
 */
function deriveEntropy(seed: Uint8Array, application: number, index: number): Uint8Array {
  const path = `m/${BIP85_PURPOSE}'/${application}'/${index}'`;
  const node = derivePath(seed, path);
  const entropy = cryptoBackend().hmacSha512(
    new TextEncoder().encode('bip-entropy-from-k'),
    node.privateKey,
  );
  node.privateKey.fill(0);
  node.chainCode.fill(0);
  return entropy.slice(0, 32);
}

/**
 * Derive a Forum-plane key. Takes the FORUM seed only.
 *
 * PA-01: activity in one community must not be linkable to activity in another, which is
 * why `COMMUNITY` takes an index and each community gets its own key.
 */
export function deriveForumKey(forumSeed: Uint8Array, path: ForumPath, index = 0): Uint8Array {
  return deriveEntropy(forumSeed, path, index);
}

/**
 * Derive a Signal-plane key. Takes the SIGNAL seed only.
 *
 * There is deliberately no function that accepts one seed and returns keys for both
 * planes — SEP-01 is enforced by the shape of this API, not by a comment.
 */
export function deriveSignalKey(signalSeed: Uint8Array, path: SignalPath, index = 0): Uint8Array {
  return deriveEntropy(signalSeed, path, index);
}
