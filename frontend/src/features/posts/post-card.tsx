import { Share, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  ChipGroup,
  IconButton,
  Pill,
  PressScale,
  Seal,
  TransportTag,
  maxFontScale,
  radius,
  spacing,
  type as typography,
  type AppPalette,
} from '../../design-system';
import type { FeedPost } from '../../data/node';
import type { HomeNode } from '../../data/node-config';
import { useProvenanceSeal } from '../../verify/use-provenance-seal';
import { VoteButtons } from './vote-buttons';

const KIND_ICON: Record<number, keyof typeof Ionicons.glyphMap> = {
  2: 'link-outline',
  3: 'image-outline',
  4: 'videocam-outline',
  5: 'stats-chart-outline',
  6: 'repeat-outline',
};

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(ms).toLocaleDateString();
}

/**
 * The one canonical post card — Reddit-shaped, used by Feed, Community, Saved, and Search
 * (previously the feed's `PostCard` and the community detail screen's bare `postRow` were two
 * different, inconsistent renderings of the same object).
 */
export function PostCard({
  colors,
  homeNode,
  post,
  onPress,
  onOpenCommunity,
  onOpenAuthor,
  onOpenProof,
  onOverflow,
  onRequireJoin,
  onVoteError,
}: {
  readonly colors: AppPalette;
  readonly homeNode: HomeNode;
  readonly post: FeedPost;
  readonly onPress: () => void;
  readonly onOpenCommunity?: () => void;
  readonly onOpenAuthor?: () => void;
  readonly onOpenProof?: () => void;
  readonly onOverflow?: () => void;
  readonly onRequireJoin?: () => void;
  readonly onVoteError?: (message: string) => void;
}) {
  const seal = useProvenanceSeal(post.provenance);
  const kindIcon = KIND_ICON[post.kind];
  const hasChips = Boolean(post.flair) || post.flags.nsfw || post.flags.spoiler || post.flags.oc;

  return (
    <PressScale label={`Open post: ${post.title}`} onPress={onPress}>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.meta}>
          <View style={[styles.avatar, { backgroundColor: colors.surface2 }]}>
            <Text maxFontSizeMultiplier={1.2} style={[typography.caption, { color: colors.ember }]}>
              r/
            </Text>
          </View>
          <Text
            onPress={onOpenCommunity}
            numberOfLines={1}
            maxFontSizeMultiplier={maxFontScale.overline}
            style={[typography.overline, styles.metaShrink, { color: colors.text }]}
          >
            r/{post.community}
          </Text>
          <Text
            onPress={onOpenAuthor}
            numberOfLines={1}
            maxFontSizeMultiplier={maxFontScale.caption}
            style={[typography.caption, styles.metaShrink, { color: colors.text2 }]}
          >
            · u/{post.authorKey.slice(0, 8)}… · {relativeTime(post.createdAtMs)}
          </Text>
          <View style={styles.metaTrailing}>
            <Seal colors={colors} state={seal} onPress={onOpenProof} />
            {onOverflow ? (
              <IconButton colors={colors} icon="ellipsis-horizontal" label="More actions" onPress={onOverflow} />
            ) : null}
          </View>
        </View>

        <Text
          numberOfLines={3}
          maxFontSizeMultiplier={maxFontScale.h1}
          style={[typography.h1, { color: colors.text }]}
        >
          {post.title}
        </Text>

        {hasChips ? (
          <ChipGroup>
            {post.flair ? <Pill colors={colors} label={post.flair} /> : null}
            {post.flags.nsfw ? <Pill colors={colors} label="Mature" /> : null}
            {post.flags.spoiler ? <Pill colors={colors} label="Spoiler" /> : null}
            {post.flags.oc ? <Pill colors={colors} label="Original" /> : null}
          </ChipGroup>
        ) : null}

        {post.removed ? (
          <Text maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text2, fontStyle: 'italic' }]}>
            Hidden by community moderators.
          </Text>
        ) : post.url ? (
          <View style={[styles.linkRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <Ionicons name="link-outline" size={16} color={colors.link} />
            <Text numberOfLines={1} maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, styles.metaShrink, { color: colors.link }]}>
              {post.url.replace(/^https?:\/\//, '')}
            </Text>
          </View>
        ) : post.kind === 3 || post.kind === 4 ? (
          <View style={[styles.mediaPlaceholder, { backgroundColor: colors.surface2 }]}>
            <Ionicons name={kindIcon ?? 'image-outline'} size={28} color={colors.text2} />
            <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>
              {post.attachments.length} attachment{post.attachments.length === 1 ? '' : 's'}
            </Text>
          </View>
        ) : post.poll ? (
          <View style={[styles.pollPreview, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <Ionicons name="stats-chart-outline" size={16} color={colors.text2} />
            <Text numberOfLines={1} maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, styles.metaShrink, { color: colors.text }]}>
              {post.poll.question}
            </Text>
          </View>
        ) : post.bodyMarkdown ? (
          <Text numberOfLines={2} maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text2 }]}>
            {post.bodyMarkdown}
          </Text>
        ) : null}

        <View style={styles.footer}>
          <VoteButtons
            colors={colors}
            homeNode={homeNode}
            communityId={post.community}
            target={post.contentId}
            targetKind="post"
            score={post.score}
            myVote={post.myVote}
            onRequireJoin={onRequireJoin}
            onError={onVoteError}
          />
          <View style={styles.footerActions}>
            <IconButton
              colors={colors}
              icon="chatbubble-outline"
              label={`${post.commentCount} comments`}
              onPress={onPress}
            />
            <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>
              {post.commentCount}
            </Text>
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
          <TransportTag colors={colors} transport="http" />
        </View>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    gap: spacing.sm,
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  metaShrink: { flexShrink: 1 },
  metaTrailing: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: spacing.xxs },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkRow: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  mediaPlaceholder: {
    minHeight: 96,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  pollPreview: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
});
