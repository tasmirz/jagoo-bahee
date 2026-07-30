import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  InfiniteList,
  Page,
  PageHeader,
  SegmentedControl,
  SkeletonPostCard,
  StatusBanner,
  maxFontScale,
  radius,
  spacing,
  type as typography,
  type AppPalette,
  type ReachState,
  type ThemeMode,
} from '../../design-system';
import {
  useInfiniteFeed,
  useNodeDocument,
  type FeedPost,
  type NodeCommunity,
  type NodePage,
} from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import { forumSessionSummary, setForumMembership } from '../../signer';
import { PostCard } from '../posts/post-card';

interface CommunityStats {
  readonly members: number;
  readonly posts: number;
  readonly pendingReports: number;
}

interface ModeratorRow {
  readonly memberKey: string;
}

type Tab = 'posts' | 'about';

/**
 * Root cause: "no post add button while being in a community." Fixes it with a raised FAB
 * that pre-fills the composer's community picker (`/composer?community=<id>`), replaces the
 * bare `postRow` with the canonical `PostCard`, and reads real membership/join state from the
 * backend's additive `joined` field instead of a `useState(false)` that never left "Join".
 */
export function CommunityScreen({
  colors,
  mode,
  reach,
  homeNode,
  communityId,
  onBack,
  onOpenPost,
  onOpenAuthor,
  onOpenAudit,
  onOpenNetwork,
  onOpenManagement,
  onCreatePost,
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly reach: ReachState;
  readonly homeNode: HomeNode;
  readonly communityId: string;
  readonly onBack: () => void;
  readonly onOpenPost: (contentId: string) => void;
  readonly onOpenAuthor: (keyId: string) => void;
  readonly onOpenAudit: (contentId: string) => void;
  readonly onOpenNetwork: () => void;
  readonly onOpenManagement: () => void;
  readonly onCreatePost: () => void;
}) {
  const queryClient = useQueryClient();
  const baseUrl = homeNode.baseUrl;
  const communityPath = `/v1/communities/${encodeURIComponent(communityId)}`;
  const community = useNodeDocument<NodeCommunity>(
    baseUrl,
    communityPath,
    { viewer: true },
  );
  const stats = useNodeDocument<CommunityStats>(baseUrl, `/v1/communities/${encodeURIComponent(communityId)}/stats`);
  const moderators = useNodeDocument<NodePage<ModeratorRow>>(
    baseUrl,
    `/v1/communities/${encodeURIComponent(communityId)}/moderators`,
  );
  const feed = useInfiniteFeed(baseUrl, { sort: 'hot', community: communityId });
  const posts: readonly FeedPost[] = (feed.data?.pages ?? []).flatMap((page) => page.value.items);

  const [tab, setTab] = useState<Tab>('posts');
  const [myKey, setMyKey] = useState<string | null>(null);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [notice, setNotice] = useState<{ readonly text: string; readonly error: boolean } | null>(null);

  useEffect(() => {
    void forumSessionSummary().then((summary) => setMyKey(summary.identityKeyHex ?? null));
  }, []);

  const item = community.data?.value;
  const isModerator = useMemo(
    () => Boolean(myKey && moderators.data?.value.items.some((row) => row.memberKey === myKey)),
    [myKey, moderators.data],
  );

  const toggleMembership = async () => {
    if (!item) return;
    setMembershipBusy(true);
    setNotice(null);
    try {
      await setForumMembership(baseUrl, item.id, !item.joined, homeNode.discovery.services.auditLogs);
      setNotice({ text: item.joined ? 'Left this community.' : 'Joined this community.', error: false });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['node', baseUrl, 'document', communityPath] }),
        queryClient.invalidateQueries({ queryKey: ['node', baseUrl, 'document', '/v1/me/communities'] }),
        community.refetch(),
      ]);
    } catch (error) {
      setNotice({
        text: error instanceof Error ? error.message : 'Membership could not be updated.',
        error: true,
      });
    } finally {
      setMembershipBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader colors={colors} mode={mode} title={item ? `r/${item.name}` : 'Community'} onBack={onBack} reach={reach} onReach={onOpenNetwork} />
      <Page colors={colors} scroll={false}>
        {community.isError && !item ? (
          <ErrorState colors={colors} title="Community unavailable" body="No saved copy is available yet." onRetry={() => void community.refetch()} />
        ) : !item ? (
          <SkeletonPostCard colors={colors} />
        ) : (
          <>
            <View style={styles.hero}>
              <View style={[styles.avatar, { backgroundColor: colors.ember }]}>
                <Text maxFontSizeMultiplier={maxFontScale.h2} style={[typography.h2, { color: colors.onAccent }]}>
                  {item.name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text maxFontSizeMultiplier={maxFontScale.h1} style={[typography.h1, { color: colors.text }]}>
                  {item.title}
                </Text>
                <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>
                  {(stats.data?.value.members ?? item.memberCount).toLocaleString()} members · {(stats.data?.value.posts ?? item.postCount).toLocaleString()} posts
                </Text>
              </View>
            </View>
            <View style={styles.actionsRow}>
              <View style={styles.flex}>
                <Button
                  colors={colors}
                  disabled={membershipBusy || item.archived}
                  label={item.joined ? 'Leave' : 'Join'}
                  loading={membershipBusy}
                  onPress={() => void toggleMembership()}
                  variant={item.joined ? 'secondary' : 'primary'}
                />
              </View>
              {isModerator || (myKey !== null && item.ownerKey === myKey) ? (
                <Button colors={colors} icon="shield-checkmark-outline" label="Manage" variant="secondary" onPress={onOpenManagement} />
              ) : null}
            </View>
            {notice ? (
              <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, styles.notice, { color: notice.error ? colors.blackout : colors.verified }]}>
                {notice.text}
              </Text>
            ) : null}
            {item.archived ? (
              <StatusBanner colors={colors} icon="archive-outline" title="Community archived" body="Existing content remains readable, but this community is not accepting new posts." tone="warning" />
            ) : null}

            <View style={styles.tabsRow}>
              <SegmentedControl colors={colors} value={tab} onChange={setTab} options={[{ value: 'posts', label: 'Posts' }, { value: 'about', label: 'About' }]} />
            </View>
            <Divider colors={colors} />

            {tab === 'about' ? (
              <View style={styles.about}>
                <Text maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text2 }]}>
                  {item.description || 'No description has been published.'}
                </Text>
                {item.rulesMarkdown ? (
                  <>
                    <Text maxFontSizeMultiplier={maxFontScale.h2} style={[typography.h2, { color: colors.text }]}>
                      Rules
                    </Text>
                    <Text maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text2 }]}>
                      {item.rulesMarkdown}
                    </Text>
                  </>
                ) : null}
              </View>
            ) : feed.isError && posts.length === 0 ? (
              <ErrorState colors={colors} title="Posts unavailable" body="The community loaded, but its feed did not." onRetry={() => void feed.refetch()} />
            ) : (
              <InfiniteList
                data={posts}
                colors={colors}
                keyExtractor={(post) => post.contentId}
                onEndReached={() => {
                  if (feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
                }}
                onRefresh={() => void feed.refetch()}
                refreshing={feed.isRefetching}
                renderItem={({ item: post }) => (
                  <PostCard
                    colors={colors}
                    homeNode={homeNode}
                    post={post}
                    onPress={() => onOpenPost(post.contentId)}
                    onOpenAuthor={() => onOpenAuthor(post.authorKey)}
                    onOpenProof={() => onOpenAudit(post.contentId)}
                  />
                )}
                ListEmptyComponent={
                  !feed.isLoading ? (
                    <EmptyState colors={colors} icon="document-text-outline" title="No posts here yet" body="Signed posts published to this community will appear here." />
                  ) : null
                }
              />
            )}
          </>
        )}
      </Page>
      {item && !item.archived ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create post in this community"
          onPress={onCreatePost}
          style={[styles.fab, { backgroundColor: colors.ember }]}
        >
          <Ionicons name="add" size={26} color={colors.onAccent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { padding: spacing.lg, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  actionsRow: { flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.md },
  notice: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  tabsRow: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  about: { padding: spacing.md, gap: spacing.sm },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
