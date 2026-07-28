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
  /** Dense Merkle-leaf index; logIndex can contain allocator holes (ADR-001). */
  readonly leafIndex: number;
  readonly acceptedAtMs: number;
  /** The node that accepted it — `jbs1…`. */
  readonly serverId: string;
  readonly serverKey: Uint8Array;
  /** Ed25519 over the canonical receipt bytes below. */
  readonly signature: Uint8Array;
  readonly sth: SignedTreeHead;
  readonly inclusionProof: readonly Uint8Array[];
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
  leafIndex: number,
  acceptedAtMs: number,
  serverId: string,
  serverKey: Uint8Array,
  sth: SignedTreeHead,
  inclusionProof: readonly Uint8Array[],
): Uint8Array {
  const text = new TextEncoder();
  const parts = [
    text.encode('jb-receipt-v1'),
    text.encode(contentId),
    text.encode(String(logIndex)),
    text.encode(String(leafIndex)),
    text.encode(String(acceptedAtMs)),
    text.encode(serverId),
    serverKey,
    text.encode(String(sth.treeSize)),
    sth.rootHash,
    text.encode(String(sth.timestampMs)),
    sth.serverKey,
    sth.signature,
    ...inclusionProof,
  ];
  const size = parts.reduce((n, p) => n + 4 + p.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let offset = 0;
  for (const part of parts) {
    view.setUint32(offset, part.length, false);
    offset += 4;
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
