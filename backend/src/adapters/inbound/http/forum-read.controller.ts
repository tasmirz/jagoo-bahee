/**
 * T1.31 — Forum read surface. Mutations stay exclusively on POST /v1/envelopes.
 *
 * Every content response is hydrated with the signed envelope and persisted receipt so
 * clients can verify authorship and Merkle inclusion without trusting rendered fields.
 */

import { Controller, Get, Headers, HttpException, Inject, Param, Query } from '@nestjs/common';
import { identityId } from '@jagoo/sdk/core';
import { parseEnvelope } from '../../../core/domain/pipeline/parse.js';
import { EnvelopeReader, ProjectionStore } from '../../../core/ports/storage.port.js';
import { WitnessLog } from '../../../core/ports/transparency.port.js';
import { SessionAuth } from '../../../core/ports/auth.port.js';
import { TaggedCache } from '../../../core/ports/cache.port.js';
import { NodeSigner } from '../../../core/ports/node-signer.port.js';
import { POSTS_COLLECTION, type PostDoc } from '../../../features/forum/post/post.projection.js';
import {
  COMMENTS_COLLECTION,
  type CommentDoc,
} from '../../../features/forum/comment/comment-create.handler.js';
import {
  COMMUNITIES_COLLECTION,
  type CommunityDoc,
} from '../../../features/forum/community/community.projection.js';
import {
  IDENTITIES_COLLECTION,
  MEMBERSHIPS_COLLECTION,
  ROLES_COLLECTION,
  type IdentityDoc,
  type MembershipDoc,
  type RoleDoc,
} from '../../../features/forum/shared/membership.projection.js';
import {
  MOD_EVENTS_COLLECTION,
  verifyModChain,
  type ModEventDoc,
} from '../../../features/forum/moderation/moderation.projection.js';
import {
  REPORTS_COLLECTION,
  type ReportDoc,
} from '../../../features/forum/report/report.handlers.js';
import {
  AWARDS_COLLECTION,
  AWARD_TYPES_COLLECTION,
  type AwardDoc,
  type AwardTypeDoc,
} from '../../../features/forum/award/award.handlers.js';
import {
  BLOCKS_COLLECTION,
  FEED_PREFS_COLLECTION,
  SAVED_COLLECTION,
  type EdgeDoc,
  type FeedPrefsDoc,
  type SavedDoc,
} from '../../../features/forum/social/social.handlers.js';
import {
  NOTIFICATIONS_COLLECTION,
  type NotificationDoc,
} from '../../../features/forum/shared/notification.projection.js';
import {
  FORUM_MESSAGES_COLLECTION,
  type ForumMessageDoc,
} from '../../../features/forum/message/forum-message.handler.js';
import { LABELS_COLLECTION, type LabelDoc } from '../../../features/forum/label/label.handler.js';

const MAX_SCAN = 100_000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

interface CursorValue {
  readonly at: number;
  readonly id: string;
}

const rowId = (row: unknown): string =>
  String(
    (row as { id?: string; contentId?: string }).id ??
      (row as { contentId?: string }).contentId ??
      '',
  );

const rowTime = (row: unknown): number => {
  const value = row as Record<string, unknown>;
  return Number(
    value['createdAtMs'] ??
      value['updatedAtMs'] ??
      value['definedAtMs'] ??
      value['joinedAtMs'] ??
      value['assignedAtMs'] ??
      value['firstSeenAtMs'] ??
      0,
  );
};

function encodeCursor(value: CursorValue): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeCursor(value: string | undefined): CursorValue | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as CursorValue;
    return Number.isFinite(parsed.at) && typeof parsed.id === 'string' ? parsed : null;
  } catch {
    throw new HttpException({ detail: 'cursor is invalid' }, 400);
  }
}

function page<T>(
  rows: readonly T[],
  limitValue: string | undefined,
  cursorValue: string | undefined,
  compare: (a: T, b: T) => number = (a, b) =>
    rowTime(b) - rowTime(a) || rowId(b).localeCompare(rowId(a)),
): { items: readonly T[]; nextCursor: string | null } {
  const limit = Math.min(Math.max(Number(limitValue) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const cursor = decodeCursor(cursorValue);
  const sorted = [...rows].sort(compare);
  const cursorIndex = cursor
    ? sorted.findIndex((row) => rowTime(row) === cursor.at && rowId(row) === cursor.id)
    : -1;
  const filtered = cursorIndex >= 0 ? sorted.slice(cursorIndex + 1) : sorted;
  const items = filtered.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      filtered.length > limit && last ? encodeCursor({ at: rowTime(last), id: rowId(last) }) : null,
  };
}

function token(header: string | undefined): string {
  const [scheme, value] = header?.split(' ') ?? [];
  if (scheme?.toLowerCase() !== 'bearer' || !value) {
    throw new HttpException({ detail: 'access token is required' }, 401);
  }
  return value;
}

@Controller('v1')
export class ForumReadController {
  constructor(
    @Inject(ProjectionStore) private readonly projections: ProjectionStore,
    @Inject(EnvelopeReader) private readonly envelopes: EnvelopeReader,
    @Inject(WitnessLog) private readonly witness: WitnessLog,
    @Inject(SessionAuth) private readonly auth: SessionAuth,
    @Inject(TaggedCache) private readonly cache: TaggedCache,
    @Inject(NodeSigner) private readonly nodeSigner: NodeSigner,
  ) {}

  private async actor(authorization?: string): Promise<string> {
    try {
      const principal = await this.auth.verifyAccess(token(authorization));
      return Buffer.from(principal.key).toString('hex');
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ detail: 'access token is invalid' }, 401);
    }
  }

  private receipt(receipt: NonNullable<Awaited<ReturnType<EnvelopeReader['get']>>>['receipt']) {
    if (!receipt) return null;
    return {
      logIndex: receipt.logIndex,
      leafIndex: receipt.leafIndex,
      acceptedAtMs: receipt.acceptedAtMs,
      serverId: receipt.serverId,
      serverKey: Buffer.from(receipt.serverKey).toString('base64'),
      serverSignature: Buffer.from(receipt.signature).toString('base64'),
      sth: {
        treeSize: receipt.sth.treeSize,
        serverKey: Buffer.from(receipt.sth.serverKey).toString('base64'),
        rootHash: Buffer.from(receipt.sth.rootHash).toString('base64'),
        timestampMs: receipt.sth.timestampMs,
        signature: Buffer.from(receipt.sth.signature).toString('base64'),
      },
      inclusionProof: receipt.inclusionProof.map((hash) => Buffer.from(hash).toString('base64')),
    };
  }

  private async provenance(contentId: string): Promise<Record<string, unknown> | null> {
    const stored = await this.envelopes.get(contentId);
    if (!stored) return null;
    const { canonical } = parseEnvelope(stored.raw);
    const env = stored.envelope;
    const labels = await this.projections
      .collection<LabelDoc>(LABELS_COLLECTION)
      .find({ target: contentId }, MAX_SCAN);
    return {
      contentId,
      plane: 'FORUM',
      authorKey: identityId(env.authorKey),
      keyAlg: 'ED25519',
      signature: Buffer.from(env.signature).toString('base64'),
      canonicalBytes: Buffer.from(canonical).toString('base64'),
      receipt: this.receipt(stored.receipt),
      labels,
    };
  }

  private async renderPost(post: PostDoc): Promise<Record<string, unknown>> {
    return {
      ...post,
      bodyMarkdown: post.removed ? null : post.bodyMarkdown,
      url: post.removed ? null : post.url,
      provenance: await this.provenance(post.contentId),
    };
  }

  private async renderComment(comment: CommentDoc): Promise<Record<string, unknown>> {
    return {
      ...comment,
      bodyMarkdown: comment.removed ? null : comment.bodyMarkdown,
      provenance: await this.provenance(comment.contentId),
    };
  }

  @Get('feed')
  async feed(
    @Query('community') community?: string,
    @Query('sort') sort = 'hot',
    @Query('timeframe') timeframe = 'all',
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    const actorKey = authorization ? await this.actor(authorization) : '';
    const cacheKey = `feed:${actorKey}:${community ?? ''}:${sort}:${timeframe}:${cursor ?? ''}:${limit ?? ''}`;
    const cached = await this.cache.get<Record<string, unknown>>(cacheKey);
    if (cached) return cached;
    let rows = await this.projections.collection<PostDoc>(POSTS_COLLECTION).find({}, MAX_SCAN);
    const timeframeMs: Readonly<Record<string, number>> = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
    };
    const windowMs = timeframeMs[timeframe];
    if (windowMs) {
      const after = Date.now() - windowMs;
      rows = rows.filter((post) => post.createdAtMs >= after);
    }
    if (actorKey) {
      const preferences = await this.projections
        .collection<FeedPrefsDoc>(FEED_PREFS_COLLECTION)
        .findOne({ id: actorKey });
      const blocks = await this.projections
        .collection<EdgeDoc>(BLOCKS_COLLECTION)
        .find({ actorKey }, MAX_SCAN);
      const hidden = new Set([
        ...(preferences?.hiddenKeys ?? []),
        ...blocks.map((block) => block.subjectKey),
      ]);
      rows = rows.filter((post) => !hidden.has(post.authorKey));
    }
    const rankedAtMs = Date.now();
    const compare = (a: PostDoc, b: PostDoc): number => {
      if (sort === 'new') return b.createdAtMs - a.createdAtMs;
      if (sort === 'top') return b.score - a.score || b.createdAtMs - a.createdAtMs;
      if (sort === 'controversial') {
        return Math.abs(a.score) - Math.abs(b.score) || b.commentCount - a.commentCount;
      }
      const ageHoursA = Math.max(1, (rankedAtMs - a.createdAtMs) / 3_600_000);
      const ageHoursB = Math.max(1, (rankedAtMs - b.createdAtMs) / 3_600_000);
      const rankA =
        sort === 'rising'
          ? (a.score + a.commentCount) / ageHoursA
          : (a.score + Math.log2(a.commentCount + 1)) / Math.pow(ageHoursA + 2, 1.5);
      const rankB =
        sort === 'rising'
          ? (b.score + b.commentCount) / ageHoursB
          : (b.score + Math.log2(b.commentCount + 1)) / Math.pow(ageHoursB + 2, 1.5);
      return rankB - rankA || b.createdAtMs - a.createdAtMs;
    };
    const result = page(
      community ? rows.filter((post) => post.community === community) : rows,
      limit,
      cursor,
      compare,
    );
    const response = {
      items: await Promise.all(result.items.map((post) => this.renderPost(post))),
      nextCursor: result.nextCursor,
    };
    await this.cache.put(
      cacheKey,
      response,
      ['forum', ...(community ? [`scope:${community}`] : [])],
      30_000,
    );
    return response;
  }

  @Get('posts/:contentId')
  async post(@Param('contentId') contentId: string): Promise<Record<string, unknown>> {
    const cacheKey = `post:${contentId}`;
    const cached = await this.cache.get<Record<string, unknown>>(cacheKey);
    if (cached) return cached;
    const post = await this.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: contentId });
    if (!post) throw new HttpException({ detail: 'post not found' }, 404);
    const response = await this.renderPost(post);
    await this.cache.put(cacheKey, response, ['forum', `content:${contentId}`], 60_000);
    return response;
  }

  @Get('posts/:contentId/comments')
  async postComments(
    @Param('contentId') contentId: string,
    @Query('depth') depth?: string,
    @Query('sort') sort = 'top',
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.projections
      .collection<CommentDoc>(COMMENTS_COLLECTION)
      .find({ post: contentId }, MAX_SCAN);
    const maximumDepth = depth === undefined ? null : Math.max(0, Number(depth));
    const filtered = Number.isFinite(maximumDepth)
      ? rows.filter((comment) => comment.depth <= maximumDepth!)
      : rows;
    const result = page(filtered, limit, cursor, (a, b) =>
      sort === 'old'
        ? a.createdAtMs - b.createdAtMs
        : sort === 'new'
          ? b.createdAtMs - a.createdAtMs
          : b.score - a.score || a.createdAtMs - b.createdAtMs,
    );
    return {
      items: await Promise.all(result.items.map((comment) => this.renderComment(comment))),
      nextCursor: result.nextCursor,
    };
  }

  @Get('comments/:contentId')
  async comment(@Param('contentId') contentId: string): Promise<Record<string, unknown>> {
    const comment = await this.projections
      .collection<CommentDoc>(COMMENTS_COLLECTION)
      .findOne({ id: contentId });
    if (!comment) throw new HttpException({ detail: 'comment not found' }, 404);
    return this.renderComment(comment);
  }

  @Get('posts/:contentId/audit')
  async audit(@Param('contentId') contentId: string): Promise<Record<string, unknown>> {
    const post = await this.post(contentId);
    const moderation = await this.projections
      .collection<ModEventDoc>(MOD_EVENTS_COLLECTION)
      .find({ target: contentId }, MAX_SCAN);
    const labels = await this.projections
      .collection<LabelDoc>(LABELS_COLLECTION)
      .find({ target: contentId }, MAX_SCAN);
    return { content: post, moderation, labels };
  }

  @Get('communities')
  async communities(
    @Query('q') query?: string,
    @Query('sort') sort = 'members',
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.projections
      .collection<CommunityDoc>(COMMUNITIES_COLLECTION)
      .find({}, MAX_SCAN);
    const needle = query?.trim().toLowerCase();
    const result = page(
      needle
        ? rows.filter(
            (community) =>
              community.name.toLowerCase().includes(needle) ||
              community.title.toLowerCase().includes(needle),
          )
        : rows,
      limit,
      cursor,
      (a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name)
          : sort === 'new'
            ? b.createdAtMs - a.createdAtMs
            : b.memberCount - a.memberCount || a.name.localeCompare(b.name),
    );
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('communities/name-available/:name')
  async communityName(@Param('name') name: string): Promise<{ available: boolean }> {
    const rows = await this.projections
      .collection<CommunityDoc>(COMMUNITIES_COLLECTION)
      .find({ name }, 1);
    return { available: rows.length === 0 };
  }

  @Get('communities/:id')
  async community(@Param('id') id: string): Promise<CommunityDoc> {
    const row = await this.projections
      .collection<CommunityDoc>(COMMUNITIES_COLLECTION)
      .findOne({ id });
    if (!row) throw new HttpException({ detail: 'community not found' }, 404);
    return row;
  }

  private async communityMemberships(id: string): Promise<readonly MembershipDoc[]> {
    return this.projections
      .collection<MembershipDoc>(MEMBERSHIPS_COLLECTION)
      .find({ community: id }, MAX_SCAN);
  }

  @Get('communities/:id/members')
  async members(
    @Param('id') id: string,
    @Query('key') key?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    let rows = await this.communityMemberships(id);
    if (key) rows = rows.filter((row) => row.memberKey === key);
    if (role === 'moderator') {
      rows = rows.filter((row) => (BigInt(row.flags) & 2n) !== 0n);
    }
    if (status === 'banned') rows = rows.filter((row) => (BigInt(row.flags) & 4n) !== 0n);
    if (status === 'active') rows = rows.filter((row) => (BigInt(row.flags) & 4n) === 0n);
    const result = page(rows, limit, cursor);
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('communities/:id/moderators')
  async moderators(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.communityMemberships(id);
    const result = page(
      rows.filter((row) => (BigInt(row.flags) & 2n) !== 0n),
      limit,
      cursor,
    );
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('communities/:id/bans')
  async bans(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.communityMemberships(id);
    const result = page(
      rows.filter((row) => (BigInt(row.flags) & 4n) !== 0n),
      limit,
      cursor,
    );
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('communities/:id/modlog')
  async modlog(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const rows = (
      await this.projections
        .collection<ModEventDoc>(MOD_EVENTS_COLLECTION)
        .find({ community: id }, MAX_SCAN)
    )
      .slice()
      .sort((a, b) => a.sequence - b.sequence);
    const result = page(rows, limit, cursor);
    return { items: result.items, nextCursor: result.nextCursor, chain: verifyModChain(rows) };
  }

  @Get('communities/:id/reports')
  async reports(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    let rows = await this.projections
      .collection<ReportDoc>(REPORTS_COLLECTION)
      .find({ community: id }, MAX_SCAN);
    if (status !== undefined && Number.isFinite(Number(status))) {
      rows = rows.filter((report) => report.status === Number(status));
    }
    const result = page(rows, limit, cursor);
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('communities/:id/roles')
  async roles(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const result = page(
      await this.projections
        .collection<RoleDoc>(ROLES_COLLECTION)
        .find({ community: id }, MAX_SCAN),
      limit,
      cursor,
    );
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('communities/:id/stats')
  async stats(@Param('id') id: string): Promise<Record<string, unknown>> {
    const community = await this.community(id);
    const reports = await this.projections
      .collection<ReportDoc>(REPORTS_COLLECTION)
      .find({ community: id }, MAX_SCAN);
    return {
      members: community.memberCount,
      posts: community.postCount,
      pendingReports: reports.filter((report) => report.status === 1).length,
    };
  }

  @Get('server/identity')
  serverIdentity(): Record<string, unknown> {
    return {
      serverId: this.nodeSigner.serverId,
      publicKey: Buffer.from(this.nodeSigner.publicKey).toString('base64'),
      keyAlg: 'ED25519',
    };
  }

  @Get('identities/:keyId')
  async identity(@Param('keyId') keyId: string): Promise<IdentityDoc> {
    const id = keyId.startsWith('jbk1') ? keyId.slice(4) : keyId;
    const rows = await this.projections
      .collection<IdentityDoc>(IDENTITIES_COLLECTION)
      .find({}, MAX_SCAN);
    const row = rows.find(
      (candidate) => candidate.id === id || identityId(Buffer.from(candidate.id, 'hex')) === keyId,
    );
    if (!row) throw new HttpException({ detail: 'identity not found' }, 404);
    return row;
  }

  @Get('identities/by-name/:username')
  async identityByName(@Param('username') username: string): Promise<IdentityDoc> {
    const rows = await this.projections
      .collection<IdentityDoc>(IDENTITIES_COLLECTION)
      .find({}, MAX_SCAN);
    const row = rows.find(
      (candidate) =>
        candidate.displayName.toLowerCase() === username.toLowerCase() ||
        `user_${candidate.id.slice(0, 12)}` === username,
    );
    if (!row) throw new HttpException({ detail: 'identity not found' }, 404);
    return row;
  }

  @Get('me/profile')
  async meProfile(@Headers('authorization') authorization?: string): Promise<IdentityDoc> {
    return this.identity(await this.actor(authorization));
  }

  @Get('me/communities')
  async meCommunities(
    @Headers('authorization') authorization?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const actor = await this.actor(authorization);
    const result = page(
      await this.projections
        .collection<MembershipDoc>(MEMBERSHIPS_COLLECTION)
        .find({ memberKey: actor }, MAX_SCAN),
      limit,
      cursor,
    );
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('me/preferences')
  async preferences(
    @Headers('authorization') authorization?: string,
  ): Promise<FeedPrefsDoc | null> {
    return this.projections
      .collection<FeedPrefsDoc>(FEED_PREFS_COLLECTION)
      .findOne({ id: await this.actor(authorization) });
  }

  @Get('me/saved')
  async saved(
    @Headers('authorization') authorization?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const result = page(
      await this.projections
        .collection<SavedDoc>(SAVED_COLLECTION)
        .find({ actorKey: await this.actor(authorization) }, MAX_SCAN),
      limit,
      cursor,
    );
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('me/notifications')
  async notifications(
    @Headers('authorization') authorization?: string,
    @Query('unread') unread?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const actor = await this.actor(authorization);
    const rows = await this.projections
      .collection<NotificationDoc>(NOTIFICATIONS_COLLECTION)
      .find({ recipientKey: actor }, MAX_SCAN);
    const filtered = unread === 'true' ? rows.filter((notification) => !notification.read) : rows;
    const result = page(filtered, limit, cursor);
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('me/messages')
  async messages(
    @Headers('authorization') authorization?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const actor = await this.actor(authorization);
    const rows = await this.projections
      .collection<ForumMessageDoc>(FORUM_MESSAGES_COLLECTION)
      .find({}, MAX_SCAN);
    const result = page(
      rows.filter((message) => message.senderKey === actor || message.recipientKey === actor),
      limit,
      cursor,
    );
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('me/messages/:threadId')
  async messageThread(
    @Param('threadId') threadId: string,
    @Headers('authorization') authorization?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const actor = await this.actor(authorization);
    const rows = await this.projections
      .collection<ForumMessageDoc>(FORUM_MESSAGES_COLLECTION)
      .find({ thread: threadId }, MAX_SCAN);
    const result = page(
      rows.filter((message) => message.senderKey === actor || message.recipientKey === actor),
      limit,
      cursor,
    );
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('awards/types')
  async awardTypes(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const result = page(
      await this.projections.collection<AwardTypeDoc>(AWARD_TYPES_COLLECTION).find({}, MAX_SCAN),
      limit,
      cursor,
    );
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('awards/target/:kind/:id')
  async awards(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.projections
      .collection<AwardDoc>(AWARDS_COLLECTION)
      .find({ target: id }, MAX_SCAN);
    const result = page(
      rows.filter((award) => String(award.targetKind) === kind || kind === 'any'),
      limit,
      cursor,
    );
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('search')
  async search(
    @Query('q') query: string,
    @Query('kind') kind?: string,
    @Query('community') community?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const needle = query?.trim().toLowerCase() ?? '';
    if (!needle) return { items: [], nextCursor: null };
    const posts =
      kind && kind !== 'post'
        ? []
        : await this.projections.collection<PostDoc>(POSTS_COLLECTION).find({}, MAX_SCAN);
    const communities =
      kind && kind !== 'community'
        ? []
        : await this.projections
            .collection<CommunityDoc>(COMMUNITIES_COLLECTION)
            .find({}, MAX_SCAN);
    const comments =
      kind && kind !== 'comment'
        ? []
        : await this.projections.collection<CommentDoc>(COMMENTS_COLLECTION).find({}, MAX_SCAN);
    const identities =
      kind && kind !== 'identity'
        ? []
        : await this.projections.collection<IdentityDoc>(IDENTITIES_COLLECTION).find({}, MAX_SCAN);
    const result = page(
      [
        ...posts.filter(
          (post) =>
            (!community || post.community === community) &&
            `${post.title}\n${post.bodyMarkdown}`.toLowerCase().includes(needle),
        ),
        ...communities.filter((community) =>
          `${community.name}\n${community.title}`.toLowerCase().includes(needle),
        ),
        ...comments.filter((comment) => comment.bodyMarkdown.toLowerCase().includes(needle)),
        ...identities.filter((identity) =>
          `${identity.displayName}\n${identity.bio}`.toLowerCase().includes(needle),
        ),
      ],
      limit,
      cursor,
    );
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('labels/:contentId')
  async labels(
    @Param('contentId') contentId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const result = page(
      await this.projections
        .collection<LabelDoc>(LABELS_COLLECTION)
        .find({ target: contentId }, MAX_SCAN),
      limit,
      cursor,
    );
    return { items: result.items, nextCursor: result.nextCursor };
  }

  @Get('receipts/:contentId')
  async receiptFor(@Param('contentId') contentId: string): Promise<Record<string, unknown>> {
    const stored = await this.envelopes.get(contentId);
    const receipt = this.receipt(stored?.receipt);
    if (!receipt) throw new HttpException({ detail: 'receipt not found' }, 404);
    return receipt;
  }

  @Get('log/inclusion/:contentId')
  async inclusion(@Param('contentId') contentId: string): Promise<Record<string, unknown>> {
    const proof = await this.witness.inclusionProof(contentId);
    return {
      leafIndex: proof.leafIndex,
      treeSize: proof.treeSize,
      path: proof.path.map((hash) => Buffer.from(hash).toString('base64')),
    };
  }

  @Get('log/consistency')
  async consistency(
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<Record<string, unknown>> {
    const start = Number(from);
    const end = Number(to);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
      throw new HttpException({ detail: 'from and to must be valid tree sizes' }, 400);
    }
    const proof = await this.witness.consistencyProof(start, end);
    return {
      from: start,
      to: end,
      path: proof.map((hash) => Buffer.from(hash).toString('base64')),
    };
  }
}
