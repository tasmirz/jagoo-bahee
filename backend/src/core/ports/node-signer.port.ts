/**
 * The node's own signing key — used for receipts and signed tree heads.
 *
 * Distinct from a `PlaneSigner`, which signs USER content. This key says "this node saw
 * this and put it in its log at this position", which is an accountability claim about the
 * operator, not an authorship claim. Conflating them would let a node forge user content.
 */
export abstract class NodeSigner {
  /** jbs1… — the node's identity is its key, never a URL (FD-02). */
  abstract readonly serverId: string;
  abstract readonly publicKey: Uint8Array;
  abstract sign(message: Uint8Array): Uint8Array;
}
