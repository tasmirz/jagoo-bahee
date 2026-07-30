/**
 * The transport surface's authorisation matrix (T3.21 — TP-02, TP-09, TP-10, TP-15, TP-20,
 * BR-06, BR-10).
 *
 * ── What this exists to catch ──────────────────────────────────────────────────────
 * `transport.controller.ts` splits its routes into one public and six operator-only, and the
 * split is a security decision, not a convenience: `/v1/transport/scope` MUST be public
 * because TP-20 requires an always-visible client indicator, and everything naming an
 * interface, an ASN or a relay volume MUST NOT be, because an uplink list is a map of how to
 * cut this node off. Both halves of that sentence are assertions, and until now neither had a
 * test — the handoff records this controller as "typecheck only".
 *
 * Per L-11 the failing cases are the point. A gate that only proves the happy path proves
 * that the route exists, not that it is guarded: every operator route is exercised with no
 * token, a bad token, and a good token belonging to a non-administrator, and only then with
 * an administrator.
 *
 * Constructed directly rather than through `AppModule`, following
 * `reticulum.controller.spec.ts`. The DI wiring is covered by `app.module.spec.ts` and — for
 * the class of fault vitest structurally cannot see (L-15/L-20) — by the container gate.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { identityId } from '@jagoo/sdk/core';
import { TransportController } from './transport.controller.js';
import { UplinkState, type UplinkHealth } from '../../../core/domain/transport/uplink-state.js';
import type { BridgeRelayService } from '../../../core/app/bridge-relay.js';
import type { ReverseTunnelExchange } from '../../../core/app/reverse-tunnel.js';
import type { SessionAuth } from '../../../core/ports/auth.port.js';
import type { Observability } from '../../../core/ports/observability.port.js';
import { ReachabilityScope } from '../../../core/ports/network.port.js';
import type { Uplink, UplinkManager } from '../../../core/ports/transport.port.js';
import type { ServiceDirectory } from '../../../core/ports/service-directory.port.js';
import type { TransportState } from '../../../composition/transport.runtime.js';
import type { FastifyRequest } from 'fastify';

/** A request from `remote`, shaped the way `callerAddress` reads one. */
function requestFrom(remote: string, forwardedFor?: string): FastifyRequest {
  return {
    ip: remote,
    raw: { socket: { remoteAddress: remote } },
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  } as unknown as FastifyRequest;
}

const ADMIN_KEY = new Uint8Array(32).fill(7);
const STRANGER_KEY = new Uint8Array(32).fill(8);

const previousAdminKeys = process.env.ADMIN_KEYS;

/** `valid` belongs to the administrator, `stranger` to an ordinary authenticated identity. */
const auth = {
  async verifyAccess(token: string) {
    if (token === 'valid') return { key: ADMIN_KEY, tokenId: 'admin-session' };
    if (token === 'stranger') return { key: STRANGER_KEY, tokenId: 'user-session' };
    throw new Error('invalid');
  },
} as SessionAuth;

function health(state: UplinkState, scopes: readonly ReachabilityScope[]): UplinkHealth {
  return {
    state,
    scopes: scopes.map((scope) => ({
      scope,
      live: state !== UplinkState.DOWN,
      consecutiveFailures: 0,
      lastOkAtMs: 1_700_000_000_000,
      rttMs: 12,
    })),
    lastProbedAtMs: 1_700_000_000_000,
  };
}

function uplink(overrides: Partial<Uplink> = {}): Uplink {
  return {
    id: 'isp-a',
    sourceIp: '10.90.1.30',
    asn: 64_501,
    ispName: 'ISP-A',
    // TP-09 — configuration proposes and probing decides, so the two lists differ here on
    // purpose: an uplink that DECLARES GLOBAL but only MEASURES ISP_LOCAL is the exact state
    // an operator debugging a partition is looking for.
    declaredScopes: [ReachabilityScope.GLOBAL, ReachabilityScope.ISP_LOCAL],
    inboundPort: 8444,
    priority: 1,
    health: health(UplinkState.UP, [ReachabilityScope.ISP_LOCAL]),
    ...overrides,
  };
}

interface Harness {
  readonly controller: TransportController;
  readonly forced: { id: string; state: UplinkState | null }[];
  readonly reevaluated: string[];
}

function harness(options: { readonly uplinks?: readonly Uplink[]; readonly scope?: ReachabilityScope | null } = {}): Harness {
  const items = options.uplinks ?? [uplink()];
  const forced: { id: string; state: UplinkState | null }[] = [];
  const reevaluated: string[] = [];

  const uplinks = {
    uplinks: () => items,
    get: (id: string) => items.find((item) => item.id === id) ?? null,
    currentScope: () => (options.scope === undefined ? ReachabilityScope.ISP_LOCAL : options.scope),
    force: (id: string, state: UplinkState | null) => forced.push({ id, state }),
  } as unknown as UplinkManager;

  const metrics = {
    snapshot: () => ({
      startedAtMs: 0,
      requests: {},
      ingressAccepted: {},
      ingressRejected: {},
      scopes: {
        ISP_LOCAL: {
          attempts: 4,
          successes: 4,
          failures: 0,
          meanLatencyMs: 11,
          lastOkAtMs: 1_700_000_000_000,
        },
      },
      uplinkTransitions: [
        { uplinkId: 'isp-a', from: 'unknown', to: 'up', atMs: 1_700_000_000_000 },
      ],
    }),
  } as unknown as Observability;

  const bridge = {
    enabled: true,
    async stats() {
      return {
        ready: true,
        relayed: [
          { fromUplink: 'isp-a', toUplink: 'isp-b', priority: 1, envelopes: 2, bytes: 400 },
        ],
        refused: {},
        headroom: [{ pair: 'isp-a:isp-b', priority: 1, envelopes: 598, bytes: 1_999_600 }],
      };
    },
  } as unknown as BridgeRelayService;

  const tunnels = { sessions: () => [] } as unknown as ReverseTunnelExchange;

  const state = {
    probeIntervalMs: 5_000,
    reachability: {
      reflexiveAddress: '100.90.4.7',
      localAddress: '10.90.1.30',
      cgnat: true,
      portMapping: { mapped: false, externalPort: null, method: 'none', detail: 'no IGD found' },
      checkedAtMs: 1_700_000_000_000,
    },
    tunnelledThrough: null,
    browseLocal: async () => [],
    reevaluate: async (reason: string) => {
      reevaluated.push(reason);
      return 1;
    },
  } as unknown as TransportState;

  const directory = {
    localAddresses: () => ['192.168.1.20'],
  } as unknown as ServiceDirectory;

  return {
    controller: new TransportController(uplinks, metrics, bridge, tunnels, state, auth, directory),
    forced,
    reevaluated,
  };
}

/** Every operator route, as a thunk taking the authorization header. */
const OPERATOR_ROUTES: readonly [string, (c: TransportController, a?: string) => Promise<unknown>][] = [
  ['GET /v1/transport/scopes', (c, a) => c.scopeMetrics(a)],
  ['GET /v1/transport/uplinks', (c, a) => c.uplinkList(a)],
  ['GET /v1/transport/bridge', (c, a) => c.bridgeStats(a)],
  ['GET /v1/transport/reachability', (c, a) => c.reachability(a)],
  ['GET /v1/transport/local-nodes', (c, a) => c.localNodes(a)],
  ['POST /v1/transport/uplinks/:id/state', (c, a) => c.forceUplink('isp-a', { state: 'auto' }, a)],
];

beforeEach(() => {
  process.env.ADMIN_KEYS = Buffer.from(ADMIN_KEY).toString('hex');
});

afterEach(() => {
  if (previousAdminKeys === undefined) delete process.env.ADMIN_KEYS;
  else process.env.ADMIN_KEYS = previousAdminKeys;
});

describe('TP-20 — the scope route is public', () => {
  it('answers with no credential at all, because an indicator only an admin can read is not an indicator', async () => {
    const { controller } = harness();
    expect(controller.scope(requestFrom('203.0.113.9'))).toMatchObject({
      scope: 'ISP_LOCAL',
      label: 'ISP-local',
      uplinksUp: 1,
      uplinksTotal: 1,
      bridging: true,
      // TG-10 — the node states its own cadence and the client honours it within 30 s.
      refreshAfterMs: 5_000,
    });
  });

  it('reports no working path rather than an empty string when nothing is reachable', () => {
    const { controller } = harness({ scope: null });
    expect(controller.scope(requestFrom('203.0.113.9'))).toMatchObject({
      scope: 'UNREACHABLE',
      label: 'No working path',
    });
  });

  it('counts uplinks in aggregate and names none of them', () => {
    const { controller } = harness({
      uplinks: [
        uplink(),
        uplink({ id: 'isp-b', sourceIp: '10.90.2.30', health: health(UplinkState.DOWN, []) }),
      ],
    });
    const document = controller.scope(requestFrom('203.0.113.9'));
    expect(document).toMatchObject({ uplinksUp: 1, uplinksTotal: 2 });
    // The whole payload must not leak an address, an ASN or an interface id.
    expect(JSON.stringify(document)).not.toMatch(/10\.90\.|64501|isp-a/);
  });
});

/**
 * TP-20 asks which scope the CLIENT is connected on. The node's own onward reach is a
 * different fact and used to be the only one reported, so a caller on the open internet was
 * told whatever the node's uplinks claimed — including "same network".
 */
describe('TP-20 — the link is classified from the caller, not from the node’s uplinks', () => {
  it('reports LAN only for a caller on one of this node’s segments', () => {
    const { controller } = harness();
    expect(controller.scope(requestFrom('192.168.1.77'))).toMatchObject({
      link: 'LAN',
      linkBasis: 'shared-subnet',
    });
  });

  it('does not call a public caller local, whatever the node’s uplinks say', () => {
    // The node's own scope here is ISP_LOCAL and its uplink declares reach it has not
    // measured. Neither may promote the caller's link.
    const { controller } = harness();
    expect(controller.scope(requestFrom('203.0.113.9'))).toMatchObject({
      link: 'GLOBAL',
      linkBasis: 'public-address',
    });
  });

  it('honours the trusted-proxy configuration the rate limiter uses', () => {
    const previous = process.env.TRUSTED_PROXY_HOPS;
    process.env.TRUSTED_PROXY_HOPS = '1';
    try {
      const { controller } = harness();
      // The proxy sits on the LAN; the real client does not.
      expect(
        controller.scope(requestFrom('192.168.1.5', '203.0.113.9')),
      ).toMatchObject({ link: 'GLOBAL' });
    } finally {
      if (previous === undefined) delete process.env.TRUSTED_PROXY_HOPS;
      else process.env.TRUSTED_PROXY_HOPS = previous;
    }
  });

  it('says UNKNOWN rather than guessing when the caller cannot be resolved', () => {
    const { controller } = harness();
    expect(controller.scope(requestFrom('not-an-address'))).toMatchObject({
      link: 'UNKNOWN',
      linkBasis: 'unknown',
    });
  });

  it('marks a never-probed node’s own scope as assumed, and a probed one as measured', () => {
    // `measured` is what lets the client say "assumed" instead of asserting a scope nothing
    // ever verified. It was already computed here and silently dropped by the client.
    // A stock node never probes — `lastProbedAtMs` stays null for its whole life — so this
    // is the value real deployments report.
    const unprobed = uplink({
      health: { ...health(UplinkState.UP, [ReachabilityScope.ISP_LOCAL]), lastProbedAtMs: null },
    });
    expect(harness({ uplinks: [unprobed] }).controller.scope(requestFrom('203.0.113.9'))).toMatchObject({
      measured: false,
    });
    expect(harness().controller.scope(requestFrom('203.0.113.9'))).toMatchObject({ measured: true });
  });
});

describe('the operator routes are guarded — every one of them', () => {
  for (const [name, call] of OPERATOR_ROUTES) {
    it(`${name} — 401 without an authorization header`, async () => {
      const { controller } = harness();
      await expect(call(controller)).rejects.toMatchObject({ status: 401 });
    });

    it(`${name} — 401 when the bearer token does not verify`, async () => {
      const { controller } = harness();
      await expect(call(controller, 'Bearer forged')).rejects.toMatchObject({ status: 401 });
    });

    it(`${name} — 401 when the scheme is not Bearer`, async () => {
      const { controller } = harness();
      await expect(call(controller, 'Basic valid')).rejects.toMatchObject({ status: 401 });
    });

    it(`${name} — 403 for an authenticated identity that is not in ADMIN_KEYS`, async () => {
      const { controller } = harness();
      await expect(call(controller, 'Bearer stranger')).rejects.toMatchObject({ status: 403 });
    });

    it(`${name} — resolves for an administrator`, async () => {
      const { controller } = harness();
      await expect(call(controller, 'Bearer valid')).resolves.toBeDefined();
    });
  }

  it('accepts an ADMIN_KEYS entry written as an identity id, not only as hex', async () => {
    process.env.ADMIN_KEYS = identityId(ADMIN_KEY);
    const { controller } = harness();
    await expect(controller.uplinkList('Bearer valid')).resolves.toBeDefined();
  });

  it('refuses when ADMIN_KEYS is unset — an empty allowlist admits nobody', async () => {
    delete process.env.ADMIN_KEYS;
    const { controller } = harness();
    await expect(controller.uplinkList('Bearer valid')).rejects.toMatchObject({ status: 403 });
  });
});

describe('TP-09 / TP-10 — the uplink inventory', () => {
  it('reports declared and measured scopes SEPARATELY, so an operator can see them disagree', async () => {
    const { controller } = harness();
    const document = (await controller.uplinkList('Bearer valid')) as {
      items: { declaredScopes: string[]; liveScopes: string[]; sourceIp: string; state: string }[];
      transitions: unknown[];
    };
    expect(document.items[0]).toMatchObject({
      sourceIp: '10.90.1.30',
      state: UplinkState.UP,
      declaredScopes: [ReachabilityScope.GLOBAL, ReachabilityScope.ISP_LOCAL],
      liveScopes: [ReachabilityScope.ISP_LOCAL],
    });
    expect(document.transitions).toHaveLength(1);
  });
});

describe('BR-10 — the operator override', () => {
  it('404s on an uplink this node does not have', async () => {
    const { controller } = harness();
    await expect(
      controller.forceUplink('isp-z', { state: 'down' }, 'Bearer valid'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('400s on a state that is neither up, down nor auto', async () => {
    const { controller } = harness();
    await expect(
      controller.forceUplink('isp-a', { state: 'degraded' }, 'Bearer valid'),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ['down', UplinkState.DOWN],
    ['up', UplinkState.UP],
  ])('forces %s and re-evaluates every peer path immediately (BR-07)', async (requested, expected) => {
    const { controller, forced, reevaluated } = harness();
    await controller.forceUplink('isp-a', { state: requested }, 'Bearer valid');
    expect(forced).toEqual([{ id: 'isp-a', state: expected }]);
    // BR-07 requires re-evaluation within 30 s; an override is a state change like any
    // other, so it happens now rather than at the next probe tick.
    expect(reevaluated).toHaveLength(1);
  });

  it.each(['auto', ''])('releases the override on %o', async (requested) => {
    const { controller, forced } = harness();
    await controller.forceUplink('isp-a', { state: requested }, 'Bearer valid');
    expect(forced).toEqual([{ id: 'isp-a', state: null }]);
  });

  it('releases the override when the body carries no state at all', async () => {
    const { controller, forced } = harness();
    await controller.forceUplink('isp-a', {}, 'Bearer valid');
    expect(forced).toEqual([{ id: 'isp-a', state: null }]);
  });
});

describe('BR-06 / TP-15 — what the operator surface must actually show', () => {
  it('reports bridge readiness, per-direction accounting and quota headroom', async () => {
    const { controller } = harness();
    await expect(controller.bridgeStats('Bearer valid')).resolves.toMatchObject({
      enabled: true,
      ready: true,
      relayed: [{ fromUplink: 'isp-a', toUplink: 'isp-b', envelopes: 2 }],
      headroom: [{ pair: 'isp-a:isp-b', priority: 1 }],
    });
  });

  it('names CGNAT rather than merely surviving it', async () => {
    const { controller } = harness();
    const document = (await controller.reachability('Bearer valid')) as {
      report: { cgnat: boolean; reflexiveAddress: string; portMapping: { mapped: boolean } };
    };
    // TP-15: no port forward can fix CGNAT, so an operator who is told sets up a reverse
    // tunnel instead of spending an evening in a router UI.
    expect(document.report.cgnat).toBe(true);
    expect(document.report.portMapping.mapped).toBe(false);
  });
});

describe('TP-02 — the scope metric', () => {
  it('exports attempts, successes and latency per scope', async () => {
    const { controller } = harness();
    await expect(controller.scopeMetrics('Bearer valid')).resolves.toMatchObject({
      scopes: { ISP_LOCAL: { attempts: 4, successes: 4, meanLatencyMs: 11 } },
    });
  });
});

describe('the guard consults the allowlist on every call', () => {
  it('stops admitting a key the moment ADMIN_KEYS stops naming it', async () => {
    const { controller } = harness();
    await expect(controller.uplinkList('Bearer valid')).resolves.toBeDefined();
    process.env.ADMIN_KEYS = Buffer.from(STRANGER_KEY).toString('hex');
    // Not cached at construction: an operator revoking an admin key must not have to
    // restart the node for it to take effect.
    await expect(controller.uplinkList('Bearer valid')).rejects.toMatchObject({ status: 403 });
  });

  it('distinguishes "your token is bad" from "you are not an administrator"', async () => {
    // Deliberately distinguishable. They are different situations with different remedies —
    // re-authenticate versus ask the operator — and collapsing them would send a client into
    // a login loop it can never win. Neither message names another identity.
    const { controller } = harness();
    const unauthenticated = await controller.uplinkList('Bearer forged').catch((e: unknown) => e);
    const unprivileged = await controller.uplinkList('Bearer stranger').catch((e: unknown) => e);
    expect(unauthenticated).toMatchObject({ status: 401 });
    expect(unprivileged).toMatchObject({ status: 403 });
    expect(
      (unauthenticated as { getResponse(): { detail: string } }).getResponse().detail,
    ).not.toBe((unprivileged as { getResponse(): { detail: string } }).getResponse().detail);
  });
});
