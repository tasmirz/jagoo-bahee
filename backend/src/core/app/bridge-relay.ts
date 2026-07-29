/**
 * The multi-homed relay (T3.11, T3.12, BR-01 … BR-06).
 *
 * ── What "bridging" actually is here ────────────────────────────────────────────────
 * Not a new transport and not a new code path. A bridge node is an ordinary federated node
 * with two uplinks; the only thing this service adds is a POLICY on step-19 fanout: when an
 * envelope that arrived from a peer on island A would be sent to a peer on island B, that
 * crossing is a relay, and a relay is opt-in, class-filtered and quota-bounded. Fanout
 * WITHIN an island is untouched — that is plain P2 federation, and gating it would break
 * ordinary gossip on a node that happens to be multi-homed.
 *
 * ── AR-12 holds ────────────────────────────────────────────────────────────────────
 * With no uplinks configured there is one implicit uplink, every peer resolves to it, no
 * fanout is ever cross-uplink, and this service returns `same_island` without consulting a
 * quota. A P2-shaped node is bit-for-bit unchanged.
 *
 * ── Why `shouldRelay` is synchronous ───────────────────────────────────────────────
 * It is called on the fanout path of every accepted envelope. A decision that awaited a
 * database read there would put the bridge's bookkeeping inside the latency budget of every
 * write on the node — on a Raspberry Pi, during the outage the bridge exists for. So peer→
 * uplink resolution is cached and refreshed on a timer and on uplink transitions, and the
 * hot path reads a `Map`.
 */

import type { ParsedEnvelope, Priority } from '../domain/envelope.js';
import {
  bridgeReadiness,
  decideRelay,
  RelayRefusal,
  bytesPerMinFor,
  envelopesPerMinFor,
  pairKey,
  type BridgeConfig,
  type BridgeStats,
  type PairBucket,
  type RelayDecision,
} from '../domain/transport/bridge-policy.js';
import { PeerTrust, type PeerDirectory, type PathSelector } from '../ports/network.port.js';
import { BridgeRelay, type UplinkManager } from '../ports/transport.port.js';
import type { Clock } from '../ports/system.port.js';

export interface BridgeRelayDeps {
  readonly config: BridgeConfig;
  readonly peers: PeerDirectory;
  readonly paths: PathSelector;
  readonly uplinks: UplinkManager;
  readonly clock: Clock;
}

interface RelayTally {
  envelopes: number;
  bytes: number;
}

export class BridgeRelayService extends BridgeRelay {
  private uplinkByPeer = new Map<string, string>();
  private trustedUplinks: ReadonlySet<string> = new Set<string>();
  private buckets: ReadonlyMap<string, PairBucket> = new Map();
  private readonly relayed = new Map<string, RelayTally>();
  private readonly refused: Record<RelayRefusal, number> = {
    [RelayRefusal.CLASS_EXCLUDED]: 0,
    [RelayRefusal.QUOTA]: 0,
    [RelayRefusal.LOOP]: 0,
    [RelayRefusal.SAME_ISLAND]: 0,
    [RelayRefusal.DISABLED]: 0,
  };

  constructor(private readonly deps: BridgeRelayDeps) {
    super();
  }

  get enabled(): boolean {
    return this.deps.config.enabled;
  }

  /**
   * Recompute which island each peer sits on, and which uplinks carry a `TRUSTED` peer.
   *
   * Called on a timer and after every uplink transition (BR-07). "Which uplink reaches this
   * peer" is exactly what the path selector answers, so it is asked rather than
   * reimplemented — a second copy of that rule would drift from the one TG-03 asserts on.
   */
  async refresh(): Promise<void> {
    const byPeer = new Map<string, string>();
    const trusted = new Set<string>();
    for (const peer of await this.deps.peers.all()) {
      const path = await this.deps.paths.select(peer);
      const uplinkId = path?.uplinkId;
      if (!uplinkId) continue;
      byPeer.set(peer.serverId, uplinkId);
      if (peer.trust === PeerTrust.TRUSTED) trusted.add(uplinkId);
    }
    this.uplinkByPeer = byPeer;
    this.trustedUplinks = trusted;
  }

  shouldRelay(envelope: ParsedEnvelope, viaUplinkId: string, bytes: number): RelayDecision {
    const outcome = decideRelay({
      config: this.deps.config,
      viaUplinkId,
      priority: envelope.priority,
      bytes,
      trustedUplinks: this.trustedUplinks,
      buckets: this.buckets,
      nowMs: this.deps.clock.nowMs(),
    });
    this.buckets = outcome.buckets;
    if (!outcome.decision.relay) this.refused[outcome.decision.reason] += 1;
    return outcome.decision;
  }

  async uplinkForPeer(peerId: string): Promise<string | null> {
    const cached = this.uplinkByPeer.get(peerId);
    if (cached) return cached;
    const peer = await this.deps.peers.get(peerId);
    if (!peer) return null;
    const path = await this.deps.paths.select(peer);
    if (!path?.uplinkId) return null;
    this.uplinkByPeer.set(peerId, path.uplinkId);
    return path.uplinkId;
  }

  async peersOn(uplinkId: string): Promise<readonly string[]> {
    if (this.uplinkByPeer.size === 0) await this.refresh();
    return [...this.uplinkByPeer.entries()]
      .filter(([, id]) => id === uplinkId)
      .map(([peerId]) => peerId);
  }

  recordRelay(fromUplink: string, toUplink: string, priority: Priority, bytes: number): void {
    // Directional on purpose (BR-06): "bytes relayed per direction" is how an operator sees
    // that one island is producing and the other only consuming, which is a real and common
    // asymmetry during a partition.
    const key = `${fromUplink}>${toUplink}::${priority}`;
    const tally = this.relayed.get(key) ?? { envelopes: 0, bytes: 0 };
    tally.envelopes += 1;
    tally.bytes += bytes;
    this.relayed.set(key, tally);
  }

  async stats(): Promise<BridgeStats> {
    const readiness = bridgeReadiness(this.deps.config, this.trustedUplinks);
    const relayed = [...this.relayed.entries()].map(([key, tally]) => {
      const [direction = '', priorityText = '0'] = key.split('::');
      const [fromUplink = '', toUplink = ''] = direction.split('>');
      return {
        fromUplink,
        toUplink,
        priority: Number(priorityText) as Priority,
        envelopes: tally.envelopes,
        bytes: tally.bytes,
      };
    });

    const headroom = [...this.buckets.entries()].map(([key, bucket]) => {
      const [left = '', right = '', priorityText = '0'] = key.split('::');
      return {
        pair: `${left}<->${right}`,
        priority: Number(priorityText) as Priority,
        envelopes: Math.floor(bucket.envelopes.tokens),
        bytes: Math.floor(bucket.bytes.tokens),
      };
    });

    return {
      ready: readiness.ready,
      ...(readiness.reason ? { reason: readiness.reason } : {}),
      relayed,
      refused: { ...this.refused },
      headroom,
    };
  }

  /** The grant an operator sees before any traffic has moved (BR-06 headroom on a fresh node). */
  grantFor(priority: Priority): { readonly envelopesPerMin: number; readonly bytesPerMin: number } {
    return {
      envelopesPerMin: envelopesPerMinFor(this.deps.config, priority),
      bytesPerMin: bytesPerMinFor(this.deps.config, priority),
    };
  }

  /** Exposed for the operator surface and the TG-05 gate, which asserts on a specific pair. */
  headroomFor(a: string, b: string, priority: Priority): PairBucket | null {
    return this.buckets.get(pairKey(a, b, priority)) ?? null;
  }
}
