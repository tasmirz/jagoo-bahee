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
  denied,
  invalid,
  valid,
  type AuthDecision,
  type DomainHandler,
  type ValidationResult,
} from '../../../core/domain/domain-handler.js';
import { Plane, type ParsedEnvelope } from '../../../core/domain/envelope.js';
import type { ProjectionStore } from '../../../core/ports/storage.port.js';
import { POSTS_COLLECTION, type PostDoc } from '../post/post.projection.js';
import { addMentionNotifications, addNotification } from '../shared/notification.projection.js';
import { canPost, hexKey, loadAuthContext } from '../shared/permissions.js';
import { ATTACHMENTS_COLLECTION, type AttachmentDoc } from '../attachment/attachment.handler.js';

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
  readonly collapsed: boolean;
  readonly flagged: boolean;
  readonly approved: boolean;
  readonly score: number;
  readonly replyCount: number;
  readonly awardCount: number;
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

  async authorize(body: CommentCreate, env: ParsedEnvelope): Promise<AuthDecision> {
    // The post must exist here. This is NOT an approval gate — it is referential integrity,
    // and it is why federation backfills parents before children.
    const post = await this.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: body.post });
    if (!post) return { allowed: false, reason: 'the post being commented on is not known here' };
    const authorKey = hexKey(env.authorKey);
    const attachments = this.projections.collection<AttachmentDoc>(ATTACHMENTS_COLLECTION);
    for (const id of body.attachments) {
      if (!id.startsWith('jb1')) continue;
      const attachment = await attachments.findOne({ id });
      if (!attachment) return denied(`attachment ${id} is not known here`);
      if (attachment.ownerKey !== authorKey) {
        return denied(`attachment ${id} belongs to another identity`);
      }
    }
    const ctx = await loadAuthContext(
      this.projections,
      authorKey,
      post.community,
      Number(env.createdAtMs),
    );
    if (ctx.communityDoc?.archived) return denied('the community is archived');
    if (ctx.communityDoc && !canPost(ctx)) return denied('post.create permission required');
    if (post.locked) return denied('the post is locked');
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
      collapsed: false,
      flagged: false,
      approved: false,
      score: 0,
      replyCount: 0,
      awardCount: 0,
    };
    await comments.put(env.contentId, doc, tx);

    const post = await this.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: body.post });
    if (post) {
      await this.projections
        .collection<PostDoc>(POSTS_COLLECTION)
        .put(body.post, { ...post, commentCount: post.commentCount + 1 }, tx);

      const parent = body.parent_comment
        ? await comments.findOne({ id: body.parent_comment })
        : null;
      if (parent) {
        await comments.put(parent.contentId, { ...parent, replyCount: parent.replyCount + 1 }, tx);
      }
      await addNotification(
        this.projections,
        {
          recipientKey: parent?.authorKey ?? post.authorKey,
          kind: 'reply',
          contentId: env.contentId,
          actorKey: doc.authorKey,
          createdAtMs: doc.createdAtMs,
        },
        tx,
      );
    }
    await addMentionNotifications(
      this.projections,
      body.body_markdown,
      env.contentId,
      doc.authorKey,
      doc.createdAtMs,
      tx,
    );
  }
}
