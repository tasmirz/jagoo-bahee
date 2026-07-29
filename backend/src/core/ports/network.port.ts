/**
 * Network ports.
 *
 * ── The Liskov rule that matters here ────────────────────────────────────────────────
 * Every `Transport` is substitutable. The outbox drains through HTTP, mesh or Reticulum
 * with IDENTICAL calling code. `if (transport.id === "reticulum")` in application code is
 * a Liskov violation and is banned (NFR-M03, lint-enforced).
 *
 * Reticulum is an optional adapter behind this port and must never be a dependency — the
 * system ships complete with it absent from the build (G-01).
 *
 * ── G-04: the fallback path is the primary path whenever it works ───────────────────
 * `PathSelector` prefers the NARROWEST working scope (LAN > ISP_LOCAL > NATIONAL > GLOBAL)
 * continuously, during normal operation. This is not an optimisation. It means the
 * resilience path is warm and exercised at the moment it becomes the only path. Code that
 * only runs during a blackout is code that fails during a blackout.
 *
 * ── P2 additions ────────────────────────────────────────────────────────────────────
 * `FederationSender` (dial a peer), `FederationLedger` (direction dedupe, stream cursors,
 * peer tree heads) and `FederationOutbox` (the durable queue). They are separate ports
 * rather than one `Federation` interface because their consumers differ: the inbox needs
 * the ledger and never the sender, the drainer needs the sender and the outbox and never
 * the ledger's cursors (Interface Segregation, AR-02).
 */

import type { ParsedEnvelope, Plane, Priority } from '../domain/envelope.js';
import type { Tx } from '../domain/domain-handler.js';
import type { SignedTreeHead } from './transparency.port.js';

export const ReachabilityScope = {
  GLOBAL: 'GLOBAL',
  NATIONAL: 'NATIONAL',
  ISP_LOCAL: 'ISP_LOCAL',
  LAN: 'LAN',
  MESH: 'MESH',
  RETICULUM: 'RETICULUM',
} as const;
export type ReachabilityScope = (typeof ReachabilityScope)[keyof typeof ReachabilityScope];

/** Narrowest first — the preference order G-04 mandates. */
export const SCOPE_PREFERENCE: readonly ReachabilityScope[] = [
  ReachabilityScope.LAN,
  ReachabilityScope.ISP_LOCAL,
  ReachabilityScope.NATIONAL,
  ReachabilityScope.GLOBAL,
  ReachabilityScope.MESH,
  ReachabilityScope.RETICULUM,
];

export interface PeerEndpoint {
  readonly address: string;
  readonly scope: ReachabilityScope;
  readonly asn?: number;
  readonly isp?: string;
  readonly region?: string;
  /**
   * FD-11: false means this peer must initiate. A node behind CGNAT federates fully in
   * both directions over connections it opened itself, so "no inbound port" is a normal
   * deployment, not a degraded one.
   */
  readonly inboundCapable?: boolean;
  readonly lastOkAtMs?: number;
  /**
   * When we last TRIED, successfully or not. Node-local and deliberately absent from the
   * wire `PeerEndpoint`: it is a fact about our dialling, not about the peer, and would be
   * meaningless to anyone else. TP-12's backoff is measured from it, because measuring from
   * `lastOkAtMs` alone leaves an endpoint that has never succeeded to be retried forever —
   * the exact hot loop the requirement forbids, on the endpoint most likely to be dead.
   */
  readonly lastAttemptAtMs?: number;
  readonly rttMs?: number;
  readonly consecutiveFailures?: number;
}

/**
 * The four trust levels from `Plans/05` §3, plus the unspecified zero the wire enum has.
 *
 * FD-01: admin allowlisting MUST NOT be the only path to federate. During a shutdown,
 * volunteers stand up relay nodes and cannot wait for manual approval — v1 required an
 * admin to flip `status === 'approved'`, which made the system least able to grow relays
 * at exactly the moment relays matter most.
 */
export const PeerTrust = {
  UNSPECIFIED: 'UNSPECIFIED',
  /** Admin action, or ≥ 2 TRUSTED peers vouching NEGATIVE. Nothing accepted. */
  BLOCKED: 'BLOCKED',
  /** Default on first contact via TOFU. Class 0–2 only, tight quota. */
  PROBATION: 'PROBATION',
  /** ≥ 2 NORMAL+ vouches, admin promotion, or 7 days clean at PROBATION. */
  NORMAL: 'NORMAL',
  /** Admin promotion or ≥ 3 TRUSTED vouches. Full quota, STH gossip partner, may bridge. */
  TRUSTED: 'TRUSTED',
} as const;
export type PeerTrust = (typeof PeerTrust)[keyof typeof PeerTrust];

/** A signed statement by one node about another node's trust level. */
export interface PeerVouch {
  /** The node making the assertion. Not part of the signed body — see `serverVouchSigningBytes`. */
  readonly asserterKey: Uint8Array;
  readonly peerKey: Uint8Array;
  readonly level: PeerTrust;
  readonly note: string;
  readonly assertedAtMs: number;
  readonly signature: Uint8Array;
}

export interface PeerRecord {
  /** jbs1… — identity is the key, never a URL (FD-02). */
  readonly serverId: string;
  readonly publicKey: Uint8Array;
  readonly displayName?: string;
  readonly software?: string;
  readonly version?: string;
  readonly endpoints: readonly PeerEndpoint[];
  readonly trust: PeerTrust;
  /** FD-07: a node MAY serve Forum only, Signal only, or both. */
  readonly planes?: readonly Plane[];
  readonly acceptedClasses?: readonly Priority[];
  readonly communities?: readonly string[];
  readonly channels?: readonly string[];
  readonly vouches?: readonly PeerVouch[];
  readonly isBridge?: boolean;
  readonly bridgedAsns?: readonly number[];
  readonly firstSeenMs?: number;
  readonly lastSeenMs: number;
  /** FD-16: repeated quota breach demotes a peer one level and notifies the operator. */
  readonly quotaBreaches?: number;
  /** Set when FD-09 fork detection blocked this peer, so the operator sees why. */
  readonly blockedReason?: string;
}

export interface SelectedPath {
  readonly endpoint: PeerEndpoint;
  readonly transportId: string;
  /** P3 — which uplink carries it, and the source address TP-08 binds the socket to. */
  readonly uplinkId?: string;
  readonly sourceIp?: string;
}

export abstract class Transport {
  abstract readonly id: string;
  abstract readonly scopes: readonly ReachabilityScope[];
  /**
   * G-07: a transport declares which priority classes it carries. Reticulum accepts only
   * BROADCAST, DIRECT and CHECKIN and rejects bulk forum traffic with a typed error — a
   * LoRa link cannot carry a forum feed, and attempting it starves the emergency channel.
   */
  abstract readonly classes: readonly Priority[];
  abstract send(raw: Uint8Array, endpoint: PeerEndpoint): Promise<void>;
}

export abstract class PeerDirectory {
  abstract get(serverId: string): Promise<PeerRecord | null>;
  abstract upsert(record: PeerRecord): Promise<void>;
  abstract all(): Promise<readonly PeerRecord[]>;
  abstract forScope(scope: ReachabilityScope): Promise<readonly PeerRecord[]>;
  abstract forAsn(asn: number): Promise<readonly PeerRecord[]>;
}

export abstract class PathSelector {
  /** Null when no path works at any scope. */
  abstract select(peer: PeerRecord): Promise<SelectedPath | null>;
  /**
   * Step 5 of the normative algorithm: "on success record last_ok_at and reset failures; on
   * failure increment consecutive_failures".
   *
   * On the port rather than inside the selector because the only component that knows
   * whether a dial worked is the one that dialled. Making it part of the contract is what
   * stops the selector's backoff state (TP-12) and the transport's reality drifting apart —
   * a selector nobody reports back to will rank a dead endpoint first forever.
   */
  abstract recordOutcome(
    peer: PeerRecord,
    endpoint: PeerEndpoint,
    ok: boolean,
    rttMs?: number,
  ): Promise<void>;
}

export interface BackfillReport {
  readonly received: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly duplicates: number;
}

/**
 * Where an envelope came from (ADR-008 §3).
 *
 * `transportId` is recorded and reported; it is never branched on. An origin that changed
 * *behaviour* by transport would be the Liskov violation CLAUDE.md §5.2 bans, and
 * `eslint.config.mjs` errors on a switch over it. Peer trust deliberately does not appear
 * here: FD-03 is unconditional, every inbound envelope re-runs all 19 steps, and trust
 * affects quota only. Origin tells the OUTBOX where not to send something. It tells the
 * pipeline nothing.
 */
export interface IngressOrigin {
  readonly transportId: string;
  readonly peerId?: string;
  /**
   * The node an envelope ORIGINATED on, as best this node can establish it.
   *
   * Distinct from `peerId`, which is who handed it to us — the two coincide for a direct
   * delivery and diverge under relay. Used only to key origin-scoped identifiers such as a
   * community ID (ADR-010); it never affects verification.
   */
  readonly originServerId?: string;
}

export const LOCAL_ORIGIN: IngressOrigin = { transportId: 'local' };

export interface FanoutOptions {
  /** Restrict fanout to these peers. Empty/absent means every eligible peer. */
  readonly targets?: readonly string[];
  /** FD-14 / FED-28: never relay an envelope back to the peer it arrived from. */
  readonly excludePeers?: readonly string[];
  /**
   * Encoded size, so a bridge charges its byte quota what actually crossed the link
   * (BR-04). Passed in rather than recomputed: the pipeline already holds the raw bytes at
   * the fanout point, and re-encoding a peer's envelope to measure it is precisely the
   * round trip ADR-008 §1 forbids.
   */
  readonly bytes?: number;
}

/**
 * Step 19 fanout, and nothing else.
 *
 * Deliberately narrow (Interface Segregation, AR-02). An earlier shape also carried
 * `backfillFrom`, which forced the outbox to depend on `IngressPipeline` — and the
 * pipeline already depends on this port, so the composition root could not construct
 * either. Pulling content INTO this node is `FederationSync`'s job; this port exists so
 * the pipeline can hand an accepted envelope onward without learning what a peer is.
 */
export abstract class FederationOut {
  abstract enqueue(envelope: ParsedEnvelope, options?: FanoutOptions): Promise<void>;
}

// ── P2 ports ─────────────────────────────────────────────────────────────────────────

/** Which way an envelope crossed this node's federation boundary. */
export const FederationDirection = {
  IN: 'in',
  OUT: 'out',
} as const;
export type FederationDirection =
  (typeof FederationDirection)[keyof typeof FederationDirection];

/**
 * Raised when `(content_id, direction)` already exists.
 *
 * This is a RESULT, not a failure to handle defensively. FD-05 requires deduplication
 * enforced by the database: v1 did `findOne` then `insertOne` and caught error 11000, but
 * never declared the unique index, so the catch was unreachable and the guard was a race
 * that looked like a guard.
 */
export class DuplicateFederationEntryError extends Error {
  constructor(
    readonly contentId: string,
    readonly direction: FederationDirection,
  ) {
    super(`federation ledger already holds ${contentId} (${direction})`);
    this.name = 'DuplicateFederationEntryError';
  }
}

export interface FederationLedgerEntry {
  readonly contentId: string;
  readonly direction: FederationDirection;
  readonly peerId: string;
  readonly recordedAtMs: number;
}

export abstract class FederationLedger {
  /**
   * Insert an entry, or throw `DuplicateFederationEntryError`. Written inside the SAME
   * transaction as projection and witness append, so a replay cannot be projected twice
   * even when two deliveries race past pipeline step 11 concurrently.
   */
  abstract record(entry: FederationLedgerEntry, tx: Tx): Promise<void>;
  abstract entriesFor(contentId: string): Promise<readonly FederationLedgerEntry[]>;

  /**
   * The peer's log position we have consumed up to, so a restart resumes rather than
   * refetching from zero (NFR-R07). Durable because a lost cursor turns every restart
   * into a full backfill of the peer's entire history.
   */
  abstract streamPosition(peerId: string): Promise<number>;
  abstract recordStreamPosition(peerId: string, index: number): Promise<void>;

  /** FD-09: the last tree head a peer showed us, kept across restarts. */
  abstract lastPeerSth(peerId: string): Promise<SignedTreeHead | null>;
  abstract recordPeerSth(peerId: string, sth: SignedTreeHead): Promise<void>;
}

/**
 * A pointer, not a copy.
 *
 * The entry names a content ID; the drainer reads the bytes back from `EnvelopeReader`.
 * Storing the envelope again here would duplicate the one backup-critical dataset in the
 * system into derived state, and on a Raspberry Pi with 512 MB that duplication is paid
 * exactly when the queue is deepest — during the outage the queue exists for.
 */
export interface OutboxEntry {
  readonly id: string;
  readonly contentId: string;
  readonly peerId: string;
  readonly priority: Priority;
  readonly plane: Plane;
  readonly attempts: number;
  readonly nextAttemptAtMs: number;
  readonly lastError?: string;
}

export interface OutboxStats {
  readonly pending: number;
  readonly deadLettered: number;
}

/**
 * FD-06 — a durable outbound queue with exponential backoff and a dead-letter path.
 *
 * Ordering is priority class FIRST, then FIFO: a queued emergency broadcast overtakes 500
 * queued votes. That ordering lives here rather than in the drainer, because a drainer
 * that sorted in memory would only order the batch it happened to lease.
 */
export abstract class FederationOutbox {
  abstract enqueue(entries: readonly Omit<OutboxEntry, 'id' | 'attempts'>[]): Promise<void>;
  /** Highest priority class first, then FIFO, restricted to entries that are due. */
  abstract lease(nowMs: number, limit: number): Promise<readonly OutboxEntry[]>;
  abstract succeed(id: string): Promise<void>;
  /** Reschedule with backoff, or dead-letter once the attempt budget is spent. */
  abstract fail(id: string, nextAttemptAtMs: number | null, error: string): Promise<void>;
  abstract stats(): Promise<OutboxStats>;
  abstract deadLetters(limit: number): Promise<readonly OutboxEntry[]>;
}

export interface QuotaVerdict {
  readonly allowed: boolean;
  /** Units the request exceeded the bucket by; drives `DeliverAck.backpressure_hint_ms`. */
  readonly overBy: number;
}

/**
 * FD-15 — the per-peer, per-class token bucket, as ONE atomic operation.
 *
 * Deliberately not `read state → decide → write state`. CLAUDE.md §5.5 bans read-modify-
 * write on any counter, and a quota is the counter where losing that race matters most:
 * two concurrent `Deliver` streams from the same peer would each read the same remaining
 * allowance and each spend it. The Redis adapter runs one Lua script; the in-memory double
 * is single-threaded and applies the same pure transition from `core/domain/federation/quota.ts`.
 */
export abstract class PeerQuotaLimiter {
  abstract consume(request: QuotaRequest): Promise<QuotaVerdict>;
}

/**
 * One admission decision, covering both grants FD-15 issues.
 *
 * An object rather than positional arguments because the envelope and byte allowances are
 * two similar-looking numbers side by side, and transposing them would produce a limiter
 * that compiles, runs, and enforces the wrong thing.
 */
export interface QuotaRequest {
  readonly peerId: string;
  readonly priority: Priority;
  /** Envelope-bucket cost — one unit per envelope of its class. */
  readonly cost: number;
  readonly perMinute: number;
  /** Byte-bucket cost — the encoded size of this envelope. */
  readonly bytes: number;
  readonly bytesPerMinute: number;
  readonly nowMs: number;
}

export interface AnnounceOutcome {
  readonly peerKey: Uint8Array;
  readonly assigned: PeerTrust;
  readonly endpoints: readonly PeerEndpoint[];
  readonly sth: SignedTreeHead | null;
  readonly quota: PeerQuota | null;
  /**
   * FD-05 — the vouches the ANSWERING peer asserts, about whichever peers it knows.
   *
   * Not vouches about us: an opinion about ourselves is worth nothing to our own trust
   * computation. These are the answering node's opinions, and `evaluateTrust` weights each
   * by how much *we* trust the node that asserted it, so a vouch from a peer we do not
   * trust counts for nothing. That weighting is what makes this safe to accept from anyone.
   */
  readonly vouches: readonly PeerVouch[];
}

export interface PeerQuota {
  readonly envelopesPerMin: number;
  readonly bytesPerMin: number;
  readonly maxConcurrentStreams: number;
  readonly allowedClasses: readonly Priority[];
}

export interface DeliverOutcome {
  readonly accepted: readonly string[];
  readonly rejected: readonly { contentId: string; code: string; detail: string }[];
  readonly backpressureHintMs: number;
  readonly ourLogSize: number;
}

export interface StreamFilter {
  readonly communities?: readonly string[];
  readonly channels?: readonly string[];
  readonly planes?: readonly Plane[];
  readonly classes?: readonly Priority[];
  readonly sinceIndex?: number;
}

/**
 * The outbound half of federation: dialling a peer.
 *
 * An abstract class rather than an interface so the composition root has a DI token, and
 * so an in-memory double can stand in for a real gRPC channel in tests — which is what
 * makes the two-node suite runnable with no containers.
 */
export abstract class FederationSender {
  abstract announce(peer: PeerRecord): Promise<AnnounceOutcome>;
  /** One stream, one plane (FG-10). Mixed planes must never share a frame sequence. */
  abstract deliver(
    peer: PeerRecord,
    plane: Plane,
    envelopes: readonly Uint8Array[],
  ): Promise<DeliverOutcome>;
  abstract streamActivities(
    peer: PeerRecord,
    filter: StreamFilter,
    signal: AbortSignal,
  ): AsyncIterable<Uint8Array>;
  abstract backfill(
    peer: PeerRecord,
    filter: StreamFilter & { fromIndex: number; toIndex?: number; max?: number },
  ): AsyncIterable<Uint8Array>;
  abstract exchangeTreeHeads(peer: PeerRecord): Promise<PeerSthReport>;
  abstract exchangeDirectory(peer: PeerRecord): Promise<readonly PeerRecord[]>;
}

export interface PeerSthReport {
  readonly peerKey: Uint8Array;
  readonly sth: SignedTreeHead | null;
  readonly observed: readonly {
    readonly peerKey: Uint8Array;
    readonly sth: SignedTreeHead | null;
    readonly observedAtMs: number;
  }[];
}
