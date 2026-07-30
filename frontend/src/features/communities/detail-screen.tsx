import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  useNodeDocument,
  type FeedPage,
  type NodeCommunity,
} from '../../data/node';
import type { AppPalette } from '../../theme';
import { radius, spacing, type as typography } from '../../theme';
import {
  Button,
  EmptyState,
  IconButton,
  PressScale,
  ReachPill,
  Screen,
  Seal,
  StatusBanner,
  type ReachState,
} from '../../ui/primitives';
import type { HomeNode } from '../../data/node-config';
import { setForumMembership } from '../../signer';
import { sealStateFor } from '../../verify';

interface CommunityStats {
  readonly members: number;
  readonly posts: number;
  readonly pendingReports: number;
}

export function CommunityDetailScreen({
  baseUrl,
  homeNode,
  colors,
  communityId,
  onBack,
  onOpenNetwork,
  onOpenPost,
  onOpenManagement,
  reach,
}: {
  readonly baseUrl: string;
  readonly homeNode: HomeNode;
  readonly colors: AppPalette;
  readonly communityId: string;
  readonly onBack: () => void;
  readonly onOpenNetwork: () => void;
  readonly onOpenPost: (contentId: string) => void;
  readonly onOpenManagement: () => void;
  readonly reach: ReachState;
}) {
  const encoded = encodeURIComponent(communityId);
  const community = useNodeDocument<NodeCommunity>(baseUrl, `/v1/communities/${encoded}`);
  const stats = useNodeDocument<CommunityStats>(baseUrl, `/v1/communities/${encoded}/stats`);
  const posts = useNodeDocument<FeedPage>(
    baseUrl,
    `/v1/feed?community=${encoded}&sort=hot&limit=25`,
  );
  const item = community.data?.value;
  const rows = posts.data?.value.items ?? [];
  const [joined, setJoined] = useState(false);
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [membershipNotice, setMembershipNotice] = useState('');
  const toggleMembership = async () => {
    if (!item) return;
    setMembershipBusy(true); setMembershipNotice('');
    try {
      await setForumMembership(baseUrl, item.id, !joined, homeNode.discovery.services.auditLogs);
      setJoined((value) => !value);
      setMembershipNotice(!joined ? 'Membership signed and queued for delivery.' : 'Leaving this community was signed and queued.');
    } catch (caught) { setMembershipNotice(caught instanceof Error ? caught.message : 'Membership could not be updated.'); } finally { setMembershipBusy(false); }
  };
  return (
    <Screen colors={colors}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <IconButton colors={colors} icon="arrow-back" label="Back" onPress={onBack} />
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[typography.h2, styles.flex, { color: colors.text }]}
        >
          {item ? `r/${item.name}` : 'Community'}
        </Text>
        <ReachPill colors={colors} compact onPress={onOpenNetwork} state={reach} />
      </View>
      <View style={styles.column}>
        {community.isError ? (
          <StatusBanner
            action="Try again"
            body="The home node could not return this community and no saved copy is available."
            colors={colors}
            icon="cloud-offline-outline"
            onAction={() => void community.refetch()}
            title="Community unavailable"
            tone="warning"
          />
        ) : null}
        {item ? (
          <>
            <View style={styles.hero}>
              <View style={[styles.avatar, { backgroundColor: colors.ember }]}>
                <Text style={[typography.h2, { color: colors.onAccent }]}>
                  {item.name.slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={[typography.h1, { color: colors.text }]}>{item.title}</Text>
                <Text style={[typography.body, { color: colors.text2 }]}>
                  {item.description || 'No description has been published.'}
                </Text>
              </View>
            </View>
            <View style={[styles.stats, { borderColor: colors.border }]}>
              <Stat colors={colors} label="Members" value={stats.data?.value.members ?? item.memberCount} />
              <Stat colors={colors} label="Posts" value={stats.data?.value.posts ?? item.postCount} />
              <Stat
                colors={colors}
                label="Open reports"
                value={stats.data?.value.pendingReports ?? 0}
              />
            </View>
            <View style={styles.membershipAction}>
              <Button colors={colors} disabled={membershipBusy || item.archived} label={membershipBusy ? 'Signing…' : joined ? 'Leave community' : 'Join community'} onPress={() => void toggleMembership()} variant={joined ? 'secondary' : 'primary'} />
              <Button colors={colors} icon="shield-checkmark-outline" label="Community controls" onPress={onOpenManagement} variant="secondary" />
              {membershipNotice ? <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.text2 }]}>{membershipNotice}</Text> : null}
            </View>
            {item.archived ? (
              <StatusBanner
                body="Existing content remains readable, but this community is not accepting new posts."
                colors={colors}
                icon="archive-outline"
                title="Community archived"
                tone="warning"
              />
            ) : null}
            <Text accessibilityRole="header" style={[typography.h2, styles.sectionTitle, { color: colors.text }]}>
              Community posts
            </Text>
            {posts.isError ? (
              <StatusBanner
                action="Reload posts"
                body="The community loaded, but its feed did not."
                colors={colors}
                icon="refresh-outline"
                onAction={() => void posts.refetch()}
                title="Posts unavailable"
                tone="warning"
              />
            ) : rows.length > 0 ? (
              rows.map((post) => (
                <PressScale
                  key={post.contentId}
                  label={`Open post: ${post.title}`}
                  onPress={() => onOpenPost(post.contentId)}
                >
                  <View style={[styles.postRow, { borderBottomColor: colors.border }]}>
                    <View style={styles.flex}>
                      <Text numberOfLines={2} style={[typography.label, { color: colors.text }]}>
                        {post.title}
                      </Text>
                      <Text style={[typography.caption, { color: colors.text2 }]}>
                        {post.score} points · {post.commentCount} comments
                      </Text>
                    </View>
                    <Seal colors={colors} state={sealStateFor(post.provenance)} />
                    <Ionicons name="chevron-forward" size={18} color={colors.text2} />
                  </View>
                </PressScale>
              ))
            ) : !posts.isLoading ? (
              <EmptyState
                body="Signed posts published to this community will appear here."
                colors={colors}
                icon="document-text-outline"
                title="No posts here yet"
              />
            ) : null}
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function Stat({
  colors,
  label,
  value,
}: {
  readonly colors: AppPalette;
  readonly label: string;
  readonly value: number;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[typography.h2, { color: colors.text }]}>{value.toLocaleString()}</Text>
      <Text style={[typography.caption, { color: colors.text2 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  header: {
    minHeight: 64,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  column: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  hero: {
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    marginHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
  },
  membershipAction: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.xs },
  stat: { flex: 1, minHeight: 82, justifyContent: 'center', paddingHorizontal: spacing.sm },
  sectionTitle: { paddingHorizontal: spacing.md, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  postRow: {
    minHeight: 76,
    marginHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
