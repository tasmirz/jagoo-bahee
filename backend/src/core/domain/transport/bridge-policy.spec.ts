/**
 * BR-01 … BR-05 — the bridging policy.
 *
 * The assertion that matters most is TG-05's: a class-0 broadcast crosses the bridge while a
 * bulk backlog is queued. It is asserted here as arithmetic on the reserved capacity rather
 * than as a timing observation, because a starvation bug that only shows up under load is a
 * bug that ships.
 */

import { describe, expect, it } from 'vitest';
import { Priority } from '../envelope.js';
import {
  bridgeReadiness,
  bytesPerMinFor,
  decideRelay,
  DISABLED_BRIDGE,
  envelopesPerMinFor,
  pairKey,
  RelayRefusal,
  type BridgeConfig,
  type PairBucket,
} from './bridge-policy.js';

const NOW = 1_767_225_600_000;

const config: BridgeConfig = {
  enabled: true,
  pairs: [['isp-a', 'isp-b']],
  classes: [Priority.BROADCAST, Priority.DIRECT, Priority.CHECKIN, Priority.BULK],
  envelopesPerMin: 100,
  bytesPerMin: 100_000,
};

const bothTrusted = new Set(['isp-a', 'isp-b']);

const relay = (
  over: Partial<Parameters<typeof decideRelay>[0]> = {},
  buckets: ReadonlyMap<string, PairBucket> = new Map(),
) =>
  decideRelay({
    config,
    viaUplinkId: 'isp-a',
    priority: Priority.BULK,
    bytes: 500,
    trustedUplinks: bothTrusted,
    buckets,
    nowMs: NOW,
    ...over,
  });

describe('BR-01 — an untrusted node cannot volunteer to become a chokepoint', () => {
  it('refuses when bridging is not enabled', () => {
    expect(relay({ config: DISABLED_BRIDGE }).decision).toEqual({
      relay: false,
      reason: RelayRefusal.DISABLED,
    });
  });

  it('refuses when no pair has a TRUSTED peer on BOTH sides', () => {
    expect(relay({ trustedUplinks: new Set(['isp-a']) }).decision).toEqual({
      relay: false,
      reason: RelayRefusal.DISABLED,
    });
  });

  it('explains WHY separately, because the operator needs the reason', () => {
    // The frozen `RelayDecision` reason set has five values and no `untrusted`, so BR-01's
    // refusal reports as `disabled`. The information is not lost — it moves here, which is
    // what `/v1/transport/bridge` shows (BR-06).
    expect(bridgeReadiness(config, new Set(['isp-a']))).toEqual({
      ready: false,
      reason: 'no uplink pair has a TRUSTED peer on both sides',
    });
    expect(bridgeReadiness(config, bothTrusted).ready).toBe(true);
    expect(bridgeReadiness(DISABLED_BRIDGE, bothTrusted).reason).toBe('bridging is not enabled');
  });
});

describe('BR-03 — loop prevention', () => {
  it('relays to the counterpart island and never back the way it came', () => {
    const outcome = relay();
    expect(outcome.decision).toEqual({ relay: true, toUplinks: ['isp-b'] });
  });

  it('refuses when the arriving uplink bridges to nothing', () => {
    expect(relay({ viaUplinkId: 'isp-c' }).decision).toEqual({
      relay: false,
      reason: RelayRefusal.SAME_ISLAND,
    });
  });

  it('refuses a pair that names itself', () => {
    expect(
      relay({
        config: { ...config, pairs: [['isp-a', 'isp-a']] },
        trustedUplinks: new Set(['isp-a']),
      }).decision,
    ).toEqual({ relay: false, reason: RelayRefusal.LOOP });
  });
});

describe('BR-04 — class filter and reserved capacity', () => {
  it('refuses a class the operator excluded', () => {
    expect(
      relay({ config: { ...config, classes: [Priority.BROADCAST] }, priority: Priority.BULK })
        .decision,
    ).toEqual({ relay: false, reason: RelayRefusal.CLASS_EXCLUDED });
  });

  it('gives bulk at most half the grant, and classes 0–2 all of it', () => {
    expect(envelopesPerMinFor(config, Priority.BULK)).toBe(50);
    expect(envelopesPerMinFor(config, Priority.BROADCAST)).toBe(100);
    expect(bytesPerMinFor(config, Priority.BULK)).toBe(50_000);
    expect(bytesPerMinFor(config, Priority.BROADCAST)).toBe(100_000);
  });

  it('TG-05 — a class-0 broadcast crosses while bulk has exhausted its own bucket', () => {
    // Drain the bulk bucket completely, then present a broadcast. Separate buckets are what
    // makes this hold: one shared allowance and the forum backlog would have eaten the
    // emergency channel, which is the one starvation this system may never permit.
    let buckets: ReadonlyMap<string, PairBucket> = new Map();
    let bulkAccepted = 0;
    for (let i = 0; i < 60; i += 1) {
      const outcome = decideRelay({
        config,
        viaUplinkId: 'isp-a',
        priority: Priority.BULK,
        bytes: 400,
        trustedUplinks: bothTrusted,
        buckets,
        nowMs: NOW,
      });
      buckets = outcome.buckets;
      if (outcome.decision.relay) bulkAccepted += 1;
    }
    expect(bulkAccepted).toBe(50);

    const broadcast = decideRelay({
      config,
      viaUplinkId: 'isp-a',
      priority: Priority.BROADCAST,
      bytes: 400,
      trustedUplinks: bothTrusted,
      buckets,
      nowMs: NOW,
    });
    expect(broadcast.decision).toEqual({ relay: true, toUplinks: ['isp-b'] });
  });

  it('refuses with `quota` once a class has genuinely run out', () => {
    let buckets: ReadonlyMap<string, PairBucket> = new Map();
    let last = relay({ priority: Priority.BROADCAST, bytes: 10 }, buckets);
    for (let i = 0; i < 101; i += 1) {
      last = relay({ priority: Priority.BROADCAST, bytes: 10 }, buckets);
      buckets = last.buckets;
    }
    expect(last.decision).toEqual({ relay: false, reason: RelayRefusal.QUOTA });
  });

  it('the byte bucket refuses independently of the envelope bucket', () => {
    const tiny: BridgeConfig = { ...config, bytesPerMin: 1_000 };
    let buckets: ReadonlyMap<string, PairBucket> = new Map();
    // Two 600-byte broadcasts exceed 1000 bytes/min while using only 2 of 100 envelopes.
    let outcome = decideRelay({
      config: tiny,
      viaUplinkId: 'isp-a',
      priority: Priority.BROADCAST,
      bytes: 600,
      trustedUplinks: bothTrusted,
      buckets,
      nowMs: NOW,
    });
    buckets = outcome.buckets;
    expect(outcome.decision.relay).toBe(true);
    outcome = decideRelay({
      config: tiny,
      viaUplinkId: 'isp-a',
      priority: Priority.BROADCAST,
      bytes: 600,
      trustedUplinks: bothTrusted,
      buckets,
      nowMs: NOW,
    });
    expect(outcome.decision).toEqual({ relay: false, reason: RelayRefusal.QUOTA });
  });

  it('a refused relay does not spend the allowance it was refused', () => {
    // The refilled timestamp is kept, but no tokens are debited — otherwise a peer sending
    // oversized envelopes silently burns the envelope allowance on requests never admitted.
    const outcome = relay({ priority: Priority.BULK, bytes: 10_000_000 });
    const bucket = outcome.buckets.get(pairKey('isp-a', 'isp-b', Priority.BULK));
    expect(outcome.decision.relay).toBe(false);
    expect(bucket?.envelopes.tokens).toBe(50);
  });

  it('refills over time rather than punishing a peer for arriving mid-window', () => {
    let buckets: ReadonlyMap<string, PairBucket> = new Map();
    for (let i = 0; i < 60; i += 1) {
      buckets = relay({ priority: Priority.BROADCAST, bytes: 10 }, buckets).buckets;
    }
    const oneMinuteLater = relay({ priority: Priority.BROADCAST, bytes: 10, nowMs: NOW + 60_000 }, buckets);
    expect(oneMinuteLater.decision.relay).toBe(true);
  });
});

describe('the pair key is direction-independent — a pair is one link, not two', () => {
  it('charges the same bucket regardless of which side received', () => {
    expect(pairKey('isp-a', 'isp-b', Priority.BULK)).toBe(pairKey('isp-b', 'isp-a', Priority.BULK));
    expect(pairKey('isp-a', 'isp-b', Priority.BULK)).not.toBe(
      pairKey('isp-a', 'isp-b', Priority.BROADCAST),
    );
  });
});
