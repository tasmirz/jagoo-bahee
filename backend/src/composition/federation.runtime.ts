/**
 * Federation's moving parts: the gRPC server, the outbox drainer, the stream pullers, and
 * the gossip timer.
 *
 * ── Why the timers live here and not in `core/app` ─────────────────────────────────
 * `FederationOutboxService.drain()` and `FederationSync.gossip()` are single passes with
 * no clock of their own, which is what makes them testable — a test calls `drain()` and
 * asserts, rather than waiting. Scheduling is a deployment concern, so it belongs in the
 * composition root alongside the other lifecycle owners (AR-11).
 *
 * ── FD-11 / FG-07: the outbound-only node is the interesting case ──────────────────
 * With `outboundOnly`, `start()` binds no port. Everything still works: the drainer pushes
 * over `Deliver` streams this node opened, and `FederationSync` receives over
 * `StreamActivities` streams this node opened. That is a complete federation participant
 * behind CGNAT with no port forwarding — the default deployment, not a fallback.
 */

import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { FederationOutboxService } from '../core/app/federation-outbox.js';
import type { FederationSync } from '../core/app/federation-sync.js';
import type { PeerDirectory } from '../core/ports/network.port.js';
import type { FederationGrpcServer } from '../adapters/inbound/grpc/federation.server.js';
import type { GrpcFederationSender } from '../adapters/outbound/grpc/federation-client.js';
import type { FederationConfig } from './federation.config.js';

export class FederationRuntime implements OnApplicationBootstrap, OnApplicationShutdown {
  private drainTimer: NodeJS.Timeout | null = null;
  private gossipTimer: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(
    private readonly config: FederationConfig,
    private readonly peers: PeerDirectory,
    private readonly outbox: FederationOutboxService,
    private readonly sync: FederationSync,
    private readonly server: FederationGrpcServer | null,
    private readonly sender: GrpcFederationSender | null,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.enabled) return;

    // Configured peers are seeded before anything dials, so the very first handshake is
    // against a record we already hold and an operator-set trust level is honoured on it.
    for (const peer of this.config.peers) {
      const existing = await this.peers.get(peer.serverId);
      if (existing) {
        await this.peers.upsert({ ...existing, endpoints: peer.endpoints });
        continue;
      }
      await this.peers.upsert({
        serverId: peer.serverId,
        publicKey: peer.publicKey,
        endpoints: peer.endpoints,
        trust: peer.trust ?? 'PROBATION',
        lastSeenMs: 0,
        firstSeenMs: 0,
      });
    }

    if (this.server) await this.server.start();

    // Connecting backfills from the durable cursor BEFORE opening the live stream, so a
    // restart closes whatever gap it opened (FG-04). Failures are deliberately swallowed:
    // a peer that is down at boot must not stop the node from starting, and the drain
    // timer will keep trying.
    for (const peer of this.config.peers) {
      void this.sync.connect(peer.serverId).catch(() => undefined);
    }

    if (this.config.drainIntervalMs > 0) {
      this.drainTimer = setInterval(() => {
        void this.outbox.drain().catch(() => undefined);
      }, this.config.drainIntervalMs);
      this.drainTimer.unref?.();
    }

    if (this.config.gossipIntervalMs > 0) {
      this.gossipTimer = setInterval(() => {
        void this.sync.gossip().catch(() => undefined);
        void this.sync.exchangeDirectories().catch(() => undefined);
      }, this.config.gossipIntervalMs);
      this.gossipTimer.unref?.();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.drainTimer) clearInterval(this.drainTimer);
    if (this.gossipTimer) clearInterval(this.gossipTimer);
    this.sync.stopAll();
    await this.server?.stop();
    this.sender?.close();
  }
}
