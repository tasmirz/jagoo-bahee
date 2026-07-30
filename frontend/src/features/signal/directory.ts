/**
 * Signal directory search, with the index server treated as optional.
 *
 * Discovery is the one Signal operation that genuinely needs a server, and it is therefore
 * the one that disappears first. Every result the index ever returns is cached here, while
 * the network still works, precisely so that nothing has to be fetched when the network is
 * gone — the same reasoning as the peer directory in `src/data/peer-directory.ts` (TP-05).
 * A directory that is only populated on demand is an empty directory during a shutdown.
 *
 * Entries are never evicted for age. A stale delivery address is infinitely more useful
 * than no address, and during a blackout there is no fresher one to be had. Staleness is
 * REPORTED (`refreshedAtMs`) so the UI can be honest about it, and never acted on by
 * deleting anything. The only bound is a cap on how many profiles are retained at all, and
 * that drops the least-recently-seen, never the oldest-signed.
 *
 * The cache is not trusted any more than the network is: nothing here decides whether a
 * profile is who it claims to be. That is `verifySignalIdentity`, run over the stored bytes
 * at save time and again at send time.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = 'jb.signal.directory-cache.v1';

/** A device address book, not a server mirror — enough to hold everyone a person knows. */
const MAX_CACHED_PROFILES = 500;

export interface SignalDirectoryClaim {
  readonly kind: number;
  readonly value: string;
  readonly proof: string;
}

export interface SignalDirectoryProfile {
  readonly id: string;
  readonly codename: string;
  readonly displayName: string;
  readonly bio: string;
  /** Ed25519 identity key, hex — without it a saved contact can never be verified offline. */
  readonly identityKey: string;
  readonly rnsPublicKey: string;
  readonly lxmfDestinationHash: string;
  /** The identity's own signature over its delivery address. */
  readonly transportBindingSignature: string;
  readonly claims: readonly SignalDirectoryClaim[];
  readonly languages: readonly string[];
  readonly revision: string;
}

export interface CachedSignalDirectoryProfile {
  readonly profile: SignalDirectoryProfile;
  /** When this device last saw the record. Reported, never used to evict. */
  readonly seenAtMs: number;
}

export interface SignalDirectoryCache {
  readonly profiles: readonly CachedSignalDirectoryProfile[];
  readonly refreshedAtMs: number;
}

export interface SignalDirectoryResult {
  readonly profiles: readonly SignalDirectoryProfile[];
  readonly source: 'network' | 'cache';
  /** When the cache was last filled from an index. 0 when it never has been. */
  readonly refreshedAtMs: number;
  /** Why the network answer is missing, when it is. */
  readonly notice?: string;
}

const EMPTY: SignalDirectoryCache = { profiles: [], refreshedAtMs: 0 };

function normalise(row: Record<string, unknown>): SignalDirectoryProfile {
  const claims = Array.isArray(row['claims']) ? (row['claims'] as Record<string, unknown>[]) : [];
  return {
    id: String(row['id'] ?? ''),
    codename: String(row['codename'] ?? row['id'] ?? ''),
    displayName: String(row['displayName'] ?? ''),
    bio: String(row['bio'] ?? ''),
    identityKey: String(row['identityKey'] ?? ''),
    rnsPublicKey: String(row['rnsPublicKey'] ?? ''),
    lxmfDestinationHash: String(row['lxmfDestinationHash'] ?? ''),
    transportBindingSignature: String(row['transportBindingSignature'] ?? ''),
    claims: claims.map((claim) => ({
      kind: Number(claim['kind'] ?? 0),
      value: String(claim['value'] ?? ''),
      proof: String(claim['proof'] ?? ''),
    })),
    languages: Array.isArray(row['languages']) ? (row['languages'] as string[]).map(String) : [],
    revision: String(row['revision'] ?? '0'),
  };
}

export async function loadSignalDirectoryCache(): Promise<SignalDirectoryCache> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as SignalDirectoryCache;
    return Array.isArray(parsed.profiles) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Merge a page of results into the cache, the newest observation of each identity winning. */
export async function cacheSignalDirectoryProfiles(
  profiles: readonly SignalDirectoryProfile[],
  seenAtMs = Date.now(),
): Promise<SignalDirectoryCache> {
  const current = await loadSignalDirectoryCache();
  const merged = new Map(current.profiles.map((row) => [row.profile.id, row]));
  for (const profile of profiles) {
    if (profile.id) merged.set(profile.id, { profile, seenAtMs });
  }
  const next: SignalDirectoryCache = {
    profiles: [...merged.values()]
      .sort((left, right) => right.seenAtMs - left.seenAtMs)
      .slice(0, MAX_CACHED_PROFILES),
    refreshedAtMs: seenAtMs,
  };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
  return next;
}

/** The same fields the index matches on, so an offline search behaves like an online one. */
function matches(profile: SignalDirectoryProfile, needle: string): boolean {
  if (!needle) return true;
  return [
    profile.displayName,
    profile.codename || profile.id,
    profile.bio,
    ...profile.claims.map((claim) => claim.value),
  ]
    .join('\n')
    .toLocaleLowerCase()
    .includes(needle);
}

export function searchCachedSignalDirectory(
  cache: SignalDirectoryCache,
  query = '',
): readonly SignalDirectoryProfile[] {
  const needle = query.trim().toLocaleLowerCase();
  return cache.profiles.filter((row) => matches(row.profile, needle)).map((row) => row.profile);
}

/**
 * Search the index, falling back to what this device already knows.
 *
 * The result states which source answered and how old it is, because "nobody matched" and
 * "the index is unreachable" have to be distinguishable on screen. When the network fails
 * and the cache is empty there is nothing honest to show, so the network error is raised
 * rather than dressed up as an empty result set.
 */
export async function searchSignalDirectory(
  baseUrl: string,
  query = '',
): Promise<SignalDirectoryResult> {
  try {
    const url = new URL('/v1/signal/directory', baseUrl);
    if (query.trim()) url.searchParams.set('q', query.trim());
    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Signal directory failed with HTTP ${response.status}`);
    const result = (await response.json()) as {
      readonly items?: readonly Record<string, unknown>[];
    };
    const profiles = (result.items ?? []).map(normalise);
    const cache = await cacheSignalDirectoryProfiles(profiles);
    return { profiles, source: 'network', refreshedAtMs: cache.refreshedAtMs };
  } catch (error) {
    const cache = await loadSignalDirectoryCache();
    if (cache.profiles.length === 0) throw error;
    return {
      profiles: searchCachedSignalDirectory(cache, query),
      source: 'cache',
      refreshedAtMs: cache.refreshedAtMs,
      notice: error instanceof Error ? error.message : 'The Signal index is unreachable.',
    };
  }
}
