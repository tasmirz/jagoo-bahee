/**
 * TP-11, TP-12, TP-13 — the path selector, proved at a desk.
 *
 * TP-13 requires path selection to be a pure function of (peer record, uplink states, clock)
 * "so it is unit-testable without a network", and that is not a convenience: this is the
 * component that has to be right when nothing else is working. Every ranking rule in
 * `Plans/06` §5 gets an assertion here, including the ones that only differ under a
 * tie-break, because a tie-break that silently inverts is invisible in production until the
 * link it wrongly preferred is the one that dies.
 */

import { describe, expect, it } from 'vitest';
import { ReachabilityScope, type PeerEndpoint, type PeerRecord } from '../../ports/network.port.js';
import {
  ENDPOINT_MAX_BACKOFF_MS,
  endpointBackoffMs,
  endpointFailed,
  endpointSucceeded,
  isBackingOff,
  mustWaitForPeer,
  rankPaths,
  selectPath,
  withEndpoint,
  type UplinkView,
} from './path-selection.js';

const NOW = 1_767_225_600_000;

const endpoint = (over: Partial<PeerEndpoint> & { scope: ReachabilityScope }): PeerEndpoint => ({
  address: `grpc://${over.scope.toLowerCase()}.example:8444`,
  ...over,
});

const peer = (endpoints: readonly PeerEndpoint[]): PeerRecord => ({
  serverId: 'jbs1peer',
  publicKey: new Uint8Array(32).fill(7),
  endpoints,
  trust: 'TRUSTED',
  lastSeenMs: NOW,
});

const uplink = (over: Partial<UplinkView> & { id: string }): UplinkView => ({
  sourceIp: '203.0.113.10',
  priority: 1,
  liveScopes: [ReachabilityScope.GLOBAL],
  selectable: true,
  ...over,
});

const select = (
  endpoints: readonly PeerEndpoint[],
  uplinks: readonly UplinkView[],
  overrides: { nowMs?: number; jitter01?: number } = {},
) =>
  selectPath({
    peer: peer(endpoints),
    uplinks,
    nowMs: overrides.nowMs ?? NOW,
    jitter01: overrides.jitter01 ?? 0,
  });

describe('TP-01 — the narrowest working scope wins', () => {
  it('prefers ISP_LOCAL over NATIONAL and GLOBAL when all three are alive', () => {
    const chosen = select(
      [
        endpoint({ scope: ReachabilityScope.GLOBAL }),
        endpoint({ scope: ReachabilityScope.NATIONAL }),
        endpoint({ scope: ReachabilityScope.ISP_LOCAL }),
      ],
      [
        uplink({
          id: 'isp-a',
          liveScopes: [
            ReachabilityScope.GLOBAL,
            ReachabilityScope.NATIONAL,
            ReachabilityScope.ISP_LOCAL,
          ],
        }),
      ],
    );
    expect(chosen?.endpoint.scope).toBe(ReachabilityScope.ISP_LOCAL);
  });

  it('prefers LAN over everything, because LAN survives the most', () => {
    const chosen = select(
      [endpoint({ scope: ReachabilityScope.ISP_LOCAL }), endpoint({ scope: ReachabilityScope.LAN })],
      [uplink({ id: 'lan', liveScopes: [ReachabilityScope.LAN, ReachabilityScope.ISP_LOCAL] })],
    );
    expect(chosen?.endpoint.scope).toBe(ReachabilityScope.LAN);
  });

  it('ignores an endpoint whose scope no uplink currently reaches (step 2)', () => {
    // The measured truth, not the declared one: this is the shutdown case, where the config
    // still says GLOBAL and the link no longer delivers it.
    const chosen = select(
      [endpoint({ scope: ReachabilityScope.GLOBAL })],
      [uplink({ id: 'isp-a', liveScopes: [ReachabilityScope.ISP_LOCAL] })],
    );
    expect(chosen).toBeNull();
  });

  it('ignores a down uplink entirely (step 1)', () => {
    const chosen = select(
      [endpoint({ scope: ReachabilityScope.GLOBAL })],
      [uplink({ id: 'isp-a', selectable: false })],
    );
    expect(chosen).toBeNull();
  });
});

describe('TP-11 — the same-ASN bonus', () => {
  it('breaks a tie at equal scope in favour of the peer on our own AS', () => {
    const chosen = select(
      [
        endpoint({ scope: ReachabilityScope.NATIONAL, asn: 99999, address: 'grpc://other:8444' }),
        endpoint({ scope: ReachabilityScope.NATIONAL, asn: 64501, address: 'grpc://same-as:8444' }),
      ],
      [uplink({ id: 'isp-a', asn: 64501, liveScopes: [ReachabilityScope.NATIONAL] })],
    );
    expect(chosen?.endpoint.address).toBe('grpc://same-as:8444');
    expect(chosen?.sameAsn).toBe(true);
  });

  it('is half a rank, so it NEVER promotes NATIONAL above ISP_LOCAL', () => {
    // The bonus exists to pick between equals. If it were a whole rank it would invert the
    // ordering TP-01 is built on, and the resilience path would stop being the preferred one.
    const chosen = select(
      [
        endpoint({ scope: ReachabilityScope.NATIONAL, asn: 64501, address: 'grpc://national:8444' }),
        endpoint({ scope: ReachabilityScope.ISP_LOCAL, asn: 77777, address: 'grpc://local:8444' }),
      ],
      [
        uplink({
          id: 'isp-a',
          asn: 64501,
          liveScopes: [ReachabilityScope.NATIONAL, ReachabilityScope.ISP_LOCAL],
        }),
      ],
    );
    expect(chosen?.endpoint.address).toBe('grpc://local:8444');
  });
});

describe('Plans/06 §5 step 4 — the remaining tie-breaks', () => {
  it('4c: prefers the lower RTT at equal rank', () => {
    const chosen = select(
      [
        endpoint({ scope: ReachabilityScope.GLOBAL, rttMs: 300, address: 'grpc://slow:8444' }),
        endpoint({ scope: ReachabilityScope.GLOBAL, rttMs: 20, address: 'grpc://fast:8444' }),
      ],
      [uplink({ id: 'isp-a' })],
    );
    expect(chosen?.endpoint.address).toBe('grpc://fast:8444');
  });

  it('4c: an unmeasured RTT sorts AFTER a measured one, never as zero', () => {
    const chosen = select(
      [
        endpoint({ scope: ReachabilityScope.GLOBAL, address: 'grpc://untimed:8444' }),
        endpoint({ scope: ReachabilityScope.GLOBAL, rttMs: 400, address: 'grpc://slow:8444' }),
      ],
      [uplink({ id: 'isp-a' })],
    );
    expect(chosen?.endpoint.address).toBe('grpc://slow:8444');
  });

  it('4d: prefers the most recently known-good when rank and RTT match', () => {
    const chosen = select(
      [
        endpoint({ scope: ReachabilityScope.GLOBAL, rttMs: 10, lastOkAtMs: NOW - 90_000, address: 'grpc://stale:8444' }),
        endpoint({ scope: ReachabilityScope.GLOBAL, rttMs: 10, lastOkAtMs: NOW - 1_000, address: 'grpc://fresh:8444' }),
      ],
      [uplink({ id: 'isp-a' })],
    );
    expect(chosen?.endpoint.address).toBe('grpc://fresh:8444');
  });
});

describe('Plans/06 §5 step 5 — which uplink carries it', () => {
  it('prefers the uplink on the endpoint’s own AS over the higher-priority one', () => {
    const chosen = select(
      [endpoint({ scope: ReachabilityScope.ISP_LOCAL, asn: 64502 })],
      [
        uplink({ id: 'isp-a', asn: 64501, priority: 0, liveScopes: [ReachabilityScope.ISP_LOCAL] }),
        uplink({ id: 'isp-b', asn: 64502, priority: 9, liveScopes: [ReachabilityScope.ISP_LOCAL] }),
      ],
    );
    expect(chosen?.uplink.id).toBe('isp-b');
  });

  it('falls back to uplink priority when no ASN matches', () => {
    const chosen = select(
      [endpoint({ scope: ReachabilityScope.ISP_LOCAL })],
      [
        uplink({ id: 'isp-b', priority: 5, liveScopes: [ReachabilityScope.ISP_LOCAL] }),
        uplink({ id: 'lan', priority: 0, liveScopes: [ReachabilityScope.ISP_LOCAL] }),
      ],
    );
    expect(chosen?.uplink.id).toBe('lan');
  });

  it('carries the uplink’s source address, which is what TP-08 binds the socket to', () => {
    const chosen = select(
      [endpoint({ scope: ReachabilityScope.ISP_LOCAL })],
      [uplink({ id: 'isp-b', sourceIp: '198.51.100.20', liveScopes: [ReachabilityScope.ISP_LOCAL] })],
    );
    expect(chosen?.uplink.sourceIp).toBe('198.51.100.20');
  });
});

describe('TP-12 — backoff with jitter, capped at five minutes', () => {
  it('does not hold back an endpoint below the failure threshold', () => {
    expect(endpointBackoffMs(0, 0)).toBe(0);
    expect(endpointBackoffMs(2, 0.9)).toBe(0);
    expect(endpointBackoffMs(3, 0)).toBeGreaterThan(0);
  });

  it('grows exponentially and stops at five minutes', () => {
    // Swept, not sampled (L-14): a cap that only holds at the value someone happened to pick
    // is a cap that does not hold.
    let previous = 0;
    for (let failures = 3; failures <= 40; failures += 1) {
      const delay = endpointBackoffMs(failures, 1);
      expect(delay).toBeLessThanOrEqual(ENDPOINT_MAX_BACKOFF_MS);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
    expect(endpointBackoffMs(40, 1)).toBe(ENDPOINT_MAX_BACKOFF_MS);
  });

  it('keeps a floor of half the delay, so a hot loop is impossible at any jitter', () => {
    for (let failures = 3; failures <= 20; failures += 1) {
      const floor = endpointBackoffMs(failures, 0);
      const ceiling = endpointBackoffMs(failures, 0.999);
      expect(floor).toBeGreaterThan(0);
      expect(ceiling).toBeGreaterThanOrEqual(floor);
      // Equal jitter: the random half never drops the wait below 50% of the schedule.
      expect(floor * 2).toBeGreaterThanOrEqual(ceiling);
    }
  });

  it('spreads a herd — two nodes failing together do not retry together', () => {
    expect(endpointBackoffMs(6, 0.05)).not.toBe(endpointBackoffMs(6, 0.95));
  });

  it('benches an endpoint that has NEVER succeeded, measuring from the last attempt', () => {
    // The literal reading of §5 measures from `last_ok_at_ms`, which is 0 for an endpoint
    // that never worked — `now - 0` is enormous, and the endpoint is retried every pass
    // forever. That is the exact hot loop TP-12 forbids, on the endpoint most likely dead.
    const never = endpoint({
      scope: ReachabilityScope.GLOBAL,
      consecutiveFailures: 5,
      lastAttemptAtMs: NOW - 500,
    });
    expect(isBackingOff(never, NOW, 0)).toBe(true);

    const withoutAttemptRecord = endpoint({
      scope: ReachabilityScope.GLOBAL,
      consecutiveFailures: 5,
    });
    expect(isBackingOff(withoutAttemptRecord, NOW, 0)).toBe(false);
  });

  it('drops a benched endpoint from the candidate list and releases it after the wait', () => {
    const benched = endpoint({
      scope: ReachabilityScope.ISP_LOCAL,
      consecutiveFailures: 4,
      lastAttemptAtMs: NOW,
      address: 'grpc://benched:8444',
    });
    const healthy = endpoint({ scope: ReachabilityScope.GLOBAL, address: 'grpc://healthy:8444' });
    const uplinks = [
      uplink({
        id: 'isp-a',
        liveScopes: [ReachabilityScope.ISP_LOCAL, ReachabilityScope.GLOBAL],
      }),
    ];

    expect(select([benched, healthy], uplinks)?.endpoint.address).toBe('grpc://healthy:8444');
    expect(
      select([benched, healthy], uplinks, { nowMs: NOW + ENDPOINT_MAX_BACKOFF_MS + 1 })?.endpoint
        .address,
    ).toBe('grpc://benched:8444');
  });
});

describe('Plans/06 §5 steps 5–7 — outcomes and the wait case', () => {
  it('records a success: last_ok_at set, failures reset, RTT captured', () => {
    const failed = endpointFailed(endpoint({ scope: ReachabilityScope.GLOBAL }), NOW);
    expect(failed.consecutiveFailures).toBe(1);
    const recovered = endpointSucceeded(failed, NOW + 10, 42);
    expect(recovered.consecutiveFailures).toBe(0);
    expect(recovered.lastOkAtMs).toBe(NOW + 10);
    expect(recovered.rttMs).toBe(42);
  });

  it('writes the update back onto the matching endpoint only', () => {
    const one = endpoint({ scope: ReachabilityScope.GLOBAL, address: 'grpc://one:8444' });
    const two = endpoint({ scope: ReachabilityScope.NATIONAL, address: 'grpc://two:8444' });
    const updated = withEndpoint(peer([one, two]), endpointFailed(two, NOW));
    expect(updated.endpoints[0]?.consecutiveFailures).toBeUndefined();
    expect(updated.endpoints[1]?.consecutiveFailures).toBe(1);
  });

  it('step 6: a peer with no inbound-capable endpoint is waited for, not escalated', () => {
    // FD-11/FD-12 — a node behind CGNAT federates fully over connections it opened. Failing
    // to dial it is the expected steady state, not an incident.
    expect(
      mustWaitForPeer(peer([endpoint({ scope: ReachabilityScope.GLOBAL, inboundCapable: false })])),
    ).toBe(true);
    expect(mustWaitForPeer(peer([]))).toBe(true);
    expect(
      mustWaitForPeer(peer([endpoint({ scope: ReachabilityScope.GLOBAL, inboundCapable: true })])),
    ).toBe(false);
  });
});

describe('rankPaths returns the whole ordered list, not just a winner', () => {
  it('so a caller can walk it on failure without re-selecting the dead endpoint', () => {
    const ranked = rankPaths({
      peer: peer([
        endpoint({ scope: ReachabilityScope.GLOBAL }),
        endpoint({ scope: ReachabilityScope.ISP_LOCAL }),
        endpoint({ scope: ReachabilityScope.NATIONAL }),
      ]),
      uplinks: [
        uplink({
          id: 'isp-a',
          liveScopes: [
            ReachabilityScope.GLOBAL,
            ReachabilityScope.ISP_LOCAL,
            ReachabilityScope.NATIONAL,
          ],
        }),
      ],
      nowMs: NOW,
      jitter01: 0,
    });
    expect(ranked.map((candidate) => candidate.endpoint.scope)).toEqual([
      ReachabilityScope.ISP_LOCAL,
      ReachabilityScope.NATIONAL,
      ReachabilityScope.GLOBAL,
    ]);
  });
});
