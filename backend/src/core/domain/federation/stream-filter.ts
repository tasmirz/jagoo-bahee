/**
 * What a peer's `StreamRequest` / `BackfillRequest` actually selects — and the plane guard
 * (T2.5, T2.15, FG-02, FG-10).
 *
 * ── FG-10: one plane per stream, always ─────────────────────────────────────────────
 * A Forum envelope and a Signal envelope must never be carried in the same stream frame
 * sequence. This is not tidiness. The two planes are unlinkable BY CONSTRUCTION: a Forum
 * key is pseudonymous, a Signal key is bound to a verifiable real-world claim, and if a
 * person's known broadcast identity were linkable to their forum identity, publishing
 * under their real name as a relief coordinator would retroactively deanonymise every
 * forum post that key ever made. Co-batching the two planes on one connection hands an
 * observer a timing correlation for free — the traffic itself becomes the linkage, even
 * though neither payload mentions the other.
 *
 * So a stream is opened FOR a plane, the guard rejects any frame from another plane, and
 * the mismatch is a hard `PLANE_MISMATCH`, never a filtered-out frame.
 */

import type { Plane, Priority } from '../envelope.js';
import { EnvelopeRejected, RejectionCode } from '../errors.js';
import type { StreamFilter } from '../../ports/network.port.js';

export interface StreamCandidate {
  readonly plane: Plane;
  readonly priority: Priority;
  /** Community ID for FORUM, channel ID for SIGNAL. Empty for node-wide records. */
  readonly scope: string;
  readonly logIndex: number;
}

/**
 * An empty repeated field in a protobuf request is indistinguishable from an absent one,
 * so an empty list means "no restriction on this axis" — the only reading under which a
 * peer asking for everything can express it.
 */
const unrestricted = (list: readonly unknown[] | undefined): boolean =>
  list === undefined || list.length === 0;

export function matchesStreamFilter(candidate: StreamCandidate, filter: StreamFilter): boolean {
  if (filter.sinceIndex !== undefined && candidate.logIndex < filter.sinceIndex) return false;
  if (!unrestricted(filter.planes) && !filter.planes!.includes(candidate.plane)) return false;
  if (!unrestricted(filter.classes) && !filter.classes!.includes(candidate.priority)) return false;

  // Communities and channels select on the SAME field for different planes, because the
  // envelope's scope is the community ID on Forum and the channel ID on Signal. Asking for
  // a community therefore also excludes every Signal envelope, which is the behaviour a
  // caller means and the behaviour FG-10 wants.
  const scoped = [...(filter.communities ?? []), ...(filter.channels ?? [])];
  if (scoped.length > 0 && !scoped.includes(candidate.scope)) return false;

  return true;
}

/**
 * The single plane a request selects, or null when it asks for more than one.
 *
 * Returning null rather than picking one is deliberate: a caller that receives null must
 * open two streams, and the type makes forgetting that a compile error rather than a
 * silent co-batch.
 */
export function soleRequestedPlane(filter: StreamFilter): Plane | null {
  const planes = filter.planes ?? [];
  return planes.length === 1 ? (planes[0] as Plane) : null;
}

/**
 * FG-10 — the wire guard. Called on every frame in both directions.
 *
 * Written now, before any Signal domain exists, per `P0-P2-IMPLEMENTATION-PLAN.md` §5.1:
 * a guard added after the second plane ships is a guard added after the leak.
 */
export function assertStreamPlane(streamPlane: Plane, framePlane: Plane): void {
  if (streamPlane !== framePlane) {
    throw new EnvelopeRejected(
      RejectionCode.PLANE_MISMATCH,
      'a federation stream carries exactly one plane',
      { field: 'plane' },
    );
  }
}
