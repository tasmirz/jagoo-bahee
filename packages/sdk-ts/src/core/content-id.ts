/**
 * Content addressing.
 *
 *   content_id = "jb1" + base32-nopad-lowercase( SHA-256( canonical_bytes(fields 1..12) ) )
 *
 * VIS-03: content is addressed by its hash. Same post, same ID, every node, forever.
 * Deduplication, replay protection, and cross-node references all fall out of this one
 * property rather than being separately engineered.
 *
 * EN-03: the signature is excluded from the hash, so the ID is stable across re-signing.
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §1, §7
 */

import { cryptoBackend } from '../crypto/backend.js';
import { base32Encode } from './base32.js';
import { canonicalBytes } from './canonical.js';
import { PREFIX, type CanonicalEnvelope } from './types.js';

/** Content ID from already-computed canonical bytes. */
export function contentIdFromCanonical(canonical: Uint8Array): string {
  return PREFIX.CONTENT + base32Encode(cryptoBackend().sha256(canonical));
}

/** Content ID of an envelope. */
export function contentId(env: CanonicalEnvelope): string {
  return contentIdFromCanonical(canonicalBytes(env));
}

/** Identity ID: jbk1 + base32(public key). Stable across nodes (Plans/02 §7). */
export function identityId(publicKey: Uint8Array): string {
  return PREFIX.IDENTITY + base32Encode(publicKey);
}

/** Channel ID: jbc1 + base32(channel signing key). CH-01 — the name is never the ID. */
export function channelId(signingKey: Uint8Array): string {
  return PREFIX.CHANNEL + base32Encode(signingKey);
}

/** Server ID: jbs1 + base32(server public key). FD-02 — identity is the key, not a URL. */
export function serverId(serverKey: Uint8Array): string {
  return PREFIX.SERVER + base32Encode(serverKey);
}

/**
 * Community ID: `<name>@<origin_fingerprint>` (COM-19).
 *
 * Names are not globally unique, so the origin fingerprint disambiguates. v1 signed a
 * Mongo ObjectId here, which a remote node can neither resolve nor verify — the specific
 * defect that made federation impossible (ID-01).
 */
export function communityId(name: string, originServerId: string): string {
  return `${name}@${originServerId}`;
}

const CONTENT_ID_PATTERN = /^jb1[a-z2-7]{52}$/;

export function isContentId(s: string): boolean {
  return CONTENT_ID_PATTERN.test(s);
}
