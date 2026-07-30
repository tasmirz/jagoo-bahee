import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { forumSessionRequest, forumSessionSummary } from '../../signer';
import { LocalNotificationState, type ForumNotification } from '../../data/notifications';

export interface NotificationItem extends ForumNotification {
  readonly kind: 'reply' | 'mention' | 'award' | 'mod_action' | 'follow';
  readonly contentId: string;
  readonly actorKey: string;
  readonly createdAtMs: number;
  readonly recipientKey: string;
}

interface NotificationsPage {
  readonly items: readonly NotificationItem[];
  readonly nextCursor: string | null;
}

/**
 * The backend has no mark-as-read or unread-count endpoint by design — the notification
 * projection comment says read state stays client-local (F5 in the rebuild plan). This hook
 * merges the server's `/v1/me/notifications` list with `LocalNotificationState`'s on-device
 * read/hidden flags rather than inventing a backend contract that doesn't exist.
 */
export function useNotifications(baseUrl: string | null, filter: 'all' | 'unread' = 'all') {
  const [actorKey, setActorKey] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void forumSessionSummary().then((summary) => {
      if (active) setActorKey(summary.identityKeyHex ?? null);
    });
    return () => {
      active = false;
    };
  }, [baseUrl]);

  const query = useQuery<NotificationsPage>({
    queryKey: ['forum', baseUrl, 'notifications', actorKey],
    queryFn: async () => {
      const page = await forumSessionRequest<NotificationsPage>(
        baseUrl!,
        '/v1/me/notifications?limit=50',
      );
      if (!actorKey) return page;
      const state = new LocalNotificationState(actorKey);
      const items = await state.apply(page.items);
      return { ...page, items: items as readonly NotificationItem[] };
    },
    enabled: baseUrl !== null && actorKey !== null,
    refetchInterval: 30_000,
    retry: 0,
  });

  const items = query.data?.items ?? [];
  const visible = filter === 'unread' ? items.filter((item) => !item.read) : items;
  return { ...query, items: visible, allItems: items, actorKey };
}

export function useUnreadCount(baseUrl: string | null): number {
  const { allItems } = useNotifications(baseUrl, 'all');
  return allItems.filter((item) => !item.read).length;
}

export function useNotificationActions(baseUrl: string | null, actorKey: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['forum', baseUrl, 'notifications'] });
  const markRead = async (id: string, value = true) => {
    if (!actorKey) return;
    await new LocalNotificationState(actorKey).markRead(id, value);
    await invalidate();
  };
  const markAllRead = async (ids: readonly string[]) => {
    if (!actorKey) return;
    const state = new LocalNotificationState(actorKey);
    await Promise.all(ids.map((id) => state.markRead(id, true)));
    await invalidate();
  };
  const dismiss = async (id: string) => {
    if (!actorKey) return;
    await new LocalNotificationState(actorKey).delete(id);
    await invalidate();
  };
  return { markRead, markAllRead, dismiss };
}
