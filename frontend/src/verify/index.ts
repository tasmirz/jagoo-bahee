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
import { ed25519 } from '@jagoo/sdk/crypto';

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

/** Verifies the complete provenance block with no network access (T1.36/T1.37). */
export function verifyProvenance(value: ProvenanceJson): VerificationResult {
  try {
    const canonical = fromBase64(value.canonicalBytes);
    const authorKey = base32Decode(value.authorKey.replace(/^jbk1/, ''));
    const contentIdValid = contentIdFromCanonical(canonical) === value.contentId;
    const authorSignature =
      value.keyAlg === 'ED25519' &&
      ed25519.verify(fromBase64(value.signature), canonical, authorKey);
    const receipt = value.receipt ? parseReceipt(value.receipt, value.contentId) : null;
    const publicationReceipt =
      receipt !== null &&
      serverId(receipt.serverKey) === receipt.serverId &&
      verifyReceipt(receipt);
    return {
      contentId: contentIdValid,
      authorSignature,
      publicationReceipt,
      verified: contentIdValid && authorSignature && publicationReceipt,
    };
  } catch {
    return {
      contentId: false,
      authorSignature: false,
      publicationReceipt: false,
      verified: false,
    };
  }
}
