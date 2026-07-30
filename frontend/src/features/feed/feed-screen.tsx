import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ChipGroup,
  ContentColumn,
  EmptyState,
  ErrorState,
  InfiniteList,
  Page,
  PageHeader,
  Pill,
  SkeletonPostCard,
  StatusBanner,
  spacing,
  useGutter,
  type ReachState,
  type ThemeMode,
  type AppPalette,
} from '../../design-system';
import { useInfiniteFeed, type FeedPost } from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import { PostCard } from '../posts/post-card';
import { useUnreadCount } from '../notifications/data';

type FeedSort = 'hot' | 'new' | 'top' | 'rising';

const SORTS: readonly { readonly value: FeedSort; readonly label: string }[] = [
  { value: 'hot', label: 'Hot' },
  { value: 'new', label: 'New' },
  { value: 'top', label: 'Top' },
  { value: 'rising', label: 'Rising' },
];

/**
 * Root cause #7 fix: a real virtualized, paginated feed. Root cause #2/#3 fix: the header is
 * sticky (`PageHeader`, rendered outside the list) instead of scrolling away with content, and
 * bottom padding comes from `Page`'s content-inset context instead of a flat 24px guess.
 */
export function FeedScreen({
  colors,
  mode,
  reach,
  homeNode,
  onOpenPost,
  onOpenCommunity,
  onOpenAuthor,
  onOpenAudit,
  onOpenNetwork,
  onOpenSearch,
  onOpenNotifications,
  onOpenInbox,
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly reach: ReachState;
  readonly homeNode: HomeNode;
  readonly onOpenPost: (contentId: string) => void;
  readonly onOpenCommunity: (communityId: string) => void;
  readonly onOpenAuthor: (keyId: string) => void;
  readonly onOpenAudit: (contentId: string) => void;
  readonly onOpenNetwork: () => void;
  readonly onOpenSearch: () => void;
  readonly onOpenNotifications: () => void;
  readonly onOpenInbox: () => void;
}) {
  const gutter = useGutter();
  const [sort, setSort] = useState<FeedSort>('hot');
  const [joinNotice, setJoinNotice] = useState(false);
  const [voteError, setVoteError] = useState('');
  const unread = useUnreadCount(homeNode.baseUrl);
  const feed = useInfiniteFeed(homeNode.baseUrl, { sort });
  const pages = feed.data?.pages ?? [];
  const posts: readonly FeedPost[] = pages.flatMap((page) => page.value.items);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader
        colors={colors}
        mode={mode}
        title="Jagoo Bahee"
        showBrand
        reach={reach}
        onReach={onOpenNetwork}
        actions={[
          { icon: 'search-outline', label: 'Search', onPress: onOpenSearch },
          { icon: 'mail-outline', label: 'Inbox', onPress: onOpenInbox },
          { icon: 'notifications-outline', label: 'Notifications', onPress: onOpenNotifications, badge: unread > 0 },
        ]}
      />
      {/*
        `gutter={false}`: the `InfiniteList` below owns the scroll container and has to reach
        the screen edge, so it applies the same `useGutter()` inset to its content instead.
        Everything above it is inside one padded header block so the chips, the banners and the
        cards all line up on the same two edges.
      */}
      <Page colors={colors} scroll={false} gutter={false} gap={0}>
        <ContentColumn fill>
          <View style={[styles.feedControls, { paddingHorizontal: gutter }]}>
            <ChipGroup>
              {SORTS.map((option) => (
                <Pill
                  key={option.value}
                  colors={colors}
                  label={option.label}
                  selected={sort === option.value}
                  onPress={() => setSort(option.value)}
                />
              ))}
            </ChipGroup>
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
            {voteError ? (
              <StatusBanner
                colors={colors}
                icon="alert-circle-outline"
                title="Signed action was not accepted"
                body={voteError}
                tone="warning"
                action="Dismiss"
                onAction={() => setVoteError('')}
              />
            ) : null}
            {joinNotice ? (
              <StatusBanner
                colors={colors}
                icon="people-outline"
                title="Join this community to vote"
                body="Voting requires membership. Open the community and tap Join, then try again."
                tone="neutral"
                action="Dismiss"
                onAction={() => setJoinNotice(false)}
              />
            ) : null}
          </View>
          {feed.isError && posts.length === 0 ? (
            <View style={{ paddingHorizontal: gutter }}>
              <ErrorState
                colors={colors}
                title="Node is unavailable"
                body="No saved feed is available yet. Start the local node or check the configured address."
                onRetry={() => void feed.refetch()}
              />
            </View>
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
                  onOpenCommunity={() => onOpenCommunity(post.community)}
                  onOpenAuthor={() => onOpenAuthor(post.authorKey)}
                  onOpenProof={() => onOpenAudit(post.contentId)}
                  onRequireJoin={() => setJoinNotice(true)}
                  onVoteError={setVoteError}
                />
              )}
              ListEmptyComponent={
                !feed.isLoading ? (
                  <EmptyState
                    colors={colors}
                    icon="documents-outline"
                    title="No posts yet"
                    body="This node is ready. Create the first signed post from the Create button below."
                  />
                ) : (
                  <View>
                    <SkeletonPostCard colors={colors} />
                    <SkeletonPostCard colors={colors} />
                    <SkeletonPostCard colors={colors} />
                  </View>
                )
              }
            />
          )}
        </ContentColumn>
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Horizontal inset comes from `useGutter()` at the call site so it tracks the breakpoint. */
  feedControls: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
});
