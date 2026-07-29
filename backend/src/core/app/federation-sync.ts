/**
 * The peer-initiated side of federation: handshake, catch-up, live pull, gossip, directory
 * (T2.9, T2.11, T2.12, T2.13).
 *
 * ── FD-11 / FG-07: this is what makes a NATed node a full participant ───────────────
 * Every call here is OUTBOUND. A node behind CGNAT opens `Deliver` to push and
 * `StreamActivities` to receive, over connections it initiated — no inbound port, no port
 * forwarding, no UPnP. `outbound-only` is therefore not a degraded mode with missing
 * features; it is this file plus the outbox drainer, with the gRPC server simply not
 * started. The default for a home or community node (FD-12).
 *
 * ── FG-04: reconnect triggers backfill, automatically ───────────────────────────────
 * A live stream that drops loses whatever the peer published while it was down. Catching
 * up is not something an operator should have to notice, so `connect` always backfills
 * from the durable cursor BEFORE opening the stream. The overlap between the two is
 * deduped at pipeline step 11 for free (FD-13), which is why the ordering can be this
 * simple.
 */

import { Plane } from '../domain/envelope.js';
import { parseEnvelope } from '../domain/pipeline/parse.js';
import { isGossipPartner } from '../domain/federation/trust.js';
import {
  PeerTrust,
  type BackfillReport,
  type FederationLedger,
  type FederationSender,
  type PeerDirectory,
  type PeerEndpoint,
  type PeerRecord,
} from '../ports/network.port.js';
import type { PeerLogStatus } from '../ports/transparency.port.js';
import type { EnvelopeReader } from '../ports/storage.port.js';
import type { Clock } from '../ports/system.port.js';
import type { FederationInbox } from './federation-inbox.js';
import type { IngressPipeline } from './ingress.js';

export interface FederationSyncDeps {
  readonly peers: PeerDirectory;
  readonly ledger: FederationLedger;
  readonly sender: FederationSender;
  readonly inbox: FederationInbox;
  readonly reader: EnvelopeReader;
  readonly pipeline: IngressPipeline;
  readonly clock: Clock;
  /** So a directory exchange can recognise, and skip, this node's own record. */
  readonly selfServerId: () => string;
}

export interface PeerSyncReport {
  readonly peerId: string;
  readonly trust: PeerTrust;
  readonly backfill: BackfillReport;
}

export class FederationSync {
  private readonly streams = new Map<string, AbortController>();

  constructor(private readonly deps: FederationSyncDeps) {}

  /**
   * Handshake with a peer and record what it told us.
   *
   * The trust level the PEER assigns US is recorded but does not change what we assign
   * THEM. Trust is not symmetric and must not be negotiated: a peer that returns
   * `TRUSTED` in its `AnnounceResponse` is describing its own policy, and treating that as
   * input to ours would let any node promote itself by claiming to like us.
   */
  async handshake(peer: PeerRecord): Promise<PeerRecord> {
    const outcome = await this.deps.sender.announce(peer);
    const nowMs = this.deps.clock.nowMs();

    const updated: PeerRecord = {
      ...peer,
      publicKey: outcome.peerKey.length > 0 ? outcome.peerKey : peer.publicKey,
      endpoints:
        outcome.endpoints.length > 0
          ? withLocalKnowledge(outcome.endpoints, peer.endpoints)
          : peer.endpoints,
      lastSeenMs: nowMs,
      firstSeenMs: peer.firstSeenMs ?? nowMs,
    };
    await this.deps.peers.upsert(updated);

    if (outcome.sth) await this.deps.inbox.observePeerSth(updated, outcome.sth);

    // FD-05 — ingest the answering node's own vouches.
    //
    // Each is weighed by how much WE trust the asserter (`evaluateTrust`), and
    // `recordVouch` verifies the signature and drops vouches about peers we do not know.
    // So this is safe to accept from any peer: an untrusted node's opinions arrive, are
    // stored, and count for nothing until that node itself earns reach.
    for (const vouch of outcome.vouches) {
      await this.deps.inbox.recordVouch(vouch);
    }

    return (await this.deps.peers.get(updated.serverId)) ?? updated;
  }

  /**
   * FG-04 — catch up, then go live.
   *
   * Returns the backfill report so a caller (or a test) can assert "exactly 20, zero
   * duplicates" without instrumenting the pipeline.
   */
  async connect(peerId: string): Promise<PeerSyncReport | null> {
    const known = await this.deps.peers.get(peerId);
    if (!known) return null;

    const peer = await this.handshake(known);
    if (peer.trust === PeerTrust.BLOCKED) {
      return { peerId, trust: peer.trust, backfill: EMPTY_BACKFILL };
    }

    const cursor = await this.deps.ledger.streamPosition(peerId);
    const backfill = await this.backfillFrom(peerId, cursor);
    this.startStream(peer);
    return { peerId, trust: peer.trust, backfill };
  }

  /**
   * Pull everything we missed from a peer, starting at a durable cursor.
   *
   * Each envelope re-runs all 19 steps — a backfill is not a trusted bulk import, and
   * FD-03 has no exception for catch-up. Duplicates are counted rather than treated as
   * failures: after a partition the overlap between "what we already have" and "what the
   * peer offers" is exactly the interesting number, and it must be zero-cost to hit
   * (FD-13).
   */
  async backfillFrom(peerId: string, fromIndex: number): Promise<BackfillReport> {
    const peer = await this.deps.peers.get(peerId);
    if (!peer) return EMPTY_BACKFILL;

    // The frozen contract carries no log index inside a frame — ID-01 forbids a local
    // storage position from appearing in anything federated, and `Backfill` streams bare
    // `Envelope`s. So the only honest cursor is the peer's own advertised tree size, from
    // the last `SignedTreeHead` it showed us. That can UNDERSHOOT if its leaf index lags
    // its log index (ADR-005), and undershooting is the failure mode we want: re-fetching a
    // handful of envelopes costs one dedupe at pipeline step 11, whereas overshooting
    // silently loses content forever.
    const advertised = await this.deps.ledger.lastPeerSth(peerId);
    const toIndex = advertised ? advertised.treeSize : 0;

    let received = 0;
    let accepted = 0;
    let rejected = 0;
    let duplicates = 0;

    const planes: readonly Plane[] =
      peer.planes && peer.planes.length > 0 ? peer.planes : [Plane.FORUM];

    for (const plane of planes) {
      for await (const raw of this.deps.sender.backfill(peer, {
        fromIndex,
        // 0 means "to the end of your log" — the peer knows where that is, we do not.
        toIndex,
        planes: [plane],
        sinceIndex: fromIndex,
      })) {
        received += 1;
        // Asked BEFORE acceptance. Asking afterwards would count every envelope as a
        // duplicate, because by then we hold it either way — and FG-04's "zero duplicates"
        // would become unfalsifiable.
        const contentId = contentIdOf(raw);
        const held = contentId !== null && (await this.deps.reader.has(contentId));
        try {
          await this.deps.pipeline.accept(raw, { transportId: 'grpc', peerId, originServerId: peerId });
          if (held) duplicates += 1;
          else accepted += 1;
        } catch {
          rejected += 1;
        }
      }
    }

    if (toIndex > fromIndex) await this.deps.ledger.recordStreamPosition(peerId, toIndex);
    return { received, accepted, rejected, duplicates };
  }

  /**
   * One long-lived `StreamActivities` per peer PER PLANE.
   *
   * FG-10: never one stream carrying both. The two planes are unlinkable by construction,
   * and co-batching them on a single connection hands an observer a timing correlation for
   * free — the traffic itself becomes the linkage even though neither payload mentions the
   * other.
   */
  startStream(peer: PeerRecord): void {
    this.stopStream(peer.serverId);
    const controller = new AbortController();
    this.streams.set(peer.serverId, controller);

    const planes = peer.planes && peer.planes.length > 0 ? peer.planes : [Plane.FORUM];
    for (const plane of planes) {
      void this.pump(peer, plane, controller.signal);
    }
  }

  stopStream(peerId: string): void {
    this.streams.get(peerId)?.abort();
    this.streams.delete(peerId);
  }

  stopAll(): void {
    for (const controller of this.streams.values()) controller.abort();
    this.streams.clear();
  }

  private async pump(peer: PeerRecord, plane: Plane, signal: AbortSignal): Promise<void> {
    const since = await this.deps.ledger.streamPosition(peer.serverId);
    try {
      for await (const raw of this.deps.sender.streamActivities(
        peer,
        { planes: [plane], sinceIndex: since },
        signal,
      )) {
        if (signal.aborted) return;
        try {
          // FD-03 — a live stream frame runs all 19 steps, exactly like an HTTP write.
          await this.deps.pipeline.accept(raw, { transportId: 'grpc', peerId: peer.serverId, originServerId: peer.serverId });
        } catch {
          // A rejected frame is a peer problem, not a stream problem. Dropping the stream
          // would let one bad envelope stop all federation with that peer.
        }
      }
    } catch {
      // The stream ended or the link failed. `connect` is what re-establishes it, and it
      // backfills first, so nothing published during the gap is lost (FG-04).
    }
  }

  // ── T2.12 — STH gossip (FG-08) ────────────────────────────────────────────────────

  /**
   * FD-08 — exchange tree heads with every TRUSTED peer.
   *
   * FD-10's `PeerObservation` entries are fed back through the same fork check, so node C
   * learns that node A saw a different head for node B than C did. That is what catches a
   * peer showing different logs to different partners — the failure a single bilateral
   * comparison cannot see.
   */
  async gossip(): Promise<readonly { peerId: string; status: PeerLogStatus }[]> {
    const results: { peerId: string; status: PeerLogStatus }[] = [];
    for (const peer of await this.deps.peers.all()) {
      if (!isGossipPartner(peer.trust)) continue;
      try {
        const report = await this.deps.sender.exchangeTreeHeads(peer);
        if (report.sth) {
          results.push({ peerId: peer.serverId, status: await this.deps.inbox.observePeerSth(peer, report.sth) });
        }
        for (const observation of report.observed) {
          if (!observation.sth) continue;
          const observed = await this.findPeerByKey(observation.peerKey);
          if (!observed) continue;
          results.push({
            peerId: observed.serverId,
            status: await this.deps.inbox.observePeerSth(observed, observation.sth),
          });
        }
      } catch {
        // A peer we cannot reach is not a peer that forked. Silence here is correct;
        // reachability is the outbox's problem and is reported through its backoff state.
      }
    }
    return results;
  }

  // ── T2.13 — directory exchange ────────────────────────────────────────────────────

  /**
   * TP-05 — pre-position the directory while the network still works.
   *
   * Peers learned this way are recorded at `PROBATION` at most: a directory entry is
   * hearsay, not a handshake, and admitting a stranger at the trust level a third party
   * claims for it would make trust transitive, which it explicitly is not.
   */
  async exchangeDirectories(): Promise<number> {
    let learned = 0;
    for (const peer of await this.deps.peers.all()) {
      if (peer.trust !== PeerTrust.TRUSTED) continue;
      try {
        for (const record of await this.deps.sender.exchangeDirectory(peer)) {
          // A record we cannot name is a record we cannot dedupe, and storing it under an
          // empty id collapses every such peer into one document with mixed-up keys and
          // endpoints. Discard rather than guess.
          if (!record.serverId || record.publicKey.length === 0) continue;
          // Directories legitimately contain US — a peer lists everyone it federates with.
          // Storing ourselves as a peer makes the node dial itself and, worse, compare its
          // own tree head against its own history under a second identity.
          if (record.serverId === this.deps.selfServerId()) continue;

          const existing = await this.deps.peers.get(record.serverId);
          if (existing) {
            // Endpoints are mutable metadata (FD-02) and worth refreshing; trust is not.
            await this.deps.peers.upsert({
              ...existing,
              endpoints: record.endpoints.length > 0 ? record.endpoints : existing.endpoints,
            });
            continue;
          }
          await this.deps.peers.upsert({
            ...record,
            trust: PeerTrust.PROBATION,
            firstSeenMs: this.deps.clock.nowMs(),
            lastSeenMs: this.deps.clock.nowMs(),
          });
          learned += 1;
        }
      } catch {
        // See `gossip` — an unreachable peer is not a finding.
      }
    }
    return learned;
  }

  private async findPeerByKey(key: Uint8Array): Promise<PeerRecord | null> {
    for (const peer of await this.deps.peers.all()) {
      if (peer.publicKey.length === key.length && peer.publicKey.every((b, i) => b === key[i])) {
        return peer;
      }
    }
    return null;
  }
}

const EMPTY_BACKFILL: BackfillReport = { received: 0, accepted: 0, rejected: 0, duplicates: 0 };

/** Null for a frame that is not a canonical envelope — the pipeline will say why. */
function contentIdOf(raw: Uint8Array): string | null {
  try {
    return parseEnvelope(raw).envelope.contentId;
  } catch {
    return null;
  }
}

/**
 * A peer's announcement is authoritative for its own addresses (FD-17) — but only for what
 * it actually stated.
 *
 * An operator who writes `ISP_LOCAL:64502=grpc://jb-b1:8444` in `FEDERATION_PEERS` is
 * recording a fact about their own topology that the peer has no reason to know and no way
 * to send: which of THIS node's uplinks reaches it. Replacing the whole endpoint list on
 * handshake discarded that, so the configuration silently stopped applying the moment the
 * first handshake succeeded — the worst kind of failure, because it worked at boot.
 *
 * Matched on the URI, because that is the only stable key an endpoint has; a field the peer
 * did state always wins, so this can never contradict the peer about itself.
 */
function withLocalKnowledge(
  announced: readonly PeerEndpoint[],
  known: readonly PeerEndpoint[],
): readonly PeerEndpoint[] {
  if (known.length === 0) return announced;
  const byAddress = new Map(known.map((endpoint) => [endpoint.address, endpoint]));
  return announced.map((endpoint) => {
    const local = byAddress.get(endpoint.address);
    if (!local) return endpoint;
    return {
      ...endpoint,
      ...(endpoint.asn === undefined && local.asn !== undefined ? { asn: local.asn } : {}),
      ...(!endpoint.isp && local.isp ? { isp: local.isp } : {}),
      ...(!endpoint.region && local.region ? { region: local.region } : {}),
    };
  });
}
