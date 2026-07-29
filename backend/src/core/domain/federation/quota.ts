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

/** Bytes-per-minute is enforced alongside envelopes-per-minute; both are in the quota grant. */
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
