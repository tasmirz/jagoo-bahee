/**
 * T1.18 — `jb:post:update:v1`, `jb:post:delete:v1`.
 *
 * ── Ownership is a key comparison, not a session lookup ─────────────────────────────
 * The author of the update envelope must be the author of the post. Both are public keys
 * that were signed over, so the check needs no session, no account row, and works
 * identically on a federated copy of the post (VIS-02).
 *
 * ── Delete is a tombstone (FM-08, PST-12) ───────────────────────────────────────────
 * The row survives with `removed: true`. Content ID, author and timestamp stay visible;
 * only the body is withheld. A post that vanished completely would be indistinguishable
 * from one that had been censored, which is the property VIS-06 exists to prevent.
 */

import { PostDelete, PostUpdate } from '@jagoo/sdk/proto';
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
import { MAX_BODY_CHARS } from './post-create.handler.js';
import { POSTS_COLLECTION, type PostDoc } from './post.projection.js';

export class PostUpdateHandler implements DomainHandler<PostUpdate> {
  readonly domain = 'jb:post:update:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): PostUpdate {
    return PostUpdate.decode(body);
  }

  validate(body: PostUpdate, _env: ParsedEnvelope): ValidationResult {
    if (!body.target.startsWith('jb1')) return invalid('target must be a content ID', 'target');
    if ([...body.body_markdown].length > MAX_BODY_CHARS) {
      return invalid(`body exceeds ${MAX_BODY_CHARS} characters`, 'body_markdown');
    }
    return valid;
  }

  async authorize(body: PostUpdate, env: ParsedEnvelope): Promise<AuthDecision> {
    const post = await this.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: body.target });
    if (!post) return denied('post is not known here');
    if (post.authorKey !== hexKey(env.authorKey)) return denied('only the author may edit a post');
    // A removed post stays removed. Editing it back into view would let an author undo a
    // moderator, and the mod log would still say it was removed.
    if (post.removed) return denied('a removed post cannot be edited');
    return allowed;
  }

  async project(body: PostUpdate, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const posts = this.projections.collection<PostDoc>(POSTS_COLLECTION);
    const post = await posts.findOne({ id: body.target });
    if (!post) return;

    // The title is immutable. An edit that could rewrite the title turns a post people
    // upvoted into a different post; the body is editable, the claim is not.
    await posts.put(
      body.target,
      {
        ...post,
        bodyMarkdown: body.body_markdown,
        flair: body.flair || post.flair,
        flags: body.flags
          ? {
              nsfw: body.flags.nsfw,
              spoiler: body.flags.spoiler,
              oc: body.flags.oc,
            }
          : post.flags,
        editedAtMs: Number(env.createdAtMs),
      },
      tx,
    );
  }
}

export class PostDeleteHandler implements DomainHandler<PostDelete> {
  readonly domain = 'jb:post:delete:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): PostDelete {
    return PostDelete.decode(body);
  }

  validate(body: PostDelete, _env: ParsedEnvelope): ValidationResult {
    if (!body.target.startsWith('jb1')) return invalid('target must be a content ID', 'target');
    return valid;
  }

  async authorize(body: PostDelete, env: ParsedEnvelope): Promise<AuthDecision> {
    const post = await this.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: body.target });
    if (!post) return denied('post is not known here');
    if (post.authorKey !== hexKey(env.authorKey)) {
      return denied('only the author may delete their post');
    }
    return allowed;
  }

  async project(body: PostDelete, _env: ParsedEnvelope, tx: Tx): Promise<void> {
    const posts = this.projections.collection<PostDoc>(POSTS_COLLECTION);
    const post = await posts.findOne({ id: body.target });
    if (!post) return;
    await posts.put(
      body.target,
      { ...post, removed: true, removedReason: body.reason || 'deleted by the author' },
      tx,
    );
  }
}
