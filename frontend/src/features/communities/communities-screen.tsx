import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Button,
  EmptyState,
  ErrorState,
  InfiniteList,
  Page,
  PageHeader,
  SegmentedControl,
  TextField,
  maxFontScale,
  radius,
  spacing,
  useGutter,
  type as typography,
  type AppPalette,
  type ReachState,
  type ThemeMode,
} from '../../design-system';
import { useDebouncedValue } from '../../hooks/use-debounced-value';
import { useNodeCommunities, useNodeDocument, type NodeCommunity, type NodePage } from '../../data/node';
import type { HomeNode } from '../../data/node-config';

interface MyMembershipRow {
  readonly community: string;
}

/**
 * F4 — consolidates what the legacy SRS calls two duplicate community directories
 * (`/subreddits` and `/subreddits/list`) into one screen with Joined/Discover segments,
 * per `Plans/13-FRONTEND-SRS-RECONCILIATION.md`.
 */
export function CommunitiesScreen({
  colors,
  mode,
  reach,
  homeNode,
  onOpenNetwork,
  onOpenCreate,
  onOpenCommunity,
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly reach: ReachState;
  readonly homeNode: HomeNode;
  readonly onOpenNetwork: () => void;
  readonly onOpenCreate: () => void;
  readonly onOpenCommunity: (communityId: string) => void;
}) {
  const gutter = useGutter();
  const [tab, setTab] = useState<'discover' | 'joined'>('discover');
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 250);
  const discover = useNodeCommunities(homeNode.baseUrl, debounced);
  // `/v1/me/*` is `actor()`-gated, not `optionalActor()`-gated: without the bearer token it
  // answers 401, the query falls back to an empty cached page, and every joined community
  // renders as unjoined with a live "Join" button. `viewer: true` is what attaches the token
  // AND puts the viewer in the query key, so the list cannot survive an identity switch.
  const joined = useNodeDocument<NodePage<MyMembershipRow>>(
    homeNode.baseUrl,
    '/v1/me/communities',
    { viewer: true },
  );
  const joinedIds = new Set((joined.data?.value.items ?? []).map((row) => row.community));
  const discoverItems = discover.data?.value.items ?? [];
  const items: readonly NodeCommunity[] =
    tab === 'joined' ? discoverItems.filter((item) => joinedIds.has(item.id)) : discoverItems;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader
        colors={colors}
        mode={mode}
        title="Communities"
        reach={reach}
        onReach={onOpenNetwork}
        actions={[{ icon: 'add-circle-outline', label: 'Create a community', onPress: onOpenCreate }]}
      />
      {/* The list owns the scroll container, so it applies the gutter — see `Page`'s contract. */}
      <Page colors={colors} scroll={false} gutter={false} gap={0}>
        <View style={[styles.controls, { paddingHorizontal: gutter }]}>
          <SegmentedControl
            colors={colors}
            value={tab}
            onChange={setTab}
            options={[
              { value: 'discover', label: 'Discover' },
              { value: 'joined', label: 'Joined' },
            ]}
          />
          <TextField colors={colors} value={query} onChangeText={setQuery} placeholder="Search communities" />
        </View>
        {discover.isError ? (
          <View style={{ paddingHorizontal: gutter }}>
            <ErrorState colors={colors} title="Communities unavailable" body="No saved list is available yet." onRetry={() => void discover.refetch()} />
          </View>
        ) : (
          <InfiniteList
            colors={colors}
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => onOpenCommunity(item.id)}
                style={[styles.row, { borderBottomColor: colors.border }]}
              >
                <View style={[styles.avatar, { backgroundColor: colors.ember }]}>
                  <Text maxFontSizeMultiplier={1.2} style={[typography.label, { color: colors.onAccent }]}>
                    {item.name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.flex}>
                  <Text numberOfLines={1} maxFontSizeMultiplier={maxFontScale.label} style={[typography.label, { color: colors.text }]}>
                    r/{item.name}
                  </Text>
                  <Text numberOfLines={1} maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>
                    {item.memberCount.toLocaleString()} members{item.description ? ` · ${item.description}` : ''}
                  </Text>
                </View>
                {joinedIds.has(item.id) ? <Button colors={colors} variant="secondary" label="Joined" onPress={() => onOpenCommunity(item.id)} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={
              !discover.isLoading ? (
                <EmptyState
                  colors={colors}
                  icon="people-outline"
                  title={tab === 'joined' ? "You haven't joined any communities yet" : 'No communities found'}
                  body={tab === 'joined' ? 'Discover communities and join one to see it here.' : 'Try a different search, or start the first one.'}
                  action="Create a community"
                  onAction={onOpenCreate}
                />
              ) : null
            }
          />
        )}
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  /** Horizontal inset comes from `useGutter()` at the call site so it tracks the breakpoint. */
  controls: { paddingTop: spacing.sm, paddingBottom: spacing.xs, gap: spacing.sm },
  row: {
    minHeight: 68,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
