/**
 * RFC 6962 Merkle tree maths — the transparency log's arithmetic.
 *
 * Pure functions, no storage, no clock. The adapter in `adapters/outbound/` holds the
 * leaves; this file decides what the hashes are, so proof verification can run identically
 * on a node and on a phone with the network switched off.
 *
 * ── Why the 0x00 / 0x01 prefixes matter ─────────────────────────────────────────────
 * Leaves hash as `H(0x00 ‖ data)` and internal nodes as `H(0x01 ‖ left ‖ right)`. Without
 * the domain-separating prefix, an attacker could present an internal node's hash as if it
 * were a leaf — a second-preimage attack that lets them claim a leaf is in the tree when it
 * is not. The prefix is the whole defence, and it is one byte.
 *
 * ── What this is FOR here ───────────────────────────────────────────────────────────
 * Moderation is publish-then-attest, so the log is what turns censorship into evidence
 * rather than something that can happen quietly. A client that holds an old signed tree
 * head can prove, offline, that a node has not rewritten history — and detect it if it has.
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §4, RFC 6962 §2
 */

import { sha256 } from '@noble/hashes/sha2';

const LEAF_PREFIX = 0x00;
const NODE_PREFIX = 0x01;

export function hashLeaf(data: Uint8Array): Uint8Array {
  const buf = new Uint8Array(data.length + 1);
  buf[0] = LEAF_PREFIX;
  buf.set(data, 1);
  return sha256(buf);
}

export function hashNode(left: Uint8Array, right: Uint8Array): Uint8Array {
  const buf = new Uint8Array(left.length + right.length + 1);
  buf[0] = NODE_PREFIX;
  buf.set(left, 1);
  buf.set(right, left.length + 1);
  return sha256(buf);
}

/** The empty tree's root is SHA-256 of nothing — RFC 6962 §2.1. */
export function emptyRoot(): Uint8Array {
  return sha256(new Uint8Array(0));
}

/**
 * Largest power of two strictly less than n. RFC 6962 splits at this point rather than in
 * half, which is what makes the tree append-only: adding a leaf never re-parents an
 * existing subtree.
 */
function splitPoint(n: number): number {
  let k = 1;
  while (k * 2 < n) k *= 2;
  return k;
}

/** Merkle root of `leaves` (already leaf-hashed). */
export function merkleRoot(leaves: readonly Uint8Array[]): Uint8Array {
  if (leaves.length === 0) return emptyRoot();
  if (leaves.length === 1) return leaves[0] as Uint8Array;
  const k = splitPoint(leaves.length);
  return hashNode(merkleRoot(leaves.slice(0, k)), merkleRoot(leaves.slice(k)));
}

/** Audit path proving `index` is in a tree of `leaves`. */
export function inclusionPath(leaves: readonly Uint8Array[], index: number): Uint8Array[] {
  if (index < 0 || index >= leaves.length) {
    throw new Error(`leaf index ${index} out of range for tree size ${leaves.length}`);
  }
  if (leaves.length === 1) return [];

  const k = splitPoint(leaves.length);
  if (index < k) {
    return [...inclusionPath(leaves.slice(0, k), index), merkleRoot(leaves.slice(k))];
  }
  return [...inclusionPath(leaves.slice(k), index - k), merkleRoot(leaves.slice(0, k))];
}

/**
 * Verify an audit path against a root.
 *
 * This is the function the CLIENT runs, offline, from the `provenance` block. It must not
 * need the tree, the server, or the network — only the leaf, its index, the tree size, the
 * path, and a root the client already trusts.
 */
export function verifyInclusion(
  leafHash: Uint8Array,
  index: number,
  treeSize: number,
  path: readonly Uint8Array[],
  root: Uint8Array,
): boolean {
  if (index < 0 || index >= treeSize) return false;

  // Descend to find which side the leaf sits on at each level. `inclusionPath` emits the
  // DEEPEST sibling first (it recurses before appending), so the descent is recorded
  // top-down here and then consumed in reverse to match.
  const goesLeft: boolean[] = [];
  let i = index;
  let size = treeSize;
  while (size > 1) {
    const k = splitPoint(size);
    if (i < k) {
      goesLeft.push(true);
      size = k;
    } else {
      goesLeft.push(false);
      i -= k;
      size -= k;
    }
  }

  // Exact length: a padded or truncated path is not a proof for this tree size. Accepting
  // extra elements would let an attacker append hashes until the result matched the root.
  if (path.length !== goesLeft.length) return false;

  let hash = leafHash;
  for (let depth = goesLeft.length - 1, p = 0; depth >= 0; depth -= 1, p += 1) {
    const sibling = path[p] as Uint8Array;
    hash = goesLeft[depth] ? hashNode(hash, sibling) : hashNode(sibling, hash);
  }
  return bytesEqual(hash, root);
}

/**
 * Consistency proof between tree sizes `m` and `n` (m <= n) — RFC 6962 §2.1.2.
 *
 * This is what detects a REWRITE. Inclusion proves "you have my content"; consistency
 * proves "you did not silently change what you had". A node that quietly drops or edits an
 * old entry cannot produce a valid consistency proof against an STH a client already holds.
 */
export function consistencyPath(leaves: readonly Uint8Array[], m: number): Uint8Array[] {
  const n = leaves.length;
  if (m < 0 || m > n) throw new Error(`consistency: ${m} is not within tree size ${n}`);
  if (m === 0 || m === n) return [];
  return subProof(leaves, m, true);
}

function subProof(leaves: readonly Uint8Array[], m: number, isRoot: boolean): Uint8Array[] {
  const n = leaves.length;
  if (m === n) {
    // The old tree is exactly this subtree: its root is only needed when it is not already
    // implied by the caller's own root.
    return isRoot ? [] : [merkleRoot(leaves)];
  }
  const k = splitPoint(n);
  if (m <= k) {
    return [...subProof(leaves.slice(0, k), m, isRoot), merkleRoot(leaves.slice(k))];
  }
  return [...subProof(leaves.slice(k), m - k, false), merkleRoot(leaves.slice(0, k))];
}

/**
 * Verify a consistency proof — RFC 6962 §2.1.2.
 *
 * Rebuilds BOTH roots from the same proof: the old root from the old tree's frontier, and
 * the new root by continuing past it. Both must match, and the proof must be exactly
 * consumed. Checking only the new root would accept a proof that reaches the right answer
 * from the wrong history, which is the tampering this is here to catch.
 */
export function verifyConsistency(
  oldSize: number,
  oldRoot: Uint8Array,
  newSize: number,
  newRoot: Uint8Array,
  proof: readonly Uint8Array[],
): boolean {
  if (oldSize < 0 || newSize < 0) return false;
  if (oldSize > newSize) return false;
  if (oldSize === newSize) return proof.length === 0 && bytesEqual(oldRoot, newRoot);
  // Every tree is consistent with the empty tree, and no proof is needed to say so.
  if (oldSize === 0) return proof.length === 0;

  let node = oldSize - 1;
  let lastNode = newSize - 1;

  // Walk up out of the run of right-children. What remains is the old tree's frontier node.
  while ((node & 1) === 1) {
    node >>= 1;
    lastNode >>= 1;
  }

  let index = 0;
  let oldHash: Uint8Array;
  let newHash: Uint8Array;

  if (node !== 0) {
    // The old tree is not a perfect subtree on the left edge, so its frontier hash has to
    // be supplied rather than being the old root itself.
    if (proof.length === 0) return false;
    oldHash = proof[0] as Uint8Array;
    newHash = proof[0] as Uint8Array;
    index = 1;
  } else {
    oldHash = oldRoot;
    newHash = oldRoot;
  }

  while (node !== 0) {
    if ((node & 1) === 1) {
      // Right child: the left sibling is shared by both trees.
      if (index >= proof.length) return false;
      const sibling = proof[index] as Uint8Array;
      index += 1;
      oldHash = hashNode(sibling, oldHash);
      newHash = hashNode(sibling, newHash);
    } else if (node < lastNode) {
      // Left child that gained a right sibling in the new tree — new side only.
      if (index >= proof.length) return false;
      const sibling = proof[index] as Uint8Array;
      index += 1;
      newHash = hashNode(newHash, sibling);
    }
    node >>= 1;
    lastNode >>= 1;
  }

  // Finish climbing the new tree above where the old one ended.
  while (lastNode !== 0) {
    if (index >= proof.length) return false;
    newHash = hashNode(newHash, proof[index] as Uint8Array);
    index += 1;
    lastNode >>= 1;
  }

  // Exact consumption: leftover elements would mean the proof was padded until it worked.
  return index === proof.length && bytesEqual(oldHash, oldRoot) && bytesEqual(newHash, newRoot);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}
