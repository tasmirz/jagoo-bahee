/**
 * The client's durable peer directory (T3.6, TP-05, TP-06, TG-09).
 *
 * ── TP-05: discovery cannot depend on the network that just failed ─────────────────
 * "Peer records MUST be cached continuously during normal operation, on both nodes and
 * clients. When the gateway drops, the ISP-local addresses must already be known." The
 * refresh below runs while everything works, precisely so that nothing has to run when
 * nothing works. A directory fetched on demand is a directory that is empty during an
 * outage.
 *
 * ── TP-06: never evict for age ─────────────────────────────────────────────────────
 * "Refresh at least hourly while online, and never evict entries purely for age — a stale
 * ISP-local address is infinitely more useful than no address." This is the one cache in the
 * app with no TTL, and that is deliberate: the normal reason to expire a cache entry is that
 * a fresher one is obtainable, and during a blackout it is not. Staleness is REPORTED
 * (`ageMs`) so the UI can be honest, and never acted on by deleting anything.
 *
 * ── TG-09: a cold client with only the seed list ───────────────────────────────────
 * `connect` walks, in order: the saved home node, the cached directory, then the baked-in
 * seeds — narrowest scope first at every stage. With `GLOBAL` blocked and an empty cache,
 * that path ends on an `ISP_LOCAL` seed, which is the gate.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { networkRequest } from './request';
import { SEED_DIRECTORY, seedsByPreference, type SeedNode, type SeedScope } from './seed-directory';

const DIRECTORY_KEY = 'jb.peer-directory.v1';
/** TP-06 — "at least hourly while online". */
export const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export interface CachedPeer {
  /** jbs1… — identity is the key, never a URL (FD-02). */
  readonly serverId: string;
  readonly serverKey: string;
  readonly displayName?: string;
  readonly endpoints: readonly {
    readonly uri: string;
    readonly scope: SeedScope | string;
    readonly asn?: number | null;
    readonly ispName?: string | null;
  }[];
  readonly trust?: string;
  /** When this client last saw the record. Reported, never used to evict (TP-06). */
  readonly cachedAtMs: number;
  readonly source: 'directory' | 'seed' | 'manual' | 'mdns' | 'qr';
}

export interface PeerDirectorySnapshot {
  readonly peers: readonly CachedPeer[];
  readonly refreshedAtMs: number;
}

const EMPTY: PeerDirectorySnapshot = { peers: [], refreshedAtMs: 0 };

const SCOPE_ORDER: Readonly<Record<string, number>> = {
  LAN: 0,
  ISP_LOCAL: 1,
  NATIONAL: 2,
  GLOBAL: 3,
  MESH: 4,
  RETICULUM: 5,
};

const rankOf = (scope: string): number => SCOPE_ORDER[scope] ?? SCOPE_ORDER['GLOBAL'] ?? 3;

export async function loadDirectory(): Promise<PeerDirectorySnapshot> {
  const stored = await AsyncStorage.getItem(DIRECTORY_KEY);
  if (!stored) return EMPTY;
  try {
    const parsed = JSON.parse(stored) as PeerDirectorySnapshot;
    if (!Array.isArray(parsed.peers)) return EMPTY;
    return parsed;
  } catch {
    // A corrupt cache is not worth a crash, and it is not worth deleting either: the write
    // below replaces it on the next successful refresh.
    return EMPTY;
  }
}

export async function saveDirectory(snapshot: PeerDirectorySnapshot): Promise<void> {
  await AsyncStorage.setItem(DIRECTORY_KEY, JSON.stringify(snapshot));
}

/**
 * Merge freshly fetched records into the cache.
 *
 * A record already held is UPDATED, never replaced wholesale, and a record that has
 * disappeared from the node's directory is KEPT. A peer vanishing from one node's view is
 * far more often that node losing reachability than the peer ceasing to exist — and during a
 * partition, forgetting the address of a node we can no longer see is exactly backwards.
 */
export function mergeDirectory(
  current: PeerDirectorySnapshot,
  incoming: readonly CachedPeer[],
  nowMs: number,
): PeerDirectorySnapshot {
  const byId = new Map(current.peers.map((peer) => [peer.serverId, peer]));
  for (const peer of incoming) {
    if (!peer.serverId) continue; // L-21 — never store an entity we cannot name.
    const existing = byId.get(peer.serverId);
    byId.set(peer.serverId, {
      ...existing,
      ...peer,
      // Endpoints accumulate: a node reached over GLOBAL today may only be reachable over
      // ISP_LOCAL tomorrow, and dropping the address we are not currently using is how a
      // client arrives at a blackout holding only the address that stopped working.
      endpoints: mergeEndpoints(existing?.endpoints ?? [], peer.endpoints),
      cachedAtMs: nowMs,
    });
  }
  return { peers: [...byId.values()], refreshedAtMs: nowMs };
}

function mergeEndpoints(
  existing: CachedPeer['endpoints'],
  incoming: CachedPeer['endpoints'],
): CachedPeer['endpoints'] {
  const byKey = new Map(existing.map((endpoint) => [`${endpoint.scope}|${endpoint.uri}`, endpoint]));
  for (const endpoint of incoming) byKey.set(`${endpoint.scope}|${endpoint.uri}`, endpoint);
  return [...byKey.values()];
}

/** TP-06 — how stale the cache is. Displayed honestly; never a reason to delete anything. */
export function directoryAgeMs(snapshot: PeerDirectorySnapshot, nowMs: number): number {
  return snapshot.refreshedAtMs === 0 ? Number.POSITIVE_INFINITY : nowMs - snapshot.refreshedAtMs;
}

export function needsRefresh(snapshot: PeerDirectorySnapshot, nowMs: number): boolean {
  return directoryAgeMs(snapshot, nowMs) >= REFRESH_INTERVAL_MS;
}

/**
 * Every address worth trying, narrowest scope first.
 *
 * Cached records rank ahead of baked-in seeds at the same scope: a seed is a guess made at
 * build time, whereas a cached record is somewhere this device has actually been.
 */
export function candidateAddresses(
  snapshot: PeerDirectorySnapshot,
  seeds: readonly SeedNode[] = SEED_DIRECTORY,
): readonly { address: string; scope: string; source: 'cache' | 'seed'; label: string }[] {
  const fromCache = snapshot.peers.flatMap((peer) =>
    peer.endpoints.map((endpoint) => ({
      address: endpoint.uri,
      scope: String(endpoint.scope),
      source: 'cache' as const,
      label: peer.displayName ?? peer.serverId,
    })),
  );
  const fromSeeds = seedsByPreference(seeds).map((seed) => ({
    address: seed.address,
    scope: seed.scope as string,
    source: 'seed' as const,
    label: seed.label,
  }));

  const seen = new Set<string>();
  return [...fromCache, ...fromSeeds]
    .filter((candidate) => {
      if (seen.has(candidate.address)) return false;
      seen.add(candidate.address);
      return true;
    })
    .sort((a, b) => {
      const byScope = rankOf(a.scope) - rankOf(b.scope);
      if (byScope !== 0) return byScope;
      // Cache before seed at equal scope.
      return (a.source === 'cache' ? 0 : 1) - (b.source === 'cache' ? 0 : 1);
    });
}

/**
 * Pull a node's directory and fold it into the cache.
 *
 * `/v1/federation/directory` is public and omits `BLOCKED` peers rather than labelling them
 * — a directory naming who a node blocked is a list of targets for whoever wanted them
 * blocked.
 */
export async function refreshFrom(
  baseUrl: string,
  snapshot: PeerDirectorySnapshot,
  nowMs: number,
  fetchImpl: (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit,
  ) => Promise<Response> = networkRequest,
): Promise<PeerDirectorySnapshot> {
  const response = await fetchImpl(new URL('/v1/federation/directory', `${baseUrl}/`).toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`directory refresh failed: HTTP ${response.status}`);
  const payload = (await response.json()) as {
    readonly self?: { serverId?: string; serverKey?: string; endpoints?: unknown[] };
    readonly peers?: unknown[];
  };

  const records: CachedPeer[] = [];
  const push = (raw: unknown, source: CachedPeer['source']): void => {
    const record = raw as {
      serverId?: string;
      serverKey?: string;
      trust?: string;
      endpoints?: { uri?: string; scope?: string; asn?: number | null; ispName?: string | null }[];
    };
    if (!record?.serverId || !record.serverKey) return;
    records.push({
      serverId: record.serverId,
      serverKey: record.serverKey,
      endpoints: (record.endpoints ?? [])
        .filter((endpoint) => typeof endpoint?.uri === 'string' && endpoint.uri.length > 0)
        .map((endpoint) => ({
          uri: endpoint.uri as string,
          scope: endpoint.scope ?? 'GLOBAL',
          asn: endpoint.asn ?? null,
          ispName: endpoint.ispName ?? null,
        })),
      ...(record.trust ? { trust: record.trust } : {}),
      cachedAtMs: nowMs,
      source,
    });
  };

  if (payload.self) push(payload.self, source(baseUrl));
  for (const peer of payload.peers ?? []) push(peer, 'directory');

  const merged = mergeDirectory(snapshot, records, nowMs);
  await saveDirectory(merged);
  return merged;
}

const source = (_baseUrl: string): CachedPeer['source'] => 'directory';

/**
 * TG-09 — connect using only what is on the device.
 *
 * Walks the candidate list narrowest first and returns the first address that answers as a
 * Jagoo Bahee node. With an empty cache and `GLOBAL` blocked, that is an `ISP_LOCAL` seed,
 * which is the gate. Errors are swallowed per candidate deliberately: during a blackout most
 * of the list is expected to fail, and each failure is information about the network rather
 * than about the app.
 */
export async function connectFromCandidates(
  candidates: readonly { address: string; scope: string; label: string }[],
  probe: (address: string) => Promise<boolean>,
): Promise<{ address: string; scope: string; label: string } | null> {
  for (const candidate of candidates) {
    if (await probe(candidate.address).catch(() => false)) return candidate;
  }
  return null;
}
