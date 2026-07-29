import { useQuery } from '@tanstack/react-query';
import type { ReachState } from '../ui/primitives';
import { OfflineApi, type CachedValue } from './index';

export interface FeedPost {
  readonly contentId: string;
  readonly authorKey: string;
  readonly community: string;
  readonly title: string;
  readonly bodyMarkdown: string | null;
  readonly attachments: readonly string[];
  readonly createdAtMs: number;
  readonly score: number;
  readonly commentCount: number;
  readonly removed: boolean;
  readonly provenance: {
    readonly contentId: string;
    readonly authorKey: string;
    readonly signature: string;
    readonly canonicalBytes: string;
    readonly receipt: { readonly leafIndex: number } | null;
  } | null;
}

export interface FeedPage {
  readonly items: readonly FeedPost[];
  readonly nextCursor: string | null;
}

const configuredUrl = process.env.EXPO_PUBLIC_NODE_URL?.trim();
export const nodeBaseUrl = configuredUrl ? `${configuredUrl.replace(/\/+$/, '')}/` : null;
const api = nodeBaseUrl ? new OfflineApi(nodeBaseUrl) : null;

export function useNodeFeed(sort: string) {
  return useQuery<CachedValue<FeedPage>>({
    queryKey: ['node', 'feed', sort],
    queryFn: () => api!.get<FeedPage>(`/v1/feed?sort=${encodeURIComponent(sort)}&limit=25`),
    enabled: api !== null,
    refetchInterval: 15_000,
  });
}

export function useNodeReach(): { readonly reach: ReachState; readonly configured: boolean } {
  const health = useQuery<CachedValue<{ readonly status: string }>>({
    queryKey: ['node', 'health'],
    queryFn: () => api!.get('/health/ready'),
    enabled: api !== null,
    refetchInterval: 15_000,
    retry: 0,
  });
  if (!api) return { reach: 'connected', configured: false };
  if (health.data?.source === 'network') return { reach: 'connected', configured: true };
  if (health.data?.source === 'cache') return { reach: 'constrained', configured: true };
  if (health.isError) return { reach: 'blackout', configured: true };
  return { reach: 'constrained', configured: true };
}
