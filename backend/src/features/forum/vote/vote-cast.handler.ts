/**
 * T1.20 — `jb:vote:cast:v1`.
 *
 * ── One vote per (author, target), and changing it is not a new vote ────────────────
 * The projection is keyed on `(authorKey, target)`, so re-voting REPLACES rather than
 * accumulates. Without that, an author could inflate a score by re-sending, and — worse for
 * a federated system — the same vote arriving over two transports would count twice.
 *
 * The score is recomputed from the stored delta rather than incremented blindly, so
 * replaying the whole log rebuilds identical scores (P1-G3).
 */

import { VoteCast } from '@jagoo/sdk/proto';
import type { Tx } from '../../../core/domain/domain-handler.js';
import {
  allowed,
  invalid,
  valid,
  type AuthDecision,
  type DomainHandler,
  type ValidationResult,
} from '../../../core/domain/domain-handler.js';
import { Plane, type ParsedEnvelope } from '../../../core/domain/envelope.js';
import type { ProjectionStore } from '../../../core/ports/storage.port.js';
import { POSTS_COLLECTION, type PostDoc } from '../post/post.projection.js';
import { COMMENTS_COLLECTION, type CommentDoc } from '../comment/comment-create.handler.js';
import { IDENTITIES_COLLECTION, type IdentityDoc } from '../shared/membership.projection.js';
import { IdentityFlag } from '../shared/flags.js';
import { hexKey, isCommunityMember, loadAuthContext } from '../shared/permissions.js';

export const VOTES_COLLECTION = 'forum_votes';

export interface VoteDoc {
  readonly id: string;
  readonly authorKey: string;
  readonly target: string;
  readonly value: number;
  readonly updatedAtMs: number;
  /**
   * The envelope this value came from. Carried so the merge below has a deterministic
   * tie-break when two votes share `updatedAtMs` — without it, equal timestamps fall back to
   * arrival order and two nodes can disagree forever.
   */
  readonly contentId: string;
}

/**
 * Which of two votes for the same `(author, target)` wins — the same answer on every node.
 *
 * ── Why this cannot be arrival order ────────────────────────────────────────────────
 * A vote is a REPLACING value, so the projection must converge on one of them, and federation
 * gives no delivery-order guarantee: node A may receive `+1` then `-1`, node B the reverse,
 * and both orderings are legitimate. Merging by arrival meant the two nodes disagreed on the
 * stored value AND on the post's score, permanently, with no error anywhere — the projections
 * simply diverged. That defeats the property the whole design rests on: identical bytes must
 * produce identical projections everywhere (VP-02, ADR-010's reasoning one layer up).
 *
 * ── Why `created_at_ms` and then `content_id` ───────────────────────────────────────
 * Both are inside the signed envelope, so every node compares the same two values and no node
 * needs to have seen the other's clock. `created_at_ms` is the author's own ordering claim;
 * ties break on `content_id`, which is a hash and therefore total, stable and unforgeable-to-
 * a-preferred-value. Author clock skew can misorder one author's own two votes, which is a
 * self-inflicted and bounded harm — it cannot affect anyone else's vote, because the key is
 * per author.
 */
export function voteSupersedes(
  incoming: { readonly createdAtMs: number; readonly contentId: string },
  stored: { readonly updatedAtMs: number; readonly contentId: string } | null,
): boolean {
  if (!stored) return true;
  if (incoming.createdAtMs !== stored.updatedAtMs) return incoming.createdAtMs > stored.updatedAtMs;
  return incoming.contentId > stored.contentId;
}

/** Stable key so a re-vote overwrites rather than appending. */
export function voteKey(authorKeyHex: string, target: string): string {
  return `${authorKeyHex}:${target}`;
}

export class VoteCastHandler implements DomainHandler<VoteCast> {
  readonly domain = 'jb:vote:cast:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): VoteCast {
    return VoteCast.decode(body);
  }

  validate(body: VoteCast, _env: ParsedEnvelope): ValidationResult {
    if (!body.target.startsWith('jb1')) return invalid('target must be a content ID', 'target');
    // -1, 0 (retract), +1. Anything else is an attempt at weighted voting.
    if (![-1, 0, 1].includes(body.value)) return invalid('value must be -1, 0 or +1', 'value');
    return valid;
  }

  async authorize(body: VoteCast, env: ParsedEnvelope): Promise<AuthDecision> {
    const post = await this.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: body.target });
    const comment = post
      ? null
      : await this.projections
          .collection<CommentDoc>(COMMENTS_COLLECTION)
          .findOne({ id: body.target });
    if (!post && !comment) return { allowed: false, reason: 'vote target is not known here' };
    const parent = comment
      ? await this.projections.collection<PostDoc>(POSTS_COLLECTION).findOne({ id: comment.post })
      : post;
    if (!parent) return { allowed: false, reason: 'vote target parent is not known here' };
    if (env.scope && env.scope !== parent.community) {
      return { allowed: false, reason: 'scope does not match the target community' };
    }
    const ctx = await loadAuthContext(
      this.projections,
      hexKey(env.authorKey),
      parent.community,
      Number(env.createdAtMs),
    );
    if (ctx.communityDoc && !isCommunityMember(ctx)) {
      return { allowed: false, reason: 'community membership required' };
    }
    return allowed;
  }

  async project(body: VoteCast, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const authorKey = Buffer.from(env.authorKey).toString('hex');
    const key = voteKey(authorKey, body.target);
    const votes = this.projections.collection<VoteDoc>(VOTES_COLLECTION);

    const previous = await votes.findOne({ id: key });

    // A vote that loses the merge changes nothing at all — not the stored value, and not the
    // score. Returning early rather than writing a zero delta keeps the two in step: the
    // score is only ever moved by the vote that is currently winning.
    if (!voteSupersedes({ createdAtMs: Number(env.createdAtMs), contentId: env.contentId }, previous ?? null)) {
      return;
    }

    const delta = body.value - (previous?.value ?? 0);

    await votes.put(
      key,
      {
        id: key,
        authorKey,
        target: body.target,
        value: body.value,
        updatedAtMs: Number(env.createdAtMs),
        contentId: env.contentId,
      },
      tx,
    );

    if (delta === 0) return;

    // The target may be a post or a comment; try both rather than branching on a
    // `target_kind` the sender controls.
    const posts = this.projections.collection<PostDoc>(POSTS_COLLECTION);
    const post = await posts.findOne({ id: body.target });
    if (post) {
      await posts.put(body.target, { ...post, score: post.score + delta }, tx);
      await this.applyKarma(post.authorKey, 'postKarma', delta, post.createdAtMs, tx);
      return;
    }

    const comments = this.projections.collection<CommentDoc>(COMMENTS_COLLECTION);
    const comment = await comments.findOne({ id: body.target });
    if (comment) {
      await comments.put(body.target, { ...comment, score: comment.score + delta }, tx);
      await this.applyKarma(comment.authorKey, 'commentKarma', delta, comment.createdAtMs, tx);
    }
  }

  private async applyKarma(
    authorKey: string,
    field: 'postKarma' | 'commentKarma',
    delta: number,
    firstSeenAtMs: number,
    tx: Tx,
  ): Promise<void> {
    const identities = this.projections.collection<IdentityDoc>(IDENTITIES_COLLECTION);
    const existing = await identities.findOne({ id: authorKey });
    const identity: IdentityDoc = existing ?? {
      id: authorKey,
      displayName: '',
      bio: '',
      avatar: '',
      banner: '',
      flags: IdentityFlag.ACTIVE.toString(),
      postKarma: 0,
      commentKarma: 0,
      firstSeenAtMs,
    };
    await identities.put(authorKey, { ...identity, [field]: identity[field] + delta }, tx);
  }
}
