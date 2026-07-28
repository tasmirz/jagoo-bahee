/**
 * Pipeline step 8 — CLOCK.
 *
 * `created_at_ms` must fall inside [now − maxAge, now + maxSkew].
 *
 * ── Why the window is asymmetric, and why it is generous ────────────────────────────
 * Future-dating is tightly bounded because it is an attack: a far-future timestamp would
 * sort to the top of every feed forever. Past-dating is loosely bounded because it is
 * NORMAL here — an envelope may have been composed offline during a blackout and carried by
 * hand or over mesh for days before reaching a node. Rejecting it as "too old" would
 * discard exactly the content this system exists to move.
 *
 * `now` is a parameter, not a `Date.now()` call. That is what makes this testable without
 * fake timers, and it is why `Date` is lint-banned inside `core/domain` (AR-02).
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §5
 */

import { EnvelopeRejected, RejectionCode } from '../errors.js';

/** Seven days. An envelope carried by sneakernet across a week-long shutdown is valid. */
export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Ten minutes, matching the frozen envelope contract. */
export const DEFAULT_MAX_SKEW_MS = 10 * 60 * 1000;

export interface ClockWindow {
  readonly maxAgeMs: number;
  readonly maxSkewMs: number;
}

export const DEFAULT_CLOCK_WINDOW: ClockWindow = {
  maxAgeMs: DEFAULT_MAX_AGE_MS,
  maxSkewMs: DEFAULT_MAX_SKEW_MS,
};

export function acceptClock(
  createdAtMs: bigint,
  nowMs: number,
  window: ClockWindow = DEFAULT_CLOCK_WINDOW,
): void {
  const created = createdAtMs;
  const now = BigInt(nowMs);

  if (created > now + BigInt(window.maxSkewMs)) {
    // CLOCK_SKEW is retryable by re-signing with a corrected timestamp — the client's clock
    // is wrong, the content is not.
    throw new EnvelopeRejected(RejectionCode.CLOCK_SKEW, 'created_at_ms is too far in the future', {
      field: 'created_at_ms',
    });
  }

  if (created < now - BigInt(window.maxAgeMs)) {
    throw new EnvelopeRejected(RejectionCode.CLOCK_SKEW, 'created_at_ms is too far in the past', {
      field: 'created_at_ms',
    });
  }
}
