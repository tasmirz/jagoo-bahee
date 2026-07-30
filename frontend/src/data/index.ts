import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { networkRequest } from './request';
export { LocalNotificationState } from './notifications';
export type { ForumNotification, NotificationStorage } from './notifications';

const CACHE_PREFIX = 'jb.api.v1:';
const FORUM_DATA_PREFIXES = [CACHE_PREFIX, 'jb.notifications.forum.v1:'] as const;

export interface CachedValue<T> {
  readonly value: T;
  readonly storedAtMs: number;
  readonly source: 'network' | 'cache';
}

export class OfflineApi {
  constructor(private readonly baseUrl: string) {}

  /**
   * `viewerHeaders` carries an optional bearer token for reads that hydrate additive,
   * per-caller fields (`myVote`, `saved`, `joined`). The cache key includes whether a token was
   * sent — not the token itself — so an authenticated viewer's cached response is never
   * silently served back to an anonymous read of the same path, or vice versa, once this
   * device switches identity or signs out.
   */
  async get<T>(
    path: string,
    viewerHeaders?: Record<string, string>,
  ): Promise<CachedValue<T>> {
    const requestUrl = new URL(path, this.baseUrl).toString();
    const key = `${CACHE_PREFIX}${viewerHeaders ? 'viewer:' : ''}${encodeURIComponent(requestUrl)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await networkRequest(requestUrl, {
        headers: { Accept: 'application/json', ...viewerHeaders },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const cached = {
        value: (await response.json()) as T,
        storedAtMs: Date.now(),
        source: 'network' as const,
      };
      await AsyncStorage.setItem(key, JSON.stringify(cached));
      return cached;
    } catch (error) {
      const stored = await AsyncStorage.getItem(key);
      if (stored) {
        const cached = JSON.parse(stored) as Omit<CachedValue<T>, 'source'>;
        return { ...cached, source: 'cache' };
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async clear(): Promise<void> {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(CACHE_PREFIX));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  }
}

/** AUTH-22: erase cached Forum material without touching a future Signal-plane store. */
export async function clearForumLocalData(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    FORUM_DATA_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );
  if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  queryClient.clear();
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 30_000,
      gcTime: process.env.NODE_ENV === 'test' ? Infinity : 7 * 24 * 60 * 60 * 1000,
      retry: 1,
    },
    mutations: { networkMode: 'offlineFirst', retry: 2 },
  },
});

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) =>
    setOnline(Boolean(state.isConnected && state.isInternetReachable)),
  ),
);
