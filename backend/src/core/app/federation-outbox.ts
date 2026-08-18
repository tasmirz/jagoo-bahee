/**
 * The outbound half of federation — the durable queue and its drainer (T2.8, T2.9, FD-06).
 *
 * ── Why a durable queue and not "send it during step 19" ────────────────────────────
 * v1's `emitLocalActivity()` wrote to an outbox that was never delivered, and its
 * `receive()` wrote to a collection nothing ever read. Federation was a message morgue in
 * both directions. The fix is not more code at the fanout point — it is that the queue is
 * durable, ordered, retried with backoff, dead-lettered when it gives up, and observable
 * while it does all of that.
 *
 * ── FD-14: an envelope is never relayed back to the peer it came from ───────────────
 * `enqueue` excludes `options.excludePeers`, which `IngressPipeline` fills from the
 * origin. Without it, A fans out to B, B accepts and fans out to A, and A dedupes at step
 * 11 — but only after a full round trip, for every envelope, forever. Content dedupe makes
 * the loop terminate; it does not make it free.
 *
 * ── Liskov, concretely ─────────────────────────────────────────────────────────────
 * Nothing below asks which transport it is using. `FederationSender` is dialled the same
 * way whether it reaches a peer over gRPC, a mesh link, or Reticulum — that is what makes
 * this drainer reusable in P3 and P6 without an `if`.
 */

import { Priority, type ParsedEnvelope, type Plane } from '../domain/envelope.js';
import { allowedClasses, atLeast } from '../domain/federation/trust.js';
import { nextRetry } from '../domain/federation/backoff.js';
import {
  DuplicateFederationEntryError,
  FederationDirection,
  FederationOut,
  PeerTrust,
  type FanoutOptions,
  type FederationLedger,
  type FederationOutbox as FederationOutboxPort,
  type FederationSender,
  type OutboxEntry,
  type PeerDirectory,
  type PeerRecord,
} from '../ports/network.port.js';
import { AlertSeverity, type OperatorAlerts } from '../ports/alerts.port.js';
import type { BridgeRelay } from '../ports/transport.port.js';
import type { EnvelopeReader, ProjectionStore } from '../ports/storage.port.js';
import type { Clock } from '../ports/system.port.js';

export interface FederationOutboxDeps {
  readonly outbox: FederationOutboxPort;
  readonly peers: PeerDirectory;
  readonly ledger: FederationLedger;
  readonly sender: FederationSender;
  readonly reader: EnvelopeReader;
  readonly projections: ProjectionStore;
  readonly clock: Clock;
  readonly alerts?: OperatorAlerts;
  /**
   * P3 — the ISP bridge (BR-01…BR-05). Absent means "this node does not bridge", which is
   * the default and is not a degraded state: fanout then behaves exactly as it did in P2.
   */
  readonly bridge?: BridgeRelay;
  /** How many entries one drain pass leases. Bounded so a deep queue cannot exhaust memory. */
  readonly batchSize?: number;
  /**
   * L-31 — how long one peer's `deliver` may take before the pass gives up on it.
   *
   * A cut link blackholes rather than refuses, so a connect to an unreachable peer neither
   * succeeds nor errors; without a deadline the pass waits on the operating system's TCP
   * retry schedule, which was measured at ~406 s. A timeout converts that into one failed
   * attempt with ordinary backoff.
   */
  readonly deliverTimeoutMs?: number;
}

export interface DrainReport {
  readonly attempted: number;
  readonly delivered: number;
  readonly failed: number;
  readonly deadLettered: number;
}

const DEFAULT_BATCH = 64;
/**
 * Generous enough that a slow-but-live peer is never cut off mid-stream, and short enough
 * that an unreachable one costs a single drain interval rather than minutes.
 */
const DEFAULT_DELIVER_TIMEOUT_MS = 15_000;

/**
 * Stop waiting on `work` after `ms`.
 *
 * The abandoned promise is left to settle on its own — `FederationSender.deliver` takes no
 * `AbortSignal`, so this bounds how long the DRAIN waits, not how long the transport tries.
 * That is the honest scope of the fix: the pass stops being hostage to one peer.
 */
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) return work;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`deliver timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export class FederationOutboxService extends FederationOut {
  constructor(private readonly deps: FederationOutboxDeps) {
    super();
  }

  /**
   * Step 19 fanout.
   *
   * One row per eligible peer, decided here rather than at drain time so the queue is a
   * faithful record of what this node intends to send. Deciding at drain time would mean a
   * peer promoted after acceptance silently receives history it was not eligible for when
   * the envelope arrived.
   */
  async enqueue(envelope: ParsedEnvelope, options: FanoutOptions = {}): Promise<void> {
    const excluded = new Set(options.excludePeers ?? []);
    const targeted = options.targets && options.targets.length > 0 ? new Set(options.targets) : null;

    const peers = await this.deps.peers.all();
    const candidates = peers
      .filter((peer) => !excluded.has(peer.serverId))
      .filter((peer) => (targeted ? targeted.has(peer.serverId) : true))
      .filter((peer) => this.eligible(peer, envelope));

    const allowed = await this.applyBridgePolicy(envelope, candidates, options);

    const entries = allowed.map((peer) => ({
      contentId: envelope.contentId,
      peerId: peer.serverId,
      priority: envelope.priority,
      plane: envelope.plane,
      nextAttemptAtMs: this.deps.clock.nowMs(),
    }));

    if (entries.length > 0) await this.deps.outbox.enqueue(entries);
  }

  /**
   * BR-01 … BR-05 — gate the CROSSINGS, and only the crossings.
   *
   * An envelope this node authored is not a relay, and fanout to peers on the island it
   * arrived from is not a relay either — both are ordinary P2 federation, and gating them
   * would break gossip on any node that happens to have two interfaces. What is gated is
   * exactly the case BR-01 is about: an envelope from island A being carried to island B by
   * a node that sits on both, which is the moment that node becomes a chokepoint and has to
   * have earned the right.
   *
   * With no bridge configured, or with one uplink, every peer resolves to the same uplink,
   * nothing is a crossing, and this returns its input unchanged (AR-12).
   */
  private async applyBridgePolicy(
    envelope: ParsedEnvelope,
    candidates: readonly PeerRecord[],
    options: FanoutOptions,
  ): Promise<readonly PeerRecord[]> {
    const bridge = this.deps.bridge;
    const originPeerId = options.excludePeers?.[0];
    // Locally authored content: this node IS the origin, so nothing is being relayed.
    if (!bridge || !originPeerId) return candidates;

    const viaUplinkId = await bridge.uplinkForPeer(originPeerId);
    if (!viaUplinkId) return candidates;

    const kept: PeerRecord[] = [];
    const crossings: PeerRecord[] = [];
    for (const peer of candidates) {
      const uplinkId = await bridge.uplinkForPeer(peer.serverId);
      if (!uplinkId || uplinkId === viaUplinkId) kept.push(peer);
      else crossings.push(peer);
    }
    if (crossings.length === 0) return kept;

    // One decision for the whole crossing set: the quota is per uplink PAIR, and asking per
    // peer would charge an island with three nodes three times for one link's worth of
    // traffic.
    const decision = bridge.shouldRelay(envelope, viaUplinkId, options.bytes ?? 0);
    if (!decision.relay) return kept;

    const permitted = new Set(decision.toUplinks);
    for (const peer of crossings) {
      const uplinkId = await bridge.uplinkForPeer(peer.serverId);
      if (uplinkId && permitted.has(uplinkId)) {
        kept.push(peer);
        bridge.recordRelay(viaUplinkId, uplinkId, envelope.priority, options.bytes ?? 0);
      }
    }
    return kept;
  }

  private eligible(peer: PeerRecord, envelope: ParsedEnvelope): boolean {
    if (!atLeast(peer.trust, PeerTrust.PROBATION)) return false;
    // A peer that does not serve this plane cannot use the envelope, and sending it anyway
    // would leak Forum traffic to a Signal-only relay (FD-07, FG-10).
    if (peer.planes && peer.planes.length > 0 && !peer.planes.includes(envelope.plane)) return false;
    // Do not push a class the peer told us it will not take, nor one its own trust in us
    // would refuse — both waste a round trip that ends in a typed rejection.
    if (
      peer.acceptedClasses &&
      peer.acceptedClasses.length > 0 &&
      !peer.acceptedClasses.includes(envelope.priority)
    ) {
      return false;
    }
    return allowedClasses(peer.trust).includes(envelope.priority);
  }

  /**
   * One drain pass.
   *
   * Entries are grouped by (peer, plane) so a single `Deliver` stream carries one plane —
   * FG-10 is enforced at the point the batch is formed, not checked afterwards, because a
   * check afterwards can only report a leak that already happened.
   */
  async drain(): Promise<DrainReport> {
    const nowMs = this.deps.clock.nowMs();
    const leased = await this.deps.outbox.lease(nowMs, this.deps.batchSize ?? DEFAULT_BATCH);
    if (leased.length === 0) {
      return { attempted: 0, delivered: 0, failed: 0, deadLettered: 0 };
    }

    const batches = new Map<string, OutboxEntry[]>();
    for (const entry of leased) {
      const key = `${entry.peerId}|${entry.plane}`;
      const bucket = batches.get(key);
      if (bucket) bucket.push(entry);
      else batches.set(key, [entry]);
    }

    // L-31 — peers are drained CONCURRENTLY, not one after another.
    //
    // Each batch is already independent by construction: it is grouped by peer, and FG-10
    // plane separation is decided when the batch is formed rather than checked afterwards.
    // Draining them serially meant a peer that had gone unreachable blocked every peer
    // behind it in the same pass — measured at 406 s, during which the rows for the other
    // peers sat at `attempts: 0`. The starved peer in the deployed case was the ISP bridge,
    // whose whole purpose is to route around the partition that caused the stall.
    //
    // Concurrency is bounded by the lease size, so this cannot fan out without limit.
    const results = await Promise.all(
      [...batches.entries()].map(([key, entries]) => this.deliverBatch(key, entries, nowMs)),
    );

    let delivered = 0;
    let failed = 0;
    let deadLettered = 0;
    for (const result of results) {
      delivered += result.delivered;
      failed += result.failed;
      deadLettered += result.deadLettered;
    }

    return { attempted: leased.length, delivered, failed, deadLettered };
  }

  /** One peer's share of a drain pass. Isolated so no peer can gate another (L-31). */
  private async deliverBatch(
    key: string,
    entries: readonly OutboxEntry[],
    nowMs: number,
  ): Promise<{ delivered: number; failed: number; deadLettered: number }> {
    let delivered = 0;
    let failed = 0;
    let deadLettered = 0;

    const [peerId, planeText] = key.split('|');
    const plane = Number(planeText) as Plane;
    const peer = await this.deps.peers.get(peerId as string);
    if (!peer || !atLeast(peer.trust, PeerTrust.PROBATION)) {
      // The peer was blocked after the row was written. Retire the rows rather than
      // retrying: a blocked peer is a decision, not an outage.
      for (const entry of entries) await this.deps.outbox.succeed(entry.id);
      return { delivered, failed, deadLettered };
    }

    const frames: { entry: OutboxEntry; raw: Uint8Array }[] = [];
    for (const entry of entries) {
      const stored = await this.deps.reader.get(entry.contentId);
      if (!stored) {
        // The envelope is gone from the log. Nothing will make this deliverable.
        await this.deps.outbox.fail(entry.id, null, 'envelope not in log');
        deadLettered += 1;
        continue;
      }
      frames.push({ entry, raw: stored.raw });
    }
    if (frames.length === 0) return { delivered, failed, deadLettered };

    try {
      const outcome = await withDeadline(
        this.deps.sender.deliver(
          peer,
          plane,
          frames.map((f) => f.raw),
        ),
        this.deps.deliverTimeoutMs ?? DEFAULT_DELIVER_TIMEOUT_MS,
      );
      const acceptedIds = new Set(outcome.accepted);
      const rejectedById = new Map(outcome.rejected.map((r) => [r.contentId, r]));

      for (const { entry } of frames) {
        if (acceptedIds.has(entry.contentId)) {
          await this.recordOutbound(entry, peer);
          await this.deps.outbox.succeed(entry.id);
          delivered += 1;
          continue;
        }
        const rejection = rejectedById.get(entry.contentId);
        if (rejection && !RETRYABLE_REJECTIONS.has(rejection.code)) {
          // A permanent refusal. Retrying it forever would hide it; dead-lettering it
          // puts it where an operator can see it.
          await this.deps.outbox.fail(entry.id, null, `${rejection.code}: ${rejection.detail}`);
          deadLettered += 1;
          continue;
        }
        const retry = nextRetry(entry.attempts, nowMs);
        // FD-15 — a peer's own hint beats our backoff schedule when it is longer. The
        // peer knows its load; the schedule only knows how many times we have failed.
        const nextAt =
          retry.nextAttemptAtMs === null
            ? null
            : Math.max(retry.nextAttemptAtMs, nowMs + outcome.backpressureHintMs);
        await this.deps.outbox.fail(
          entry.id,
          nextAt,
          rejection ? `${rejection.code}: ${rejection.detail}` : 'peer did not acknowledge',
        );
        if (retry.deadLettered) deadLettered += 1;
        else failed += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'delivery failed';
      for (const { entry } of frames) {
        const retry = nextRetry(entry.attempts, nowMs);
        await this.deps.outbox.fail(entry.id, retry.nextAttemptAtMs, message);
        if (retry.deadLettered) {
          deadLettered += 1;
          await this.deps.alerts?.raise({
            severity: AlertSeverity.WARNING,
            code: 'outbox.dead-letter',
            subject: peer.serverId,
            detail: `${entry.contentId} gave up after ${entry.attempts + 1} attempts: ${message}`,
            raisedAtMs: nowMs,
          });
        } else {
          failed += 1;
        }
      }
    }

    return { delivered, failed, deadLettered };
  }

  /**
   * FD-05 — the `out` half of `(content_id, direction)`.
   *
   * Recorded after the peer acknowledged, so the row means "this peer has it", which is
   * what a later reconciliation needs. A duplicate here is benign and expected: an
   * overlapping stream and a backfill can both deliver the same envelope.
   */
  private async recordOutbound(entry: OutboxEntry, peer: PeerRecord): Promise<void> {
    try {
      await this.deps.projections.transaction(async (tx) => {
        await this.deps.ledger.record(
          {
            contentId: entry.contentId,
            direction: FederationDirection.OUT,
            peerId: peer.serverId,
            recordedAtMs: this.deps.clock.nowMs(),
          },
          tx,
        );
      });
    } catch (error) {
      if (!(error instanceof DuplicateFederationEntryError)) throw error;
    }
  }

  /** Exposed so the operator surface can report queue depth without reaching for the adapter. */
  async stats(): Promise<{ pending: number; deadLettered: number }> {
    return this.deps.outbox.stats();
  }
}

/**
 * Rejections worth retrying.
 *
 * `RATE_LIMITED` and `NO_CERTIFICATE` are transient by nature — the peer will have room
 * later, and a certificate that has not federated yet will. Everything else (a bad
 * signature, an unknown domain, a forbidden class) is a permanent property of the envelope
 * or of our relationship with that peer, and retrying it is how a queue turns into a
 * self-inflicted flood.
 */
const RETRYABLE_REJECTIONS: ReadonlySet<string> = new Set([
  'RATE_LIMITED',
  'NO_CERTIFICATE',
  'CLOCK_SKEW',
  'INSUFFICIENT_CREDITS',
]);

/** Re-exported for the operator surface; `Priority` ordering is the queue's ordering. */
export const OUTBOX_PRIORITY_ORDER: readonly Priority[] = [
  Priority.BROADCAST,
  Priority.DIRECT,
  Priority.CHECKIN,
  Priority.BULK,
];
