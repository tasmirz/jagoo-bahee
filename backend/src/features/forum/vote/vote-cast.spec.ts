/**
 * The merge rule for `jb:vote:cast:v1`, and the property it exists to hold.
 *
 * A vote REPLACES rather than accumulates, so when two votes for the same `(author, target)`
 * exist the projection must pick one — and every node must pick the SAME one. Federation
 * gives no ordering guarantee: node A can receive `+1` then `-1` while node B receives them
 * in the opposite order, and both are legitimate deliveries.
 *
 * The handler used to merge by arrival: it read the previous row, computed a delta, and wrote
 * the incoming value unconditionally. Two nodes given the same two envelopes in different
 * orders therefore ended with different stored values and different post scores, permanently,
 * with nothing logged and no error raised. These tests are the falsifying case for that.
 */

import { describe, expect, it } from 'vitest';
import { voteSupersedes } from './vote-cast.handler.js';

interface Vote {
  readonly createdAtMs: number;
  readonly contentId: string;
  readonly value: number;
}

/** Fold votes in the given delivery order under the merge rule, returning the winner. */
function applyInOrder(order: readonly Vote[]): Vote | null {
  let stored: Vote | null = null;
  for (const incoming of order) {
    if (voteSupersedes(incoming, stored ? { updatedAtMs: stored.createdAtMs, contentId: stored.contentId } : null)) {
      stored = incoming;
    }
  }
  return stored;
}

describe('vote merge — convergence under out-of-order federated delivery', () => {
  it('picks the author’s later vote regardless of which arrives first', () => {
    const earlier: Vote = { createdAtMs: 1_000, contentId: 'jb1aaa', value: 1 };
    const later: Vote = { createdAtMs: 2_000, contentId: 'jb1bbb', value: -1 };

    expect(applyInOrder([earlier, later])).toEqual(later);
    expect(applyInOrder([later, earlier])).toEqual(later);
  });

  it('breaks a timestamp tie the same way on every node', () => {
    // Equal `created_at_ms` is not exotic: a client casting and correcting within the same
    // millisecond produces it, and so does a coarse clock. Arrival order must still not decide.
    const a: Vote = { createdAtMs: 5_000, contentId: 'jb1aaa', value: 1 };
    const b: Vote = { createdAtMs: 5_000, contentId: 'jb1bbb', value: -1 };

    expect(applyInOrder([a, b])).toEqual(b);
    expect(applyInOrder([b, a])).toEqual(b);
  });

  it('is order-independent across every permutation of three votes', () => {
    const votes: Vote[] = [
      { createdAtMs: 1_000, contentId: 'jb1ccc', value: 1 },
      { createdAtMs: 3_000, contentId: 'jb1aaa', value: -1 },
      { createdAtMs: 3_000, contentId: 'jb1bbb', value: 1 },
    ];

    const permutations: Vote[][] = [];
    for (const i of [0, 1, 2]) {
      for (const j of [0, 1, 2]) {
        for (const k of [0, 1, 2]) {
          if (i === j || j === k || i === k) continue;
          permutations.push([votes[i] as Vote, votes[j] as Vote, votes[k] as Vote]);
        }
      }
    }
    expect(permutations).toHaveLength(6);

    const winners = permutations.map((order) => applyInOrder(order));
    // The winner is the highest `created_at_ms`, then the highest `content_id`: 3000/jb1bbb.
    for (const winner of winners) expect(winner).toEqual(votes[2]);
  });

  it('accepts the first vote when nothing is stored', () => {
    expect(voteSupersedes({ createdAtMs: 1, contentId: 'jb1aaa' }, null)).toBe(true);
  });

  it('refuses a replay of the identical envelope', () => {
    // Not a correctness requirement on its own — step 11 dedupes by content id — but the merge
    // must not treat a re-delivery as a newer value, or a replayed envelope would re-apply a
    // delta and move the score twice.
    const same = { createdAtMs: 9_000, contentId: 'jb1aaa' };
    expect(voteSupersedes(same, { updatedAtMs: 9_000, contentId: 'jb1aaa' })).toBe(false);
  });

  it('refuses a vote older than the stored one', () => {
    expect(
      voteSupersedes({ createdAtMs: 1_000, contentId: 'jb1zzz' }, { updatedAtMs: 2_000, contentId: 'jb1aaa' }),
    ).toBe(false);
  });
});
