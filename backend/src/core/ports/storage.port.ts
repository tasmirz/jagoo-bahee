/**
 * Storage ports.
 *
 * Abstract classes rather than interfaces: a TS `interface` vanishes at runtime and cannot
 * be a DI token. These keep the structural contract for the type checker AND give Nest a
 * token, with no parallel `Symbol` to keep in sync (ADR-002).
 *
 * Reader and writer stay separate (Interface Segregation, AR-02). The Mongo adapter
 * implements both and is bound twice in the composition root, so a consumer that only
 * reads still depends only on the reader.
 */

import type { ParsedEnvelope, Priority, StoredEnvelope } from '../domain/envelope.js';
import type { Tx } from '../domain/domain-handler.js';

export abstract class EnvelopeWriter {
  /**
   * Append to the log. `tx` is required, not optional: the append and the projection must
   * be atomic with respect to each other, because a projected envelope missing from the
   * Merkle log is a transparency failure (pipeline steps 16/17).
   */
  abstract put(envelope: ParsedEnvelope, raw: Uint8Array, tx: Tx): Promise<void>;
}

export abstract class EnvelopeReader {
  abstract get(contentId: string): Promise<StoredEnvelope | null>;
  abstract has(contentId: string): Promise<boolean>;
  /** Half-open [from, to). Used by federation backfill. */
  abstract range(from: number, to: number): AsyncIterable<StoredEnvelope>;
  /** Compact set-reconciliation summary for federation (FD-08). */
  abstract bloom(classes: readonly Priority[], sinceMs: number): Promise<Uint8Array>;
}

/**
 * A named collection of projected documents. Projections are DERIVED — they must be fully
 * reconstructible from the envelope log alone, byte-identically. If one cannot be, that is
 * a defect in the handler, not a reason to back up projections.
 */
export interface Collection<T> {
  findOne(filter: Record<string, unknown>): Promise<T | null>;
  find(filter: Record<string, unknown>, limit: number, cursor?: string): Promise<readonly T[]>;
  put(id: string, doc: T, tx: Tx): Promise<void>;
  delete(id: string, tx: Tx): Promise<void>;
}

export abstract class ProjectionStore {
  abstract collection<T>(name: string): Collection<T>;
  /** Mongo requires a replica set for this, even single-node (ADR-001, build log L-03). */
  abstract transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>;
}
