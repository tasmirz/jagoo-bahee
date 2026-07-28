/**
 * T1.31 — read endpoints for the post feature.
 *
 * ── Cursor pagination, never offset ─────────────────────────────────────────────────
 * Offset pagination does not exist in this system. Beyond the correctness problem (rows
 * shift under you as content arrives), `OFFSET 10000` makes the database walk 10 000 rows
 * to discard them — the cost grows exactly as the instance gets busier, which is when it
 * can least afford it.
 *
 * ── Every response carries `provenance` ─────────────────────────────────────────────
 * The client verifies; it never trusts the server's word. Each item ships the content ID,
 * the author key and the log index, so the client can recompute the content ID from the
 * envelope and demand an inclusion proof. A read API that returned only rendered content
 * would make the whole transparency design unusable from the client side.
 */

import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ProjectionStore } from '../../../core/ports/storage.port.js';
import { WitnessLog } from '../../../core/ports/transparency.port.js';
import { POSTS_COLLECTION, type PostDoc } from '../../../features/forum/post/post.projection.js';
import {
  COMMENTS_COLLECTION,
  type CommentDoc,
} from '../../../features/forum/comment/comment-create.handler.js';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/**
 * Opaque cursor.
 *
 * Base64 of `createdAtMs:contentId`. The content ID is the tiebreaker so a page boundary is
 * stable even when many posts share a millisecond — without it, items can be skipped or
 * repeated across pages.
 */
export function encodeCursor(createdAtMs: number, contentId: string): string {
  return Buffer.from(`${createdAtMs}:${contentId}`).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAtMs: number; contentId: string } | null {
  try {
    const [ms, id] = Buffer.from(cursor, 'base64url').toString('utf8').split(':');
    if (!ms || !id) return null;
    const createdAtMs = Number(ms);
    return Number.isFinite(createdAtMs) ? { createdAtMs, contentId: id } : null;
  } catch {
    return null;
  }
}

@Controller('v1')
export class PostsController {
  // Explicit tokens — see the note in envelope.controller.ts.
  constructor(
    @Inject(ProjectionStore) private readonly projections: ProjectionStore,
    @Inject(WitnessLog) private readonly witness: WitnessLog,
  ) {}

  @Get('posts')
  async listPosts(
    @Query('community') community?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<Record<string, unknown>> {
    const take = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    // The in-memory projection store has no query planner; a Mongo adapter pushes this
    // filter and sort into an index. The SHAPE of the contract — newest first, cursor
    // bounded — is what matters here and does not change.
    const all = await this.projections.collection<PostDoc>(POSTS_COLLECTION).find({}, 10_000);

    let rows = [...all].sort(
      (a, b) => b.createdAtMs - a.createdAtMs || (a.contentId < b.contentId ? 1 : -1),
    );
    if (community) rows = rows.filter((p) => p.community === community);

    const after = cursor ? decodeCursor(cursor) : null;
    if (after) {
      rows = rows.filter(
        (p) =>
          p.createdAtMs < after.createdAtMs ||
          (p.createdAtMs === after.createdAtMs && p.contentId < after.contentId),
      );
    }

    const page = rows.slice(0, take);
    const last = page[page.length - 1];

    return {
      items: page.map((p) => this.render(p)),
      next_cursor: rows.length > take && last ? encodeCursor(last.createdAtMs, last.contentId) : null,
    };
  }

  @Get('comments')
  async listComments(
    @Query('post') post: string,
    @Query('limit') limit?: string,
  ): Promise<Record<string, unknown>> {
    const take = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const all = await this.projections.collection<CommentDoc>(COMMENTS_COLLECTION).find({}, 10_000);

    const rows = all
      .filter((c) => c.post === post)
      .sort((a, b) => a.createdAtMs - b.createdAtMs)
      .slice(0, take);

    return {
      items: rows.map((c) => ({
        content_id: c.contentId,
        post: c.post,
        parent_comment: c.parentComment || null,
        // A tombstone keeps the row: author, timestamp and reason stay visible, only the
        // body is withheld. Every censorship action is itself evidence.
        body_markdown: c.removed ? null : c.bodyMarkdown,
        removed: c.removed,
        removed_reason: c.removedReason,
        depth: c.depth,
        score: c.score,
        created_at_ms: c.createdAtMs,
        provenance: { content_id: c.contentId, author_key: c.authorKey },
      })),
      next_cursor: null,
    };
  }

  /** The signed tree head a client pins to verify later inclusion proofs offline. */
  @Get('log/sth')
  async sth(): Promise<Record<string, unknown>> {
    const head = await this.witness.currentSth();
    return {
      tree_size: head.treeSize,
      root_hash: Buffer.from(head.rootHash).toString('base64'),
      timestamp_ms: head.timestampMs,
      signature: Buffer.from(head.signature).toString('base64'),
    };
  }

  @Get('log/proof')
  async proof(@Query('content_id') contentId: string): Promise<Record<string, unknown>> {
    const proof = await this.witness.inclusionProof(contentId);
    return {
      leaf_index: proof.leafIndex,
      tree_size: proof.treeSize,
      path: proof.path.map((h) => Buffer.from(h).toString('base64')),
    };
  }

  private render(p: PostDoc): Record<string, unknown> {
    return {
      content_id: p.contentId,
      community: p.community,
      title: p.title,
      kind: p.kind,
      body_markdown: p.removed ? null : p.bodyMarkdown,
      url: p.removed ? null : p.url,
      attachments: p.attachments,
      flair: p.flair,
      removed: p.removed,
      removed_reason: p.removedReason,
      score: p.score,
      comment_count: p.commentCount,
      created_at_ms: p.createdAtMs,
      edited_at_ms: p.editedAtMs,
      provenance: {
        content_id: p.contentId,
        author_key: p.authorKey,
      },
    };
  }
}
