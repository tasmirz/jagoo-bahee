/**
 * Outbound delivery backoff and the dead-letter boundary (T2.8, FD-06).
 *
 * Pure: the schedule is a function of the attempt count, and the caller supplies `nowMs`.
 * A backoff that read the clock itself would be untestable at exactly the sizes that
 * matter — the eighth retry, three hours in.
 *
 * ── Why the delay is deterministic and not jittered here ────────────────────────────
 * Jitter belongs to the drainer, which knows how many entries it is about to release at
 * once; a pure schedule that randomised internally would need a `RandomSource` and would
 * stop being comparable between two nodes debugging the same stuck queue. The drainer
 * spreads a batch; this decides how long a single entry waits.
 */

export const INITIAL_BACKOFF_MS = 1_000;
export const MAX_BACKOFF_MS = 15 * 60 * 1000;

/**
 * FD-06 gives no number, so this is a judgement: ~13 attempts spans roughly two hours of
 * exponential growth plus capped retries, which comfortably covers a router reboot, an
 * uplink failover, and a short national outage — the failure durations this system is
 * actually built for. Beyond that the entry is dead-lettered and surfaced, because a queue
 * that retries forever is a queue that hides a permanent failure behind an infinite one.
 */
export const MAX_DELIVERY_ATTEMPTS = 13;

/** Exponential with a ceiling: 1s, 2s, 4s … 15m, 15m, 15m. */
export function backoffDelayMs(attempt: number): number {
  if (attempt <= 0) return 0;
  const exponent = Math.min(attempt - 1, 30);
  return Math.min(INITIAL_BACKOFF_MS * 2 ** exponent, MAX_BACKOFF_MS);
}

export interface RetryDecision {
  /** Null means dead-letter: no further attempt will be made without operator action. */
  readonly nextAttemptAtMs: number | null;
  readonly attempts: number;
  readonly deadLettered: boolean;
}

export function nextRetry(attempts: number, nowMs: number): RetryDecision {
  const next = attempts + 1;
  if (next >= MAX_DELIVERY_ATTEMPTS) {
    return { nextAttemptAtMs: null, attempts: next, deadLettered: true };
  }
  return { nextAttemptAtMs: nowMs + backoffDelayMs(next), attempts: next, deadLettered: false };
}

/**
 * FD-15 — how long a peer should pause before pushing again.
 *
 * Returned to the peer as `DeliverAck.backpressure_hint_ms` INSTEAD of dropping the
 * connection. Dropping is worse than useless here: the peer reconnects immediately, pays
 * the handshake cost again, and arrives in the same over-quota state, so the node spends
 * more work refusing than it would have spent accepting. A hint lets a well-behaved peer
 * self-regulate, and a peer that ignores it is the one FD-16 demotes.
 */
export function backpressureHintMs(overBy: number, perMinute: number): number {
  if (overBy <= 0 || perMinute <= 0) return 0;
  const msPerEnvelope = 60_000 / perMinute;
  return Math.min(Math.ceil(overBy * msPerEnvelope), 60_000);
}
