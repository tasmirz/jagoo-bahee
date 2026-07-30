import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_STATE_KEY = 'jb.forum.notification-state.v1';

export interface LocalNotificationState {
  readonly read: readonly string[];
  readonly dismissed: readonly string[];
}

const emptyState: LocalNotificationState = { read: [], dismissed: [] };

export async function loadLocalNotificationState(): Promise<LocalNotificationState> {
  const encoded = await AsyncStorage.getItem(NOTIFICATION_STATE_KEY);
  if (!encoded) return emptyState;
  try {
    const value = JSON.parse(encoded) as LocalNotificationState;
    return {
      read: Array.isArray(value.read) ? value.read : [],
      dismissed: Array.isArray(value.dismissed) ? value.dismissed : [],
    };
  } catch {
    return emptyState;
  }
}

export async function changeLocalNotificationState(
  id: string,
  action: 'read' | 'unread' | 'dismiss',
): Promise<LocalNotificationState> {
  const current = await loadLocalNotificationState();
  const read = new Set(current.read);
  const dismissed = new Set(current.dismissed);
  if (action === 'read') read.add(id);
  if (action === 'unread') read.delete(id);
  if (action === 'dismiss') dismissed.add(id);
  const next = { read: [...read], dismissed: [...dismissed] };
  await AsyncStorage.setItem(NOTIFICATION_STATE_KEY, JSON.stringify(next));
  return next;
}
