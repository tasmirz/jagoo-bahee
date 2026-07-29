/**
 * T1.5 — the local Merkle witness log.
 *
 * Holds the leaves; `core/domain/merkle.ts` decides what the hashes are. The split matters:
 * the maths is pure and runs identically on a phone, so a client can verify an inclusion
 * proof offline instead of taking the node's word (THR-01).
 *
 * The STH is signed by the NODE key, not a user key. It is an accountability claim by the
 * operator — "my log is this shape at this moment" — which is what makes a later rewrite
 * detectable by anyone holding an older STH.
 */

import {
  consistencyPath,
  hashLeaf,
  inclusionPath,
  merkleRoot,
} from '../../../core/domain/merkle.js';
import { registerRollback, type Tx } from '../../../core/domain/domain-handler.js';
import {
  WitnessLog,
  type InclusionProof,
  type SignedTreeHead,
} from '../../../core/ports/transparency.port.js';
import type { NodeSigner } from '../../../core/ports/node-signer.port.js';
import type { Clock } from '../../../core/ports/system.port.js';

/** Bytes an STH signature covers. Field-separated so two heads cannot collide. */
export function sthSigningBytes(treeSize: number, rootHash: Uint8Array, timestampMs: number): Uint8Array {
  const prefix = new TextEncoder().encode(`jb-sth-v1\n${treeSize}\n${timestampMs}\n`);
  const out = new Uint8Array(prefix.length + rootHash.length);
  out.set(prefix);
  out.set(rootHash, prefix.length);
  return out;
}

export class LocalMerkleLog extends WitnessLog {
  private readonly leaves: Uint8Array[] = [];
  private readonly indexById = new Map<string, number>();

  constructor(
    private readonly signer: NodeSigner,
    private readonly clock: Clock,
  ) {
    super();
  }

  async append(contentId: string, tx: Tx): Promise<number> {
    const existing = this.indexById.get(contentId);
    // Append-only and idempotent: the same content ID must never occupy two positions, or
    // a receipt could name a position the log disagrees with.
    if (existing !== undefined) return existing;

    const index = this.leaves.length;
    this.leaves.push(hashLeaf(new TextEncoder().encode(contentId)));
    this.indexById.set(contentId, index);
    registerRollback(tx, () => {
      if (this.indexById.get(contentId) === index) this.indexById.delete(contentId);
      if (this.leaves.length === index + 1) this.leaves.pop();
    });
    return index;
  }

  async currentSth(_tx?: Tx): Promise<SignedTreeHead> {
    const rootHash = merkleRoot(this.leaves);
    const timestampMs = this.clock.nowMs();
    return {
      serverKey: this.signer.publicKey,
      treeSize: this.leaves.length,
      rootHash,
      timestampMs,
      signature: this.signer.sign(sthSigningBytes(this.leaves.length, rootHash, timestampMs)),
    };
  }

  async inclusionProof(contentId: string, _tx?: Tx): Promise<InclusionProof> {
    const leafIndex = this.indexById.get(contentId);
    if (leafIndex === undefined) throw new Error(`not in log: ${contentId}`);
    return {
      leafIndex,
      treeSize: this.leaves.length,
      path: inclusionPath(this.leaves, leafIndex),
    };
  }

  async consistencyProof(from: number, to: number): Promise<readonly Uint8Array[]> {
    return consistencyPath(this.leaves.slice(0, to), from);
  }

  get size(): number {
    return this.leaves.length;
  }
}
