/**
 * Mongo-backed envelope, projection and RFC 6962 witness storage.
 *
 * All writes receive the same ClientSession through the opaque Tx context. This is the
 * production counterpart of the in-memory rollback hooks: envelope, projection, Merkle
 * leaf, and persisted receipt commit together or not at all (VP-02 / ER-01).
 */

import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  Binary,
  type ClientSession,
  type Collection as MongoCollection,
  type Db,
  type MongoClient,
  MongoServerError,
  ReturnDocument,
} from 'mongodb';
import { parseEnvelope } from '../../../core/domain/pipeline/parse.js';
import type { Tx } from '../../../core/domain/domain-handler.js';
import type { ParsedEnvelope, Priority, StoredEnvelope } from '../../../core/domain/envelope.js';
import {
  consistencyPath,
  hashLeaf,
  hashNode,
  inclusionPath,
  merkleRoot,
} from '../../../core/domain/merkle.js';
import type { Receipt } from '../../../core/domain/receipt.js';
import {
  EnvelopeWriter,
  DuplicateContentError,
  ProjectionStore,
  type Collection,
  type EnvelopeReader,
} from '../../../core/ports/storage.port.js';
import {
  WitnessLog,
  type InclusionProof,
  type SignedTreeHead,
} from '../../../core/ports/transparency.port.js';
import type { NodeSigner } from '../../../core/ports/node-signer.port.js';
import type { Clock } from '../../../core/ports/system.port.js';
import { sthSigningBytes } from '../in-memory/local-merkle-log.js';

const ENVELOPES = 'envelopes';
const COUNTERS = 'counters';
const MERKLE_LEAVES = 'merkle_leaves';
const MERKLE_STATE = 'merkle_state';

interface MongoTxContext {
  readonly session: ClientSession;
}

function sessionFor(tx: Tx): ClientSession {
  const context = tx.context as Partial<MongoTxContext> | undefined;
  if (!context?.session) throw new Error('Mongo adapter received a transaction without a session');
  return context.session;
}

const bytes = (value: Uint8Array | Binary | Buffer): Uint8Array =>
  value instanceof Binary ? Uint8Array.from(value.buffer) : Uint8Array.from(value);

interface CounterDocument {
  readonly _id: string;
  readonly value: number;
}

interface MerkleStateDocument {
  readonly _id: string;
  readonly size: number;
  readonly frontier: readonly (Binary | null)[];
  readonly root_hash: Binary;
}

interface MongoReceipt {
  readonly content_id: string;
  readonly log_index: number;
  readonly leaf_index: number;
  readonly accepted_at_ms: number;
  readonly server_id: string;
  readonly server_key: Binary;
  readonly signature: Binary;
  readonly sth: {
    readonly server_key: Binary;
    readonly tree_size: number;
    readonly root_hash: Binary;
    readonly timestamp_ms: number;
    readonly signature: Binary;
  };
  readonly inclusion_proof: readonly Binary[];
}

function receiptToMongo(receipt: Receipt): MongoReceipt {
  return {
    content_id: receipt.contentId,
    log_index: receipt.logIndex,
    leaf_index: receipt.leafIndex,
    accepted_at_ms: receipt.acceptedAtMs,
    server_id: receipt.serverId,
    server_key: new Binary(Buffer.from(receipt.serverKey)),
    signature: new Binary(Buffer.from(receipt.signature)),
    sth: {
      server_key: new Binary(Buffer.from(receipt.sth.serverKey)),
      tree_size: receipt.sth.treeSize,
      root_hash: new Binary(Buffer.from(receipt.sth.rootHash)),
      timestamp_ms: receipt.sth.timestampMs,
      signature: new Binary(Buffer.from(receipt.sth.signature)),
    },
    inclusion_proof: receipt.inclusionProof.map((hash) => new Binary(Buffer.from(hash))),
  };
}

function receiptFromMongo(value: MongoReceipt): Receipt {
  return {
    contentId: value.content_id,
    logIndex: value.log_index,
    leafIndex: value.leaf_index,
    acceptedAtMs: value.accepted_at_ms,
    serverId: value.server_id,
    serverKey: bytes(value.server_key),
    signature: bytes(value.signature),
    sth: {
      serverKey: bytes(value.sth.server_key),
      treeSize: value.sth.tree_size,
      rootHash: bytes(value.sth.root_hash),
      timestampMs: value.sth.timestamp_ms,
      signature: bytes(value.sth.signature),
    },
    inclusionProof: value.inclusion_proof.map(bytes),
  };
}

interface EnvelopeDocument {
  readonly _id: string;
  readonly raw: Binary;
  readonly log_index: number;
  readonly received_at_ms: number;
  readonly priority: number;
  readonly merkle_leaf_index?: number;
  readonly receipt?: MongoReceipt;
}

/** ADR-001 C-2: reserves log indices in blocks, intentionally allowing holes after a crash. */
export class MongoEnvelopeStore extends EnvelopeWriter implements EnvelopeReader {
  private next = 0;
  private end = 0;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly blockSize = 256,
  ) {
    super();
  }

  async ensureIndexes(): Promise<void> {
    await this.db
      .collection<EnvelopeDocument>(ENVELOPES)
      .createIndex({ log_index: 1 }, { unique: true });
    await this.db
      .collection<EnvelopeDocument>(ENVELOPES)
      .createIndex({ received_at_ms: 1, priority: 1 });
  }

  private async allocate(): Promise<number> {
    if (this.next < this.end) return this.next++;
    const counter = await this.db
      .collection<CounterDocument>(COUNTERS)
      .findOneAndUpdate(
        { _id: 'envelope_log_index' },
        { $inc: { value: this.blockSize } },
        { upsert: true, returnDocument: ReturnDocument.AFTER },
      );
    const value = Number(counter?.value ?? this.blockSize);
    this.next = value - this.blockSize;
    this.end = value;
    return this.next++;
  }

  async put(envelope: ParsedEnvelope, raw: Uint8Array, tx: Tx): Promise<StoredEnvelope> {
    const logIndex = await this.allocate();
    const receivedAtMs = this.clock.nowMs();
    try {
      await this.db.collection<EnvelopeDocument>(ENVELOPES).insertOne(
        {
          _id: envelope.contentId,
          raw: new Binary(Buffer.from(raw)),
          log_index: logIndex,
          received_at_ms: receivedAtMs,
          priority: envelope.priority,
        },
        { session: sessionFor(tx) },
      );
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new DuplicateContentError(envelope.contentId);
      }
      throw error;
    }
    return { envelope, raw, logIndex, receivedAtMs };
  }

  async recordReceipt(
    contentId: string,
    receipt: Receipt,
    merkleLeafIndex: number,
    tx: Tx,
  ): Promise<void> {
    const result = await this.db
      .collection<EnvelopeDocument>(ENVELOPES)
      .updateOne(
        { _id: contentId },
        { $set: { receipt: receiptToMongo(receipt), merkle_leaf_index: merkleLeafIndex } },
        { session: sessionFor(tx) },
      );
    if (result.matchedCount !== 1) throw new Error(`cannot receipt missing envelope ${contentId}`);
  }

  private decode(document: EnvelopeDocument): StoredEnvelope {
    const raw = bytes(document.raw);
    const { envelope } = parseEnvelope(raw);
    return {
      envelope,
      raw,
      logIndex: document.log_index,
      receivedAtMs: document.received_at_ms,
      ...(document.merkle_leaf_index !== undefined
        ? { merkleLeafIndex: document.merkle_leaf_index }
        : {}),
      ...(document.receipt ? { receipt: receiptFromMongo(document.receipt) } : {}),
    };
  }

  async get(contentId: string): Promise<StoredEnvelope | null> {
    const document = await this.db
      .collection<EnvelopeDocument>(ENVELOPES)
      .findOne({ _id: contentId });
    return document ? this.decode(document) : null;
  }

  async has(contentId: string): Promise<boolean> {
    return (
      (await this.db
        .collection<EnvelopeDocument>(ENVELOPES)
        .countDocuments({ _id: contentId }, { limit: 1 })) > 0
    );
  }

  async *range(from: number, to: number): AsyncIterable<StoredEnvelope> {
    const cursor = this.db
      .collection<EnvelopeDocument>(ENVELOPES)
      .find({ log_index: { $gte: from, $lt: to } })
      .sort({ log_index: 1 });
    for await (const document of cursor) yield this.decode(document);
  }

  async bloom(classes: readonly Priority[], sinceMs: number): Promise<Uint8Array> {
    const ids = await this.db
      .collection<EnvelopeDocument>(ENVELOPES)
      .find({ priority: { $in: [...classes] }, received_at_ms: { $gte: sinceMs } })
      .project<{ _id: string }>({ _id: 1 })
      .limit(256)
      .toArray();
    // Compact deterministic reconciliation summary. Federation can request exact missing
    // IDs after a positive match, so false positives are safe.
    const out = new Uint8Array(256);
    for (const { _id: id } of ids) {
      let h = 0;
      for (const char of id) h = (h * 31 + char.charCodeAt(0)) & 0xffff;
      out[h % out.length]! |= 1 << (h % 8);
    }
    return out;
  }
}

/** Mongo document projections; `_id` is an adapter concern and never leaks into API models. */
interface ProjectionDocument {
  readonly _id: string;
  readonly [key: string]: unknown;
}

export class MongoProjectionStore extends ProjectionStore {
  private readonly activeSession = new AsyncLocalStorage<ClientSession>();

  constructor(
    private readonly db: Db,
    private readonly client: MongoClient,
  ) {
    super();
  }

  collection<T>(name: string): Collection<T> {
    const collection: MongoCollection<ProjectionDocument> = this.db.collection(name);
    return {
      findOne: async (filter) => {
        const query = filter.id ? { _id: filter.id } : filter;
        const session = this.activeSession.getStore();
        const doc = await collection.findOne(query, session ? { session } : undefined);
        if (!doc) return null;
        const { _id: _ignored, ...value } = doc;
        return value as T;
      },
      find: async (filter, limit) => {
        const session = this.activeSession.getStore();
        const docs = await collection
          .find(filter, session ? { session } : undefined)
          .limit(limit)
          .toArray();
        return docs.map(({ _id: _ignored, ...value }) => value as T);
      },
      put: async (id, doc, tx) => {
        await collection.replaceOne(
          { _id: id },
          { ...doc, _id: id },
          {
            upsert: true,
            session: sessionFor(tx),
          },
        );
      },
      delete: async (id, tx) => {
        await collection.deleteOne({ _id: id }, { session: sessionFor(tx) });
      },
    };
  }

  async transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    const session = this.client.startSession();
    try {
      let result!: R;
      await session.withTransaction(async () => {
        result = await this.activeSession.run(session, () =>
          fn({ id: randomUUID(), context: { session } satisfies MongoTxContext }),
        );
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  async reset(): Promise<void> {
    const collections = await this.db.listCollections({}, { nameOnly: true }).toArray();
    for (const { name } of collections) {
      if (name.startsWith('forum_')) await this.db.collection(name).drop();
    }
  }
}

interface MerkleLeafDocument {
  readonly _id: string;
  readonly index: number;
  readonly hash: Binary;
}

/** Persisted Merkle leaves. The canonical math remains in core/domain/merkle.ts. */
export class MongoMerkleLog extends WitnessLog {
  constructor(
    private readonly db: Db,
    private readonly signer: NodeSigner,
    private readonly clock: Clock,
  ) {
    super();
  }

  async ensureIndexes(): Promise<void> {
    await this.db
      .collection<MerkleLeafDocument>(MERKLE_LEAVES)
      .createIndex({ index: 1 }, { unique: true });
    await this.db.collection<MerkleStateDocument>(MERKLE_STATE).updateOne(
      { _id: 'local' },
      {
        $setOnInsert: {
          size: 0,
          frontier: [],
          root_hash: new Binary(Buffer.from(merkleRoot([]))),
        },
      },
      { upsert: true },
    );
  }

  private async leaves(session?: ClientSession): Promise<Uint8Array[]> {
    const records = await this.db
      .collection<MerkleLeafDocument>(MERKLE_LEAVES)
      .find({}, session ? { session } : undefined)
      .sort({ index: 1 })
      .toArray();
    return records.map((record) => bytes(record.hash));
  }

  async append(contentId: string, tx: Tx): Promise<number> {
    const session = sessionFor(tx);
    const existing = await this.db
      .collection<MerkleLeafDocument>(MERKLE_LEAVES)
      .findOne({ _id: contentId }, { session });
    if (existing) return existing.index;
    const state = await this.db
      .collection<MerkleStateDocument>(MERKLE_STATE)
      .findOne({ _id: 'local' }, { session });
    if (!state) throw new Error('Merkle state has not been initialised');
    const index = state.size;
    const leafHash = hashLeaf(new TextEncoder().encode(contentId));
    const frontier = [...state.frontier];
    let carry = leafHash;
    let level = 0;
    let occupied = index;
    while ((occupied & 1) === 1) {
      const left = frontier[level];
      if (!left) throw new Error(`Merkle frontier is corrupt at level ${level}`);
      carry = hashNode(bytes(left), carry);
      frontier[level] = null;
      occupied >>= 1;
      level += 1;
    }
    frontier[level] = new Binary(Buffer.from(carry));

    let root: Uint8Array | null = null;
    for (let i = 0; i < frontier.length; i += 1) {
      const subtree = frontier[i];
      if (subtree) root = root ? hashNode(bytes(subtree), root) : bytes(subtree);
    }
    if (!root) throw new Error('Merkle frontier did not produce a root');

    await this.db.collection<MerkleStateDocument>(MERKLE_STATE).replaceOne(
      { _id: 'local', size: state.size },
      {
        size: state.size + 1,
        frontier,
        root_hash: new Binary(Buffer.from(root)),
      },
      { session },
    );
    await this.db
      .collection<MerkleLeafDocument>(MERKLE_LEAVES)
      .insertOne({ _id: contentId, index, hash: new Binary(Buffer.from(leafHash)) }, { session });
    return index;
  }

  async currentSth(tx?: Tx): Promise<SignedTreeHead> {
    const session = tx ? sessionFor(tx) : undefined;
    const state = await this.db
      .collection<MerkleStateDocument>(MERKLE_STATE)
      .findOne({ _id: 'local' }, session ? { session } : undefined);
    const rootHash = state ? bytes(state.root_hash) : merkleRoot([]);
    const treeSize = state?.size ?? 0;
    const timestampMs = this.clock.nowMs();
    return {
      serverKey: this.signer.publicKey,
      treeSize,
      rootHash,
      timestampMs,
      signature: this.signer.sign(sthSigningBytes(treeSize, rootHash, timestampMs)),
    };
  }

  async inclusionProof(contentId: string, tx?: Tx): Promise<InclusionProof> {
    const session = tx ? sessionFor(tx) : undefined;
    const record = await this.db
      .collection<MerkleLeafDocument>(MERKLE_LEAVES)
      .findOne({ _id: contentId }, session ? { session } : undefined);
    if (!record) throw new Error(`not in log: ${contentId}`);
    const leaves = await this.leaves(session);
    return {
      leafIndex: record.index,
      treeSize: leaves.length,
      path: inclusionPath(leaves, record.index),
    };
  }

  async consistencyProof(from: number, to: number): Promise<readonly Uint8Array[]> {
    return consistencyPath((await this.leaves()).slice(0, to), from);
  }

}
