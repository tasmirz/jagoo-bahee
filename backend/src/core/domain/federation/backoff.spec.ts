import { describe, expect, it } from 'vitest';
import {
  backoffDelayMs,
  backpressureHintMs,
  INITIAL_BACKOFF_MS,
  MAX_BACKOFF_MS,
  MAX_DELIVERY_ATTEMPTS,
  nextRetry,
} from './backoff.js';

describe('backoffDelayMs', () => {
  it('doubles from the initial delay and then holds at the ceiling', () => {
    expect(backoffDelayMs(1)).toBe(INITIAL_BACKOFF_MS);
    expect(backoffDelayMs(2)).toBe(INITIAL_BACKOFF_MS * 2);
    expect(backoffDelayMs(3)).toBe(INITIAL_BACKOFF_MS * 4);
    expect(backoffDelayMs(30)).toBe(MAX_BACKOFF_MS);
  });

  it('never returns a negative or fractional delay across the whole attempt range', () => {
    // L-14 — sweep, do not spot-check. An off-by-one in the exponent only shows at an edge.
    for (let attempt = 0; attempt <= MAX_DELIVERY_ATTEMPTS + 5; attempt += 1) {
      const delay = backoffDelayMs(attempt);
      expect(Number.isInteger(delay), `attempt ${attempt}`).toBe(true);
      expect(delay, `attempt ${attempt}`).toBeGreaterThanOrEqual(0);
      expect(delay, `attempt ${attempt}`).toBeLessThanOrEqual(MAX_BACKOFF_MS);
    }
  });

  it('is monotonically non-decreasing', () => {
    for (let attempt = 1; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
      expect(backoffDelayMs(attempt + 1)).toBeGreaterThanOrEqual(backoffDelayMs(attempt));
    }
  });
});

describe('nextRetry', () => {
  it('schedules forward from now', () => {
    const decision = nextRetry(0, 1_000);
    expect(decision.deadLettered).toBe(false);
    expect(decision.attempts).toBe(1);
    expect(decision.nextAttemptAtMs).toBe(1_000 + INITIAL_BACKOFF_MS);
  });

  it('dead-letters exactly once the attempt budget is spent, and not before', () => {
    const last = nextRetry(MAX_DELIVERY_ATTEMPTS - 2, 0);
    expect(last.deadLettered).toBe(false);
    expect(last.nextAttemptAtMs).not.toBeNull();

    const spent = nextRetry(MAX_DELIVERY_ATTEMPTS - 1, 0);
    expect(spent.deadLettered).toBe(true);
    expect(spent.nextAttemptAtMs).toBeNull();
  });
});

describe('backpressureHintMs', () => {
  it('is zero when the peer is within quota', () => {
    expect(backpressureHintMs(0, 120)).toBe(0);
    expect(backpressureHintMs(-5, 120)).toBe(0);
  });

  it('grows with the overshoot and caps at a minute', () => {
    expect(backpressureHintMs(1, 60)).toBe(1_000);
    expect(backpressureHintMs(10, 60)).toBe(10_000);
    expect(backpressureHintMs(10_000, 60)).toBe(60_000);
  });

  it('never divides by a zero rate', () => {
    expect(backpressureHintMs(5, 0)).toBe(0);
  });
});
