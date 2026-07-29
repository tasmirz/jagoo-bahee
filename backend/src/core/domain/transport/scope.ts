/**
 * Reachability scope ranking (T3.1, TP-01).
 *
 * ── The narrowest-working-scope rule is a RESILIENCE mechanism, not an optimisation ──
 * `LAN` → `ISP_LOCAL` → `NATIONAL` → `GLOBAL` → `MESH` → `RETICULUM`, best first, applied
 * during NORMAL operation. A fallback path that only runs during a blackout is untested
 * code that will fail during a blackout; preferring the narrow scope continuously is what
 * keeps the ISP-local path warm, monitored and known-good at the moment it becomes the only
 * path. The secondary benefit — intra-ISP routing is faster and cheaper than transiting the
 * IX — is real but is not why the rule exists.
 *
 * The order itself lives in `SCOPE_PREFERENCE` on the port, because the gRPC sender, the
 * path selector and the client all have to agree on it and a second copy would drift.
 */

import { ReachabilityScope, SCOPE_PREFERENCE } from '../../ports/network.port.js';

/**
 * 0 for the narrowest scope, ascending. An unknown scope ranks after everything known
 * rather than before it: a scope this build does not understand is the one we are least
 * able to promise anything about.
 */
export function scopeRank(scope: ReachabilityScope): number {
  const index = SCOPE_PREFERENCE.indexOf(scope);
  return index < 0 ? SCOPE_PREFERENCE.length : index;
}

/** True when `a` is at least as narrow as `b`. */
export function isNarrowerOrEqual(a: ReachabilityScope, b: ReachabilityScope): boolean {
  return scopeRank(a) <= scopeRank(b);
}

/** The narrowest of a set, or null when the set is empty. */
export function narrowest(
  scopes: Iterable<ReachabilityScope>,
): ReachabilityScope | null {
  let best: ReachabilityScope | null = null;
  for (const scope of scopes) {
    if (best === null || scopeRank(scope) < scopeRank(best)) best = scope;
  }
  return best;
}

/** Narrowest first, stable for equal ranks. */
export function byScopePreference(
  a: ReachabilityScope,
  b: ReachabilityScope,
): number {
  return scopeRank(a) - scopeRank(b);
}

/**
 * The scopes a node reaching `scope` also reaches.
 *
 * A node that can reach `GLOBAL` can, by construction, reach everything the wider internet
 * subsumes — but the reverse is emphatically false, and that asymmetry is the whole shape
 * of a shutdown: `ISP_LOCAL` survives when `GLOBAL` does not. `LAN`, `MESH` and `RETICULUM`
 * subsume nothing; they are separate physical facts, not degrees of the same one.
 */
export function impliedScopes(scope: ReachabilityScope): readonly ReachabilityScope[] {
  switch (scope) {
    case ReachabilityScope.GLOBAL:
      return [ReachabilityScope.GLOBAL, ReachabilityScope.NATIONAL, ReachabilityScope.ISP_LOCAL];
    case ReachabilityScope.NATIONAL:
      return [ReachabilityScope.NATIONAL, ReachabilityScope.ISP_LOCAL];
    default:
      return [scope];
  }
}

/** Human-facing label, kept here so the operator surface and the client cannot disagree. */
export const SCOPE_LABEL: Readonly<Record<ReachabilityScope, string>> = {
  [ReachabilityScope.LAN]: 'Local network',
  [ReachabilityScope.ISP_LOCAL]: 'ISP-local',
  [ReachabilityScope.NATIONAL]: 'National',
  [ReachabilityScope.GLOBAL]: 'Internet',
  [ReachabilityScope.MESH]: 'Mesh',
  [ReachabilityScope.RETICULUM]: 'Reticulum',
};
