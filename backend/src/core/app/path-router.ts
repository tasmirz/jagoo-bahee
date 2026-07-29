/**
 * The `PathSelector` port, wired to live uplink state (T3.4, T3.10, TP-02, TP-11).
 *
 * ── What is here and what is deliberately not ───────────────────────────────────────
 * The ranking rules are in `core/domain/transport/path-selection.ts`, pure and unit-tested
 * with no network (TP-13). This file supplies the three impure inputs that function needs —
 * the measured uplink views, the clock, and one jitter draw — and does the one thing a pure
 * function cannot: it writes the outcome back, so a failed endpoint is actually held back
 * next time (TP-12) and the per-scope metric reflects what was really dialled (TP-02).
 *
 * ── TG-03 lives or dies on `recordOutcome` being called ─────────────────────────────
 * "Path selector demonstrably prefers ISP_LOCAL over NATIONAL when both are alive (metric
 * confirms)". If the sender selected a path and never reported back, the scope counters would
 * stay at zero and the gate would pass vacuously on an empty snapshot. So the port declares
 * the callback and the gate asserts on non-zero `ISP_LOCAL` attempts, not merely on the
 * absence of `NATIONAL` ones.
 */

import {
  endpointFailed,
  endpointSucceeded,
  rankPaths,
  withEndpoint,
  type PathCandidate,
} from '../domain/transport/path-selection.js';
import {
  PathSelector,
  type PeerEndpoint,
  type PeerRecord,
  type SelectedPath,
} from '../ports/network.port.js';
import type { UplinkManager } from '../ports/transport.port.js';
import type { PeerDirectory } from '../ports/network.port.js';
import type { Observability } from '../ports/observability.port.js';
import type { Clock, RandomSource } from '../ports/system.port.js';

export interface PathRouterDeps {
  readonly uplinks: UplinkManager;
  readonly peers: PeerDirectory;
  readonly clock: Clock;
  readonly random: RandomSource;
  readonly observability?: Observability;
  /** The transport that will carry it. Recorded, never branched on (NFR-M03). */
  readonly transportId?: string;
}

export class PathRouter extends PathSelector {
  constructor(private readonly deps: PathRouterDeps) {
    super();
  }

  async select(peer: PeerRecord): Promise<SelectedPath | null> {
    const best = this.rank(peer)[0];
    return best ? this.toSelectedPath(best) : null;
  }

  /**
   * Every workable path, best first.
   *
   * Exposed so a caller can walk the list on failure (step 5) rather than re-selecting and
   * getting the same dead endpoint back — re-selection only helps once `recordOutcome` has
   * pushed the failure count past the threshold, which is three dials too late.
   */
  candidates(peer: PeerRecord): readonly SelectedPath[] {
    return this.rank(peer).map((candidate) => this.toSelectedPath(candidate));
  }

  async recordOutcome(
    peer: PeerRecord,
    endpoint: PeerEndpoint,
    ok: boolean,
    rttMs?: number,
  ): Promise<void> {
    const nowMs = this.deps.clock.nowMs();
    this.deps.observability?.transportAttempt(endpoint.scope, ok, rttMs ?? null);

    const updated = ok
      ? endpointSucceeded(endpoint, nowMs, rttMs)
      : endpointFailed(endpoint, nowMs);

    // Re-read rather than mutating the caller's copy: between selection and outcome a
    // handshake may have replaced the peer's endpoint set entirely (FD-02 makes addresses
    // mutable metadata), and writing back a stale record would undo that.
    const current = (await this.deps.peers.get(peer.serverId)) ?? peer;
    await this.deps.peers.upsert(withEndpoint(current, updated));
  }

  private rank(peer: PeerRecord): readonly PathCandidate[] {
    return rankPaths({
      peer,
      uplinks: this.deps.uplinks.views(),
      nowMs: this.deps.clock.nowMs(),
      jitter01: jitterFrom(this.deps.random),
    });
  }

  private toSelectedPath(candidate: PathCandidate): SelectedPath {
    return {
      endpoint: candidate.endpoint,
      transportId: this.deps.transportId ?? 'grpc',
      uplinkId: candidate.uplink.id,
      ...(candidate.uplink.sourceIp ? { sourceIp: candidate.uplink.sourceIp } : {}),
    };
  }
}

/**
 * One jitter draw in [0, 1), from the injected `RandomSource`.
 *
 * Two bytes rather than one: with 256 buckets, five hundred nodes recovering together would
 * land on the same millisecond roughly twice each, which is a small thundering herd rather
 * than none (TP-12).
 */
function jitterFrom(random: RandomSource): number {
  const bytes = random.bytes(2);
  return (((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0)) / 65_536;
}
