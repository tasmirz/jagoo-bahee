import type { NodeComment } from '../../data/node';

export interface CommentTreeNode {
  readonly comment: NodeComment;
  readonly children: readonly CommentTreeNode[];
}

/**
 * Builds a real tree from the flat, depth-tagged list the backend returns. The previous
 * `PostDetailScreen` skipped this entirely — it rendered `rows.map(...)` with
 * `marginLeft: comment.depth * spacing.md` as the only sign of nesting, so replies were never
 * grouped under their parent, only visually indented in whatever order the page happened to
 * return them. This also survives out-of-order arrival (a reply appearing in the array before
 * its parent, which pagination can produce) and caps runaway depth for phone-width legibility.
 */
export function buildCommentTree(
  comments: readonly NodeComment[],
): { readonly roots: readonly CommentTreeNode[]; readonly orphanCount: number } {
  const byId = new Map<string, CommentTreeNode>();
  for (const comment of comments) {
    byId.set(comment.contentId, { comment, children: [] });
  }
  const roots: CommentTreeNode[] = [];
  let orphanCount = 0;
  for (const comment of comments) {
    const node = byId.get(comment.contentId)!;
    const parent = comment.parentComment ? byId.get(comment.parentComment) : undefined;
    if (comment.parentComment && !parent) {
      // The parent was removed/unavailable/out of the current page — still show the reply
      // rather than silently dropping it, but count it so the UI can say why it's top-level.
      orphanCount += 1;
      roots.push(node);
    } else if (parent) {
      (parent.children as CommentTreeNode[]).push(node);
    } else {
      roots.push(node);
    }
  }
  const sortByScore = (nodes: CommentTreeNode[]): CommentTreeNode[] =>
    nodes
      .sort((a, b) => b.comment.score - a.comment.score || a.comment.createdAtMs - b.comment.createdAtMs)
      .map((node) => ({ ...node, children: sortByScore([...(node.children as CommentTreeNode[])]) }));
  return { roots: sortByScore([...roots]), orphanCount };
}

export function clampDepth(depth: number, maxDepth = 8): number {
  return Math.min(depth, maxDepth);
}

export function countDescendants(node: CommentTreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}
