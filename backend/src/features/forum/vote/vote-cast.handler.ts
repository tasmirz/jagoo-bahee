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

export const VOTES_COLLECTION = 'forum_votes';

export interface VoteDoc {
  readonly id: string;
  readonly authorKey: string;
  readonly target: string;
  readonly value: number;
  readonly updatedAtMs: number;
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

  async authorize(_body: VoteCast, _env: ParsedEnvelope): Promise<AuthDecision> {
    return allowed;
  }

  async project(body: VoteCast, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const authorKey = Buffer.from(env.authorKey).toString('hex');
    const key = voteKey(authorKey, body.target);
    const votes = this.projections.collection<VoteDoc>(VOTES_COLLECTION);

    const previous = await votes.findOne({ id: key });
    const delta = body.value - (previous?.value ?? 0);

    await votes.put(
      key,
      {
        id: key,
        authorKey,
        target: body.target,
        value: body.value,
        updatedAtMs: Number(env.createdAtMs),
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
      return;
    }

    const comments = this.projections.collection<CommentDoc>(COMMENTS_COLLECTION);
    const comment = await comments.findOne({ id: body.target });
    if (comment) {
      await comments.put(body.target, { ...comment, score: comment.score + delta }, tx);
    }
  }
}
