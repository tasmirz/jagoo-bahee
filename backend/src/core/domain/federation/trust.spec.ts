/**
 * The promotion table from `Plans/05` §3, one test per row, plus the ways a web of trust
 * is normally gamed.
 */

import { describe, expect, it } from 'vitest';
import { Priority } from '../envelope.js';
import { PeerTrust, type PeerVouch } from '../../ports/network.port.js';
import {
  allowedClasses,
  atLeast,
  demoteOne,
  evaluateTrust,
  isGossipPartner,
  PROBATION_PERIOD_MS,
  quotaFor,
  trustRank,
} from './trust.js';

const key = (n: number): Uint8Array => new Uint8Array(32).fill(n);

const vouch = (asserter: number, level: PeerTrust): PeerVouch => ({
  asserterKey: key(asserter),
  peerKey: key(200),
  level,
  note: '',
  assertedAtMs: 0,
  signature: new Uint8Array(64),
});

const trustOf =
  (table: Record<number, PeerTrust>) =>
  (k: Uint8Array): PeerTrust =>
    table[k[0] as number] ?? PeerTrust.UNSPECIFIED;

const base = {
  vouches: [] as PeerVouch[],
  asserterTrust: () => PeerTrust.UNSPECIFIED,
  firstSeenMs: 0,
  nowMs: 0,
};

describe('evaluateTrust — the FD-01 admission path', () => {
  it('admits an unknown peer at PROBATION with no operator in the loop (FG-01)', () => {
    const result = evaluateTrust({ ...base, current: null });
    expect(result.level).toBe(PeerTrust.PROBATION);
    expect(result.reason).toContain('TOFU');
  });

  it('leaves a known peer where it is when nothing has changed', () => {
    expect(evaluateTrust({ ...base, current: PeerTrust.NORMAL }).level).toBe(PeerTrust.NORMAL);
  });

  it('promotes to NORMAL on two vouches from normal-or-better peers', () => {
    const result = evaluateTrust({
      ...base,
      current: PeerTrust.PROBATION,
      vouches: [vouch(1, PeerTrust.NORMAL), vouch(2, PeerTrust.TRUSTED)],
      asserterTrust: trustOf({ 1: PeerTrust.NORMAL, 2: PeerTrust.NORMAL }),
    });
    expect(result.level).toBe(PeerTrust.NORMAL);
  });

  it('promotes to TRUSTED only on three vouches from TRUSTED peers', () => {
    const asserterTrust = trustOf({ 1: PeerTrust.TRUSTED, 2: PeerTrust.TRUSTED, 3: PeerTrust.TRUSTED });
    const two = evaluateTrust({
      ...base,
      current: PeerTrust.NORMAL,
      vouches: [vouch(1, PeerTrust.TRUSTED), vouch(2, PeerTrust.TRUSTED)],
      asserterTrust,
    });
    expect(two.level).toBe(PeerTrust.NORMAL);

    const three = evaluateTrust({
      ...base,
      current: PeerTrust.NORMAL,
      vouches: [vouch(1, PeerTrust.TRUSTED), vouch(2, PeerTrust.TRUSTED), vouch(3, PeerTrust.TRUSTED)],
      asserterTrust,
    });
    expect(three.level).toBe(PeerTrust.TRUSTED);
  });

  it('blocks on two negative vouches from TRUSTED peers', () => {
    const result = evaluateTrust({
      ...base,
      current: PeerTrust.NORMAL,
      vouches: [vouch(1, PeerTrust.BLOCKED), vouch(2, PeerTrust.BLOCKED)],
      asserterTrust: trustOf({ 1: PeerTrust.TRUSTED, 2: PeerTrust.TRUSTED }),
    });
    expect(result.level).toBe(PeerTrust.BLOCKED);
  });

  it('promotes after seven clean days at PROBATION', () => {
    const almost = evaluateTrust({
      ...base,
      current: PeerTrust.PROBATION,
      firstSeenMs: 0,
      nowMs: PROBATION_PERIOD_MS - 1,
    });
    expect(almost.level).toBe(PeerTrust.PROBATION);

    const due = evaluateTrust({
      ...base,
      current: PeerTrust.PROBATION,
      firstSeenMs: 0,
      nowMs: PROBATION_PERIOD_MS,
    });
    expect(due.level).toBe(PeerTrust.NORMAL);
  });

  it('does not age a peer into NORMAL if it has breached quota', () => {
    const result = evaluateTrust({
      ...base,
      current: PeerTrust.PROBATION,
      nowMs: PROBATION_PERIOD_MS * 4,
      quotaBreaches: 1,
    });
    expect(result.level).toBe(PeerTrust.PROBATION);
  });
});

describe('evaluateTrust — the ways this would be gamed', () => {
  it('counts distinct asserters, not vouch rows', () => {
    // One TRUSTED node shouting three times is one opinion.
    const result = evaluateTrust({
      ...base,
      current: PeerTrust.NORMAL,
      vouches: [vouch(1, PeerTrust.TRUSTED), vouch(1, PeerTrust.TRUSTED), vouch(1, PeerTrust.TRUSTED)],
      asserterTrust: trustOf({ 1: PeerTrust.TRUSTED }),
    });
    expect(result.level).toBe(PeerTrust.NORMAL);
  });

  it('ignores vouches from peers we do not ourselves trust', () => {
    const result = evaluateTrust({
      ...base,
      current: PeerTrust.PROBATION,
      vouches: [vouch(1, PeerTrust.TRUSTED), vouch(2, PeerTrust.TRUSTED), vouch(3, PeerTrust.TRUSTED)],
      asserterTrust: trustOf({ 1: PeerTrust.PROBATION, 2: PeerTrust.PROBATION, 3: PeerTrust.PROBATION }),
    });
    expect(result.level).toBe(PeerTrust.PROBATION);
  });

  it('will not let vouches lift a fork block — that needs an operator (FD-09)', () => {
    const result = evaluateTrust({
      ...base,
      current: PeerTrust.BLOCKED,
      blockedReason: 'rewrote its log',
      vouches: [vouch(1, PeerTrust.TRUSTED), vouch(2, PeerTrust.TRUSTED), vouch(3, PeerTrust.TRUSTED)],
      asserterTrust: trustOf({ 1: PeerTrust.TRUSTED, 2: PeerTrust.TRUSTED, 3: PeerTrust.TRUSTED }),
    });
    expect(result.level).toBe(PeerTrust.BLOCKED);
    expect(result.reason).toBe('rewrote its log');
  });

  it('lets an operator override every derived rule, in both directions', () => {
    const up = evaluateTrust({ ...base, current: null, adminLevel: PeerTrust.TRUSTED });
    expect(up.level).toBe(PeerTrust.TRUSTED);

    const down = evaluateTrust({
      ...base,
      current: PeerTrust.TRUSTED,
      adminLevel: PeerTrust.BLOCKED,
      blockedReason: 'rewrote its log',
    });
    expect(down.level).toBe(PeerTrust.BLOCKED);
  });
});

describe('reach', () => {
  it('orders levels so BLOCKED is never "at least" anything useful', () => {
    expect(atLeast(PeerTrust.TRUSTED, PeerTrust.NORMAL)).toBe(true);
    expect(atLeast(PeerTrust.PROBATION, PeerTrust.NORMAL)).toBe(false);
    expect(atLeast(PeerTrust.BLOCKED, PeerTrust.PROBATION)).toBe(false);
    expect(trustRank(PeerTrust.BLOCKED)).toBeLessThan(trustRank(PeerTrust.PROBATION));
  });

  it('demotes one level and floors at BLOCKED', () => {
    expect(demoteOne(PeerTrust.TRUSTED)).toBe(PeerTrust.NORMAL);
    expect(demoteOne(PeerTrust.NORMAL)).toBe(PeerTrust.PROBATION);
    expect(demoteOne(PeerTrust.PROBATION)).toBe(PeerTrust.BLOCKED);
    expect(demoteOne(PeerTrust.BLOCKED)).toBe(PeerTrust.BLOCKED);
  });

  it('FG-09 — PROBATION carries classes 0–2 but not BULK', () => {
    const probation = allowedClasses(PeerTrust.PROBATION);
    expect(probation).toContain(Priority.BROADCAST);
    expect(probation).toContain(Priority.DIRECT);
    expect(probation).toContain(Priority.CHECKIN);
    expect(probation).not.toContain(Priority.BULK);

    expect(allowedClasses(PeerTrust.NORMAL)).toContain(Priority.BULK);
    expect(allowedClasses(PeerTrust.BLOCKED)).toHaveLength(0);
  });

  it('grants a strictly larger quota at each level, and nothing at BLOCKED', () => {
    expect(quotaFor(PeerTrust.BLOCKED).envelopesPerMin).toBe(0);
    expect(quotaFor(PeerTrust.PROBATION).envelopesPerMin).toBeLessThan(
      quotaFor(PeerTrust.NORMAL).envelopesPerMin,
    );
    expect(quotaFor(PeerTrust.NORMAL).envelopesPerMin).toBeLessThan(
      quotaFor(PeerTrust.TRUSTED).envelopesPerMin,
    );
  });

  it('gossips tree heads only with TRUSTED peers (FD-08)', () => {
    expect(isGossipPartner(PeerTrust.TRUSTED)).toBe(true);
    expect(isGossipPartner(PeerTrust.NORMAL)).toBe(false);
  });
});
