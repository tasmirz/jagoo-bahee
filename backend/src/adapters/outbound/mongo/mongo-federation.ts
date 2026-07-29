/**
 * Mongo-backed federation state: the direction ledger, the peer directory, and the durable
 * outbox (T2.3, T2.7, T2.8 · FD-05, FD-06, FG-05).
 *
 * ── FD-05: the unique index IS the deduplication ────────────────────────────────────
 * v1 did `findOne` then `insertOne` and caught error 11000 — but no unique index was ever
 * declared, so the catch was unreachable and the guard was a race that looked like a guard.
 * Here `{ content_id: 1, direction: 1 }` is declared unique, the write is a bare
 * `insertOne`, and the duplicate-key error is the RESULT rather than an exception to
 * handle. `federation.integration.spec.ts` asserts all three of the things v1 also
 * "observed": that `listIndexes` reports `unique: true`, that concurrent double delivery
 * yields exactly one projection, and that the duplicate branch was genuinely entered.
 *
 * Why a separate collection rather than extending the envelope store's unique index on
 * `content_id`: the envelope log holds exactly one row per envelope regardless of how many
 * peers offered it. Direction and peer attribution are federation bookkeeping, not
 * properties of the content, and ID-01 forbids local storage detail leaking into anything
 * signed or federated.
 */

import {
  Binary,
  MongoServerError,
  type ClientSession,
  type Collection as MongoCollection,
  type Db,
} from 'mongodb';
import type { Plane, Priority } from '../../../core/domain/envelope.js';
import type { Tx } from '../../../core/domain/domain-handler.js';
import {
  DuplicateFederationEntryError,
  FederationLedger,
  FederationOutbox,
  PeerDirectory,
  type FederationDirection,
  type FederationLedgerEntry,
  type OutboxEntry,
  type OutboxStats,
  type PeerEndpoint,
  type PeerRecord,
  type PeerTrust,
  type PeerVouch,
  type ReachabilityScope,
} from '../../../core/ports/network.port.js';
import type { SignedTreeHead } from '../../../core/ports/transparency.port.js';

const LEDGER = 'federation_ledger';
const PEERS = 'federation_peers';
const OUTBOX = 'federation_outbox';
const CURSORS = 'federation_cursors';
const PEER_HEADS = 'federation_peer_heads';

/** Mongo's duplicate-key error code. The one branch FD-05 requires be reachable. */
const DUPLICATE_KEY = 11000;

function sessionFor(tx: Tx): ClientSession {
  const context = tx.context as { session?: ClientSession } | undefined;
  if (!context?.session) throw new Error('Mongo adapter received a transaction without a session');
  return context.session;
}

const bytes = (value: Binary | Uint8Array): Uint8Array =>
  value instanceof Binary ? Uint8Array.from(value.buffer) : Uint8Array.from(value);

const bin = (value: Uint8Array): Binary => new Binary(Buffer.from(value));

interface LedgerDocument {
  readonly content_id: string;
  readonly direction: FederationDirection;
  readonly peer_id: string;
  readonly recorded_at_ms: number;
}

export class MongoFederationLedger extends FederationLedger {
  private readonly ledger: MongoCollection<LedgerDocument>;
  private readonly cursors: MongoCollection<{ _id: string; index: number }>;
  private readonly heads: MongoCollection<{
    _id: string;
    server_key: Binary;
    tree_size: number;
    root_hash: Binary;
    timestamp_ms: number;
    signature: Binary;
  }>;

  constructor(db: Db) {
    super();
    this.ledger = db.collection<LedgerDocument>(LEDGER);
    this.cursors = db.collection(CURSORS);
    this.heads = db.collection(PEER_HEADS);
  }

  /**
   * Declared explicitly and asserted by a test.
   *
   * An index that is merely intended is the exact v1 defect. `federation.integration.spec.ts`
   * reads `listIndexes` back and requires `unique: true` on this compound key.
   */
  async ensureIndexes(): Promise<void> {
    await this.ledger.createIndex({ content_id: 1, direction: 1 }, { unique: true });
    await this.ledger.createIndex({ peer_id: 1, recorded_at_ms: -1 });
  }

  async record(entry: FederationLedgerEntry, tx: Tx): Promise<void> {
    try {
      await this.ledger.insertOne(
        {
          content_id: entry.contentId,
          direction: entry.direction,
          peer_id: entry.peerId,
          recorded_at_ms: entry.recordedAtMs,
        },
        { session: sessionFor(tx) },
      );
    } catch (error) {
      if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) {
        throw new DuplicateFederationEntryError(entry.contentId, entry.direction);
      }
      throw error;
    }
  }

  async entriesFor(contentId: string): Promise<readonly FederationLedgerEntry[]> {
    const rows = await this.ledger.find({ content_id: contentId }).toArray();
    return rows.map((row) => ({
      contentId: row.content_id,
      direction: row.direction,
      peerId: row.peer_id,
      recordedAtMs: row.recorded_at_ms,
    }));
  }

  async streamPosition(peerId: string): Promise<number> {
    const row = await this.cursors.findOne({ _id: peerId });
    return row?.index ?? 0;
  }

  async recordStreamPosition(peerId: string, index: number): Promise<void> {
    // `$max`, not `$set`. A late acknowledgement from a slower stream must never rewind the
    // cursor — that would replay a peer's entire history on the next pass.
    await this.cursors.updateOne({ _id: peerId }, { $max: { index } }, { upsert: true });
  }

  async lastPeerSth(peerId: string): Promise<SignedTreeHead | null> {
    const row = await this.heads.findOne({ _id: peerId });
    if (!row) return null;
    return {
      serverKey: bytes(row.server_key),
      treeSize: row.tree_size,
      rootHash: bytes(row.root_hash),
      timestampMs: row.timestamp_ms,
      signature: bytes(row.signature),
    };
  }

  /**
   * T2.12 — persisted, so fork-detection state survives a restart.
   *
   * `LocalMerkleLog` keeps peer heads in an in-process `Map`, which is enough for a single
   * process but loses exactly the history FD-09 compares against. Losing it turns a
   * detected fork back into an unknown, and a peer that can provoke a restart could clear
   * the evidence against itself.
   */
  async recordPeerSth(peerId: string, sth: SignedTreeHead): Promise<void> {
    await this.heads.updateOne(
      { _id: peerId },
      {
        $set: {
          server_key: bin(sth.serverKey),
          tree_size: sth.treeSize,
          root_hash: bin(sth.rootHash),
          timestamp_ms: sth.timestampMs,
          signature: bin(sth.signature),
        },
      },
      { upsert: true },
    );
  }
}

interface PeerDocument {
  readonly _id: string;
  readonly public_key: Binary;
  readonly display_name?: string;
  readonly software?: string;
  readonly version?: string;
  readonly endpoints: readonly {
    address: string;
    scope: string;
    asn?: number;
    isp?: string;
    region?: string;
    inbound_capable?: boolean;
    last_ok_at_ms?: number;
    rtt_ms?: number;
    consecutive_failures?: number;
  }[];
  readonly trust: string;
  readonly planes?: readonly number[];
  readonly accepted_classes?: readonly number[];
  readonly communities?: readonly string[];
  readonly channels?: readonly string[];
  readonly vouches?: readonly {
    asserter_key: Binary;
    peer_key: Binary;
    level: string;
    note: string;
    asserted_at_ms: number;
    signature: Binary;
  }[];
  readonly is_bridge?: boolean;
  readonly bridged_asns?: readonly number[];
  readonly first_seen_ms?: number;
  readonly last_seen_ms: number;
  readonly quota_breaches?: number;
  readonly blocked_reason?: string;
}

export class MongoPeerDirectory extends PeerDirectory {
  private readonly peers: MongoCollection<PeerDocument>;

  constructor(db: Db) {
    super();
    this.peers = db.collection<PeerDocument>(PEERS);
  }

  async ensureIndexes(): Promise<void> {
    await this.peers.createIndex({ trust: 1 });
    await this.peers.createIndex({ 'endpoints.scope': 1 });
    await this.peers.createIndex({ 'endpoints.asn': 1 });
  }

  async get(serverId: string): Promise<PeerRecord | null> {
    const row = await this.peers.findOne({ _id: serverId });
    return row ? fromDocument(row) : null;
  }

  async upsert(record: PeerRecord): Promise<void> {
    await this.peers.updateOne(
      { _id: record.serverId },
      { $set: toDocument(record) },
      { upsert: true },
    );
  }

  async all(): Promise<readonly PeerRecord[]> {
    return (await this.peers.find({}).toArray()).map(fromDocument);
  }

  async forScope(scope: ReachabilityScope): Promise<readonly PeerRecord[]> {
    return (await this.peers.find({ 'endpoints.scope': scope }).toArray()).map(fromDocument);
  }

  async forAsn(asn: number): Promise<readonly PeerRecord[]> {
    return (await this.peers.find({ 'endpoints.asn': asn }).toArray()).map(fromDocument);
  }
}

function toDocument(record: PeerRecord): Omit<PeerDocument, '_id'> {
  return {
    public_key: bin(record.publicKey),
    display_name: record.displayName ?? '',
    software: record.software ?? '',
    version: record.version ?? '',
    endpoints: record.endpoints.map((endpoint) => ({
      address: endpoint.address,
      scope: endpoint.scope,
      asn: endpoint.asn ?? 0,
      isp: endpoint.isp ?? '',
      region: endpoint.region ?? '',
      inbound_capable: endpoint.inboundCapable ?? false,
      last_ok_at_ms: endpoint.lastOkAtMs ?? 0,
      rtt_ms: endpoint.rttMs ?? 0,
      consecutive_failures: endpoint.consecutiveFailures ?? 0,
    })),
    trust: record.trust,
    planes: [...(record.planes ?? [])],
    accepted_classes: [...(record.acceptedClasses ?? [])],
    communities: [...(record.communities ?? [])],
    channels: [...(record.channels ?? [])],
    vouches: (record.vouches ?? []).map((vouch) => ({
      asserter_key: bin(vouch.asserterKey),
      peer_key: bin(vouch.peerKey),
      level: vouch.level,
      note: vouch.note,
      asserted_at_ms: vouch.assertedAtMs,
      signature: bin(vouch.signature),
    })),
    is_bridge: record.isBridge ?? false,
    bridged_asns: [...(record.bridgedAsns ?? [])],
    first_seen_ms: record.firstSeenMs ?? record.lastSeenMs,
    last_seen_ms: record.lastSeenMs,
    quota_breaches: record.quotaBreaches ?? 0,
    blocked_reason: record.blockedReason ?? '',
  };
}

function fromDocument(row: PeerDocument): PeerRecord {
  return {
    serverId: row._id,
    publicKey: bytes(row.public_key),
    displayName: row.display_name ?? '',
    software: row.software ?? '',
    version: row.version ?? '',
    endpoints: row.endpoints.map(
      (endpoint): PeerEndpoint => ({
        address: endpoint.address,
        scope: endpoint.scope as ReachabilityScope,
        asn: endpoint.asn ?? 0,
        isp: endpoint.isp ?? '',
        region: endpoint.region ?? '',
        inboundCapable: endpoint.inbound_capable ?? false,
        lastOkAtMs: endpoint.last_ok_at_ms ?? 0,
        rttMs: endpoint.rtt_ms ?? 0,
        consecutiveFailures: endpoint.consecutive_failures ?? 0,
      }),
    ),
    trust: row.trust as PeerTrust,
    planes: (row.planes ?? []) as readonly Plane[],
    acceptedClasses: (row.accepted_classes ?? []) as readonly Priority[],
    communities: row.communities ?? [],
    channels: row.channels ?? [],
    vouches: (row.vouches ?? []).map(
      (vouch): PeerVouch => ({
        asserterKey: bytes(vouch.asserter_key),
        peerKey: bytes(vouch.peer_key),
        level: vouch.level as PeerTrust,
        note: vouch.note,
        assertedAtMs: vouch.asserted_at_ms,
        signature: bytes(vouch.signature),
      }),
    ),
    isBridge: row.is_bridge ?? false,
    bridgedAsns: row.bridged_asns ?? [],
    firstSeenMs: row.first_seen_ms ?? row.last_seen_ms,
    lastSeenMs: row.last_seen_ms,
    quotaBreaches: row.quota_breaches ?? 0,
    ...(row.blocked_reason ? { blockedReason: row.blocked_reason } : {}),
  };
}

interface OutboxDocument {
  readonly _id: string;
  readonly content_id: string;
  readonly peer_id: string;
  readonly priority: number;
  readonly plane: number;
  readonly attempts: number;
  readonly next_attempt_at_ms: number;
  readonly sequence: number;
  readonly dead: boolean;
  readonly last_error?: string;
}

/**
 * FD-06 — the durable outbound queue.
 *
 * Ordering is `{ priority: 1, sequence: 1 }`: priority class first, then FIFO. A queued
 * emergency broadcast overtakes 500 queued votes, and it does so in the INDEX rather than
 * in the drainer — a drainer that sorted in memory would only order the batch it happened
 * to lease, which is the wrong batch exactly when the queue is deep.
 */
export class MongoFederationOutbox extends FederationOutbox {
  private readonly outbox: MongoCollection<OutboxDocument>;
  private readonly counters: MongoCollection<{ _id: string; value: number }>;

  constructor(private readonly db: Db) {
    super();
    this.outbox = db.collection<OutboxDocument>(OUTBOX);
    this.counters = db.collection('counters');
  }

  async ensureIndexes(): Promise<void> {
    await this.outbox.createIndex({ dead: 1, next_attempt_at_ms: 1, priority: 1, sequence: 1 });
    await this.outbox.createIndex({ peer_id: 1 });
  }

  async enqueue(entries: readonly Omit<OutboxEntry, 'id' | 'attempts'>[]): Promise<void> {
    if (entries.length === 0) return;
    const start = await this.reserveSequence(entries.length);
    const operations = entries.map((entry, offset) => ({
      updateOne: {
        filter: { _id: `${entry.contentId} ${entry.peerId}` },
        // `$setOnInsert` only. Re-enqueuing the same envelope for the same peer is the
        // normal result of an overlapping stream and a backfill, and it must not reset an
        // in-flight entry's attempt count back to zero and restart its backoff.
        update: {
          $setOnInsert: {
            content_id: entry.contentId,
            peer_id: entry.peerId,
            priority: entry.priority,
            plane: entry.plane,
            attempts: 0,
            next_attempt_at_ms: entry.nextAttemptAtMs,
            sequence: start + offset,
            dead: false,
          },
        },
        upsert: true,
      },
    }));
    await this.outbox.bulkWrite(operations, { ordered: false });
  }

  private async reserveSequence(count: number): Promise<number> {
    const result = await this.counters.findOneAndUpdate(
      { _id: 'federation_outbox_seq' },
      { $inc: { value: count } },
      { upsert: true, returnDocument: 'after' },
    );
    return (result?.value ?? count) - count;
  }

  async lease(nowMs: number, limit: number): Promise<readonly OutboxEntry[]> {
    const rows = await this.outbox
      .find({ dead: false, next_attempt_at_ms: { $lte: nowMs } })
      .sort({ priority: 1, sequence: 1 })
      .limit(limit)
      .toArray();
    return rows.map(toEntry);
  }

  async succeed(id: string): Promise<void> {
    await this.outbox.deleteOne({ _id: id });
  }

  async fail(id: string, nextAttemptAtMs: number | null, error: string): Promise<void> {
    if (nextAttemptAtMs === null) {
      await this.outbox.updateOne(
        { _id: id },
        { $set: { dead: true, last_error: error }, $inc: { attempts: 1 } },
      );
      return;
    }
    await this.outbox.updateOne(
      { _id: id },
      { $set: { next_attempt_at_ms: nextAttemptAtMs, last_error: error }, $inc: { attempts: 1 } },
    );
  }

  async stats(): Promise<OutboxStats> {
    const [pending, deadLettered] = await Promise.all([
      this.outbox.countDocuments({ dead: false }),
      this.outbox.countDocuments({ dead: true }),
    ]);
    return { pending, deadLettered };
  }

  async deadLetters(limit: number): Promise<readonly OutboxEntry[]> {
    const rows = await this.outbox.find({ dead: true }).limit(limit).toArray();
    return rows.map(toEntry);
  }

  /** Exposed for the operator surface; the collection is derived state, never backed up. */
  get database(): Db {
    return this.db;
  }
}

function toEntry(row: OutboxDocument): OutboxEntry {
  return {
    id: row._id,
    contentId: row.content_id,
    peerId: row.peer_id,
    priority: row.priority as Priority,
    plane: row.plane as Plane,
    attempts: row.attempts,
    nextAttemptAtMs: row.next_attempt_at_ms,
    ...(row.last_error ? { lastError: row.last_error } : {}),
  };
}
