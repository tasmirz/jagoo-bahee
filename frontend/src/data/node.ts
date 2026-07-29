import { useQuery } from '@tanstack/react-query';
import type { ReachState } from '../ui/primitives';
import { OfflineApi, type CachedValue } from './index';
import type { DiscoveredService } from './node-config';

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

export interface NodeComment {
  readonly contentId: string;
  readonly authorKey: string;
  readonly bodyMarkdown: string | null;
  readonly createdAtMs: number;
  readonly depth: number;
  readonly score: number;
  readonly removed: boolean;
}

export interface CommentPage {
  readonly items: readonly NodeComment[];
  readonly nextCursor: string | null;
}

export interface NodeCommunity {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly memberCount: number;
  readonly postCount: number;
  readonly archived: boolean;
}

export interface CommunityPage {
  readonly items: readonly NodeCommunity[];
  readonly nextCursor: string | null;
}

export interface NodeSearchResult {
  readonly contentId?: string;
  readonly id?: string;
  readonly title?: string;
  readonly name?: string;
  readonly bodyMarkdown?: string;
  readonly description?: string;
  readonly community?: string;
  readonly displayName?: string;
}

export interface SearchPage {
  readonly items: readonly NodeSearchResult[];
  readonly nextCursor: string | null;
}

export interface NodePage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

export function useNodeDocument<T>(
  baseUrl: string | null,
  path: string | null,
  options: { readonly refetchInterval?: number; readonly retry?: number } = {},
) {
  return useQuery<CachedValue<T>>({
    queryKey: ['node', baseUrl, 'document', path],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<T>(path!),
    enabled: baseUrl !== null && path !== null,
    ...options,
  });
}

export function useNodeFeed(baseUrl: string | null, sort: string) {
  return useQuery<CachedValue<FeedPage>>({
    queryKey: ['node', baseUrl, 'feed', sort],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<FeedPage>(
        `/v1/feed?sort=${encodeURIComponent(sort)}&limit=25`,
      ),
    enabled: baseUrl !== null,
    refetchInterval: 15_000,
  });
}

export function useNodePost(baseUrl: string | null, contentId: string | null) {
  return useQuery<CachedValue<FeedPost>>({
    queryKey: ['node', baseUrl, 'post', contentId],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<FeedPost>(
        `/v1/posts/${encodeURIComponent(contentId!)}`,
      ),
    enabled: baseUrl !== null && contentId !== null,
  });
}

export function useNodeComments(baseUrl: string | null, contentId: string | null) {
  return useQuery<CachedValue<CommentPage>>({
    queryKey: ['node', baseUrl, 'post', contentId, 'comments'],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<CommentPage>(
        `/v1/posts/${encodeURIComponent(contentId!)}/comments?sort=top&limit=100`,
      ),
    enabled: baseUrl !== null && contentId !== null,
  });
}

export function useNodeReach(baseUrl: string | null): {
  readonly reach: ReachState;
  readonly configured: boolean;
} {
  const health = useQuery<CachedValue<{ readonly status: string }>>({
    queryKey: ['node', baseUrl, 'health'],
    queryFn: () => new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get('/health/ready'),
    enabled: baseUrl !== null,
    refetchInterval: 15_000,
    retry: 0,
  });
  if (!baseUrl) return { reach: 'blackout', configured: false };
  if (health.data?.source === 'network') return { reach: 'connected', configured: true };
  if (health.data?.source === 'cache') return { reach: 'constrained', configured: true };
  if (health.isError) return { reach: 'blackout', configured: true };
  return { reach: 'constrained', configured: true };
}

export function useNodeCommunities(baseUrl: string | null, query: string) {
  return useQuery<CachedValue<CommunityPage>>({
    queryKey: ['node', baseUrl, 'communities', query],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<CommunityPage>(
        `/v1/communities?sort=members&limit=50&q=${encodeURIComponent(query)}`,
      ),
    enabled: baseUrl !== null,
  });
}

export function useNodeSearch(baseUrl: string | null, query: string, kind?: string) {
  return useQuery<CachedValue<SearchPage>>({
    queryKey: ['node', baseUrl, 'search', query, kind],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<SearchPage>(
        `/v1/search?limit=50&q=${encodeURIComponent(query)}` +
          (kind ? `&kind=${encodeURIComponent(kind)}` : ''),
      ),
    enabled: baseUrl !== null && query.trim().length > 0,
  });
}

export interface FederationsDocument {
  readonly serverId: string;
  readonly items: readonly DiscoveredService[];
  readonly connected: number;
}

export function useFederations(baseUrl: string | null) {
  return useQuery<CachedValue<FederationsDocument>>({
    queryKey: ['node', baseUrl, 'federations'],
    queryFn: () => new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get('/federations'),
    enabled: baseUrl !== null,
    refetchInterval: 30_000,
    retry: 0,
  });
}
