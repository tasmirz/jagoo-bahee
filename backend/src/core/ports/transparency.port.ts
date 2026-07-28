/**
 * Transparency port — the Merkle witness log.
 *
 * Moderation here is publish-then-attest, so the log is what makes censorship *evidence*
 * rather than something that can happen silently. Removal is a tombstone: content ID,
 * author, timestamp, acting moderator and reason stay publicly visible; only the body is
 * withheld. Every censorship action is itself a logged, signed record.
 *
 * The client verifies inclusion proofs on-device, offline, from the provenance block. It
 * never takes the server's word that content is in the log.
 */

import type { Tx } from '../domain/domain-handler.js';

export interface SignedTreeHead {
  readonly serverKey: Uint8Array;
  readonly treeSize: number;
  readonly rootHash: Uint8Array;
  readonly timestampMs: number;
  readonly signature: Uint8Array;
}

export interface InclusionProof {
  readonly leafIndex: number;
  readonly treeSize: number;
  readonly path: readonly Uint8Array[];
}

export const PeerLogStatus = {
  CONSISTENT: 'CONSISTENT',
  /** A peer rewrote history. This is the finding the whole log exists to make detectable. */
  FORKED: 'FORKED',
  UNKNOWN: 'UNKNOWN',
} as const;
export type PeerLogStatus = (typeof PeerLogStatus)[keyof typeof PeerLogStatus];

export abstract class WitnessLog {
  /** Atomic with the projection write — same `tx` (pipeline steps 16/17). */
  abstract append(contentId: string, tx: Tx): Promise<number>;
  abstract currentSth(tx?: Tx): Promise<SignedTreeHead>;
  abstract inclusionProof(contentId: string, tx?: Tx): Promise<InclusionProof>;
  abstract consistencyProof(from: number, to: number): Promise<readonly Uint8Array[]>;
  abstract verifyPeerSth(peerKey: Uint8Array, sth: SignedTreeHead): Promise<PeerLogStatus>;
}
