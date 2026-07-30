/**
 * The transport surface: scope, uplinks, bridge, reachability (T3.10, T3.20, T3.21, TP-02,
 * TP-15, TP-20, BR-06, BR-10).
 *
 * ── Public vs. operator, and why the split falls where it does ─────────────────────
 * `/v1/transport/scope` is PUBLIC because TP-20 requires the client to display which scope
 * it is connected on, always visible and never buried in settings — "people need to know
 * what network they are on" is a safety property during a shutdown, and a surface only an
 * admin can read cannot deliver it. It reports a scope name and nothing else: no addresses,
 * no ASNs, no peer counts.
 *
 * Everything that names an interface, an ASN, or a relay volume is operator-only. An uplink
 * list is a map of how to cut this node off, and `/v1/federation/peers` already omits
 * `BLOCKED` peers for the same reason — a directory of who to attack is not public
 * infrastructure metadata.
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { identityId } from '@jagoo/sdk/core';
import { UplinkState, liveScopes } from '../../../core/domain/transport/uplink-state.js';
import { SCOPE_LABEL } from '../../../core/domain/transport/scope.js';
import { classifyLink } from '../../../core/domain/transport/link-scope.js';
import { ServiceDirectory } from '../../../core/ports/service-directory.port.js';
import { callerAddress } from './network-subject.js';
import { BridgeRelayService } from '../../../core/app/bridge-relay.js';
import { ReverseTunnelExchange } from '../../../core/app/reverse-tunnel.js';
import { SessionAuth } from '../../../core/ports/auth.port.js';
import { Observability } from '../../../core/ports/observability.port.js';
import { UplinkManager } from '../../../core/ports/transport.port.js';
import { TRANSPORT_STATE, type TransportState } from '../../../composition/transport.runtime.js';

function configuredAdminKeys(): Set<string> {
  return new Set(
    (process.env.ADMIN_KEYS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

@Controller('v1/transport')
export class TransportController {
  constructor(
    @Inject(UplinkManager) private readonly uplinks: UplinkManager,
    @Inject(Observability) private readonly metrics: Observability,
    @Inject(BridgeRelayService) private readonly bridge: BridgeRelayService,
    @Inject(ReverseTunnelExchange) private readonly tunnels: ReverseTunnelExchange,
    @Inject(TRANSPORT_STATE) private readonly state: TransportState,
    @Inject(SessionAuth) private readonly auth: SessionAuth,
    @Inject(ServiceDirectory) private readonly directory: ServiceDirectory,
  ) {}

  /**
   * TP-20 / TG-10 — the always-visible scope indicator's source.
   *
   * Two different facts, deliberately reported separately because they answer different
   * questions and were previously conflated into one:
   *
   *   `link`  — how THIS CALLER reached this node. What TP-20 asks for, and what the pill
   *             must render: "same network" is a statement about the phone and the server,
   *             so it cannot be answered without a fact about the phone.
   *   `scope` — how far this NODE can reach onward. What the node forwards your post into.
   *             Correct and useful, but it is not the caller's link and must not be
   *             labelled as one.
   *
   * `refreshAfterMs` tells the client how soon to ask again. TG-10 requires the indicator to
   * update within 30 seconds of a change, and letting the NODE state its own probe cadence
   * means a client polling on a guess cannot be systematically slower than the truth.
   *
   * Nothing here is stored and nothing new is read: the caller address is the one the
   * anti-abuse interceptor already derives for every request.
   */
  @Get('scope')
  scope(@Req() request: FastifyRequest): Record<string, unknown> {
    const scope = this.uplinks.currentScope();
    // Whether any scope this node reports was actually probed. A node with no probe targets
    // is reporting what it was configured to assume, and a client telling someone "nothing
    // you post leaves this building" should be able to say whether that was measured.
    const measured = this.uplinks
      .uplinks()
      .some((uplink) => uplink.health.lastProbedAtMs !== null);
    const observed = callerAddress(request);
    const link = observed
      ? classifyLink(observed, this.directory.localAddresses())
      : { scope: null, basis: 'unknown' as const };
    return {
      link: link.scope ?? 'UNKNOWN',
      linkBasis: link.basis,
      scope: scope ?? 'UNREACHABLE',
      label: scope ? SCOPE_LABEL[scope] : 'No working path',
      measured,
      // Aggregate only: how many uplinks are alive, never which or where.
      uplinksUp: this.uplinks.uplinks().filter((uplink) => uplink.health.state === UplinkState.UP)
        .length,
      uplinksTotal: this.uplinks.uplinks().length,
      bridging: this.bridge.enabled,
      refreshAfterMs: this.state.probeIntervalMs,
      asOfMs: Date.now(),
    };
  }

  /** TP-02 / TG-03 — per-scope attempts, successes and latency. Operator-only. */
  @Get('scopes')
  async scopeMetrics(
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    await this.authorize(authorization);
    return { scopes: this.metrics.snapshot().scopes };
  }

  /** TP-10 — uplink inventory with measured live scopes and the transition history. */
  @Get('uplinks')
  async uplinkList(
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    await this.authorize(authorization);
    return {
      items: this.uplinks.uplinks().map((uplink) => ({
        id: uplink.id,
        sourceIp: uplink.sourceIp,
        asn: uplink.asn ?? null,
        ispName: uplink.ispName ?? null,
        priority: uplink.priority,
        state: uplink.health.state,
        forced: uplink.health.forcedState ?? null,
        declaredScopes: uplink.declaredScopes,
        // TP-09 — configuration proposes, probing decides. Both are shown, because an
        // operator debugging a partition needs to see exactly where those two disagree.
        liveScopes: liveScopes(uplink.health),
        lastProbedAtMs: uplink.health.lastProbedAtMs,
        scopes: uplink.health.scopes,
      })),
      transitions: this.metrics.snapshot().uplinkTransitions,
    };
  }

  /**
   * BR-10 — force an uplink up or down.
   *
   * "A manual operator override MUST exist for situations the probes cannot detect." A
   * transparent proxy that answers every TCP connect makes an uplink look healthy while
   * nothing traverses it; no probe this node can run distinguishes that from working, and an
   * operator watching the actual traffic can.
   */
  @Post('uplinks/:id/state')
  async forceUplink(
    @Param('id') id: string,
    @Body() body: { readonly state?: string },
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    await this.authorize(authorization);
    if (!this.uplinks.get(id)) {
      throw new HttpException({ detail: `no uplink named ${id}` }, 404);
    }
    const requested = (body?.state ?? '').trim().toLowerCase();
    const forced =
      requested === 'auto' || requested === ''
        ? null
        : requested === UplinkState.UP || requested === UplinkState.DOWN
          ? (requested as UplinkState)
          : undefined;
    if (forced === undefined) {
      throw new HttpException({ detail: 'state must be "up", "down" or "auto"' }, 400);
    }
    this.uplinks.force(id, forced);
    // BR-07 — an override is a state change like any other, so every peer path is
    // re-evaluated immediately rather than at the next probe tick.
    await this.state.reevaluate(`operator forced ${id} ${forced ?? 'auto'}`);
    return { id, forced: forced ?? 'auto', state: this.uplinks.get(id)?.health.state };
  }

  /** BR-06 — bytes relayed per direction, per class, and current quota headroom. */
  @Get('bridge')
  async bridgeStats(
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    await this.authorize(authorization);
    return { enabled: this.bridge.enabled, ...(await this.bridge.stats()) };
  }

  /** TP-14 / TP-15 — reflexive address, CGNAT verdict, port-mapping outcome, tunnels. */
  @Get('reachability')
  async reachability(
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    await this.authorize(authorization);
    return {
      report: this.state.reachability,
      tunnels: this.tunnels.sessions(),
      tunnelledThrough: this.state.tunnelledThrough,
    };
  }

  /** TP-18 — one bounded mDNS/SSDP browse round on the local segment. */
  @Get('local-nodes')
  async localNodes(
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    await this.authorize(authorization);
    return { items: await this.state.browseLocal() };
  }

  private async authorize(authorization?: string): Promise<void> {
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new HttpException({ detail: 'administrator access token is required' }, 401);
    }
    let key: Uint8Array;
    try {
      key = (await this.auth.verifyAccess(token)).key;
    } catch {
      throw new HttpException({ detail: 'administrator access token is invalid' }, 401);
    }
    const admins = configuredAdminKeys();
    if (
      !admins.has(Buffer.from(key).toString('hex').toLowerCase()) &&
      !admins.has(identityId(key).toLowerCase())
    ) {
      throw new HttpException({ detail: 'administrator role is required' }, 403);
    }
  }
}
