/**
 * What a moderation action was actually taken against (MOD-09).
 *
 * ── Why a bare target ID is not an audit trail ──────────────────────────────────────
 * MOD-09 requires the public mod log to carry "actor, verb, target, reason, timestamp".
 * Storing `target: "jb1qh2…"` satisfies that literally and fails it in practice: nobody
 * reviewing the log — a member checking whether moderation is fair, a moderator reviewing a
 * colleague, a researcher documenting censorship — can tell what was removed without
 * resolving every ID by hand, and for a member action the ID is a raw hex key. "Every
 * censorship action is evidence" (VIS-06) only holds if the evidence is legible.
 *
 * ── Why it is a SNAPSHOT and not a join ─────────────────────────────────────────────
 * Resolving the target at read time shows what the post says *now*. An audit trail has to
 * show what the moderator acted on *then* — a post edited after removal, or a display name
 * changed afterwards, would otherwise silently rewrite the record of the decision. So the
 * summary is captured in `project()`, in the same transaction as the action.
 *
 * This stays rebuildable (P1-G3): `ProjectionRebuilder` replays the log in log-index order,
 * so when a ModAction is re-projected the target's row holds exactly the state it held the
 * first time. The snapshot is derived data, not an input.
 *
 * ── The snapshot is convenience, never authority ────────────────────────────────────
 * It is deliberately NOT part of `modChainHash`. The chained field is `target`, a content
 * ID, and the target's own signed envelope remains the authority on what it said — the
 * summary can always be re-derived from it, and a tombstoned row is never deleted, so the
 * comparison stays possible. Chaining a denormalised copy would add a second thing to keep
 * consistent without adding a fact the chain does not already commit to.
 */

import type { ProjectionStore } from '../../../core/ports/storage.port.js';
import { POSTS_COLLECTION, type PostDoc } from '../post/post.projection.js';
import { COMMENTS_COLLECTION, type CommentDoc } from '../comment/comment-create.handler.js';
import { IDENTITIES_COLLECTION, type IdentityDoc } from './membership.projection.js';

/**
 * Excerpt budget, in CODE POINTS.
 *
 * Counted in code points rather than bytes because Bangla is a first-class language here and
 * one Bangla character costs three UTF-8 bytes: a byte budget would truncate a Bangla
 * excerpt to a third of an English one, and could cut a grapheme in half.
 */
export const SUMMARY_EXCERPT_CHARS = 280;

export type ModTargetKind = 'post' | 'comment' | 'identity' | 'unknown';

export interface ModTargetSummary {
  readonly kind: ModTargetKind;
  /** Content ID for content, hex key for an identity — the thing `target` names. */
  readonly target: string;
  /** Whose content this was, or the member acted on. Hex key. */
  readonly authorKey: string;
  /** The author's display name at the time of the action, '' when never set. */
  readonly authorName: string;
  /** Post title; '' for comments and identities. */
  readonly title: string;
  /** First `SUMMARY_EXCERPT_CHARS` code points of the body; '' for identities. */
  readonly excerpt: string;
  /** True when the body was longer than the excerpt, so a reader knows it is cut. */
  readonly truncated: boolean;
  /** The post a comment belongs to; '' otherwise. */
  readonly parentPost: string;
  /** When the target was authored, from its signed envelope. 0 for identities. */
  readonly createdAtMs: number;
  /** Content state at the moment the action was taken. */
  readonly removed: boolean;
  readonly approved: boolean;
}

function excerptOf(body: string): { excerpt: string; truncated: boolean } {
  const points = [...body.trim()];
  return points.length <= SUMMARY_EXCERPT_CHARS
    ? { excerpt: points.join(''), truncated: false }
    : { excerpt: points.slice(0, SUMMARY_EXCERPT_CHARS).join(''), truncated: true };
}

async function displayNameOf(projections: ProjectionStore, authorKey: string): Promise<string> {
  const identity = await projections
    .collection<IdentityDoc>(IDENTITIES_COLLECTION)
    .findOne({ id: authorKey });
  return identity?.displayName ?? '';
}

export function summariseImportedPost(post: PostDoc, authorName: string): ModTargetSummary {
  const { excerpt, truncated } = excerptOf(post.bodyMarkdown);
  return {
    kind: 'post',
    target: post.contentId,
    authorKey: post.authorKey,
    authorName,
    title: post.title,
    excerpt,
    truncated,
    parentPost: '',
    createdAtMs: post.createdAtMs,
    removed: post.removed,
    approved: post.approved,
  };
}

export function summariseImportedComment(
  comment: CommentDoc,
  authorName: string,
): ModTargetSummary {
  const { excerpt, truncated } = excerptOf(comment.bodyMarkdown);
  return {
    kind: 'comment',
    target: comment.contentId,
    authorKey: comment.authorKey,
    authorName,
    title: '',
    excerpt,
    truncated,
    parentPost: comment.post,
    createdAtMs: comment.createdAtMs,
    removed: comment.removed,
    approved: comment.approved,
  };
}

/**
 * Resolve whatever `target` names into a legible summary.
 *
 * Returns an `unknown` summary rather than null when nothing resolves, so a log row always
 * renders. A moderation action whose target this node has never seen is itself worth
 * showing — silently dropping the row would hide it.
 */
export async function resolveTargetSummary(
  projections: ProjectionStore,
  target: string,
  isMemberAction: boolean,
): Promise<ModTargetSummary> {
  if (isMemberAction) {
    return {
      kind: 'identity',
      target,
      authorKey: target,
      authorName: await displayNameOf(projections, target),
      title: '',
      excerpt: '',
      truncated: false,
      parentPost: '',
      createdAtMs: 0,
      removed: false,
      approved: false,
    };
  }

  // `id` is the store's primary-key filter — it maps to `_id`, which is the content ID.
  const post = await projections.collection<PostDoc>(POSTS_COLLECTION).findOne({ id: target });
  if (post) return summariseImportedPost(post, await displayNameOf(projections, post.authorKey));

  const comment = await projections
    .collection<CommentDoc>(COMMENTS_COLLECTION)
    .findOne({ id: target });
  if (comment) {
    return summariseImportedComment(comment, await displayNameOf(projections, comment.authorKey));
  }

  return {
    kind: 'unknown',
    target,
    authorKey: '',
    authorName: '',
    title: '',
    excerpt: '',
    truncated: false,
    parentPost: '',
    createdAtMs: 0,
    removed: false,
    approved: false,
  };
}
