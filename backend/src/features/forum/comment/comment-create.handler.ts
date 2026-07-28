/**
 * T1.19 — `jb:comment:create:v1`.
 *
 * Threading is by CONTENT ID, both for the post and for the parent comment. A row ID would
 * be meaningless on any other instance, which is the specific defect that made v1
 * federation impossible (ID-01) — a comment federated to another node has to be able to
 * find what it replies to.
 *
 * `depth` is precomputed at projection time so rendering a thread is one query rather than
 * a recursive walk per view.
 */

import { CommentCreate } from '@jagoo/sdk/proto';
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

export const COMMENTS_COLLECTION = 'forum_comments';
export const MAX_COMMENT_CHARS = 10000;
/** MOD-11: beyond this, replies attach to the deepest visible ancestor rather than nesting. */
export const MAX_DEPTH = 8;

export interface CommentDoc {
  readonly contentId: string;
  readonly authorKey: string;
  readonly post: string;
  readonly parentComment: string;
  readonly bodyMarkdown: string;
  readonly attachments: readonly string[];
  readonly depth: number;
  readonly createdAtMs: number;
  readonly removed: boolean;
  readonly removedReason: string | null;
  readonly score: number;
}

export class CommentCreateHandler implements DomainHandler<CommentCreate> {
  readonly domain = 'jb:comment:create:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): CommentCreate {
    return CommentCreate.decode(body);
  }

  validate(body: CommentCreate, _env: ParsedEnvelope): ValidationResult {
    if (!body.post.startsWith('jb1')) {
      return invalid('post must be a content ID', 'post');
    }
    if (body.parent_comment && !body.parent_comment.startsWith('jb1')) {
      return invalid('parent_comment must be a content ID', 'parent_comment');
    }
    const text = body.body_markdown.trim();
    if (text.length === 0) return invalid('comment body is required', 'body_markdown');
    if ([...text].length > MAX_COMMENT_CHARS) {
      return invalid(`comment exceeds ${MAX_COMMENT_CHARS} characters`, 'body_markdown');
    }
    return valid;
  }

  async authorize(body: CommentCreate, _env: ParsedEnvelope): Promise<AuthDecision> {
    // The post must exist here. This is NOT an approval gate — it is referential integrity,
    // and it is why federation backfills parents before children.
    const post = await this.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: body.post });
    if (!post) return { allowed: false, reason: 'the post being commented on is not known here' };
    return allowed;
  }

  async project(body: CommentCreate, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const comments = this.projections.collection<CommentDoc>(COMMENTS_COLLECTION);

    let depth = 0;
    if (body.parent_comment) {
      const parent = await comments.findOne({ id: body.parent_comment });
      depth = parent ? Math.min(parent.depth + 1, MAX_DEPTH) : 0;
    }

    const doc: CommentDoc = {
      contentId: env.contentId,
      authorKey: Buffer.from(env.authorKey).toString('hex'),
      post: body.post,
      parentComment: body.parent_comment,
      bodyMarkdown: body.body_markdown,
      attachments: [...body.attachments],
      depth,
      createdAtMs: Number(env.createdAtMs),
      removed: false,
      removedReason: null,
      score: 0,
    };
    await comments.put(env.contentId, doc, tx);

    const post = await this.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: body.post });
    if (post) {
      await this.projections
        .collection<PostDoc>(POSTS_COLLECTION)
        .put(body.post, { ...post, commentCount: post.commentCount + 1 }, tx);
    }
  }
}
