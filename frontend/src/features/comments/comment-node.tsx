import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Button,
  IconButton,
  Seal,
  maxFontScale,
  radius,
  spacing,
  type as typography,
  type AppPalette,
} from '../../design-system';
import type { HomeNode } from '../../data/node-config';
import { useProvenanceSeal } from '../../verify/use-provenance-seal';
import { VoteButtons } from '../posts/vote-buttons';
import { countDescendants, type CommentTreeNode } from './comment-tree';

const MAX_VISUAL_DEPTH = 8;

function relativeTime(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * design.md §5 — "16px indent per depth, a single 1px vertical border line per thread instead
 * of nested boxes." The previous implementation flattened everything and only applied
 * `marginLeft: depth * 16` with no left rail and no real parent/child grouping.
 */
export function CommentNode({
  colors,
  homeNode,
  communityId,
  node,
  depth = 0,
  isAuthor,
  onReply,
  onEdit,
  onDelete,
  onReport,
  onVoteError,
}: {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
  readonly communityId: string;
  readonly node: CommentTreeNode;
  readonly depth?: number;
  readonly isAuthor: (authorKey: string) => boolean;
  readonly onReply: (parentId: string, body: string) => Promise<void>;
  readonly onEdit: (contentId: string, body: string) => Promise<void>;
  readonly onDelete: (contentId: string, reason: string) => Promise<void>;
  readonly onReport: (contentId: string) => void;
  readonly onVoteError: (message: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(node.comment.bodyMarkdown ?? '');
  const [busy, setBusy] = useState(false);

  const { comment, children } = node;
  const seal = useProvenanceSeal(comment.provenance);
  const mine = isAuthor(comment.authorKey);
  const totalDescendants = countDescendants(node);
  const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH);

  const submitReply = async () => {
    if (!replyText.trim()) return;
    setBusy(true);
    try {
      await onReply(comment.contentId, replyText);
      setReplyText('');
      setReplying(false);
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async () => {
    setBusy(true);
    try {
      await onEdit(comment.contentId, editText);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, { marginLeft: visualDepth * 16, borderLeftColor: colors.border }]}>
      <View style={styles.headRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Expand thread' : 'Collapse thread'}
          onPress={() => setCollapsed((v) => !v)}
          hitSlop={8}
        >
          <Ionicons name={collapsed ? 'add-circle-outline' : 'remove-circle-outline'} size={16} color={colors.text2} />
        </Pressable>
        <Text numberOfLines={1} maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, styles.shrink, { color: colors.text }]}>
          u/{comment.authorKey.slice(0, 8)}… · {relativeTime(comment.createdAtMs)}
        </Text>
        <Seal colors={colors} state={seal} />
      </View>

      {collapsed ? (
        <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>
          {totalDescendants > 0 ? `${totalDescendants} hidden repl${totalDescendants === 1 ? 'y' : 'ies'}` : 'Collapsed'}
        </Text>
      ) : (
        <>
          {comment.removed ? (
            <Text maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text2, fontStyle: 'italic' }]}>
              [removed{comment.removedReason ? `: ${comment.removedReason}` : ''}]
            </Text>
          ) : editing ? (
            <View style={styles.editBlock}>
              <TextInput
                accessibilityLabel="Edit comment"
                multiline
                value={editText}
                onChangeText={setEditText}
                style={[typography.body, styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              />
              <View style={styles.rowGap}>
                <Button colors={colors} label="Cancel" variant="ghost" onPress={() => setEditing(false)} />
                <Button colors={colors} label={busy ? 'Saving…' : 'Save'} disabled={busy} onPress={() => void submitEdit()} />
              </View>
            </View>
          ) : (
            <Text maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text }]}>
              {comment.bodyMarkdown}
            </Text>
          )}

          <View style={styles.actionsRow}>
            <VoteButtons
              colors={colors}
              homeNode={homeNode}
              communityId={communityId}
              target={comment.contentId}
              targetKind="comment"
              score={comment.score}
              myVote={comment.myVote}
              onError={onVoteError}
            />
            <IconButton colors={colors} icon="arrow-undo-outline" label="Reply" onPress={() => setReplying((v) => !v)} />
            {mine ? (
              <>
                <IconButton colors={colors} icon="create-outline" label="Edit" onPress={() => setEditing(true)} />
                <IconButton colors={colors} icon="trash-outline" label="Delete" onPress={() => void onDelete(comment.contentId, '')} />
              </>
            ) : (
              <IconButton colors={colors} icon="flag-outline" label="Report" onPress={() => onReport(comment.contentId)} />
            )}
          </View>

          {replying ? (
            <View style={styles.editBlock}>
              <TextInput
                accessibilityLabel="Write a reply"
                multiline
                placeholder="Write a reply…"
                placeholderTextColor={colors.text3}
                value={replyText}
                onChangeText={setReplyText}
                style={[typography.body, styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
              />
              <View style={styles.rowGap}>
                <Button colors={colors} label="Cancel" variant="ghost" onPress={() => setReplying(false)} />
                <Button colors={colors} label={busy ? 'Replying…' : 'Reply'} disabled={busy || !replyText.trim()} onPress={() => void submitReply()} />
              </View>
            </View>
          ) : null}

          {children.map((child) => (
            <CommentNode
              key={child.comment.contentId}
              colors={colors}
              homeNode={homeNode}
              communityId={communityId}
              node={child}
              depth={depth + 1}
              isAuthor={isAuthor}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              onReport={onReport}
              onVoteError={onVoteError}
            />
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderLeftWidth: 1, paddingLeft: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xs },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  shrink: { flexShrink: 1 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  editBlock: { gap: spacing.xs },
  input: { minHeight: 64, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, textAlignVertical: 'top' },
  rowGap: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'flex-end' },
});
