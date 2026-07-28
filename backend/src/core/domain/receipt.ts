/**
 * The receipt — pipeline step 18.
 *
 * A receipt is the node's signed statement: "I accepted this content ID and placed it at
 * this position in my log, and here is the tree head that covers it." It is what lets a
 * client later demand an inclusion proof and check that the node has not quietly dropped
 * the content since.
 *
 * ── ER-01: a duplicate returns the ORIGINAL receipt ─────────────────────────────────
 * The same envelope arriving twice is the normal case — it may reach a node over HTTP,
 * again via federation, and again over mesh. Returning the original receipt makes retry
 * safe and the write path idempotent. Issuing a *new* receipt for the same content would
 * mean two different log positions for one content ID, which is a transparency failure.
 */

import type { SignedTreeHead } from '../ports/transparency.port.js';

export interface Receipt {
  readonly contentId: string;
  readonly logIndex: number;
  readonly acceptedAtMs: number;
  /** The node that accepted it — `jbs1…`. */
  readonly serverId: string;
  /** Ed25519 over the canonical receipt bytes below. */
  readonly signature: Uint8Array;
  readonly sth: SignedTreeHead;
}

/**
 * Bytes a receipt signature covers.
 *
 * Deliberately field-separated with `\n` rather than concatenated: `contentId=a, index=12`
 * and `contentId=a1, index=2` must not produce identical bytes, or one receipt would verify
 * as another.
 */
export function receiptSigningBytes(
  contentId: string,
  logIndex: number,
  acceptedAtMs: number,
  serverId: string,
): Uint8Array {
  return new TextEncoder().encode(
    ['jb-receipt-v1', contentId, String(logIndex), String(acceptedAtMs), serverId].join('\n'),
  );
}
