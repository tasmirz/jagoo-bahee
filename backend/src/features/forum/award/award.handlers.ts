/**
 * T1.26 — `jb:award:give:v1`, `jb:award:type:v1` (AWD-01 … AWD-09).
 *
 * ── AWD-09: an anonymous award must not be deanonymisable from the projection ───────
 * The giver's key is unavoidably in the signed envelope — that is what makes the award
 * authentic. But the PROJECTION stores only an anonymity flag and omits the giver, and the
 * read API never exposes a giver for an anonymous award. Someone reading the database
 * directly still cannot answer "who gave this", which is the property that matters when
 * the database is the thing that gets seized.
 */

import { AwardGive, AwardTypeDefine } from '@jagoo/sdk/proto';
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
import { IdentityFlag, hasFlag } from '../shared/flags.js';
import { hexKey } from '../shared/permissions.js';
import { IDENTITIES_COLLECTION, type IdentityDoc } from '../shared/membership.projection.js';
import { COMMENTS_COLLECTION, type CommentDoc } from '../comment/comment-create.handler.js';
import { POSTS_COLLECTION, type PostDoc } from '../post/post.projection.js';
import { addNotification } from '../shared/notification.projection.js';
import { isCommunityMember, loadAuthContext } from '../shared/permissions.js';

export const AWARDS_COLLECTION = 'forum_awards';
export const AWARD_TYPES_COLLECTION = 'forum_award_types';

const MAX_AWARD_MESSAGE = 200;
const AWARD_SLUG_PATTERN = /^[a-z0-9_-]{2,32}$/;

export interface AwardDoc {
  /** content ID of the AwardGive envelope. */
  readonly id: string;
  readonly target: string;
  readonly targetKind: number;
  readonly awardType: string;
  readonly anonymous: boolean;
  /** null whenever `anonymous` is true — see the header. */
  readonly giverKey: string | null;
  readonly message: string;
  readonly createdAtMs: number;
}

export interface AwardTypeDoc {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly icon: string;
  readonly cost: number;
  readonly active: boolean;
  readonly definedAtMs: number;
}

export class AwardGiveHandler implements DomainHandler<AwardGive> {
  readonly domain = 'jb:award:give:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): AwardGive {
    return AwardGive.decode(body);
  }

  validate(body: AwardGive, _env: ParsedEnvelope): ValidationResult {
    if (!body.target.startsWith('jb1')) return invalid('target must be a content ID', 'target');
    if (!body.award_type) return invalid('award_type is required', 'award_type');
    if ([...body.message].length > MAX_AWARD_MESSAGE) {
      return invalid(`message exceeds ${MAX_AWARD_MESSAGE} characters`, 'message');
    }
    return valid;
  }

  async authorize(body: AwardGive, env: ParsedEnvelope): Promise<AuthDecision> {
    const type = await this.projections
      .collection<AwardTypeDoc>(AWARD_TYPES_COLLECTION)
      .findOne({ id: body.award_type });
    if (!type) return denied('award type is not defined on this instance');
    if (!type.active) return denied('award type is not active');
    const post = await this.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: body.target });
    const comment = post
      ? null
      : await this.projections
          .collection<CommentDoc>(COMMENTS_COLLECTION)
          .findOne({ id: body.target });
    if (!post && !comment) return denied('award target is not known here');
    const parent = comment
      ? await this.projections.collection<PostDoc>(POSTS_COLLECTION).findOne({ id: comment.post })
      : post;
    if (!parent) return denied('award target parent is not known here');
    if (env.scope && env.scope !== parent.community) {
      return denied('scope does not match the target community');
    }
    const ctx = await loadAuthContext(
      this.projections,
      hexKey(env.authorKey),
      parent.community,
      Number(env.createdAtMs),
    );
    if (ctx.communityDoc && !isCommunityMember(ctx)) {
      return denied('community membership required');
    }
    return allowed;
  }

  async project(body: AwardGive, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const doc: AwardDoc = {
      id: env.contentId,
      target: body.target,
      targetKind: body.target_kind,
      awardType: body.award_type,
      anonymous: body.anonymous,
      // AWD-09. The envelope still carries the key; the projection deliberately does not.
      giverKey: body.anonymous ? null : hexKey(env.authorKey),
      message: body.message,
      createdAtMs: Number(env.createdAtMs),
    };
    await this.projections.collection<AwardDoc>(AWARDS_COLLECTION).put(doc.id, doc, tx);
    const post = await this.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: body.target });
    const comment = post
      ? null
      : await this.projections
          .collection<CommentDoc>(COMMENTS_COLLECTION)
          .findOne({ id: body.target });
    const recipientKey = post?.authorKey ?? comment?.authorKey;
    if (post) {
      await this.projections
        .collection<PostDoc>(POSTS_COLLECTION)
        .put(post.contentId, { ...post, awardCount: post.awardCount + 1 }, tx);
    } else if (comment) {
      await this.projections
        .collection<CommentDoc>(COMMENTS_COLLECTION)
        .put(comment.contentId, { ...comment, awardCount: comment.awardCount + 1 }, tx);
    }
    if (recipientKey) {
      await addNotification(
        this.projections,
        {
          recipientKey,
          kind: 'award',
          contentId: env.contentId,
          actorKey: hexKey(env.authorKey),
          createdAtMs: Number(env.createdAtMs),
        },
        tx,
      );
    }
  }
}

export class AwardTypeDefineHandler implements DomainHandler<AwardTypeDefine> {
  readonly domain = 'jb:award:type:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): AwardTypeDefine {
    return AwardTypeDefine.decode(body);
  }

  validate(body: AwardTypeDefine, _env: ParsedEnvelope): ValidationResult {
    if (!AWARD_SLUG_PATTERN.test(body.slug)) {
      return invalid('slug must be 2-32 lowercase letters, digits, - or _', 'slug');
    }
    if (!body.name.trim()) return invalid('name is required', 'name');
    if (body.cost < 0) return invalid('cost cannot be negative', 'cost');
    return valid;
  }

  async authorize(_body: AwardTypeDefine, env: ParsedEnvelope): Promise<AuthDecision> {
    // AWD-02: instance-level, so it is gated on the identity bitmap rather than on any
    // community's permission mask.
    const identity = await this.projections
      .collection<IdentityDoc>(IDENTITIES_COLLECTION)
      .findOne({ id: hexKey(env.authorKey) });
    if (!identity || !hasFlag(BigInt(identity.flags), IdentityFlag.GLOBAL_ADMIN)) {
      return denied('defining award types requires instance admin');
    }
    return allowed;
  }

  async project(body: AwardTypeDefine, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const doc: AwardTypeDoc = {
      id: body.slug,
      slug: body.slug,
      name: body.name,
      icon: body.icon,
      cost: body.cost,
      active: body.active,
      definedAtMs: Number(env.createdAtMs),
    };
    await this.projections.collection<AwardTypeDoc>(AWARD_TYPES_COLLECTION).put(doc.id, doc, tx);
  }
}
