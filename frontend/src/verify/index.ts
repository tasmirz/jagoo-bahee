/**
 * On-device verification.
 *
 * The client verifies; it never trusts the server's word. Signature badges and inclusion
 * proofs are recomputed here from the `provenance` block, and must work with the network
 * fully disabled — a node that is lying and a node that is unreachable have to be
 * distinguishable on the device itself.
 *
 * Everything here goes through `@jagoo/sdk`, deliberately: the app must compute content
 * IDs with the exact same canonical encoder as the backend, the Rust reference and the
 * Python reference. A second implementation on the client is how a "valid signature" badge
 * ends up disagreeing with the network about what was signed — which is the v1 failure this
 * whole design forecloses.
 *
 * Includes offline signature, receipt, STH, and Merkle inclusion verification.
 */

import {
  base32Decode,
  canonicalBytes,
  contentIdFromCanonical,
  serverId,
  verifyReceipt,
  type CanonicalEnvelope,
  type OfflineReceipt,
} from '@jagoo/sdk/core';
import { cryptoBackend, ed25519 } from '@jagoo/sdk/crypto';

/**
 * Recompute an envelope's content ID locally.
 *
 * Never trust a `content_id` that arrived over the wire: it is derived data, and accepting
 * the server's value would let a node relabel content it did not author (VIS-03).
 */
export function computeContentId(envelope: CanonicalEnvelope): string {
  return contentIdFromCanonical(canonicalBytes(envelope));
}

/**
 * True when a claimed content ID actually matches the envelope it arrived with.
 *
 * A mismatch means the envelope was altered in transit or the sender is lying about what
 * it holds. Either way the content is not what it claims to be.
 */
export function contentIdMatches(envelope: CanonicalEnvelope, claimed: string): boolean {
  return computeContentId(envelope) === claimed;
}

export interface ProvenanceJson {
  readonly contentId: string;
  readonly authorKey: string;
  readonly keyAlg: string;
  readonly signature: string;
  readonly canonicalBytes: string;
  readonly receipt: {
    readonly logIndex: number;
    readonly leafIndex: number;
    readonly acceptedAtMs: number;
    readonly serverId: string;
    readonly serverKey: string;
    readonly serverSignature: string;
    readonly sth: {
      readonly treeSize: number;
      readonly serverKey: string;
      readonly rootHash: string;
      readonly timestampMs: number;
      readonly signature: string;
    };
    readonly inclusionProof: readonly string[];
  } | null;
}

export interface VerificationResult {
  readonly contentId: boolean;
  readonly authorSignature: boolean;
  readonly publicationReceipt: boolean;
  readonly verified: boolean;
}

const fromBase64 = (value: string): Uint8Array =>
  Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));

const VERIFICATION_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFIED_CONTENT = 4096;
const MAX_AUTHOR_KEYS = 512;
const text = new TextEncoder();

interface VerificationCacheEntry {
  readonly fingerprint: string;
  readonly expiresAtMs: number;
  readonly result: VerificationResult;
}

interface AuthorKeyCacheEntry {
  readonly key: Uint8Array;
  readonly expiresAtMs: number;
}

const verificationCache = new Map<string, VerificationCacheEntry>();
const authorKeyCache = new Map<string, AuthorKeyCacheEntry>();

function boundedPut<K, V>(cache: Map<K, V>, key: K, value: V, limit: number): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) {
    const oldest = cache.keys().next().value as K | undefined;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function fingerprint(value: ProvenanceJson): string {
  const digest = cryptoBackend().sha256(text.encode(JSON.stringify(value)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function authorKeyFor(encoded: string, nowMs: number): Uint8Array {
  const cached = authorKeyCache.get(encoded);
  if (cached && cached.expiresAtMs > nowMs) {
    boundedPut(authorKeyCache, encoded, cached, MAX_AUTHOR_KEYS);
    return cached.key;
  }
  const key = base32Decode(encoded.replace(/^jbk1/, ''));
  boundedPut(
    authorKeyCache,
    encoded,
    { key, expiresAtMs: nowMs + VERIFICATION_TTL_MS },
    MAX_AUTHOR_KEYS,
  );
  return key;
}

function parseReceipt(
  value: NonNullable<ProvenanceJson['receipt']>,
  contentId: string,
): OfflineReceipt {
  return {
    contentId,
    logIndex: value.logIndex,
    leafIndex: value.leafIndex,
    acceptedAtMs: value.acceptedAtMs,
    serverId: value.serverId,
    serverKey: fromBase64(value.serverKey),
    signature: fromBase64(value.serverSignature),
    sth: {
      treeSize: value.sth.treeSize,
      serverKey: fromBase64(value.sth.serverKey),
      rootHash: fromBase64(value.sth.rootHash),
      timestampMs: value.sth.timestampMs,
      signature: fromBase64(value.sth.signature),
    },
    inclusionProof: value.inclusionProof.map(fromBase64),
  };
}

/**
 * What the Seal is allowed to claim about a piece of content.
 *
 * `unsigned` is not the same as `failed`: content with no provenance block at all is
 * content the node did not vouch for, whereas `failed` means it presented evidence that
 * did not hold. Collapsing the two would either accuse an honest cache entry of forgery or
 * excuse a real one.
 */
export type SealState = 'synced' | 'queued' | 'failed' | 'unsigned';

/**
 * Verify a provenance block and say what the Seal should show.
 *
 * This is the whole point of the client: `THR-01` says content validity must be checkable
 * with no network and no trusted server, and a Seal wired to a hardcoded prop — which is
 * what shipped before this — asserts exactly the thing it is supposed to prove. Every
 * badge in the UI now derives from this function or shows nothing.
 */
export function sealStateFor(value: ProvenanceJson | null | undefined): SealState {
  if (!value) return 'unsigned';
  const result = verifyProvenance(value);
  if (result.verified) return 'synced';
  // Authorship holds; the node has not witnessed it yet. That is the offline-authored and
  // awaiting-receipt case (VIS-08), not a failure.
  if (result.contentId && result.authorSignature && !value.receipt) return 'queued';
  return 'failed';
}

/** Verifies the complete provenance block with no network access (T1.36/T1.37). */
export function verifyProvenance(value: ProvenanceJson): VerificationResult {
  const nowMs = Date.now();
  const proofFingerprint = fingerprint(value);
  const cached = verificationCache.get(value.contentId);
  if (
    cached &&
    cached.expiresAtMs > nowMs &&
    cached.fingerprint === proofFingerprint
  ) {
    boundedPut(verificationCache, value.contentId, cached, MAX_VERIFIED_CONTENT);
    return cached.result;
  }

  let result: VerificationResult;
  try {
    const canonical = fromBase64(value.canonicalBytes);
    const authorKey = authorKeyFor(value.authorKey, nowMs);
    const contentIdValid = contentIdFromCanonical(canonical) === value.contentId;
    const authorSignature =
      value.keyAlg === 'ED25519' &&
      ed25519.verify(fromBase64(value.signature), canonical, authorKey);
    const receipt = value.receipt ? parseReceipt(value.receipt, value.contentId) : null;
    const publicationReceipt =
      receipt !== null &&
      serverId(receipt.serverKey) === receipt.serverId &&
      verifyReceipt(receipt);
    result = {
      contentId: contentIdValid,
      authorSignature,
      publicationReceipt,
      verified: contentIdValid && authorSignature && publicationReceipt,
    };
  } catch {
    result = {
      contentId: false,
      authorSignature: false,
      publicationReceipt: false,
      verified: false,
    };
  }
  boundedPut(
    verificationCache,
    value.contentId,
    {
      fingerprint: proofFingerprint,
      expiresAtMs: nowMs + VERIFICATION_TTL_MS,
      result,
    },
    MAX_VERIFIED_CONTENT,
  );
  return result;
}

/** Test and panic-wipe hook; production callers normally let the fixed TTL expire entries. */
export function clearVerificationCache(): void {
  verificationCache.clear();
  authorKeyCache.clear();
}
