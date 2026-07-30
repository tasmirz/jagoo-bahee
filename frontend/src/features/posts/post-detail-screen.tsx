import { useEffect, useMemo, useState } from 'react';
import { Share, StyleSheet, Text, TextInput, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useQueryClient } from '@tanstack/react-query';
import { ReportReason, TargetKind } from '@jagoo/sdk/proto';
import {
  ActionSheet,
  Button,
  ConfirmSheet,
  Page,
  PageHeader,
  Section,
  Seal,
  StatusBanner,
  maxFontScale,
  radius,
  spacing,
  type as typography,
  useContentInsets,
  type AppPalette,
  type ThemeMode,
} from '../../design-system';
import { useNodeComments, useNodePost, type NodeComment } from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import {
  createForumReport,
  deleteForumPost,
  forumSessionSummary,
  giveForumAward,
  publishForumComment,
  setForumSaved,
  updateForumComment,
  deleteForumComment,
} from '../../signer';
import { useProvenanceSeal } from '../../verify/use-provenance-seal';
import { VoteButtons } from './vote-buttons';
import { CommentNode } from '../comments/comment-node';
import { buildCommentTree } from '../comments/comment-tree';

const markdownStyles = (colors: AppPalette) => ({
  body: { color: colors.text, fontFamily: 'Poppins_400Regular', fontSize: 16, lineHeight: 26 },
  heading1: { color: colors.text, fontFamily: 'Poppins_600SemiBold' },
  heading2: { color: colors.text, fontFamily: 'Poppins_600SemiBold' },
  link: { color: colors.link },
  code_inline: { backgroundColor: colors.surface2, color: colors.text },
  code_block: { backgroundColor: colors.surface2, color: colors.text },
  blockquote: { borderLeftColor: colors.border, backgroundColor: colors.surface2 },
});

export function PostDetailScreen({
  colors,
  mode,
  homeNode,
  contentId,
  onBack,
  onAudit,
  onEdit,
  onOpenCommunity,
  onOpenAuthor,
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly homeNode: HomeNode;
  readonly contentId: string;
  readonly onBack?: () => void;
  readonly onAudit: () => void;
  readonly onEdit: () => void;
  readonly onOpenCommunity: (communityId: string) => void;
  readonly onOpenAuthor: (keyId: string) => void;
}) {
  const queryClient = useQueryClient();
  const baseUrl = homeNode.baseUrl;
  const post = useNodePost(baseUrl, contentId);
  const comments = useNodeComments(baseUrl, contentId, 'top');
  const [myKey, setMyKey] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);
  const [notice, setNotice] = useState<{ readonly tone: 'verified' | 'danger'; readonly text: string } | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const { bottom } = useContentInsets();

  useEffect(() => {
    void forumSessionSummary().then((summary) => setMyKey(summary.identityKeyHex ?? null));
  }, []);

  const item = post.data?.value;
  const rows = comments.data?.value.items ?? [];
  const tree = useMemo(() => buildCommentTree(rows as readonly NodeComment[]), [rows]);
  const seal = useProvenanceSeal(item?.provenance);
  const isAuthor = (authorKey: string) => myKey !== null && authorKey === myKey;
  const isMine = item ? isAuthor(item.authorKey) : false;

  const invalidateThis = () => {
    void queryClient.invalidateQueries({ queryKey: ['node', baseUrl, 'post', contentId] });
    void queryClient.invalidateQueries({ queryKey: ['node', baseUrl, 'post', contentId, 'comments'] });
  };

  const submitReply = async () => {
    if (!item || !replyText.trim()) return;
    try {
      await publishForumComment(
        baseUrl,
        { bodyMarkdown: replyText, communityId: item.community, postId: contentId },
        homeNode.discovery.services.auditLogs,
      );
      setReplyText('');
      setReplying(false);
      invalidateThis();
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'Reply was not published.' });
    }
  };

  const reply = async (parentId: string, body: string) => {
    if (!item) return;
    await publishForumComment(
      baseUrl,
      { bodyMarkdown: body, communityId: item.community, parentComment: parentId, postId: contentId },
      homeNode.discovery.services.auditLogs,
    );
    invalidateThis();
  };

  const editComment = async (id: string, body: string) => {
    if (!item) return;
    await updateForumComment(baseUrl, { target: id, body_markdown: body, communityId: item.community }, homeNode.discovery.services.auditLogs);
    invalidateThis();
  };

  const removeComment = async (id: string, reason: string) => {
    if (!item) return;
    await deleteForumComment(baseUrl, { target: id, reason, communityId: item.community }, homeNode.discovery.services.auditLogs);
    invalidateThis();
  };

  const toggleSave = async () => {
    if (!item) return;
    try {
      await setForumSaved(baseUrl, { target: contentId, targetKind: 'post', save: !item.saved }, homeNode.discovery.services.auditLogs);
      setNotice({ tone: 'verified', text: item.saved ? 'Removed from saved.' : 'Saved.' });
      invalidateThis();
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'Could not update saved state.' });
    }
  };

  const submitReport = async (reason: number, detail: string) => {
    if (!item) return;
    try {
      await createForumReport(
        baseUrl,
        item.community,
        { target: contentId, target_kind: TargetKind.TARGET_KIND_POST, reason, detail },
        homeNode.discovery.services.auditLogs,
      );
      setNotice({ tone: 'verified', text: 'Report submitted to community moderators.' });
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'Report was not accepted.' });
    }
  };

  const giveAward = async () => {
    if (!item) return;
    try {
      await giveForumAward(
        baseUrl,
        item.community,
        { target: contentId, target_kind: TargetKind.TARGET_KIND_POST, award_type: 'thanks', anonymous: false, message: '' },
        homeNode.discovery.services.auditLogs,
      );
      setNotice({ tone: 'verified', text: 'Award sent.' });
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'Award was not accepted.' });
    }
  };

  const removePost = async () => {
    if (!item) return;
    try {
      await deleteForumPost(baseUrl, { communityId: item.community, target: contentId, reason: 'Removed by author' }, homeNode.discovery.services.auditLogs);
      onBack?.();
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'Post was not removed.' });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader
        colors={colors}
        mode={mode}
        title={item ? `r/${item.community}` : 'Post'}
        onBack={onBack}
        actions={[{ icon: 'ellipsis-horizontal', label: 'More actions', onPress: () => setOverflowOpen(true) }]}
      />
      <Page colors={colors}>
        {!item ? (
          <StatusBanner
            colors={colors}
            icon="cloud-offline-outline"
            title="Post unavailable"
            body="No saved copy is available yet. Reconnect and try again."
            tone="warning"
          />
        ) : (
          <View style={styles.column}>
            <View style={styles.headRow}>
              <Text
                onPress={() => onOpenCommunity(item.community)}
                maxFontSizeMultiplier={maxFontScale.overline}
                style={[typography.overline, { color: colors.ember }]}
              >
                r/{item.community}
              </Text>
              <Text
                onPress={() => onOpenAuthor(item.authorKey)}
                maxFontSizeMultiplier={maxFontScale.caption}
                style={[typography.caption, { color: colors.text2 }]}
              >
                {' '}
                · u/{item.authorKey.slice(0, 10)}…
              </Text>
              <Seal colors={colors} state={seal} onPress={onAudit} />
            </View>
            <Text maxFontSizeMultiplier={maxFontScale.h1} style={[typography.h1, { color: colors.text }]}>
              {item.title}
            </Text>
            {item.url ? (
              <Text
                selectable
                onPress={() => void Share.share({ message: item.url })}
                maxFontSizeMultiplier={maxFontScale.body}
                style={[typography.body, { color: colors.link }]}
              >
                {item.url}
              </Text>
            ) : null}
            {item.removed ? (
              <Text maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text2, fontStyle: 'italic' }]}>
                Hidden by community moderators.
              </Text>
            ) : item.bodyMarkdown ? (
              <Markdown style={markdownStyles(colors)}>{item.bodyMarkdown}</Markdown>
            ) : null}

            <View style={styles.actionBar}>
              <VoteButtons
                colors={colors}
                homeNode={homeNode}
                communityId={item.community}
                target={contentId}
                targetKind="post"
                score={item.score}
                myVote={item.myVote}
                onError={(text) => setNotice({ tone: 'danger', text })}
              />
              <Button
                colors={colors}
                variant="ghost"
                icon={item.saved ? 'bookmark' : 'bookmark-outline'}
                label={item.saved ? 'Saved' : 'Save'}
                onPress={() => void toggleSave()}
              />
              <Button colors={colors} variant="ghost" icon="sparkles-outline" label="Award" onPress={() => void giveAward()} />
              <Button
                colors={colors}
                variant="ghost"
                icon="share-outline"
                label="Share"
                onPress={() => void Share.share({ message: `${item.title}\n${contentId}` })}
              />
            </View>

            {notice ? (
              <StatusBanner
                colors={colors}
                icon={notice.tone === 'verified' ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                title={notice.tone === 'verified' ? 'Done' : 'Not completed'}
                body={notice.text}
                tone={notice.tone}
              />
            ) : null}

            <Section title={`${item.commentCount} comments`} colors={colors}>
              {replying ? (
                <View style={styles.replyBlock}>
                  <TextInput
                    accessibilityLabel="Write a comment"
                    multiline
                    placeholder="What are your thoughts?"
                    placeholderTextColor={colors.text3}
                    value={replyText}
                    onChangeText={setReplyText}
                    style={[typography.body, styles.replyInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface2 }]}
                  />
                  <View style={styles.replyActions}>
                    <Button colors={colors} label="Cancel" variant="ghost" onPress={() => setReplying(false)} />
                    <Button colors={colors} label="Comment" disabled={!replyText.trim()} onPress={() => void submitReply()} />
                  </View>
                </View>
              ) : (
                <Button colors={colors} variant="secondary" icon="chatbubble-outline" label="Add a comment" onPress={() => setReplying(true)} />
              )}
              {tree.roots.map((node) => (
                <CommentNode
                  key={node.comment.contentId}
                  colors={colors}
                  homeNode={homeNode}
                  communityId={item.community}
                  node={node}
                  isAuthor={isAuthor}
                  onReply={reply}
                  onEdit={editComment}
                  onDelete={removeComment}
                  onReport={() => setReportOpen(true)}
                  onVoteError={(text) => setNotice({ tone: 'danger', text })}
                />
              ))}
            </Section>
            <View style={{ height: bottom }} />
          </View>
        )}
      </Page>

      <ActionSheet
        colors={colors}
        mode={mode}
        visible={overflowOpen}
        onClose={() => setOverflowOpen(false)}
        title="Post actions"
        items={[
          { label: 'View audit proof', icon: 'shield-checkmark-outline', onPress: onAudit },
          ...(isMine
            ? [
                { label: 'Edit post', icon: 'create-outline', onPress: onEdit },
                { label: 'Delete post', icon: 'trash-outline', destructive: true, onPress: () => setDeleteOpen(true) },
              ]
            : [{ label: 'Report post', icon: 'flag-outline', onPress: () => setReportOpen(true) }]),
        ]}
      />
      <ConfirmSheet
        colors={colors}
        mode={mode}
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this post?"
        body="It stays visible with a public tombstone — content isn't erased, only withheld."
        confirmLabel="Delete"
        destructive
        onConfirm={() => void removePost()}
      />
      <ActionSheet
        colors={colors}
        mode={mode}
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report this content"
        items={[
          { label: 'Spam', onPress: () => void submitReport(ReportReason.REPORT_REASON_SPAM, '') },
          { label: 'Harassment or bullying', onPress: () => void submitReport(ReportReason.REPORT_REASON_HARASSMENT, '') },
          { label: 'Breaks community rules', onPress: () => void submitReport(ReportReason.REPORT_REASON_UNSPECIFIED, 'breaks rules') },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  column: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: spacing.md, gap: spacing.sm, paddingTop: spacing.md },
  headRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  actionBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, paddingVertical: spacing.xs },
  replyBlock: { gap: spacing.xs },
  replyInput: { minHeight: 96, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, textAlignVertical: 'top' },
  replyActions: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'flex-end' },
});
