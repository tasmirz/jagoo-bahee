/**
 * Path selection — the normative algorithm from `Plans/06` §5 (T3.4, T3.5).
 *
 * ── TP-13: pure, and that is the point ──────────────────────────────────────────────
 * A function of (peer record, uplink states, clock, jitter). No sockets, no DNS, no
 * `Date.now()`. The path selector is the piece that has to be right when nothing else is
 * working, so it must be provable at a desk: every ranking rule below is a unit test, not a
 * field observation. The ATTEMPT loop — step 5's "attempt connection bound to
 * uplink.sourceIp" — is I/O and lives in `core/app/path-router.ts`; this file produces the
 * ordered candidate list that loop walks.
 *
 * ── TP-11: the same-ASN bonus is what makes ISP-local win ───────────────────────────
 * Step 4b subtracts half a rank when an endpoint's ASN matches one of our uplinks'. Half,
 * not one: it must be strong enough to beat an equally-ranked endpoint on a different AS and
 * weak enough never to promote a `NATIONAL` endpoint above an `ISP_LOCAL` one. That is the
 * rule that keeps the resilience path warm (TP-01), and TG-03 fails if it stops holding.
 *
 * ── TP-12: exponential backoff with jitter, capped at 5 minutes ─────────────────────
 * A dead endpoint must not be retried into a hot loop, and a recovering ISP must not see a
 * thundering herd — five hundred nodes that all failed at the same instant must not all
 * return at the same instant. Jitter arrives as a caller-supplied fraction rather than being
 * drawn here, because `core/domain` is deterministic given its inputs (AR-02).
 */

import type { PeerEndpoint, PeerRecord, ReachabilityScope } from '../../ports/network.port.js';
import { scopeRank } from './scope.js';

/** The failure count at which step 3 starts holding an endpoint back. */
export const ENDPOINT_FAILURE_THRESHOLD = 3;
export const ENDPOINT_INITIAL_BACKOFF_MS = 1_000;
/** TP-12 — capped at five minutes. A longer hold would outlast most real outages. */
export const ENDPOINT_MAX_BACKOFF_MS = 5 * 60 * 1000;

/**
 * Everything the selector needs to know about one uplink.
 *
 * A view rather than the live `Uplink` object so this stays a value function: the adapter
 * that owns sockets projects its state into this shape, and the selector cannot accidentally
 * probe anything.
 */
export interface UplinkView {
  readonly id: string;
  readonly sourceIp: string;
  readonly asn?: number;
  readonly ispName?: string;
  /** Lower is tried first. `lan: 0` in the sample config is the narrowest, so it leads. */
  readonly priority: number;
  /** MEASURED, not declared (TP-09). */
  readonly liveScopes: readonly ReachabilityScope[];
  /** `up` or `degraded`; a `down` uplink is not a candidate at all. */
  readonly selectable: boolean;
}

export interface PathCandidate {
  readonly endpoint: PeerEndpoint;
  readonly uplink: UplinkView;
  /** Scope rank with the same-ASN bonus applied — lower is better. */
  readonly rank: number;
  readonly sameAsn: boolean;
}

export interface PathSelectionInput {
  readonly peer: PeerRecord;
  readonly uplinks: readonly UplinkView[];
  readonly nowMs: number;
  /** In [0, 1). One draw per selection is enough to spread a herd. */
  readonly jitter01: number;
}

/**
 * TP-12 — how long an endpoint stays benched after `failures` consecutive failures.
 *
 * Equal jitter: half the delay is fixed and half is random. Full jitter (`random × delay`)
 * spreads a herd better but can return a near-zero delay on the twelfth failure, which is
 * how a dead endpoint becomes a hot loop again; equal jitter keeps a guaranteed floor.
 */
export function endpointBackoffMs(failures: number, jitter01: number): number {
  if (failures < ENDPOINT_FAILURE_THRESHOLD) return 0;
  const exponent = Math.min(failures - ENDPOINT_FAILURE_THRESHOLD, 30);
  const ceiling = Math.min(ENDPOINT_INITIAL_BACKOFF_MS * 2 ** exponent, ENDPOINT_MAX_BACKOFF_MS);
  const bounded = Math.min(Math.max(jitter01, 0), 0.999_999);
  return Math.round(ceiling / 2 + (ceiling / 2) * bounded);
}

/**
 * Step 3 — is this endpoint still serving its backoff?
 *
 * `Plans/06` §5 measures the wait from `last_ok_at_ms`. Taken literally that is unusable for
 * an endpoint that has NEVER succeeded: `last_ok_at_ms` is 0, `now − 0` is enormous, and the
 * endpoint is retried every pass forever — the precise hot loop TP-12 forbids, on the
 * precise endpoint most likely to be dead. So the wait is measured from the last ATTEMPT
 * when we have recorded one, falling back to `last_ok_at_ms`. `lastAttemptAtMs` is node-local
 * and deliberately absent from `PeerEndpoint` on the wire: it is a fact about our dialling,
 * not about the peer, and would be meaningless to anyone else.
 */
export function isBackingOff(
  endpoint: PeerEndpoint,
  nowMs: number,
  jitter01: number,
): boolean {
  const failures = endpoint.consecutiveFailures ?? 0;
  if (failures < ENDPOINT_FAILURE_THRESHOLD) return false;
  const since = endpoint.lastAttemptAtMs ?? endpoint.lastOkAtMs ?? 0;
  return nowMs - since < endpointBackoffMs(failures, jitter01);
}

/**
 * Steps 1–4 — every workable (endpoint, uplink) pair, best first.
 *
 * Returns the full ranked list rather than one winner so the caller can walk it on failure
 * (step 5) without re-running selection and without the selector needing to know that a
 * connection attempt exists.
 */
export function rankPaths(input: PathSelectionInput): readonly PathCandidate[] {
  // 1. live ← union of liveScopes over uplinks in state up|degraded
  const usable = input.uplinks.filter((uplink) => uplink.selectable);
  const live = new Set<ReachabilityScope>();
  for (const uplink of usable) for (const scope of uplink.liveScopes) live.add(scope);

  const ourAsns = new Set(
    usable.map((uplink) => uplink.asn).filter((asn): asn is number => typeof asn === 'number'),
  );

  const candidates: PathCandidate[] = [];
  for (const endpoint of input.peer.endpoints) {
    // 2. candidates ← endpoints whose scope is live on some uplink
    if (!live.has(endpoint.scope)) continue;
    // 3. drop endpoints still serving their backoff
    if (isBackingOff(endpoint, input.nowMs, input.jitter01)) continue;

    // 5. the uplink that will carry it: highest priority reaching this scope, ASN match first
    const uplink = uplinkFor(usable, endpoint);
    if (!uplink) continue;

    const sameAsn = endpoint.asn !== undefined && ourAsns.has(endpoint.asn);
    candidates.push({
      endpoint,
      uplink,
      // 4a + 4b — scope rank, minus the same-ASN bonus.
      rank: scopeRank(endpoint.scope) - (sameAsn ? 0.5 : 0),
      sameAsn,
    });
  }

  return candidates.sort(compareCandidates);
}

/** Step 5's first attempt. Null means step 7: no path, enqueue to the outbox. */
export function selectPath(input: PathSelectionInput): PathCandidate | null {
  return rankPaths(input)[0] ?? null;
}

/**
 * Step 6 — an unreachable peer with no inbound port is not a failure.
 *
 * FD-11/FD-12: a node behind CGNAT federates fully over connections IT opened. When we
 * cannot dial such a peer the correct action is to wait for it, not to escalate, and the
 * outbox holds its traffic meanwhile (BR-08).
 */
export function mustWaitForPeer(peer: PeerRecord): boolean {
  return (
    peer.endpoints.length === 0 ||
    peer.endpoints.every((endpoint) => endpoint.inboundCapable === false)
  );
}

/**
 * Step 5's uplink choice: the highest-priority uplink that reaches this endpoint's scope,
 * preferring one on the same AS.
 *
 * The ASN preference is checked before the priority number because a matching AS is a
 * statement about the actual topology, whereas `priority` is an operator's guess about a
 * normal day — and the whole point of TP-11 is that traffic to an ISP-local peer should
 * leave through that ISP's interface.
 */
function uplinkFor(
  uplinks: readonly UplinkView[],
  endpoint: PeerEndpoint,
): UplinkView | null {
  const reaching = uplinks.filter((uplink) => uplink.liveScopes.includes(endpoint.scope));
  if (reaching.length === 0) return null;
  const sorted = [...reaching].sort((a, b) => {
    const aMatch = endpoint.asn !== undefined && a.asn === endpoint.asn ? 0 : 1;
    const bMatch = endpoint.asn !== undefined && b.asn === endpoint.asn ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id.localeCompare(b.id);
  });
  return sorted[0] ?? null;
}

function compareCandidates(a: PathCandidate, b: PathCandidate): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  // 4c — faster first. An unmeasured RTT sorts last rather than as zero: "we have never
  // timed this" must never outrank "we timed it and it was quick".
  const aRtt = a.endpoint.rttMs ?? Number.POSITIVE_INFINITY;
  const bRtt = b.endpoint.rttMs ?? Number.POSITIVE_INFINITY;
  if (aRtt !== bRtt) return aRtt - bRtt;
  // 4d — most recently known good first.
  const aOk = a.endpoint.lastOkAtMs ?? 0;
  const bOk = b.endpoint.lastOkAtMs ?? 0;
  if (aOk !== bOk) return bOk - aOk;
  return a.endpoint.address.localeCompare(b.endpoint.address);
}

/** Record a successful dial: step 5's "record last_ok_at, reset failures". */
export function endpointSucceeded(
  endpoint: PeerEndpoint,
  nowMs: number,
  rttMs?: number,
): PeerEndpoint {
  return {
    ...endpoint,
    lastOkAtMs: nowMs,
    lastAttemptAtMs: nowMs,
    consecutiveFailures: 0,
    ...(rttMs === undefined ? {} : { rttMs }),
  };
}

/** Record a failed dial: step 5's "increment consecutive_failures, continue". */
export function endpointFailed(endpoint: PeerEndpoint, nowMs: number): PeerEndpoint {
  return {
    ...endpoint,
    lastAttemptAtMs: nowMs,
    consecutiveFailures: (endpoint.consecutiveFailures ?? 0) + 1,
  };
}

/** Apply an endpoint update to a peer record, matching on address and scope. */
export function withEndpoint(peer: PeerRecord, updated: PeerEndpoint): PeerRecord {
  return {
    ...peer,
    endpoints: peer.endpoints.map((endpoint) =>
      endpoint.address === updated.address && endpoint.scope === updated.scope
        ? updated
        : endpoint,
    ),
  };
}
