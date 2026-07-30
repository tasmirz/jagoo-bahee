import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ReachState } from '../design-system';
import { OfflineApi, type CachedValue } from './index';
import type { DiscoveredService } from './node-config';
import type { ProvenanceJson } from '../verify';
import { forumViewerHeaders } from '../signer';

export interface FeedPost {
  readonly contentId: string;
  readonly authorKey: string;
  readonly community: string;
  readonly title: string;
  readonly kind: number;
  readonly bodyMarkdown: string | null;
  readonly url: string;
  readonly attachments: readonly string[];
  readonly flair: string;
  readonly poll: {
    readonly question: string;
    readonly options: readonly string[];
    readonly multiple: boolean;
    readonly closesAtMs: number;
  } | null;
  readonly crosspostOf: string;
  readonly flags: {
    readonly nsfw: boolean;
    readonly spoiler: boolean;
    readonly oc: boolean;
  };
  readonly createdAtMs: number;
  readonly score: number;
  readonly commentCount: number;
  readonly removed: boolean;
  readonly removedReason?: string;
  /**
   * The full block the node sends, not a subset.
   *
   * It was previously narrowed to five fields, which silently dropped `keyAlg` and the
   * receipt's signature, tree head and inclusion proof — everything `verifyProvenance`
   * needs. A type that cannot express the evidence guarantees the evidence is never checked.
   */
  readonly provenance: ProvenanceJson | null;
  /**
   * Present only when the request carried a bearer token — the additive viewer-hydration
   * fields added to `forum-read.controller.ts` (`Code Implementation/ADR-018`). Root cause #6:
   * before this, vote state and saved state were pure client-side `useState` that reset to
   * neutral on every remount, since nothing served them back.
   */
  readonly myVote?: -1 | 0 | 1;
  readonly saved?: boolean;
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
  readonly post: string;
  readonly parentComment: string;
  readonly replyCount: number;
  readonly score: number;
  readonly removed: boolean;
  readonly removedReason?: string | null;
  /** The node sends this for comments too; dropping it is what made their seals decorative. */
  readonly provenance: ProvenanceJson | null;
  readonly myVote?: -1 | 0 | 1;
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
  readonly rulesMarkdown?: string;
  readonly ownerKey?: string;
  readonly isPrivate?: boolean;
  readonly isNsfw?: boolean;
  readonly memberCount: number;
  readonly postCount: number;
  readonly archived: boolean;
  readonly settings?: {
    readonly allowTextPosts: boolean;
    readonly allowLinkPosts: boolean;
    readonly allowImagePosts: boolean;
    readonly allowVideoPosts: boolean;
    readonly allowCrossposts: boolean;
  };
  readonly theme?: {
    readonly primary: string;
    readonly accent: string;
    readonly background: string;
    readonly foreground: string;
  };
  /** Present only for an authenticated caller — see `myVote`/`saved` above. */
  readonly joined?: boolean;
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
  options: { readonly refetchInterval?: number; readonly retry?: number; readonly viewer?: boolean } = {},
) {
  const { viewer, ...rest } = options;
  return useQuery<CachedValue<T>>({
    queryKey: ['node', baseUrl, 'document', path, viewer ?? false],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<T>(
        path!,
        viewer ? forumViewerHeaders() : undefined,
      ),
    enabled: baseUrl !== null && path !== null,
    ...rest,
  });
}

export function useNodeFeed(baseUrl: string | null, sort: string) {
  return useQuery<CachedValue<FeedPage>>({
    queryKey: ['node', baseUrl, 'feed', sort],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<FeedPage>(
        `/v1/feed?sort=${encodeURIComponent(sort)}&limit=25`,
        forumViewerHeaders(),
      ),
    enabled: baseUrl !== null,
    refetchInterval: 15_000,
  });
}

/**
 * Root cause #7 — the previous feed hook fetched a single fixed `limit=25` page and discarded
 * the backend's `nextCursor` entirely. This one keeps fetching pages via `FlatList`'s
 * `onEndReached`, which is what `InfiniteList` (design-system) expects.
 */
export function useInfiniteFeed(
  baseUrl: string | null,
  params: { readonly sort: string; readonly community?: string; readonly timeframe?: string },
) {
  return useInfiniteQuery<CachedValue<FeedPage>>({
    queryKey: ['node', baseUrl, 'feed-pages', params.sort, params.community ?? '', params.timeframe ?? ''],
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams({ sort: params.sort, limit: '20' });
      if (params.community) search.set('community', params.community);
      if (params.timeframe) search.set('timeframe', params.timeframe);
      if (typeof pageParam === 'string' && pageParam) search.set('cursor', pageParam);
      return new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<FeedPage>(
        `/v1/feed?${search.toString()}`,
        forumViewerHeaders(),
      );
    },
    enabled: baseUrl !== null,
    initialPageParam: '',
    getNextPageParam: (last) => last.value.nextCursor ?? undefined,
  });
}

export function useNodePost(baseUrl: string | null, contentId: string | null) {
  return useQuery<CachedValue<FeedPost>>({
    queryKey: ['node', baseUrl, 'post', contentId],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<FeedPost>(
        `/v1/posts/${encodeURIComponent(contentId!)}`,
        forumViewerHeaders(),
      ),
    enabled: baseUrl !== null && contentId !== null,
  });
}

export function useNodeComments(
  baseUrl: string | null,
  contentId: string | null,
  sort: 'top' | 'new' | 'old' = 'top',
) {
  return useQuery<CachedValue<CommentPage>>({
    queryKey: ['node', baseUrl, 'post', contentId, 'comments', sort],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<CommentPage>(
        `/v1/posts/${encodeURIComponent(contentId!)}/comments?sort=${sort}&limit=200`,
        forumViewerHeaders(),
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

// ── P2 · federation (Plans/05 §7) ──────────────────────────────────────────────────

/** Narrowest first. The same order the node's own path selector prefers (TP-01, G-04). */
export const SCOPE_ORDER: readonly string[] = [
  'LAN',
  'ISP_LOCAL',
  'NATIONAL',
  'GLOBAL',
  'MESH',
  'RETICULUM',
];

export interface FederationPeerEndpoint {
  readonly uri: string;
  readonly scope: string;
  readonly asn: number | null;
  readonly ispName: string | null;
  readonly inboundCapable: boolean;
}

export interface FederationPeer {
  readonly serverId: string;
  readonly serverKey: string;
  readonly displayName: string;
  /** BLOCKED peers are never listed by the node — a blocklist is a list of targets. */
  readonly trust: 'PROBATION' | 'NORMAL' | 'TRUSTED' | 'UNSPECIFIED';
  readonly planes: readonly number[];
  readonly endpoints: readonly FederationPeerEndpoint[];
  readonly vouchCount: number;
  readonly lastSeenMs: number;
}

export interface FederationPeersDocument {
  readonly items: readonly FederationPeer[];
  readonly count: number;
}

/**
 * The node's real peer directory.
 *
 * Distinct from `/federations`, which lists operator-configured auxiliary services. These
 * are peers the node has actually handshaked with, at the trust level TOFU and vouches
 * placed them at.
 *
 * ── TP-05 / TP-06: this is pre-positioning, not decoration ─────────────────────────
 * Every response is cached by `OfflineApi`, and entries are never evicted for age. When
 * the gateway drops, the ISP-local addresses must already be on the device — discovery
 * cannot depend on the network that just failed. A stale ISP-local address is infinitely
 * more useful than no address.
 */
export function useFederationPeers(baseUrl: string | null) {
  return useQuery<CachedValue<FederationPeersDocument>>({
    queryKey: ['node', baseUrl, 'federation', 'peers'],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<FederationPeersDocument>(
        '/v1/federation/peers',
      ),
    enabled: baseUrl !== null,
    refetchInterval: 60_000,
    retry: 0,
  });
}

export interface NodeTreeHead {
  readonly serverId: string;
  readonly serverKey: string;
  readonly treeSize: number;
  readonly rootHash: string;
  readonly timestampMs: number;
  readonly signature: string;
}

/** The node's current signed tree head — what its receipts are anchored to. */
export function useNodeTreeHead(baseUrl: string | null) {
  return useQuery<CachedValue<NodeTreeHead>>({
    queryKey: ['node', baseUrl, 'federation', 'sth'],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get<NodeTreeHead>('/v1/federation/sth'),
    enabled: baseUrl !== null,
    refetchInterval: 60_000,
    retry: 0,
  });
}

export interface OperatorAlertItem {
  readonly id: string;
  readonly severity: 'INFO' | 'WARNING' | 'CRITICAL';
  readonly code: string;
  readonly subject: string;
  readonly detail: string;
  readonly raisedAtMs: number;
}

/**
 * FD-09 / FD-16 findings.
 *
 * Public on purpose. A node that detected a peer rewriting its log has produced evidence,
 * and evidence that only the operator can see is evidence a compromised operator can hide.
 */
export function useFederationAlerts(baseUrl: string | null) {
  return useQuery<CachedValue<{ readonly items: readonly OperatorAlertItem[] }>>({
    queryKey: ['node', baseUrl, 'federation', 'alerts'],
    queryFn: () =>
      new OfflineApi(`${baseUrl!.replace(/\/+$/, '')}/`).get('/v1/federation/alerts'),
    enabled: baseUrl !== null,
    refetchInterval: 60_000,
    retry: 0,
  });
}

/** Narrowest working scope first, so the list reads in the order the node would dial. */
export function sortByScope(
  endpoints: readonly FederationPeerEndpoint[],
): readonly FederationPeerEndpoint[] {
  return [...endpoints].sort(
    (left, right) => scopeRank(left.scope) - scopeRank(right.scope),
  );
}

function scopeRank(scope: string): number {
  const index = SCOPE_ORDER.indexOf(scope);
  return index < 0 ? SCOPE_ORDER.length : index;
}
