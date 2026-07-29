import { describe, expect, it } from 'vitest';
import { Plane, Priority } from '../envelope.js';
import { PeerTrust } from '../../ports/network.port.js';
import { EnvelopeRejected, RejectionCode } from '../errors.js';
import { quotaFor } from './trust.js';
import {
  bytesPerMinuteFor,
  classPermitted,
  consume,
  consumePair,
  costOf,
  envelopesPerMinuteFor,
  newBucket,
  refill,
  shouldDemote,
} from './quota.js';
import { assertStreamPlane, matchesStreamFilter, soleRequestedPlane } from './stream-filter.js';

describe('token bucket', () => {
  it('admits up to capacity and then refuses with a measurable overshoot', () => {
    let state = newBucket(2, 0);
    const first = consume(state, 1, 2, 0);
    expect(first.allowed).toBe(true);
    state = first.state;

    const second = consume(state, 1, 2, 0);
    expect(second.allowed).toBe(true);
    state = second.state;

    const third = consume(state, 1, 2, 0);
    expect(third.allowed).toBe(false);
    expect(third.overBy).toBeCloseTo(1);
  });

  it('refills continuously rather than in windows', () => {
    const drained = { tokens: 0, lastRefillMs: 0 };
    const halfMinute = refill(drained, 60, 60, 30_000);
    expect(halfMinute.tokens).toBeCloseTo(30);
  });

  it('never refills above capacity, and never goes backwards in time', () => {
    expect(refill({ tokens: 50, lastRefillMs: 0 }, 60, 60, 10 * 60_000).tokens).toBe(60);
    const stale = refill({ tokens: 10, lastRefillMs: 5_000 }, 60, 60, 1_000);
    expect(stale.tokens).toBe(10);
  });
});

describe('class admission (FG-09)', () => {
  it('permits classes 0–2 for a PROBATION peer and refuses BULK', () => {
    expect(classPermitted(PeerTrust.PROBATION, Priority.BROADCAST)).toBe(true);
    expect(classPermitted(PeerTrust.PROBATION, Priority.DIRECT)).toBe(true);
    expect(classPermitted(PeerTrust.PROBATION, Priority.CHECKIN)).toBe(true);
    expect(classPermitted(PeerTrust.PROBATION, Priority.BULK)).toBe(false);
  });

  it('permits everything for NORMAL and nothing for BLOCKED', () => {
    expect(classPermitted(PeerTrust.NORMAL, Priority.BULK)).toBe(true);
    expect(classPermitted(PeerTrust.BLOCKED, Priority.BROADCAST)).toBe(false);
  });

  it('BR-04 — bulk cannot consume the whole grant, so a broadcast always has room', () => {
    const quota = quotaFor(PeerTrust.NORMAL);
    expect(envelopesPerMinuteFor(quota, Priority.BULK)).toBeLessThan(
      envelopesPerMinuteFor(quota, Priority.BROADCAST),
    );
  });

  it('charges nothing for an unspecified class, so a malformed priority cannot drain a bucket', () => {
    expect(costOf(Priority.UNSPECIFIED)).toBe(0);
    expect(costOf(Priority.BULK)).toBe(1);
  });

  it('demotes only once the breach limit is reached (FD-16)', () => {
    expect(shouldDemote(2, 3)).toBe(false);
    expect(shouldDemote(3, 3)).toBe(true);
  });
});

describe('stream filter', () => {
  const candidate = {
    plane: Plane.FORUM,
    priority: Priority.BULK,
    scope: 'dhaka-relief@jbs1a4f7m2k',
    logIndex: 10,
  };

  it('treats an empty repeated field as "no restriction"', () => {
    expect(matchesStreamFilter(candidate, {})).toBe(true);
    expect(matchesStreamFilter(candidate, { communities: [], planes: [], classes: [] })).toBe(true);
  });

  it('honours since_index as a resumption point, not a window', () => {
    expect(matchesStreamFilter(candidate, { sinceIndex: 10 })).toBe(true);
    expect(matchesStreamFilter(candidate, { sinceIndex: 11 })).toBe(false);
  });

  it('filters by plane, class, and scope', () => {
    expect(matchesStreamFilter(candidate, { planes: [Plane.SIGNAL] })).toBe(false);
    expect(matchesStreamFilter(candidate, { classes: [Priority.BROADCAST] })).toBe(false);
    expect(matchesStreamFilter(candidate, { communities: ['other@jbs1'] })).toBe(false);
    expect(matchesStreamFilter(candidate, { communities: [candidate.scope] })).toBe(true);
  });

  it('excludes Signal traffic when a caller asks for a Forum community', () => {
    const signal = { ...candidate, plane: Plane.SIGNAL, scope: 'jbc1channel' };
    expect(matchesStreamFilter(signal, { communities: ['dhaka-relief@jbs1a4f7m2k'] })).toBe(false);
  });

  it('reports a sole plane only when exactly one was requested', () => {
    expect(soleRequestedPlane({ planes: [Plane.FORUM] })).toBe(Plane.FORUM);
    expect(soleRequestedPlane({ planes: [] })).toBeNull();
    expect(soleRequestedPlane({ planes: [Plane.FORUM, Plane.SIGNAL] })).toBeNull();
  });
});

describe('FD-15 — envelopes and bytes are one decision', () => {
  const base = {
    envelopeCost: 1,
    envelopesPerMinute: 10,
    byteCost: 100,
    bytesPerMinute: 1000,
    nowMs: 0,
  };

  it('spends both buckets when both allow', () => {
    const decision = consumePair({
      ...base,
      envelopes: newBucket(10, 0),
      bytes: newBucket(1000, 0),
    });
    expect(decision.allowed).toBe(true);
    expect(decision.envelopes.tokens).toBe(9);
    expect(decision.bytes.tokens).toBe(900);
  });

  /**
   * The reason this is one function and not two calls.
   *
   * A peer sending oversized envelopes must not burn its envelope allowance on requests
   * that were refused: that converts a byte-limit breach into an envelope-limit breach and
   * tells the peer to slow down when it should be sending less.
   */
  it('debits NEITHER bucket when only the byte bucket refuses', () => {
    const decision = consumePair({
      ...base,
      envelopes: newBucket(10, 0),
      bytes: { tokens: 10, lastRefillMs: 0 },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.envelopes.tokens).toBe(10);
    expect(decision.bytes.tokens).toBe(10);
    expect(decision.overBy).toBe(90);
  });

  it('debits neither bucket when only the envelope bucket refuses', () => {
    const decision = consumePair({
      ...base,
      envelopes: { tokens: 0, lastRefillMs: 0 },
      bytes: newBucket(1000, 0),
    });
    expect(decision.allowed).toBe(false);
    expect(decision.bytes.tokens).toBe(1000);
    expect(decision.overBy).toBe(1);
  });

  it('keeps refilled timestamps on refusal, so a refused peer still accrues back', () => {
    // One second of a 10/min rate is 1/6 of a token — a real gain, still short of the
    // cost of 1. The refusal must bank it anyway, or a peer refused once can never
    // accumulate its way back to allowed.
    const decision = consumePair({
      ...base,
      envelopes: { tokens: 0, lastRefillMs: 0 },
      bytes: newBucket(1000, 0),
      nowMs: 1_000,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.envelopes.lastRefillMs).toBe(1_000);
    expect(decision.envelopes.tokens).toBeCloseTo(10 / 60);
  });

  it('reports the LARGER shortfall, so the hint reflects the binding limit', () => {
    const decision = consumePair({
      ...base,
      envelopes: { tokens: 0, lastRefillMs: 0 },
      bytes: { tokens: 0, lastRefillMs: 0 },
    });
    expect(decision.overBy).toBe(100);
  });

  /** BR-04 — bulk may take half the byte grant, so volume cannot starve the alert channel. */
  it('reserves byte capacity for classes 0–2 against bulk', () => {
    const quota = quotaFor(PeerTrust.NORMAL);
    expect(bytesPerMinuteFor(quota, Priority.BULK)).toBe(Math.floor(quota.bytesPerMin / 2));
    expect(bytesPerMinuteFor(quota, Priority.BROADCAST)).toBe(quota.bytesPerMin);
  });

  it('gives a class the peer may not send a zero byte rate, not an unlimited one', () => {
    expect(bytesPerMinuteFor(quotaFor(PeerTrust.PROBATION), Priority.BULK)).toBe(0);
  });
});

describe('FG-10 — the wire plane guard', () => {
  it('accepts a frame matching the stream plane', () => {
    expect(() => assertStreamPlane(Plane.FORUM, Plane.FORUM)).not.toThrow();
  });

  it('rejects a mismatched frame as PLANE_MISMATCH, not as a filtered-out frame', () => {
    try {
      assertStreamPlane(Plane.FORUM, Plane.SIGNAL);
      expect.unreachable('a cross-plane frame must be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvelopeRejected);
      expect((error as EnvelopeRejected).code).toBe(RejectionCode.PLANE_MISMATCH);
    }
  });
});
