/**
 * T1.5 — Merkle log maths.
 *
 * The two properties that matter operationally:
 *   inclusion   — "this content is in your log", verifiable offline on a phone
 *   consistency — "you did not rewrite what was already there"
 *
 * The second is the one that turns censorship into evidence. A node that quietly drops or
 * edits an old entry cannot produce a valid consistency proof against an STH a client
 * already holds, so the tampering is detectable by anyone who kept one.
 */

import { describe, expect, it } from 'vitest';
import {
  consistencyPath,
  emptyRoot,
  hashLeaf,
  hashNode,
  inclusionPath,
  merkleRoot,
  verifyConsistency,
  verifyInclusion,
} from './merkle.js';

const leaf = (n: number): Uint8Array => hashLeaf(new TextEncoder().encode(`jb1entry${n}`));
const tree = (size: number): Uint8Array[] => Array.from({ length: size }, (_, i) => leaf(i));

describe('structure', () => {
  it('the empty tree is SHA-256 of nothing (RFC 6962 §2.1)', () => {
    expect(merkleRoot([])).toEqual(emptyRoot());
  });

  it('a one-leaf tree roots at the leaf hash', () => {
    expect(merkleRoot([leaf(0)])).toEqual(leaf(0));
  });

  it('a two-leaf tree roots at H(0x01 ‖ l ‖ r)', () => {
    expect(merkleRoot([leaf(0), leaf(1)])).toEqual(hashNode(leaf(0), leaf(1)));
  });

  it('leaf and node hashing are domain-separated', () => {
    // Without the 0x00/0x01 prefixes an internal node hash could be presented as a leaf —
    // a second-preimage attack that fakes membership. One byte is the entire defence.
    const data = new Uint8Array([1, 2, 3]);
    expect(hashLeaf(data)).not.toEqual(hashNode(data, new Uint8Array(0)));
  });

  it('appending changes the root', () => {
    expect(merkleRoot(tree(4))).not.toEqual(merkleRoot(tree(5)));
  });
});

describe('inclusion proofs', () => {
  it('verify for every leaf at every tree size up to 33', () => {
    for (let size = 1; size <= 33; size += 1) {
      const leaves = tree(size);
      const root = merkleRoot(leaves);
      for (let i = 0; i < size; i += 1) {
        const path = inclusionPath(leaves, i);
        expect(verifyInclusion(leaves[i]!, i, size, path, root), `size=${size} i=${i}`).toBe(true);
      }
    }
  });

  it('reject a proof for the wrong leaf', () => {
    const leaves = tree(8);
    const root = merkleRoot(leaves);
    expect(verifyInclusion(leaf(99), 3, 8, inclusionPath(leaves, 3), root)).toBe(false);
  });

  it('reject a proof presented at the wrong index', () => {
    const leaves = tree(8);
    const root = merkleRoot(leaves);
    expect(verifyInclusion(leaves[3]!, 4, 8, inclusionPath(leaves, 3), root)).toBe(false);
  });

  it('reject a proof against the wrong root', () => {
    const leaves = tree(8);
    expect(verifyInclusion(leaves[3]!, 3, 8, inclusionPath(leaves, 3), merkleRoot(tree(9)))).toBe(
      false,
    );
  });

  it('reject a padded proof', () => {
    // Leftover path elements must fail. Accepting them would let an attacker append hashes
    // until the computation happened to land on the expected root.
    const leaves = tree(8);
    const root = merkleRoot(leaves);
    const padded = [...inclusionPath(leaves, 3), leaf(42)];
    expect(verifyInclusion(leaves[3]!, 3, 8, padded, root)).toBe(false);
  });

  it('reject a truncated proof', () => {
    const leaves = tree(8);
    const root = merkleRoot(leaves);
    expect(verifyInclusion(leaves[3]!, 3, 8, inclusionPath(leaves, 3).slice(0, 1), root)).toBe(
      false,
    );
  });

  it('reject an out-of-range index', () => {
    const leaves = tree(4);
    expect(verifyInclusion(leaves[0]!, 9, 4, [], merkleRoot(leaves))).toBe(false);
  });
});

describe('consistency proofs', () => {
  it('verify for every (old, new) pair up to 24', () => {
    for (let n = 1; n <= 24; n += 1) {
      const leaves = tree(n);
      const newRoot = merkleRoot(leaves);
      for (let m = 1; m <= n; m += 1) {
        const oldRoot = merkleRoot(leaves.slice(0, m));
        const proof = consistencyPath(leaves, m);
        expect(verifyConsistency(m, oldRoot, n, newRoot, proof), `m=${m} n=${n}`).toBe(true);
      }
    }
  });

  it('DETECT A REWRITE — an altered historical leaf breaks consistency', () => {
    // The censorship-evidence property. A node that edits entry 2 after the fact cannot
    // produce a proof that satisfies a client holding the earlier STH.
    const original = tree(8);
    const oldSize = 5;
    const oldRoot = merkleRoot(original.slice(0, oldSize));

    const rewritten = [...original];
    rewritten[2] = leaf(999);

    const proof = consistencyPath(rewritten, oldSize);
    expect(verifyConsistency(oldSize, oldRoot, 8, merkleRoot(rewritten), proof)).toBe(false);
  });

  it('DETECT A DROP — removing an old entry breaks consistency', () => {
    const original = tree(8);
    const oldRoot = merkleRoot(original.slice(0, 5));
    const shortened = original.filter((_, i) => i !== 1);

    const proof = consistencyPath(shortened, 5);
    expect(verifyConsistency(5, oldRoot, shortened.length, merkleRoot(shortened), proof)).toBe(
      false,
    );
  });

  it('reject a shrinking tree', () => {
    expect(verifyConsistency(8, merkleRoot(tree(8)), 4, merkleRoot(tree(4)), [])).toBe(false);
  });

  it('an unchanged tree is consistent with itself and needs no proof', () => {
    const root = merkleRoot(tree(6));
    expect(verifyConsistency(6, root, 6, root, [])).toBe(true);
  });

  it('reject same-size trees with different roots', () => {
    expect(verifyConsistency(6, merkleRoot(tree(6)), 6, merkleRoot(tree(7).slice(1)), [])).toBe(
      false,
    );
  });
});
