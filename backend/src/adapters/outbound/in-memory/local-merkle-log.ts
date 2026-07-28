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
  verifyConsistency,
} from '../../../core/domain/merkle.js';
import type { Tx } from '../../../core/domain/domain-handler.js';
import {
  PeerLogStatus,
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
  /** Last STH seen per peer, so a fork is detected against what they told us before. */
  private readonly peerHeads = new Map<string, SignedTreeHead>();

  constructor(
    private readonly signer: NodeSigner,
    private readonly clock: Clock,
  ) {
    super();
  }

  async append(contentId: string, _tx: Tx): Promise<number> {
    const existing = this.indexById.get(contentId);
    // Append-only and idempotent: the same content ID must never occupy two positions, or
    // a receipt could name a position the log disagrees with.
    if (existing !== undefined) return existing;

    const index = this.leaves.length;
    this.leaves.push(hashLeaf(new TextEncoder().encode(contentId)));
    this.indexById.set(contentId, index);
    return index;
  }

  async currentSth(): Promise<SignedTreeHead> {
    const rootHash = merkleRoot(this.leaves);
    const timestampMs = this.clock.nowMs();
    return {
      treeSize: this.leaves.length,
      rootHash,
      timestampMs,
      signature: this.signer.sign(sthSigningBytes(this.leaves.length, rootHash, timestampMs)),
    };
  }

  async inclusionProof(contentId: string): Promise<InclusionProof> {
    const leafIndex = this.indexById.get(contentId);
    if (leafIndex === undefined) throw new Error(`not in log: ${contentId}`);
    return {
      leafIndex,
      treeSize: this.leaves.length,
      path: inclusionPath(this.leaves, leafIndex),
    };
  }

  async consistencyProof(from: number, _to: number): Promise<readonly Uint8Array[]> {
    return consistencyPath(this.leaves, from);
  }

  /**
   * FG-08 — fork detection.
   *
   * A peer that presents a tree head inconsistent with one it previously gave us has
   * rewritten history. That is not a transient error and must not be retried away: it is
   * the single strongest signal that a node is being tampered with, and it surfaces to the
   * operator rather than being swallowed.
   */
  async verifyPeerSth(peerKey: Uint8Array, sth: SignedTreeHead): Promise<PeerLogStatus> {
    const key = Buffer.from(peerKey).toString('hex');
    const previous = this.peerHeads.get(key);

    if (!previous) {
      this.peerHeads.set(key, sth);
      return PeerLogStatus.UNKNOWN;
    }

    if (sth.treeSize < previous.treeSize) return PeerLogStatus.FORKED;

    if (sth.treeSize === previous.treeSize) {
      const same = Buffer.from(sth.rootHash).equals(Buffer.from(previous.rootHash));
      return same ? PeerLogStatus.CONSISTENT : PeerLogStatus.FORKED;
    }

    // A growing tree needs a real consistency proof to be trusted; without one we can only
    // say we have not yet checked, never that it is fine.
    this.peerHeads.set(key, sth);
    return PeerLogStatus.UNKNOWN;
  }

  /** Verify a peer's growth claim against a proof they supplied. */
  async checkPeerGrowth(
    previous: SignedTreeHead,
    next: SignedTreeHead,
    proof: readonly Uint8Array[],
  ): Promise<PeerLogStatus> {
    const ok = verifyConsistency(
      previous.treeSize,
      previous.rootHash,
      next.treeSize,
      next.rootHash,
      proof,
    );
    return ok ? PeerLogStatus.CONSISTENT : PeerLogStatus.FORKED;
  }

  get size(): number {
    return this.leaves.length;
  }
}
