/**
 * Per-peer, per-class token buckets (T2.10, FD-15, FD-16, FG-09).
 *
 * Pure state transitions. The adapter owns where the bucket lives — Redis for a durable
 * node, a Map for a test — and this file owns what the bucket does. That separation is why
 * FG-09 ("a PROBATION peer's class-3 envelopes are rejected, class 0–2 accepted") is a
 * unit test rather than a load test.
 *
 * ── BR-04: classes 0–2 have capacity bulk traffic cannot consume ────────────────────
 * The bucket is PER CLASS, not per peer. One shared bucket would let a forum backlog
 * exhaust the same allowance an emergency broadcast needs, which is the one starvation
 * this system may never permit — a queued emergency broadcast overtakes 500 queued votes,
 * and it must also be *admitted* ahead of them.
 */

import { Priority } from '../envelope.js';
import type { PeerQuota, PeerTrust } from '../../ports/network.port.js';
import { allowedClasses } from './trust.js';

export interface BucketState {
  readonly tokens: number;
  readonly lastRefillMs: number;
}

export function newBucket(capacity: number, nowMs: number): BucketState {
  return { tokens: capacity, lastRefillMs: nowMs };
}

/** Continuous refill, so a peer is not punished for arriving mid-window. */
export function refill(
  state: BucketState,
  perMinute: number,
  capacity: number,
  nowMs: number,
): BucketState {
  if (nowMs <= state.lastRefillMs) return state;
  const elapsed = nowMs - state.lastRefillMs;
  const gained = (elapsed / 60_000) * perMinute;
  return { tokens: Math.min(capacity, state.tokens + gained), lastRefillMs: nowMs };
}

export interface QuotaDecision {
  readonly allowed: boolean;
  readonly state: BucketState;
  /** How many units the request exceeded the bucket by. Drives `backpressure_hint_ms`. */
  readonly overBy: number;
}

export function consume(
  state: BucketState,
  cost: number,
  perMinute: number,
  nowMs: number,
): QuotaDecision {
  const capacity = Math.max(perMinute, cost);
  const refilled = refill(state, perMinute, capacity, nowMs);
  if (refilled.tokens >= cost) {
    return { allowed: true, state: { ...refilled, tokens: refilled.tokens - cost }, overBy: 0 };
  }
  return { allowed: false, state: refilled, overBy: cost - refilled.tokens };
}

export interface PairDecision {
  readonly allowed: boolean;
  readonly envelopes: BucketState;
  readonly bytes: BucketState;
  /** The larger shortfall of the two, in bucket units. Drives `backpressure_hint_ms`. */
  readonly overBy: number;
}

/**
 * Spend the envelope bucket and the byte bucket together, all or nothing.
 *
 * FD-15 grants both `envelopes_per_min` and `bytes_per_min`, and a peer is over quota if it
 * exceeds EITHER. They must therefore be decided together and spent together: checking them
 * in sequence and spending as you go means a request refused by the second bucket has
 * already drained a token from the first, so a peer sending oversized envelopes silently
 * burns its envelope allowance on requests that were never admitted. Over a stream that
 * converts a byte-limit breach into an envelope-limit breach, and the hint the peer gets
 * back tells it to slow down when it should be sending less.
 *
 * A rate of zero means "not permitted", never "unlimited" — treating it as unlimited is how
 * FG-09 inverts.
 */
export function consumePair(input: {
  readonly envelopes: BucketState;
  readonly bytes: BucketState;
  readonly envelopeCost: number;
  readonly envelopesPerMinute: number;
  readonly byteCost: number;
  readonly bytesPerMinute: number;
  readonly nowMs: number;
}): PairDecision {
  const envelopeCapacity = Math.max(input.envelopesPerMinute, input.envelopeCost);
  const byteCapacity = Math.max(input.bytesPerMinute, input.byteCost);

  const envelopes = refill(
    input.envelopes,
    input.envelopesPerMinute,
    envelopeCapacity,
    input.nowMs,
  );
  const bytes = refill(input.bytes, input.bytesPerMinute, byteCapacity, input.nowMs);

  const envelopeShort = Math.max(0, input.envelopeCost - envelopes.tokens);
  const byteShort = Math.max(0, input.byteCost - bytes.tokens);

  if (envelopeShort > 0 || byteShort > 0) {
    // Neither bucket is debited. The refilled timestamps are kept, because time passing is
    // not something a refusal should undo.
    return { allowed: false, envelopes, bytes, overBy: Math.max(envelopeShort, byteShort) };
  }

  return {
    allowed: true,
    envelopes: { ...envelopes, tokens: envelopes.tokens - input.envelopeCost },
    bytes: { ...bytes, tokens: bytes.tokens - input.byteCost },
    overBy: 0,
  };
}

export const QuotaOutcome = {
  ACCEPTED: 'ACCEPTED',
  /** The trust level does not carry this class at all. Not a rate problem — a reach problem. */
  CLASS_NOT_PERMITTED: 'CLASS_NOT_PERMITTED',
  /** Within reach, over rate. The peer gets a hint, not a closed connection (FD-15). */
  RATE_LIMITED: 'RATE_LIMITED',
  BLOCKED: 'BLOCKED',
} as const;
export type QuotaOutcome = (typeof QuotaOutcome)[keyof typeof QuotaOutcome];

/**
 * Whether a peer at this trust level may push this priority class at all.
 *
 * Separate from the rate check because the two failures mean different things to the peer:
 * a class it may never send is a permanent answer, and retrying it is wasted work on both
 * sides, whereas a rate limit is an invitation to slow down.
 */
export function classPermitted(level: PeerTrust, priority: Priority): boolean {
  return allowedClasses(level).includes(priority);
}

/** FD-16 — the operator is notified and the peer demoted after repeated breach. */
export function shouldDemote(quotaBreaches: number, limit: number): boolean {
  return quotaBreaches >= limit;
}

export function costOf(priority: Priority): number {
  // Every envelope costs one unit of its class's bucket. Weighting by class here would
  // double-count: the classes already have separate buckets with separate rates.
  return priority === Priority.UNSPECIFIED ? 0 : 1;
}

export function envelopesPerMinuteFor(quota: PeerQuota, priority: Priority): number {
  if (!quota.allowedClasses.includes(priority)) return 0;
  // Classes 0–2 get the reserved share BR-04 requires: bulk may use at most half the
  // grant, so a forum backlog cannot consume the allowance a broadcast needs.
  return priority === Priority.BULK
    ? Math.floor(quota.envelopesPerMin / 2)
    : quota.envelopesPerMin;
}

/**
 * The byte allowance for a class, with the same BR-04 reservation.
 *
 * Bytes need the reservation more than envelope counts do, not less: bulk envelopes are
 * unbounded in size while classes 0–2 are capped at 512 B / 1 KB, so a single large post
 * can carry as many bytes as a thousand broadcasts. Without a per-class byte ceiling the
 * emergency channel starves on volume even while it has envelope tokens to spare.
 */
export function bytesPerMinuteFor(quota: PeerQuota, priority: Priority): number {
  if (!quota.allowedClasses.includes(priority)) return 0;
  return priority === Priority.BULK ? Math.floor(quota.bytesPerMin / 2) : quota.bytesPerMin;
}
