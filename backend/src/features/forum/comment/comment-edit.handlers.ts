/**
 * T1.19 — `jb:comment:update:v1`, `jb:comment:delete:v1`.
 *
 * Same ownership and tombstone rules as posts (see `post-edit.handlers.ts`), with one
 * difference: deleting a comment does NOT decrement the parent post's comment count. The
 * comment row survives as a tombstone and still occupies its place in the thread, so a
 * count that dropped would disagree with what the thread actually renders.
 */

import { CommentDelete, CommentUpdate } from '@jagoo/sdk/proto';
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
import { hexKey } from '../shared/permissions.js';
import { COMMENTS_COLLECTION, MAX_COMMENT_CHARS, type CommentDoc } from './comment-create.handler.js';

export class CommentUpdateHandler implements DomainHandler<CommentUpdate> {
  readonly domain = 'jb:comment:update:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): CommentUpdate {
    return CommentUpdate.decode(body);
  }

  validate(body: CommentUpdate, _env: ParsedEnvelope): ValidationResult {
    if (!body.target.startsWith('jb1')) return invalid('target must be a content ID', 'target');
    const text = body.body_markdown.trim();
    if (text.length === 0) return invalid('comment body is required', 'body_markdown');
    if ([...text].length > MAX_COMMENT_CHARS) {
      return invalid(`comment exceeds ${MAX_COMMENT_CHARS} characters`, 'body_markdown');
    }
    return valid;
  }

  async authorize(body: CommentUpdate, env: ParsedEnvelope): Promise<AuthDecision> {
    const comment = await this.projections
      .collection<CommentDoc>(COMMENTS_COLLECTION)
      .findOne({ id: body.target });
    if (!comment) return denied('comment is not known here');
    if (comment.authorKey !== hexKey(env.authorKey)) {
      return denied('only the author may edit a comment');
    }
    if (comment.removed) return denied('a removed comment cannot be edited');
    return allowed;
  }

  async project(body: CommentUpdate, _env: ParsedEnvelope, tx: Tx): Promise<void> {
    const comments = this.projections.collection<CommentDoc>(COMMENTS_COLLECTION);
    const comment = await comments.findOne({ id: body.target });
    if (!comment) return;
    await comments.put(body.target, { ...comment, bodyMarkdown: body.body_markdown }, tx);
  }
}

export class CommentDeleteHandler implements DomainHandler<CommentDelete> {
  readonly domain = 'jb:comment:delete:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): CommentDelete {
    return CommentDelete.decode(body);
  }

  validate(body: CommentDelete, _env: ParsedEnvelope): ValidationResult {
    if (!body.target.startsWith('jb1')) return invalid('target must be a content ID', 'target');
    return valid;
  }

  async authorize(body: CommentDelete, env: ParsedEnvelope): Promise<AuthDecision> {
    const comment = await this.projections
      .collection<CommentDoc>(COMMENTS_COLLECTION)
      .findOne({ id: body.target });
    if (!comment) return denied('comment is not known here');
    if (comment.authorKey !== hexKey(env.authorKey)) {
      return denied('only the author may delete their comment');
    }
    return allowed;
  }

  async project(body: CommentDelete, _env: ParsedEnvelope, tx: Tx): Promise<void> {
    const comments = this.projections.collection<CommentDoc>(COMMENTS_COLLECTION);
    const comment = await comments.findOne({ id: body.target });
    if (!comment) return;
    // The row stays in the thread; only the body is withheld. See the header.
    await comments.put(
      body.target,
      { ...comment, removed: true, removedReason: body.reason || 'deleted by the author' },
      tx,
    );
  }
}
