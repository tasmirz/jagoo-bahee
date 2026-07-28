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
 * Populated further in P1 (inclusion proofs, signature badges).
 */

import { canonicalBytes, contentIdFromCanonical, type CanonicalEnvelope } from '@jagoo/sdk/core';

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
