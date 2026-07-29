/**
 * Transport's moving parts: the probe timer, NAT discovery, local discovery, and the reverse
 * tunnel (T3.13, T3.15, T3.16, T3.17, T3.18).
 *
 * ── Why the timers live here ───────────────────────────────────────────────────────
 * `TransportSupervisor.tick()` is a single pass with no clock of its own, exactly like
 * `FederationOutboxService.drain()` — a test calls it and asserts rather than waiting thirty
 * seconds. Scheduling is a deployment concern and belongs in the composition root (AR-11).
 *
 * ── AR-12 ─────────────────────────────────────────────────────────────────────────
 * With no `UPLINKS`, no `PROBE_TARGETS`, no `NAT_*`, no `LOCAL_DISCOVERY` and no
 * `TUNNEL_THROUGH`, every branch below is skipped: no timer, no sockets, no multicast, no
 * outbound poll. A P2-shaped node is unchanged, and the resilience machinery costs it
 * nothing.
 */

import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { TransportSupervisor } from '../core/app/transport-supervisor.js';
import type { BridgeRelayService } from '../core/app/bridge-relay.js';
import type { DiscoveredNode, LocalDiscovery, NatTraversal, ReachabilityReport } from '../core/ports/transport.port.js';
import type { UplinkManager } from '../core/ports/transport.port.js';
import type { ReverseTunnelClient } from '../adapters/outbound/transport/reverse-tunnel-client.js';
import type { TransportConfig } from './transport.config.js';

export const TRANSPORT_STATE = Symbol('TransportState');

/**
 * What the operator surface reads.
 *
 * A narrow read-model rather than handing the controller the runtime object: a controller
 * that could call `stop()` on the runtime is a controller that eventually will.
 */
export interface TransportState {
  readonly probeIntervalMs: number;
  readonly reachability: ReachabilityReport | null;
  readonly tunnelledThrough: string | null;
  browseLocal(): Promise<readonly DiscoveredNode[]>;
  reevaluate(reason: string): Promise<number>;
}

export interface TransportRuntimeDeps {
  readonly config: TransportConfig;
  readonly uplinks: UplinkManager;
  readonly supervisor: TransportSupervisor;
  readonly bridge: BridgeRelayService;
  readonly nat: NatTraversal | null;
  readonly discovery: LocalDiscovery | null;
  readonly tunnel: ReverseTunnelClient | null;
  readonly nodeIdentity: () => { readonly serverId: string; readonly displayName: string };
  readonly grpcPort: number;
}

export class TransportRuntime
  implements OnApplicationBootstrap, OnApplicationShutdown, TransportState
{
  private probeTimer: NodeJS.Timeout | null = null;
  private report: ReachabilityReport | null = null;
  private stopping = false;

  constructor(private readonly deps: TransportRuntimeDeps) {}

  get probeIntervalMs(): number {
    return this.deps.config.probe.intervalMs;
  }

  get reachability(): ReachabilityReport | null {
    return this.report;
  }

  get tunnelledThrough(): string | null {
    return this.deps.config.tunnel.through;
  }

  async onApplicationBootstrap(): Promise<void> {
    // The bridge's peer→island map is derived from path selection, so it needs one pass
    // before the first envelope arrives; otherwise the first relay decision is made against
    // an empty map and refuses a crossing that should have been allowed.
    await this.deps.bridge.refresh().catch(() => undefined);

    // TP-01 in practice: probe once at boot so the FIRST dial already prefers the narrowest
    // working scope. Waiting a full interval would mean every node spends its first thirty
    // seconds on whatever path the OS routing table happens to name.
    if (this.deps.config.configured) {
      await this.deps.supervisor.tick().catch(() => undefined);
    }

    if (this.deps.config.configured && this.deps.config.probe.intervalMs > 0) {
      this.probeTimer = setInterval(() => {
        void this.deps.supervisor.tick().catch(() => undefined);
      }, this.deps.config.probe.intervalMs);
      this.probeTimer.unref?.();
    }

    if (this.deps.nat) {
      // TP-14 — attempted, reported, and never fatal. A node whose mapping failed keeps
      // working outbound-only, which FD-12 makes the default rather than a fallback.
      this.report = await this.deps.nat
        .discover({
          port: this.deps.grpcPort,
          ...(this.primarySourceIp() ? { sourceIp: this.primarySourceIp() as string } : {}),
        })
        .catch(() => null);
      if (this.report && !this.report.portMapping.mapped) {
        // TP-14 requires the outcome to be reported clearly — a silent mapping failure is
        // how peers end up retrying a port that will never answer.
        console.warn(`[transport] inbound mapping unavailable: ${this.report.portMapping.detail}`);
      }
    }

    if (this.deps.discovery) {
      const identity = this.deps.nodeIdentity();
      await this.deps.discovery
        .announce({
          serverId: identity.serverId,
          displayName: identity.displayName,
          port: this.deps.grpcPort,
        })
        .catch(() => undefined);
    }

    this.deps.tunnel?.start();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.probeTimer) clearInterval(this.probeTimer);
    this.deps.tunnel?.stop();
    await this.deps.discovery?.stop().catch(() => undefined);
    await this.deps.nat?.release().catch(() => undefined);
  }

  async browseLocal(): Promise<readonly DiscoveredNode[]> {
    return (await this.deps.discovery?.browse(3_000)) ?? [];
  }

  async reevaluate(reason: string): Promise<number> {
    return this.deps.supervisor.reevaluate(reason);
  }

  /** The highest-priority uplink's source address — what NAT mapping and STUN bind to. */
  private primarySourceIp(): string | null {
    const ranked = [...this.deps.uplinks.uplinks()].sort((a, b) => a.priority - b.priority);
    return ranked.find((uplink) => uplink.sourceIp)?.sourceIp ?? null;
  }
}
