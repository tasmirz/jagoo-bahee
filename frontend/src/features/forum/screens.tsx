import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { verifyAuditCertificate } from '@jagoo/sdk';
import { featureDestinations, type FeatureDestination } from '../catalog';
import {
  useNodeCommunities,
  useNodeComments,
  useNodeFeed,
  useNodePost,
  useNodeSearch,
  type FeedPost,
} from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import {
  createForumIdentity,
  forumSessionSummary,
  importForumIdentity,
  lockForumIdentity,
  publishForumComment,
  publishForumPost,
  publishForumVote,
  registerForumIdentity,
  unlockForumIdentity,
  type ForumSessionSummary,
} from '../../signer';
import type { AppPalette, ThemeMode } from '../../theme';
import { radius, spacing, type as typography } from '../../theme';
import {
  AppHeader,
  Button,
  Divider,
  EmptyState,
  IconButton,
  Pill,
  PressScale,
  ReachPill,
  Screen,
  Seal,
  SectionHeader,
  StatusBanner,
  type ReachState,
} from '../../ui/primitives';
import { certificateStatus, listAuditCertificates, type StoredAuditCertificate } from '../../audit';
import { sealStateFor } from '../../verify';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import {
  FeatureWorkspace,
  MessagingWorkspace,
  NotificationsWorkspace,
} from '../capabilities/workspace';

interface CommonProps {
  readonly colors: AppPalette;
  readonly reach: ReachState;
  readonly onOpenNetwork?: () => void;
}

function ContentColumn({ children }: { readonly children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  return <View style={[styles.column, width >= 760 ? styles.columnWide : null]}>{children}</View>;
}

function VoteControl({
  colors,
  onVote,
  score = 128,
}: {
  readonly colors: AppPalette;
  readonly onVote?: (value: -1 | 0 | 1) => Promise<void>;
  readonly score?: number;
}) {
  const [vote, setVote] = useState<-1 | 0 | 1>(0);
  const [busy, setBusy] = useState(false);
  const changeVote = async (next: -1 | 0 | 1) => {
    const previous = vote;
    setVote(next);
    if (!onVote) return;
    setBusy(true);
    try {
      await onVote(next);
    } catch {
      setVote(previous);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View
      accessibilityLabel={`Vote score ${score + vote}`}
      style={[styles.vote, { backgroundColor: colors.surface2 }]}
    >
      <IconButton
        colors={colors}
        icon={vote === 1 ? 'arrow-up-circle' : 'arrow-up-outline'}
        label="Upvote"
        active={vote === 1}
        disabled={busy}
        onPress={() => void changeVote(vote === 1 ? 0 : 1)}
      />
      <Text style={[typography.label, { color: vote ? colors.ember : colors.text }]}>
        {score + vote}
      </Text>
      <IconButton
        colors={colors}
        icon={vote === -1 ? 'arrow-down-circle' : 'arrow-down-outline'}
        label="Downvote"
        active={vote === -1}
        disabled={busy}
        onPress={() => void changeVote(vote === -1 ? 0 : -1)}
      />
    </View>
  );
}

function PostCard({
  colors,
  onPress,
  compact = false,
  onVote,
  post,
}: {
  readonly colors: AppPalette;
  readonly onPress: () => void;
  readonly compact?: boolean;
  readonly onVote?: (value: -1 | 0 | 1) => Promise<void>;
  readonly post: FeedPost;
}) {
  const title = post.title;
  const body = post.bodyMarkdown ?? 'Hidden with a public tombstone.';
  const community = post.community;
  const author = `${post.authorKey.slice(0, 8)}…`;
  const score = post.score;
  const comments = post.commentCount;
  // THR-01 — recomputed on this device from the provenance block, with no network and no
  // trust in what the node said about it. Memoised per content ID because the check is a
  // SHA-256, an Ed25519 verify and a Merkle path walk, and a feed renders 25 of them.
  const seal = useMemo(() => sealStateFor(post.provenance), [post.provenance]);
  return (
    <PressScale label={`Open post: ${title}`} onPress={onPress}>
      <View style={[styles.post, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.postMeta}>
          <View style={[styles.avatar, { backgroundColor: colors.surface2 }]}>
            <Text style={[typography.caption, { color: colors.ember }]}>r/</Text>
          </View>
          <View style={styles.flex}>
            <Text style={[typography.overline, { color: colors.text }]}>r/{community}</Text>
            <Text style={[typography.caption, { color: colors.text2 }]}>
              u/{author} · {new Date(post.createdAtMs).toLocaleDateString()}
            </Text>
          </View>
          <Seal colors={colors} state={seal} />
        </View>
        <Text style={[typography.h1, { color: colors.text }]}>{title}</Text>
        <Text numberOfLines={compact ? 2 : 3} style={[typography.body, { color: colors.text2 }]}>
          {body}
        </Text>
        <View style={styles.postActions}>
          <VoteControl colors={colors} onVote={onVote} score={score} />
          <View style={styles.inlineActions}>
            <IconButton
              colors={colors}
              icon="chatbubble-outline"
              label={`${comments} comments`}
              onPress={onPress}
            />
            <IconButton
              colors={colors}
              icon="share-outline"
              label="Share post"
              onPress={() =>
                void Share.share({
                  message: `${post.title}\n${post.contentId}`,
                  title: post.title,
                })
              }
            />
          </View>
        </View>
        <View style={styles.transport}>
          <Ionicons name="git-network-outline" size={14} color={colors.text2} />
          <Text style={[typography.caption, { color: colors.text2 }]}>via HTTP · proof stored</Text>
        </View>
      </View>
    </PressScale>
  );
}

export function FeedScreen({
  colors,
  reach,
  homeNode,
  onOpenPost,
  onOpenNetwork,
  onSearch,
}: CommonProps & {
  readonly homeNode: HomeNode;
  readonly onOpenPost: (contentId: string) => void;
  readonly onSearch: () => void;
}) {
  const baseUrl = homeNode.baseUrl;
  const [sort, setSort] = useState('For you');
  const [actionError, setActionError] = useState('');
  const querySort =
    sort === 'Popular' ? 'top' : sort === 'Local' || sort === 'Following' ? 'new' : 'hot';
  const feed = useNodeFeed(baseUrl, querySort);
  const posts = feed.data?.value.items ?? [];
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} onReach={onOpenNetwork} onSearch={onSearch} />
      <ContentColumn>
        {reach !== 'connected' ? (
          <StatusBanner
            colors={colors}
            icon={reach === 'blackout' ? 'cloud-offline-outline' : 'swap-vertical-outline'}
            title={reach === 'blackout' ? 'Reading from this device' : 'Federation is slow'}
            body={
              reach === 'blackout'
                ? 'New posts queue safely and send when any path opens.'
                : 'Posting and reading still work. Live updates may arrive late.'
            }
            tone={reach === 'blackout' ? 'danger' : 'warning'}
          />
        ) : null}
        <ScrollView
          horizontal
          contentContainerStyle={styles.pills}
          showsHorizontalScrollIndicator={false}
        >
          {['For you', 'Following', 'Local', 'Popular'].map((item) => (
            <Pill
              key={item}
              colors={colors}
              label={item}
              selected={sort === item}
              onPress={() => setSort(item)}
            />
          ))}
        </ScrollView>
        {feed.isError ? (
          <StatusBanner
            action="Try again"
            colors={colors}
            icon="cloud-offline-outline"
            title="Node is unavailable"
            body="No saved feed is available yet. Start the local node or check the configured address."
            onAction={() => void feed.refetch()}
            tone="danger"
          />
        ) : null}
        {actionError ? (
          <StatusBanner
            action="Dismiss"
            body={actionError}
            colors={colors}
            icon="alert-circle-outline"
            onAction={() => setActionError('')}
            title="Signed action was not accepted"
            tone="warning"
          />
        ) : null}
        {posts.length > 0 ? (
          posts.map((post, index) => (
            <PostCard
              key={post.contentId}
              colors={colors}
              onPress={() => onOpenPost(post.contentId)}
              compact={index > 0}
              onVote={async (value) => {
                try {
                  await publishForumVote(
                    homeNode.baseUrl,
                    {
                      communityId: post.community,
                      target: post.contentId,
                      targetKind: 'post',
                      value,
                    },
                    homeNode.discovery.services.auditLogs,
                  );
                  await feed.refetch();
                } catch (error) {
                  setActionError((error as Error).message);
                  throw error;
                }
              }}
              post={post}
            />
          ))
        ) : !feed.isLoading && !feed.isError ? (
          <EmptyState
            colors={colors}
            icon="documents-outline"
            title="No posts yet"
            body="This node is ready. Create the first signed post from the Create tab."
          />
        ) : null}
      </ContentColumn>
    </Screen>
  );
}

export function PostDetailScreen({
  colors,
  reach,
  homeNode,
  contentId,
  onBack,
  onAudit,
  onOpenNetwork,
}: CommonProps & {
  readonly homeNode: HomeNode;
  readonly contentId: string;
  readonly onBack: () => void;
  readonly onAudit: () => void;
}) {
  const baseUrl = homeNode.baseUrl;
  const post = useNodePost(baseUrl, contentId);
  const comments = useNodeComments(baseUrl, contentId);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const [replyNotice, setReplyNotice] = useState('');
  const item = post.data?.value;
  const rows = comments.data?.value.items ?? [];
  return (
    <Screen colors={colors}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <ReachPill colors={colors} state={reach} compact onPress={onOpenNetwork} />
        <View style={{ width: 44 }} />
      </View>
      <ContentColumn>
        {item ? (
          <PostCard
            colors={colors}
            onPress={onAudit}
            onVote={async (value) => {
              await publishForumVote(
                homeNode.baseUrl,
                {
                  communityId: item.community,
                  target: item.contentId,
                  targetKind: 'post',
                  value,
                },
                homeNode.discovery.services.auditLogs,
              );
              await post.refetch();
            }}
            post={item}
          />
        ) : post.isError ? (
          <StatusBanner
            body="The node could not return this post. Its acknowledgement may still be in your proof vault."
            colors={colors}
            icon="alert-circle-outline"
            title="Post unavailable"
            tone="warning"
          />
        ) : null}
        <SectionHeader
          colors={colors}
          title="Top comments"
          action="Audit proof"
          onAction={onAudit}
        />
        {item ? (
          <View style={styles.replyComposer}>
            <Text style={[typography.label, { color: colors.text }]}>Write a signed reply</Text>
            <TextInput
              accessibilityLabel="Reply"
              maxLength={10_000}
              multiline
              onChangeText={setReply}
              placeholder="Add to the conversation"
              placeholderTextColor={colors.text3}
              style={[
                styles.input,
                styles.replyInput,
                typography.body,
                { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text },
              ]}
              value={reply}
            />
            <Button
              colors={colors}
              disabled={!reply.trim() || replying || reach !== 'connected'}
              icon="send-outline"
              label={replying ? 'Signing reply…' : 'Publish reply'}
              onPress={() => {
                setReplying(true);
                setReplyNotice('');
                void publishForumComment(
                  homeNode.baseUrl,
                  {
                    bodyMarkdown: reply,
                    communityId: item.community,
                    postId: item.contentId,
                  },
                  homeNode.discovery.services.auditLogs,
                )
                  .then(async () => {
                    setReply('');
                    setReplyNotice('Reply acknowledged, saved, and forwarded to audit services.');
                    await comments.refetch();
                  })
                  .catch((error: Error) => setReplyNotice(error.message))
                  .finally(() => setReplying(false));
              }}
            />
            {replyNotice ? (
              <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.text2 }]}>
                {replyNotice}
              </Text>
            ) : null}
          </View>
        ) : null}
        {rows.map((comment) => (
          <View
            key={comment.contentId}
            style={[
              styles.comment,
              {
                borderLeftColor: comment.depth === 0 ? colors.ember : colors.border,
                marginLeft: Math.min(comment.depth, 8) * spacing.md,
              },
            ]}
          >
            <View style={styles.commentMeta}>
              <Text style={[typography.caption, { color: colors.text2 }]}>
                {comment.authorKey.slice(0, 10)}… · {new Date(comment.createdAtMs).toLocaleString()}
              </Text>
              <Seal colors={colors} state={sealStateFor(comment.provenance)} />
            </View>
            <Text style={[typography.body, { color: colors.text }]}>
              {comment.bodyMarkdown ?? 'Hidden with a public tombstone.'}
            </Text>
            <View accessibilityLabel={`Comment score ${comment.score}`} style={styles.inlineActions}>
              <Ionicons name="arrow-up-outline" size={16} color={colors.text2} />
              <Text style={[typography.caption, { color: colors.text2 }]}>
                {comment.score} points
              </Text>
            </View>
          </View>
        ))}
        {!comments.isLoading && rows.length === 0 ? (
          <EmptyState
            body="Start a signed reply when you have something useful to add."
            colors={colors}
            icon="chatbubble-outline"
            title="No comments yet"
          />
        ) : null}
      </ContentColumn>
    </Screen>
  );
}

export function AuditScreen({
  colors,
  baseUrl,
  contentId,
  onBack,
}: {
  readonly colors: AppPalette;
  readonly baseUrl: string;
  readonly contentId: string;
  readonly onBack: () => void;
}) {
  const [record, setRecord] = useState<StoredAuditCertificate | null>(null);
  const [status, setStatus] = useState<{
    readonly status: string;
    readonly reason: string | null;
  } | null>(null);
  useEffect(() => {
    void listAuditCertificates().then((records) => {
      setRecord(records.find((item) => item.certificate.identifier === contentId) ?? null);
    });
  }, [contentId]);
  const verification = record ? verifyAuditCertificate(record.certificate) : null;
  const receipt = record?.certificate.acknowledgement;
  const rows = receipt
    ? [
        [
          'Request packet',
          verification?.checks.requestPacket ? 'Verified' : 'Failed',
          contentId.slice(0, 18),
        ],
        [
          'Node receipt',
          verification?.checks.receiptSignature ? 'Verified' : 'Failed',
          receipt.server_id.slice(0, 16),
        ],
        [
          'Merkle inclusion',
          verification?.checks.receiptSignature ? 'Verified' : 'Failed',
          `leaf ${receipt.leaf_index} · tree ${receipt.sth.tree_size}`,
        ],
        [
          'Independent copies',
          record.deliveries.some((item) => item.delivered) ? 'Stored' : 'Pending',
          String(record.deliveries.filter((item) => item.delivered).length),
        ],
        ['Stored on device', 'Available offline', new Date(record.storedAtMs).toLocaleString()],
      ]
    : [];
  return (
    <Screen colors={colors}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <Text accessibilityRole="header" style={[typography.h2, { color: colors.text }]}>
          Publication proof
        </Text>
        <IconButton
          colors={colors}
          disabled={!record}
          icon="share-outline"
          label="Export proof"
          onPress={
            record
              ? () =>
                  void Share.share({
                    message: JSON.stringify(record.certificate),
                    title: `Jagoo acknowledgement ${record.certificate.identifier}`,
                  })
              : undefined
          }
        />
      </View>
      <ContentColumn>
        {record ? (
          <>
            <View style={styles.auditHero}>
              <View style={[styles.auditSeal, { backgroundColor: colors.verified }]}>
                <Ionicons name="shield-checkmark" size={32} color={colors.onAccent} />
              </View>
              <Text style={[typography.h1, { color: colors.text }]}>
                {verification?.valid ? 'Verified independently' : 'Proof needs attention'}
              </Text>
              <Text style={[typography.body, styles.center, { color: colors.text2 }]}>
                This device verified the author, node receipt, and transparency proof without
                trusting the rendered page.
              </Text>
            </View>
            <View style={[styles.auditList, { borderColor: colors.border }]}>
              {rows.map(([title, status, detail], index) => (
                <View key={title}>
                  <View style={styles.auditRow}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.verified} />
                    <View style={styles.flex}>
                      <Text style={[typography.label, { color: colors.text }]}>{title}</Text>
                      <Text style={[typography.caption, { color: colors.verified }]}>{status}</Text>
                    </View>
                    <Text style={[typography.mono, styles.auditDetail, { color: colors.text2 }]}>
                      {detail}
                    </Text>
                  </View>
                  {index < rows.length - 1 ? <Divider colors={colors} /> : null}
                </View>
              ))}
            </View>
            <StatusBanner
              colors={colors}
              icon="cloud-offline-outline"
              title="Works without the network"
              body="The receipt and tree head are stored on this device as durable publication evidence."
              tone="verified"
            />
            {status ? (
              <StatusBanner
                colors={colors}
                icon={status.status === 'online' ? 'checkmark-circle' : 'alert-circle-outline'}
                title={`Server reports: ${status.status}`}
                body={status.reason ?? 'The acknowledged content is present.'}
                tone={status.status === 'online' ? 'verified' : 'warning'}
              />
            ) : null}
            <View style={styles.pageActions}>
              <Button
                colors={colors}
                label="Ask server for status"
                icon="pulse-outline"
                onPress={() =>
                  void certificateStatus(baseUrl, record.certificate).then((result) =>
                    setStatus({ status: result.status, reason: result.reason }),
                  )
                }
              />
            </View>
          </>
        ) : (
          <EmptyState
            colors={colors}
            icon="shield-outline"
            title="No local acknowledgement"
            body="This post was not published from this device, so its request certificate is not in your vault."
          />
        )}
      </ContentColumn>
    </Screen>
  );
}

export function CommunitiesScreen({
  colors,
  reach,
  baseUrl,
  onOpenNetwork,
  onOpenFeature,
  onOpenCommunity,
}: CommonProps & {
  readonly baseUrl: string;
  readonly onOpenFeature: (feature: FeatureDestination) => void;
  readonly onOpenCommunity: (communityId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const communities = useNodeCommunities(baseUrl, debouncedQuery);
  const items = communities.data?.value.items ?? [];
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} onReach={onOpenNetwork} title="Communities" />
      <ContentColumn>
        <View style={[styles.searchBox, { backgroundColor: colors.surface2 }]}>
          <Ionicons name="search-outline" size={18} color={colors.text2} />
          <TextInput
            accessibilityLabel="Search communities"
            onChangeText={setQuery}
            placeholder="Search communities"
            placeholderTextColor={colors.text3}
            style={[typography.body, styles.flex, { color: colors.text }]}
            value={query}
          />
        </View>
        <SectionHeader
          colors={colors}
          title="Discover"
          action="Manage"
          onAction={() => onOpenFeature(featureDestinations[2]!)}
        />
        {items.map((community) => (
          <PressScale
            key={community.id}
            label={`Open r/${community.name}`}
            onPress={() => onOpenCommunity(community.id)}
          >
            <View style={[styles.communityRow, { borderBottomColor: colors.border }]}>
              <View style={[styles.communityAvatar, { backgroundColor: colors.ember }]}>
                <Text style={[typography.label, { color: colors.onAccent }]}>
                  {community.name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={[typography.h2, { color: colors.text }]}>r/{community.name}</Text>
                <Text numberOfLines={2} style={[typography.body, { color: colors.text2 }]}>
                  {community.description || community.title}
                </Text>
                <Text style={[typography.caption, { color: colors.text2 }]}>
                  {community.memberCount.toLocaleString()} members · {community.postCount} posts
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.text2} />
            </View>
          </PressScale>
        ))}
        {!communities.isLoading && items.length === 0 ? (
          <EmptyState
            action="Manage communities"
            body={
              query
                ? 'No communities on this node match that search.'
                : 'This home node has no communities yet.'
            }
            colors={colors}
            icon="people-outline"
            onAction={() => onOpenFeature(featureDestinations[2]!)}
            title={query ? 'Nothing found' : 'Build the first community'}
          />
        ) : null}
      </ContentColumn>
    </Screen>
  );
}

export function ComposeScreen({
  colors,
  reach,
  homeNode,
  onOpenNetwork,
}: CommonProps & { readonly homeNode: HomeNode }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [spoiler, setSpoiler] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{
    readonly tone: 'verified' | 'danger';
    readonly title: string;
    readonly body: string;
  } | null>(null);
  const communities = useNodeCommunities(homeNode.baseUrl, '');
  const publishingCommunity = communities.data?.value.items[0] ?? null;

  const publish = async () => {
    setPublishing(true);
    setPublishResult(null);
    try {
      const receipt = await publishForumPost(
        homeNode.baseUrl,
        {
          title: title.trim(),
          bodyMarkdown: body.trim(),
        },
        homeNode.discovery.services.auditLogs,
      );
      setTitle('');
      setBody('');
      setPublishResult({
        tone: 'verified',
        title: 'Published with durable proof',
        body:
          `${receipt.contentId.slice(0, 18)}… · transparency leaf ${receipt.leafIndex}` +
          (receipt.auditCopies > 0
            ? ` · ${receipt.auditCopies} independent audit copy`
            : ' · proof saved on this device'),
      });
    } catch (error) {
      setPublishResult({
        tone: 'danger',
        title: 'Post was not published',
        body: (error as Error).message,
      });
    } finally {
      setPublishing(false);
    }
  };
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} onReach={onOpenNetwork} title="Create" />
      <ContentColumn>
        <View style={styles.compose}>
          <Text style={[typography.overline, { color: colors.text2 }]}>Community</Text>
          <View style={[styles.selector, { backgroundColor: colors.surface2 }]}>
            <Text style={[typography.label, { color: colors.text }]}>
              {publishingCommunity ? `r/${publishingCommunity.name}` : 'No community available'}
            </Text>
            <Ionicons name="people-outline" size={18} color={colors.text2} />
          </View>
          <View style={styles.composeKinds}>
            <Pill colors={colors} label="Signed text post" selected />
          </View>
          <Text style={[typography.label, { color: colors.text }]}>Title</Text>
          <TextInput
            accessibilityLabel="Post title"
            maxLength={300}
            onChangeText={setTitle}
            placeholder="What should people know?"
            placeholderTextColor={colors.text3}
            style={[
              styles.input,
              typography.bodyLarge,
              { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text },
            ]}
            value={title}
          />
          <Text style={[typography.caption, { color: colors.text2, textAlign: 'right' }]}>
            {title.length}/300
          </Text>
          <Text style={[typography.label, { color: colors.text }]}>Body</Text>
          <TextInput
            accessibilityLabel="Post body"
            multiline
            onChangeText={setBody}
            placeholder="Write in Markdown…"
            placeholderTextColor={colors.text3}
            style={[
              styles.input,
              styles.textarea,
              typography.body,
              { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text },
            ]}
            textAlignVertical="top"
            value={body}
          />
          <View style={styles.attachmentRow}>
            <Ionicons name="logo-markdown" size={18} color={colors.text2} />
            <Text style={[typography.caption, { color: colors.text2 }]}>
              Markdown is preserved inside the signed request.
            </Text>
          </View>
          <View style={styles.settingRow}>
            <View style={styles.flex}>
              <Text style={[typography.label, { color: colors.text }]}>Spoiler</Text>
              <Text style={[typography.caption, { color: colors.text2 }]}>
                Blur previews until opened
              </Text>
            </View>
            <Switch
              accessibilityLabel="Mark as spoiler"
              onValueChange={setSpoiler}
              trackColor={{ false: colors.surface2, true: colors.ember }}
              value={spoiler}
            />
          </View>
          {reach !== 'connected' ? (
            <StatusBanner
              colors={colors}
              icon="time-outline"
              title="Publishing is unavailable on this path"
              body="Your draft stays on this screen. Durable background outbox delivery arrives in P5."
              tone="warning"
            />
          ) : null}
          {publishResult ? (
            <StatusBanner
              colors={colors}
              icon={
                publishResult.tone === 'verified'
                  ? 'shield-checkmark-outline'
                  : 'alert-circle-outline'
              }
              title={publishResult.title}
              body={publishResult.body}
              tone={publishResult.tone}
            />
          ) : null}
          <Button
            colors={colors}
            disabled={
              !title.trim() || !publishingCommunity || reach !== 'connected' || publishing
            }
            label={publishing ? 'Signing and publishing…' : 'Publish signed post'}
            icon="send-outline"
            onPress={() => void publish()}
          />
        </View>
      </ContentColumn>
    </Screen>
  );
}

export function InboxScreen({
  colors,
  reach,
  onOpenNetwork,
  homeNode,
  onOpenSignal,
}: CommonProps & { readonly homeNode: HomeNode; readonly onOpenSignal: () => void }) {
  const [tab, setTab] = useState<'Messages' | 'Notifications'>('Messages');
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} onReach={onOpenNetwork} title="Inbox" />
      <ContentColumn>
        <View style={styles.inboxTabs}>
          {(['Messages', 'Notifications'] as const).map((item) => (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item }}
              onPress={() => setTab(item)}
              style={[
                styles.inboxTab,
                tab === item ? { borderBottomColor: colors.signal } : null,
              ]}
            >
              <Text
                style={[
                  typography.label,
                  { color: tab === item ? colors.signal : colors.text2 },
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
        <StatusBanner
          action="Open Signal"
          colors={colors}
          icon="lock-closed-outline"
          onAction={onOpenSignal}
          title="Forum inbox"
          body="Pseudonymous Forum messages stay here. Identified crisis coordination has a separate Signal vault."
          tone="verified"
        />
        {tab === 'Messages' ? (
          <MessagingWorkspace colors={colors} homeNode={homeNode} />
        ) : (
          <NotificationsWorkspace colors={colors} homeNode={homeNode} />
        )}
      </ContentColumn>
    </Screen>
  );
}

export function ProfileScreen({
  colors,
  reach,
  onOpenNetwork,
  themeMode,
  onThemeChange,
  onOpenFeature,
}: CommonProps & {
  readonly themeMode: ThemeMode;
  readonly onThemeChange: () => void;
  readonly onOpenFeature: (feature: FeatureDestination) => void;
}) {
  const [session, setSession] = useState<ForumSessionSummary | null>(null);
  useEffect(() => {
    void forumSessionSummary().then(setSession);
  }, []);
  const grouped = useMemo(
    () =>
      featureDestinations.reduce<Record<string, FeatureDestination[]>>((result, feature) => {
        (result[feature.area] ??= []).push(feature);
        return result;
      }, {}),
    [],
  );
  return (
    <Screen colors={colors}>
      <AppHeader colors={colors} reach={reach} onReach={onOpenNetwork} title="Profile" />
      <ContentColumn>
        <View style={styles.profileHero}>
          <View style={[styles.profileAvatar, { backgroundColor: colors.ember }]}>
            <Ionicons name="key-outline" size={24} color={colors.onAccent} />
          </View>
          <Text style={[typography.h1, { color: colors.text }]}>Forum identity</Text>
          <Text style={[typography.mono, { color: colors.text2 }]}>
            {session?.identityId ??
              (session?.configured ? 'locked on this device' : 'not configured')}
          </Text>
          <Text style={[typography.body, styles.center, { color: colors.text2 }]}>
            Pseudonymous by design · separate from private messages
          </Text>
          <Seal
            colors={colors}
            label={session?.unlocked ? 'key vault unlocked' : 'key vault protected'}
            state={session?.unlocked ? 'synced' : 'queued'}
          />
          <View style={styles.profileActions}>
            <Button
              colors={colors}
              label="Profile details"
              onPress={() => onOpenFeature(featureDestinations[1]!)}
              variant="secondary"
            />
            <IconButton
              colors={colors}
              icon={themeMode === 'dark' ? 'sunny-outline' : 'moon-outline'}
              label={`Use ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
              onPress={onThemeChange}
            />
          </View>
        </View>
        {Object.entries(grouped).map(([area, features]) => (
          <View key={area}>
            <SectionHeader colors={colors} title={area} />
            {features.map((feature) => (
              <PressScale
                key={feature.id}
                label={`Open ${feature.title}`}
                onPress={() => onOpenFeature(feature)}
              >
                <View style={[styles.featureRow, { borderBottomColor: colors.border }]}>
                  <View style={[styles.featureIcon, { backgroundColor: colors.surface2 }]}>
                    <Ionicons name={feature.icon} size={19} color={colors.ember} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[typography.label, { color: colors.text }]}>{feature.title}</Text>
                    <Text numberOfLines={2} style={[typography.caption, { color: colors.text2 }]}>
                      {feature.description}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.text2} />
                </View>
              </PressScale>
            ))}
          </View>
        ))}
      </ContentColumn>
    </Screen>
  );
}

function IdentityPanel({
  colors,
  homeNode,
}: {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
}) {
  const registrationUrl = homeNode.baseUrl;
  const [passphrase, setPassphrase] = useState('');
  const [importPhrase, setImportPhrase] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [summary, setSummary] = useState<ForumSessionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    readonly tone: 'verified' | 'danger';
    readonly title: string;
    readonly body: string;
  } | null>(null);

  const refresh = async () => setSummary(await forumSessionSummary());
  useEffect(() => {
    void refresh();
  }, []);

  const execute = async (operation: () => Promise<string>, success: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const identityId = await operation();
      await refresh();
      setNotice({ tone: 'verified', title: success, body: identityId });
    } catch (error) {
      setNotice({
        tone: 'danger',
        title: 'Identity action failed',
        body: (error as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await createForumIdentity(passphrase);
      setRecoveryPhrase(result.recoveryPhrase);
      await refresh();
      setNotice({
        tone: 'verified',
        title: 'Identity created on this device',
        body: result.identityId,
      });
    } catch (error) {
      setNotice({
        tone: 'danger',
        title: 'Identity action failed',
        body: (error as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={[
        styles.identityPanel,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[typography.h2, { color: colors.text }]}>Forum key vault</Text>
      <Text style={[typography.body, { color: colors.text2 }]}>
        {summary?.unlocked
          ? `Unlocked · ${summary.identityId}`
          : summary?.configured
            ? 'Configured on this device · locked'
            : 'No Forum identity is configured'}
      </Text>
      <TextInput
        accessibilityLabel="Identity passphrase"
        onChangeText={setPassphrase}
        placeholder="App passphrase (8+ characters)"
        placeholderTextColor={colors.text3}
        secureTextEntry
        style={[
          styles.input,
          typography.body,
          { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text },
        ]}
        value={passphrase}
      />
      {!summary?.configured ? (
        <>
          <Button
            colors={colors}
            disabled={busy || passphrase.length < 8}
            label={busy ? 'Creating…' : 'Create new identity'}
            icon="key-outline"
            onPress={() => void create()}
          />
          <TextInput
            accessibilityLabel="Recovery phrase to import"
            multiline
            onChangeText={setImportPhrase}
            placeholder="Or paste a 24-word recovery phrase"
            placeholderTextColor={colors.text3}
            style={[
              styles.input,
              styles.recoveryInput,
              typography.body,
              { backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text },
            ]}
            value={importPhrase}
          />
          <Button
            colors={colors}
            disabled={busy || passphrase.length < 8 || !importPhrase.trim()}
            label="Import recovery phrase"
            variant="secondary"
            onPress={() =>
              void execute(() => importForumIdentity(importPhrase, passphrase), 'Identity imported')
            }
          />
        </>
      ) : summary.unlocked ? (
        <>
          <Button
            colors={colors}
            disabled={busy || !registrationUrl}
            label={registrationUrl ? 'Register and authenticate' : 'Configure a node to register'}
            icon="shield-checkmark-outline"
            onPress={() =>
              registrationUrl
                ? void execute(
                    () =>
                      registerForumIdentity(registrationUrl, homeNode.discovery.services.auditLogs),
                    'Certificate published and session authenticated',
                  )
                : undefined
            }
          />
          <Button
            colors={colors}
            label="Lock identity"
            variant="secondary"
            onPress={() => {
              lockForumIdentity();
              void refresh();
            }}
          />
        </>
      ) : (
        <Button
          colors={colors}
          disabled={busy || passphrase.length < 8}
          label={busy ? 'Unlocking…' : 'Unlock identity'}
          icon="lock-open-outline"
          onPress={() => void execute(() => unlockForumIdentity(passphrase), 'Identity unlocked')}
        />
      )}
      {recoveryPhrase ? (
        <View style={[styles.recoveryPhrase, { backgroundColor: colors.surface2 }]}>
          <Text style={[typography.label, { color: colors.constrained }]}>
            Write this down now. It is shown only in this session.
          </Text>
          <Text selectable style={[typography.mono, { color: colors.text }]}>
            {recoveryPhrase}
          </Text>
        </View>
      ) : null}
      {notice ? (
        <StatusBanner
          colors={colors}
          icon={notice.tone === 'verified' ? 'shield-checkmark-outline' : 'alert-circle-outline'}
          title={notice.title}
          body={notice.body}
          tone={notice.tone}
        />
      ) : null}
    </View>
  );
}

export function FeatureScreen({
  colors,
  feature,
  homeNode,
  onBack,
}: {
  readonly colors: AppPalette;
  readonly feature: FeatureDestination;
  readonly homeNode: HomeNode;
  readonly onBack: () => void;
}) {
  const signal = feature.id === 'messaging';
  const accent = signal ? colors.signal : colors.ember;
  return (
    <Screen colors={colors}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <Text style={[typography.overline, { color: colors.text2 }]}>
          {feature.area}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <ContentColumn>
        <View style={[styles.featureHero, { borderBottomColor: colors.border }]}>
          <View style={styles.flex}>
            <Text style={[typography.overline, { color: accent }]}>
              {signal ? 'Private identity plane' : 'Pseudonymous Forum plane'}
            </Text>
            <Text accessibilityRole="header" style={[typography.h1, { color: colors.text }]}>
              {feature.title}
            </Text>
            <Text style={[typography.body, { color: colors.text2 }]}>
              {feature.description}
            </Text>
          </View>
          <Ionicons name={feature.icon} size={26} color={accent} />
        </View>
        {feature.id === 'identity' ? <IdentityPanel colors={colors} homeNode={homeNode} /> : null}
        {feature.id !== 'identity' ? (
          <FeatureWorkspace colors={colors} featureId={feature.id} homeNode={homeNode} />
        ) : null}
        <StatusBanner
          colors={colors}
          icon={signal ? 'lock-closed-outline' : 'shield-checkmark-outline'}
          title={signal ? 'Signal-space styling' : 'Forum identity protected'}
          body={
            signal
              ? 'This screen uses Signal blue and never exposes your community identity.'
              : 'No screen stores a network address beside your Forum key.'
          }
          tone="verified"
        />
      </ContentColumn>
    </Screen>
  );
}

export function SearchScreen({
  colors,
  baseUrl,
  onBack,
  onOpenPost,
}: {
  readonly colors: AppPalette;
  readonly baseUrl: string;
  readonly onBack: () => void;
  readonly onOpenPost: (contentId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('All');
  const debouncedQuery = useDebouncedValue(query);
  const kindParameter = {
    Posts: 'post',
    Comments: 'comment',
    Communities: 'community',
    People: 'identity',
  }[kind];
  const results = useNodeSearch(baseUrl, debouncedQuery, kindParameter);
  const items = results.data?.value.items ?? [];
  return (
    <Screen colors={colors}>
      <View style={[styles.detailHeader, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <TextInput
          accessibilityLabel="Search"
          autoFocus
          onChangeText={setQuery}
          placeholder="Search communities, posts…"
          placeholderTextColor={colors.text3}
          style={[styles.searchInput, typography.body, { color: colors.text }]}
          value={query}
        />
        <View style={{ width: 44 }} />
      </View>
      <ContentColumn>
        <ScrollView horizontal contentContainerStyle={styles.pills}>
          {['All', 'Posts', 'Comments', 'Communities', 'People'].map((item) => (
            <Pill
              key={item}
              colors={colors}
              label={item}
              onPress={() => setKind(item)}
              selected={kind === item}
            />
          ))}
        </ScrollView>
        {query && items.length > 0 ? (
          items.map((item, index) => {
            const title = item.title ?? item.name ?? item.displayName ?? 'Search result';
            const body = item.bodyMarkdown ?? item.description ?? item.community ?? '';
            return (
              <PressScale
                key={item.contentId ?? item.id ?? `${title}-${index}`}
                label={`Open ${title}`}
                onPress={item.contentId ? () => onOpenPost(item.contentId!) : undefined}
              >
                <View style={[styles.searchResult, { borderBottomColor: colors.border }]}>
                  <View style={[styles.searchResultMark, { backgroundColor: colors.surface2 }]}>
                    <Ionicons
                      name={item.title ? 'document-text-outline' : 'people-outline'}
                      size={18}
                      color={colors.ember}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text style={[typography.label, { color: colors.text }]}>{title}</Text>
                    {body ? (
                      <Text numberOfLines={2} style={[typography.body, { color: colors.text2 }]}>
                        {body}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </PressScale>
            );
          })
        ) : query && !results.isLoading ? (
          <EmptyState
            colors={colors}
            icon="search-outline"
            title="Nothing found"
            body="Try a shorter phrase or search for a community name."
          />
        ) : (
          <EmptyState
            colors={colors}
            icon="search-outline"
            title="Search without surrendering identity"
            body="Find public Forum content. Your search history stays on this device."
          />
        )}
      </ContentColumn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  column: { width: '100%', alignSelf: 'center' },
  columnWide: { maxWidth: 760 },
  pills: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  post: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  postMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inlineActions: { flexDirection: 'row', alignItems: 'center' },
  vote: {
    minHeight: 42,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
  },
  transport: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  detailHeader: {
    minHeight: 64,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  comment: {
    marginHorizontal: spacing.md,
    paddingLeft: spacing.md,
    paddingVertical: spacing.sm,
    borderLeftWidth: 2,
    gap: spacing.xs,
  },
  commentMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  replyComposer: { padding: spacing.md, gap: spacing.sm },
  replyInput: { minHeight: 112, textAlignVertical: 'top' },
  auditHero: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  auditSeal: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditList: { marginHorizontal: spacing.md, borderWidth: 1, borderRadius: radius.lg },
  auditRow: {
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  auditDetail: { maxWidth: '42%', textAlign: 'right' },
  pageActions: { padding: spacing.md },
  searchBox: {
    margin: spacing.md,
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  communityRow: {
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  communityAvatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compose: { padding: spacing.md, gap: spacing.sm },
  selector: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  composeKinds: { gap: spacing.xs },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, padding: spacing.sm },
  textarea: { minHeight: 170 },
  attachmentRow: { flexDirection: 'row', alignItems: 'center' },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  inboxTabs: { flexDirection: 'row', paddingHorizontal: spacing.md },
  inboxTab: {
    minHeight: 48,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  profileHero: { padding: spacing.lg, alignItems: 'center', gap: spacing.xs },
  profileAvatar: {
    width: 82,
    height: 82,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  profileActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  identityPanel: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  recoveryInput: { minHeight: 96 },
  recoveryPhrase: { padding: spacing.md, borderRadius: radius.md, gap: spacing.sm },
  featureRow: {
    minHeight: 72,
    marginHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureHero: {
    marginHorizontal: spacing.md,
    paddingVertical: spacing.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  searchInput: { flex: 1, minHeight: 48 },
  searchResult: {
    minHeight: 76,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchResultMark: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
