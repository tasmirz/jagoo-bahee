import { useState } from 'react';
import { View } from 'react-native';
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
  readonly onOpenNetwork: () => void;
  readonly onOpenSearch: () => void;
  readonly onOpenNotifications: () => void;
  readonly onOpenInbox: () => void;
}) {
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
        reach={reach}
        onReach={onOpenNetwork}
        actions={[
          { icon: 'search-outline', label: 'Search', onPress: onOpenSearch },
          { icon: 'mail-outline', label: 'Inbox', onPress: onOpenInbox },
          { icon: 'notifications-outline', label: 'Notifications', onPress: onOpenNotifications, badge: unread > 0 },
        ]}
      />
      <Page colors={colors} scroll={false}>
        <ContentColumn>
          <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
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
          </View>
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
          {feed.isError && posts.length === 0 ? (
            <ErrorState
              colors={colors}
              title="Node is unavailable"
              body="No saved feed is available yet. Start the local node or check the configured address."
              onRetry={() => void feed.refetch()}
            />
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
