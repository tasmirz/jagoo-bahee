/**
 * T1.18 — `jb:post:create:v1`.
 *
 * The reference `DomainHandler`. Adding this feature required a registry row and this file
 * and touched no core code — which is exactly what P1-G11 asserts.
 *
 * The four methods are separated by when they may touch the world:
 *   decode      bytes → typed body
 *   validate    PURE. No I/O, no clock, no random. Unit-testable with nothing wired up.
 *   authorize   reads projections, writes nothing
 *   project     writes, inside the transaction shared with the witness append
 */

import { PostCreate, PostKind } from '@jagoo/sdk/proto';
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
import { POSTS_COLLECTION, type PostDoc } from './post.projection.js';
import { addMentionNotifications } from '../shared/notification.projection.js';
import { canPost, hexKey, loadAuthContext } from '../shared/permissions.js';
import { COMMUNITIES_COLLECTION, type CommunityDoc } from '../community/community.projection.js';
import { ATTACHMENTS_COLLECTION, type AttachmentDoc } from '../attachment/attachment.handler.js';

/** PST-02. Counted in CODE POINTS, not UTF-8 bytes — see the note in `validate`. */
export const MAX_TITLE_CHARS = 300;
export const MAX_BODY_CHARS = 40000;

export class PostCreateHandler implements DomainHandler<PostCreate> {
  readonly domain = 'jb:post:create:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): PostCreate {
    return PostCreate.decode(body);
  }

  validate(body: PostCreate, env: ParsedEnvelope): ValidationResult {
    if (!env.scope) {
      return invalid('a post must name the community it belongs to', 'scope');
    }

    const title = body.title.trim();
    if (title.length === 0) return invalid('title is required', 'title');

    // Counted with the spread operator so it counts CODE POINTS, not UTF-16 units. Bangla
    // is the primary language here; `"পানি".length` over-counts nothing but emoji and
    // surrogate pairs would, and a limit that silently differs per script is a limit that
    // rejects legitimate Bangla while accepting the same-length English.
    const titleChars = [...title].length;
    if (titleChars > MAX_TITLE_CHARS) {
      return invalid(`title exceeds ${MAX_TITLE_CHARS} characters`, 'title');
    }

    if ([...body.body_markdown].length > MAX_BODY_CHARS) {
      return invalid(`body exceeds ${MAX_BODY_CHARS} characters`, 'body_markdown');
    }

    // ID-01: an attachment reference is a content ID, never a row ID — a row ID is
    // meaningless on any other instance and is what made v1 federation impossible.
    for (const attachment of body.attachments) {
      if (!attachment.startsWith('jb1')) {
        return invalid('attachment references must be content IDs', 'attachments');
      }
    }

    if (body.crosspost_of && !body.crosspost_of.startsWith('jb1')) {
      return invalid('crosspost_of must be a content ID', 'crosspost_of');
    }
    if (body.kind === PostKind.POST_KIND_UNSPECIFIED) {
      return invalid('post kind is required', 'kind');
    }
    if (body.kind === PostKind.POST_KIND_LINK && !body.url) {
      return invalid('a link post requires a URL', 'url');
    }
    if (
      [PostKind.POST_KIND_IMAGE, PostKind.POST_KIND_VIDEO].includes(body.kind) &&
      body.attachments.length === 0
    ) {
      return invalid('a media post requires an attachment', 'attachments');
    }
    if (body.kind === PostKind.POST_KIND_CROSSPOST && !body.crosspost_of) {
      return invalid('a crosspost requires crosspost_of', 'crosspost_of');
    }
    if (body.kind === PostKind.POST_KIND_POLL) {
      if (!body.poll?.question.trim()) return invalid('a poll requires a question', 'poll');
      if (body.poll.options.length < 2) {
        return invalid('a poll requires at least two options', 'poll.options');
      }
      if (body.poll.options.some((option) => option.trim().length === 0)) {
        return invalid('poll options cannot be empty', 'poll.options');
      }
    }

    return valid;
  }

  async authorize(body: PostCreate, env: ParsedEnvelope): Promise<AuthDecision> {
    const authorKey = hexKey(env.authorKey);
    const attachments = this.projections.collection<AttachmentDoc>(ATTACHMENTS_COLLECTION);
    for (const id of body.attachments) {
      // Syntax belongs to step 15. Do not turn a malformed reference into a step-14
      // ownership failure merely because authorisation runs first.
      if (!id.startsWith('jb1')) continue;
      const attachment = await attachments.findOne({ id });
      if (!attachment) return denied(`attachment ${id} is not known here`);
      if (attachment.ownerKey !== authorKey) {
        return denied(`attachment ${id} belongs to another identity`);
      }
    }
    if (body.crosspost_of.startsWith('jb1')) {
      const source = await this.projections
        .collection<PostDoc>(POSTS_COLLECTION)
        .findOne({ id: body.crosspost_of });
      if (!source) return denied('crosspost source is not known here');
    }
    const ctx = await loadAuthContext(
      this.projections,
      authorKey,
      env.scope,
      Number(env.createdAtMs),
    );
    // A missing projection can occur during ordered federation backfill. Once community
    // state is known, all authoring policy is enforced from its signed projection.
    if (!ctx.communityDoc) return allowed;
    if (ctx.communityDoc.archived) return denied('the community is archived');
    if (!canPost(ctx)) return denied('post.create permission required');

    const settings = ctx.communityDoc.settings;
    const kindAllowed =
      (body.kind === PostKind.POST_KIND_TEXT && settings.allowTextPosts) ||
      (body.kind === PostKind.POST_KIND_LINK && settings.allowLinkPosts) ||
      (body.kind === PostKind.POST_KIND_IMAGE && settings.allowImagePosts) ||
      (body.kind === PostKind.POST_KIND_VIDEO && settings.allowVideoPosts) ||
      body.kind === PostKind.POST_KIND_POLL ||
      (body.kind === PostKind.POST_KIND_CROSSPOST && settings.allowCrossposts);
    if (!kindAllowed) return denied('this post kind is disabled in the community');

    const karma = (ctx.identity?.postKarma ?? 0) + (ctx.identity?.commentKarma ?? 0);
    if (karma < settings.minimumKarmaToPost) {
      return denied(`minimum karma to post is ${settings.minimumKarmaToPost}`);
    }
    const minimumAgeMs = settings.minimumAccountAgeDays * 24 * 60 * 60 * 1000;
    if (
      minimumAgeMs > 0 &&
      (!ctx.identity || Number(env.createdAtMs) - ctx.identity.firstSeenAtMs < minimumAgeMs)
    ) {
      return denied(`minimum account age is ${settings.minimumAccountAgeDays} days`);
    }
    return allowed;
  }

  async project(body: PostCreate, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const doc: PostDoc = {
      contentId: env.contentId,
      authorKey: Buffer.from(env.authorKey).toString('hex'),
      community: env.scope,
      title: body.title.trim(),
      kind: body.kind,
      bodyMarkdown: body.body_markdown,
      url: body.url,
      attachments: [...body.attachments],
      flair: body.flair,
      poll: body.poll
        ? {
            question: body.poll.question,
            options: [...body.poll.options],
            multiple: body.poll.multiple,
            closesAtMs: Number(body.poll.closes_at_ms),
          }
        : null,
      crosspostOf: body.crosspost_of,
      flags: {
        nsfw: body.flags?.nsfw ?? false,
        spoiler: body.flags?.spoiler ?? false,
        oc: body.flags?.oc ?? false,
      },
      createdAtMs: Number(env.createdAtMs),
      editedAtMs: null,
      removed: false,
      removedReason: null,
      locked: false,
      pinned: false,
      flagged: false,
      approved: false,
      score: 0,
      commentCount: 0,
      awardCount: 0,
    };
    await this.projections.collection<PostDoc>(POSTS_COLLECTION).put(env.contentId, doc, tx);
    const communities = this.projections.collection<CommunityDoc>(COMMUNITIES_COLLECTION);
    const community = await communities.findOne({ id: env.scope });
    if (community) {
      await communities.put(env.scope, { ...community, postCount: community.postCount + 1 }, tx);
    }
    await addMentionNotifications(
      this.projections,
      `${body.title}\n${body.body_markdown}`,
      env.contentId,
      doc.authorKey,
      doc.createdAtMs,
      tx,
    );
  }
}
