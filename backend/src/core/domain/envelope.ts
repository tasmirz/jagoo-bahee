/**
 * The envelope as the core sees it.
 *
 * Deliberately declared here rather than imported from `@jagoo/sdk` at runtime: the core
 * must stay a pure, dependency-free TypeScript island (AR-01). These are plain `const`
 * objects rather than TS `enum`s so the values survive erasure cleanly and never depend on
 * a module format.
 *
 * The numeric values are frozen — they are the protobuf field values that get signed, and
 * they must match `proto/jagoo/v1/envelope.proto` exactly.
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §2-3
 */

import type { Receipt } from './receipt.js';

export const Plane = {
  UNSPECIFIED: 0,
  FORUM: 1,
  SIGNAL: 2,
} as const;
export type Plane = (typeof Plane)[keyof typeof Plane];

export const KeyAlg = {
  UNSPECIFIED: 0,
  ED25519: 1,
  ML_DSA_44: 2,
  FALCON_512: 3,
} as const;
export type KeyAlg = (typeof KeyAlg)[keyof typeof KeyAlg];

/**
 * Priority class. Ordering matters: outbound queues drain by class first, then FIFO, so a
 * queued emergency broadcast overtakes 500 queued votes.
 */
export const Priority = {
  UNSPECIFIED: 0,
  BROADCAST: 1,
  DIRECT: 2,
  CHECKIN: 3,
  BULK: 4,
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

/** The only envelope version this build accepts. An unknown version is hard-rejected. */
export const ENVELOPE_VERSION = 1;

export interface AntiAbuse {
  readonly credential?: Uint8Array;
  readonly nullifier?: Uint8Array;
  readonly epoch?: number;
  readonly pow?: Uint8Array;
}

/** A decoded envelope. Fields 1..12 are signed; `signature` is field 13. */
export interface ParsedEnvelope {
  readonly version: number;
  readonly plane: Plane;
  readonly domain: string;
  readonly authorKey: Uint8Array;
  readonly keyAlg: KeyAlg;
  readonly parent: string;
  readonly scope: string;
  readonly createdAtMs: bigint;
  readonly nonce: Uint8Array;
  readonly priority: Priority;
  readonly body: Uint8Array;
  readonly antiAbuse?: AntiAbuse;
  readonly signature: Uint8Array;
  /** jb1… — derived, never transmitted as a trusted value (VIS-03). */
  readonly contentId: string;
}

/**
 * An envelope as stored, with its log position.
 *
 * `logIndex` is a position in this node's append-only log. It is deliberately NOT part of
 * any signed structure or federated payload — a local index is meaningless off-instance,
 * and embedding one is the exact defect that made v1 federation impossible (ID-01).
 */
export interface StoredEnvelope {
  readonly envelope: ParsedEnvelope;
  readonly raw: Uint8Array;
  readonly logIndex: number;
  readonly receivedAtMs: number;
  /** Dense RFC 6962 leaf position; deliberately distinct from the sparse log index. */
  readonly merkleLeafIndex?: number;
  /** Persisted verbatim so an idempotent retry returns the original evidence. */
  readonly receipt?: Receipt;
}
