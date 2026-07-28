/**
 * In-memory doubles for every port (AR-03).
 *
 * These are not throwaway mocks. They are real implementations with the same observable
 * semantics as the production adapters, which is what makes a unit test meaningful: a
 * handler tested against `InMemoryProjectionStore` behaves the same way against Mongo,
 * because both honour the transaction contract rather than ignoring it.
 *
 * The transaction double is intentionally strict — see `InMemoryProjectionStore`.
 */

import { registerRollback, type Tx } from '../../../core/domain/domain-handler.js';
import type { ParsedEnvelope, Priority, StoredEnvelope } from '../../../core/domain/envelope.js';
import type { Receipt } from '../../../core/domain/receipt.js';
import {
  EnvelopeWriter,
  DuplicateContentError,
  ProjectionStore,
  type Collection,
  type EnvelopeReader,
} from '../../../core/ports/storage.port.js';
import { Clock, RandomSource } from '../../../core/ports/system.port.js';

/** Both halves of the storage port, so the composition root can bind it twice. */
export class InMemoryEnvelopeStore extends EnvelopeWriter implements EnvelopeReader {
  private readonly byContentId = new Map<string, StoredEnvelope>();
  private readonly log: StoredEnvelope[] = [];

  constructor(private readonly clock: Clock) {
    super();
  }

  async put(envelope: ParsedEnvelope, raw: Uint8Array, tx: Tx): Promise<StoredEnvelope> {
    // DUPLICATE is a pipeline-step-11 concern, but the store enforces the invariant too:
    // a unique index on content_id is what makes dedupe correct under concurrency.
    const existing = this.byContentId.get(envelope.contentId);
    if (existing) throw new DuplicateContentError(envelope.contentId);

    const stored: StoredEnvelope = {
      envelope,
      raw,
      logIndex: this.log.length,
      receivedAtMs: this.clock.nowMs(),
    };
    this.byContentId.set(envelope.contentId, stored);
    this.log.push(stored);
    registerRollback(tx, () => {
      this.byContentId.delete(envelope.contentId);
      if (this.log[this.log.length - 1] === stored) this.log.pop();
    });
    return stored;
  }

  async recordReceipt(
    contentId: string,
    receipt: Receipt,
    merkleLeafIndex: number,
    tx: Tx,
  ): Promise<void> {
    const previous = this.byContentId.get(contentId);
    if (!previous) throw new Error(`cannot receipt missing envelope ${contentId}`);
    const next: StoredEnvelope = { ...previous, receipt, merkleLeafIndex };
    this.byContentId.set(contentId, next);
    const index = this.log.indexOf(previous);
    if (index >= 0) this.log[index] = next;
    registerRollback(tx, () => {
      this.byContentId.set(contentId, previous);
      if (index >= 0) this.log[index] = previous;
    });
  }

  async get(contentId: string): Promise<StoredEnvelope | null> {
    return this.byContentId.get(contentId) ?? null;
  }

  async has(contentId: string): Promise<boolean> {
    return this.byContentId.has(contentId);
  }

  async *range(from: number, to: number): AsyncIterable<StoredEnvelope> {
    for (const entry of this.log.slice(Math.max(0, from), Math.max(0, to))) {
      yield entry;
    }
  }

  async bloom(classes: readonly Priority[], sinceMs: number): Promise<Uint8Array> {
    // A real Bloom filter belongs in the production adapter (FD-08). The double returns a
    // deterministic stand-in so callers can be tested without depending on its contents.
    const matching = this.log.filter(
      (e) => classes.includes(e.envelope.priority) && e.receivedAtMs >= sinceMs,
    );
    return new Uint8Array([matching.length & 0xff]);
  }

  get size(): number {
    return this.log.length;
  }
}

/**
 * Transactions that actually roll back.
 *
 * A double that ignores rollback would let a handler which writes a projection and then
 * throws pass its unit test and corrupt data in production. Writes are buffered per
 * transaction and only merged on success — so pipeline steps 16/17 atomicity is genuinely
 * exercised, not assumed.
 */
export class InMemoryProjectionStore extends ProjectionStore {
  private readonly data = new Map<string, Map<string, unknown>>();
  private staged: Map<string, Map<string, unknown>> | null = null;
  private txCounter = 0;

  private live(): Map<string, Map<string, unknown>> {
    return this.staged ?? this.data;
  }

  private collectionMap(name: string): Map<string, unknown> {
    const store = this.live();
    let existing = store.get(name);
    if (!existing) {
      existing = new Map();
      store.set(name, existing);
    }
    return existing;
  }

  collection<T>(name: string): Collection<T> {
    const matches = (doc: unknown, filter: Record<string, unknown>): boolean => {
      if (!doc || typeof doc !== 'object') return false;
      return Object.entries(filter).every(
        ([key, value]) => (doc as Record<string, unknown>)[key] === value,
      );
    };
    return {
      findOne: async (filter) => {
        const id = filter['id'];
        if (typeof id === 'string') return (this.collectionMap(name).get(id) as T) ?? null;
        const first = [...this.collectionMap(name).values()].find((doc) => matches(doc, filter));
        return (first as T) ?? null;
      },
      find: async (filter, limit) => {
        return [...this.collectionMap(name).values()]
          .filter((doc) => matches(doc, filter))
          .slice(0, limit) as T[];
      },
      put: async (id, doc) => {
        this.collectionMap(name).set(id, doc);
      },
      delete: async (id) => {
        this.collectionMap(name).delete(id);
      },
    };
  }

  async transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
    if (this.staged) throw new Error('nested transactions are not supported');

    this.txCounter += 1;
    const rollbacks: (() => void)[] = [];
    const tx: Tx = {
      id: `tx-${this.txCounter}`,
      context: { onRollback: (action: () => void) => rollbacks.push(action) },
    };

    // Deep-enough copy: one level of collections, each a fresh Map.
    this.staged = new Map([...this.data].map(([k, v]) => [k, new Map(v)]));
    try {
      const result = await fn(tx);
      for (const [name, docs] of this.staged) this.data.set(name, docs);
      return result;
    } catch (error) {
      for (const rollback of rollbacks.reverse()) rollback();
      throw error;
    } finally {
      this.staged = null;
    }
  }

  async reset(): Promise<void> {
    if (this.staged) throw new Error('cannot reset projections during a transaction');
    this.data.clear();
  }

  /** Stable test/admin representation used by the byte-identical rebuild gate. */
  snapshot(): string {
    const collections = [...this.data.entries()]
      .filter(([, docs]) => docs.size > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, docs]) => [
        name,
        [...docs.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ]);
    return JSON.stringify(collections);
  }
}

/** Deterministic clock — the whole point of the Clock port (AR-02). */
export class FixedClock extends Clock {
  constructor(private current: number = 0) {
    super();
  }
  nowMs(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
  set(ms: number): void {
    this.current = ms;
  }
}

/** Counter-based, so a test asserting on a nonce is reproducible. */
export class SequentialRandom extends RandomSource {
  private counter = 0;
  bytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 1) {
      this.counter = (this.counter + 1) & 0xff;
      out[i] = this.counter;
    }
    return out;
  }
}
