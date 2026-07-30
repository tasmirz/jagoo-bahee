import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Button,
  EmptyState,
  Page,
  PageHeader,
  SegmentedControl,
  maxFontScale,
  radius,
  spacing,
  type as typography,
  type AppPalette,
  type ThemeMode,
} from '../../design-system';
import type { HomeNode } from '../../data/node-config';
import { useNotificationActions, useNotifications, type NotificationItem } from './data';

const KIND_ICON: Record<NotificationItem['kind'], keyof typeof Ionicons.glyphMap> = {
  reply: 'chatbubble-outline',
  mention: 'at-outline',
  award: 'sparkles-outline',
  mod_action: 'shield-checkmark-outline',
  follow: 'person-add-outline',
};

const KIND_TEXT: Record<NotificationItem['kind'], string> = {
  reply: 'replied to your post',
  mention: 'mentioned you',
  award: 'gave you an award',
  mod_action: 'took a moderation action',
  follow: 'followed you',
};

function relativeTime(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * F5 — the backend has no mark-read/unread-count endpoint by design (read state is
 * client-local); this screen is the honest UI for that: a real All/Unread filter and
 * mark-read/mark-all-read backed by `LocalNotificationState`, not an invented server contract.
 */
export function NotificationsScreen({
  colors,
  mode,
  homeNode,
  onBack,
  onOpenContent,
}: {
  readonly colors: AppPalette;
  readonly mode: ThemeMode;
  readonly homeNode: HomeNode;
  readonly onBack: () => void;
  readonly onOpenContent: (contentId: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const { items, allItems, actorKey, isLoading } = useNotifications(homeNode.baseUrl, filter);
  const { markRead, markAllRead, dismiss } = useNotificationActions(homeNode.baseUrl, actorKey);
  const unreadCount = allItems.filter((item) => !item.read).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader
        colors={colors}
        mode={mode}
        title="Notifications"
        onBack={onBack}
        actions={
          unreadCount > 0
            ? [{ icon: 'checkmark-done-outline', label: 'Mark all as read', onPress: () => void markAllRead(allItems.map((item) => item.id)) }]
            : []
        }
      />
      <Page colors={colors}>
        <View style={styles.filterRow}>
          <SegmentedControl
            colors={colors}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All (${allItems.length})` },
              { value: 'unread', label: `Unread (${unreadCount})` },
            ]}
          />
        </View>
        {items.length === 0 && !isLoading ? (
          <EmptyState
            colors={colors}
            icon="notifications-outline"
            title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
            body="Replies, mentions, awards, moderation actions, and new followers will show up here."
          />
        ) : (
          items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPress={() => {
                void markRead(item.id, true);
                onOpenContent(item.contentId);
              }}
              style={[styles.row, { borderBottomColor: colors.border }]}
            >
              <View style={[styles.iconWrap, { backgroundColor: colors.surface2 }]}>
                <Ionicons name={KIND_ICON[item.kind]} size={18} color={colors.ember} />
              </View>
              <View style={styles.flex}>
                <Text maxFontSizeMultiplier={maxFontScale.body} style={[typography.body, { color: colors.text }]}>
                  u/{item.actorKey.slice(0, 8)}… {KIND_TEXT[item.kind]}
                </Text>
                <Text maxFontSizeMultiplier={maxFontScale.caption} style={[typography.caption, { color: colors.text2 }]}>
                  {relativeTime(item.createdAtMs)}
                </Text>
              </View>
              {!item.read ? <View style={[styles.unreadDot, { backgroundColor: colors.ember }]} /> : null}
              <Button colors={colors} variant="ghost" label="Dismiss" onPress={() => void dismiss(item.id)} />
            </Pressable>
          ))
        )}
      </Page>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  filterRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  row: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { width: 8, height: 8, borderRadius: radius.pill },
});
