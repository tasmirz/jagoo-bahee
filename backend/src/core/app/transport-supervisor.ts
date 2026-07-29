/**
 * Uplink failover (T3.13, T3.14, BR-07, BR-08, BR-09, TP-10).
 *
 * ── The requirement, and what makes it hard ─────────────────────────────────────────
 * BR-07: "Uplink state changes MUST trigger re-evaluation of every active peer path within
 * 30 seconds. Existing streams on a failed uplink are torn down and re-established on a live
 * one." The hard part is not noticing the failure — it is that a `StreamActivities` call on a
 * dead interface does not fail fast. It sits there, TCP retransmitting, for minutes. So
 * failover is driven by the PROBE, not by the stream erroring: the moment an uplink's health
 * transitions, every peer stream is aborted and re-established, whether or not the socket has
 * noticed yet.
 *
 * ── BR-08: switching uplinks MUST NOT lose queued envelopes ────────────────────────
 * Nothing here touches the outbox, and that is the design. The queue is durable and
 * uplink-agnostic; only the PATH changes. An envelope enqueued while uplink A was alive is
 * still in Mongo when uplink B takes over, and the drainer picks it up on its next pass with
 * no special case. Zero loss is a property of not having written a failover path that could
 * lose anything.
 *
 * ── BR-09: re-announce, then backfill ──────────────────────────────────────────────
 * `FederationSync.connect` already does both in the right order — handshake, backfill from
 * the durable cursor, then open the live stream. A switch is therefore the same operation as
 * a restart, which is exactly right: from a peer's point of view we were briefly gone.
 *
 * Single passes with no timers. Scheduling belongs to the composition root (AR-11), and a
 * test calls `tick()` and asserts rather than waiting 30 seconds.
 */

import { AlertSeverity, type OperatorAlerts } from '../ports/alerts.port.js';
import type { PeerDirectory } from '../ports/network.port.js';
import type { Observability } from '../ports/observability.port.js';
import type { Clock } from '../ports/system.port.js';
import type { UplinkManager, UplinkTransition } from '../ports/transport.port.js';
import type { BridgeRelayService } from './bridge-relay.js';
import type { FederationSync } from './federation-sync.js';

export interface TransportSupervisorDeps {
  readonly uplinks: UplinkManager;
  readonly peers: PeerDirectory;
  readonly sync: FederationSync;
  readonly clock: Clock;
  readonly bridge?: BridgeRelayService;
  readonly observability?: Observability;
  readonly alerts?: OperatorAlerts;
}

export interface FailoverReport {
  readonly transitions: readonly UplinkTransition[];
  readonly peersReconnected: number;
  readonly reason: string;
}

export class TransportSupervisor {
  constructor(private readonly deps: TransportSupervisorDeps) {}

  /**
   * Rebuild the bridge's peer→island map, or do nothing at all.
   *
   * Guarded on `enabled` so AR-12 holds one rung up: a node that has not opted into bridging
   * pays nothing for this on every probe round. A failure is swallowed — an unreachable peer
   * directory is the ordinary state during the partition a bridge exists to survive, and it
   * must not stop the probe loop that will fix it.
   */
  private async refreshBridge(): Promise<void> {
    if (!this.deps.bridge?.enabled) return;
    await this.deps.bridge.refresh().catch(() => undefined);
  }

  /**
   * One probe round, plus the failover it implies.
   *
   * Returns the report so the runtime can log it and a test can assert on it. A pass that
   * changes nothing returns zero reconnections and does no work — the common case, run every
   * 30 seconds, must stay cheap.
   */
  async tick(): Promise<FailoverReport> {
    const transitions = await this.deps.uplinks.probeAll();

    for (const transition of transitions) {
      // TP-10 — "the IX went down at 03:14" is operationally critical information, and it is
      // only useful if it was recorded when it happened rather than reconstructed afterwards.
      this.deps.observability?.uplinkTransition(
        transition.uplink.id,
        transition.from,
        transition.to,
        transition.atMs,
      );
      await this.deps.alerts?.raise({
        severity: transition.to === 'down' ? AlertSeverity.WARNING : AlertSeverity.INFO,
        code: 'uplink.transition',
        subject: transition.uplink.id,
        detail: `${transition.from} → ${transition.to}`,
        raisedAtMs: transition.atMs,
      });
    }

    if (transitions.length === 0) {
      // BR-01 — the bridge's peer→island map goes stale without any uplink moving.
      //
      // It used to be rebuilt in exactly two places: once at bootstrap, and again on an
      // uplink transition. A bridge in its normal state has neither. Peers are seeded and
      // handshaken by the federation runtime on its own schedule, so the boot-time pass
      // routinely ran against an empty or partial directory — and then nothing recomputed it
      // for the life of the process. The container gate found a correctly configured bridge
      // with three TRUSTED peers reporting "no uplink pair has a TRUSTED peer on both sides"
      // forever, which no operator could have acted on because nothing was wrong.
      //
      // A quiet round is the right place for it: the work is one directory read plus pure
      // path selection, it runs at the probe cadence rather than per envelope, and the probe
      // cadence is exactly how often the answer can change.
      await this.refreshBridge();
      return { transitions, peersReconnected: 0, reason: 'no change' };
    }

    const reason = transitions
      .map((transition) => `${transition.uplink.id}:${transition.from}->${transition.to}`)
      .join(', ');
    const peersReconnected = await this.reevaluate(reason);
    return { transitions, peersReconnected, reason };
  }

  /**
   * BR-07 + BR-09 — tear down every peer stream and bring it back on whatever uplink is
   * alive now.
   *
   * Every peer, not only the ones on the failed uplink. Path selection is a function of the
   * WHOLE uplink set (`rankPaths` unions live scopes across uplinks), so an uplink coming up
   * can change the right answer for a peer that was reachable all along — and that is
   * precisely the TP-01 case: `ISP_LOCAL` returning should immediately reclaim traffic that
   * had failed over to `GLOBAL`, not wait for `GLOBAL` to break too.
   */
  async reevaluate(reason: string): Promise<number> {
    // The bridge's peer→island map is derived from path selection, so it is stale the instant
    // an uplink changes. Refreshed before reconnecting, or the first relayed envelope after a
    // failover would be charged to the wrong pair.
    await this.refreshBridge();

    let reconnected = 0;
    for (const peer of await this.deps.peers.all()) {
      this.deps.sync.stopStream(peer.serverId);
      try {
        // Handshake (re-announce with the new endpoint set), backfill from the durable
        // cursor, then re-open the stream. Identical to a restart, deliberately.
        const report = await this.deps.sync.connect(peer.serverId);
        if (report) reconnected += 1;
      } catch {
        // A peer unreachable on every live uplink is the expected outcome of an island going
        // dark, not an error to escalate. Its traffic stays in the durable outbox (BR-08) and
        // the next tick tries again.
      }
    }

    await this.deps.alerts?.raise({
      severity: AlertSeverity.INFO,
      code: 'uplink.failover',
      subject: reason,
      detail: `re-evaluated ${reconnected} peer path(s)`,
      raisedAtMs: this.deps.clock.nowMs(),
    });
    return reconnected;
  }
}
