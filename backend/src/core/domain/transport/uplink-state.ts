/**
 * The uplink state machine (T3.2, TP-09, TP-10).
 *
 * ── `declaredScopes` is configuration; `liveScopes` is measured truth ───────────────
 * TP-09 is explicit that the path selector uses the MEASURED value. An operator writing
 * `scopes: [GLOBAL, NATIONAL, ISP_LOCAL]` in `node.config.yaml` is stating an intent about
 * a normal day. During a shutdown that line is exactly as true as it was yesterday and
 * exactly as useless, so this file exists to keep the two apart: configuration proposes,
 * probing decides.
 *
 * ── Why a threshold, and why per scope ──────────────────────────────────────────────
 * One dropped packet is not an outage. Flapping an uplink `up`/`down` on every missed probe
 * would tear down and rebuild every stream on it (BR-07) several times a minute, which is
 * strictly worse than the single lost packet it reacts to. So a scope goes dark only after
 * `failureThreshold` consecutive failures, and recovers on the FIRST success — asymmetric on
 * purpose: being slow to declare death avoids churn, being slow to declare life would leave
 * the narrow path unused exactly when it came back (TP-01).
 *
 * Pure. `nowMs` is supplied by the caller; nothing here reads a clock or a socket.
 */

import type { ReachabilityScope } from '../../ports/network.port.js';
import { narrowest, scopeRank } from './scope.js';

export const UplinkState = {
  /** No probe has completed yet. Distinct from `down`: we have not looked. */
  UNKNOWN: 'unknown',
  UP: 'up',
  /** Reachable, but not at every scope it declares. Still usable — for the scopes that live. */
  DEGRADED: 'degraded',
  DOWN: 'down',
} as const;
export type UplinkState = (typeof UplinkState)[keyof typeof UplinkState];

export interface ScopeProbeResult {
  readonly scope: ReachabilityScope;
  readonly reachable: boolean;
  readonly rttMs?: number;
}

export interface ScopeHealth {
  readonly scope: ReachabilityScope;
  readonly live: boolean;
  readonly consecutiveFailures: number;
  readonly lastOkAtMs: number | null;
  readonly rttMs: number | null;
}

export interface UplinkHealth {
  readonly state: UplinkState;
  readonly scopes: readonly ScopeHealth[];
  readonly lastProbedAtMs: number | null;
  /**
   * An operator override (BR-10). When set it wins over every measurement, because the
   * situations BR-10 exists for are precisely the ones the probes cannot detect — a
   * transparent proxy that answers every TCP connect, a link that is up but poisoned.
   */
  readonly forcedState?: UplinkState;
}

export function initialHealth(declaredScopes: readonly ReachabilityScope[]): UplinkHealth {
  return {
    state: UplinkState.UNKNOWN,
    scopes: declaredScopes.map((scope) => ({
      scope,
      live: false,
      consecutiveFailures: 0,
      lastOkAtMs: null,
      rttMs: null,
    })),
    lastProbedAtMs: null,
  };
}

export interface ProbeApplication {
  readonly health: UplinkHealth;
  /** Null when the state did not change — the caller logs and meters only transitions (TP-10). */
  readonly transition: { readonly from: UplinkState; readonly to: UplinkState } | null;
}

/**
 * Fold one round of probe results into an uplink's health.
 *
 * Results for scopes the uplink does not declare are ignored rather than added: an uplink
 * that answers a probe for a scope it never claimed has told us something about the probe
 * target, not about itself.
 */
export function applyProbeRound(
  current: UplinkHealth,
  results: readonly ScopeProbeResult[],
  options: { readonly failureThreshold: number; readonly nowMs: number },
): ProbeApplication {
  const byScope = new Map(results.map((result) => [result.scope, result]));

  const scopes = current.scopes.map((health): ScopeHealth => {
    const result = byScope.get(health.scope);
    if (!result) return health;
    if (result.reachable) {
      return {
        scope: health.scope,
        live: true,
        consecutiveFailures: 0,
        lastOkAtMs: options.nowMs,
        rttMs: result.rttMs ?? null,
      };
    }
    const failures = health.consecutiveFailures + 1;
    return {
      scope: health.scope,
      // Recovers on the first success, dies only on the threshold. See the header note.
      live: failures < options.failureThreshold ? health.live : false,
      consecutiveFailures: failures,
      lastOkAtMs: health.lastOkAtMs,
      rttMs: health.rttMs,
    };
  });

  const measured = deriveState(scopes);
  const next: UplinkHealth = {
    state: current.forcedState ?? measured,
    scopes,
    lastProbedAtMs: options.nowMs,
    ...(current.forcedState ? { forcedState: current.forcedState } : {}),
  };

  return {
    health: next,
    transition: next.state === current.state ? null : { from: current.state, to: next.state },
  };
}

function deriveState(scopes: readonly ScopeHealth[]): UplinkState {
  if (scopes.length === 0) return UplinkState.UNKNOWN;
  const live = scopes.filter((scope) => scope.live).length;
  if (live === 0) return UplinkState.DOWN;
  return live === scopes.length ? UplinkState.UP : UplinkState.DEGRADED;
}

/**
 * BR-10 — force an uplink up or down, or release the override.
 *
 * Forcing UP does not fabricate live scopes: it keeps the uplink in the selector's candidate
 * set while leaving the measured per-scope truth intact, so an operator who is right gets
 * their path back and an operator who is wrong gets an honest failure instead of a lie.
 *
 * ── Releasing an override must actually release it ─────────────────────────────────
 * This used to spread `health` and then conditionally re-add `forcedState`, which meant
 * `withForcedState(health, null)` kept whatever override was already there: `state` fell back
 * to the measured value, but `forcedState` survived forever. Two consequences, both live.
 * `/v1/transport/uplinks` reported `forced: "down"` on an uplink no longer forced, so an
 * operator reading the surface BR-10 exists to provide was told the opposite of the truth.
 * And `liveScopes` has a special case keyed on `forcedState === UP`, so a released
 * never-probed uplink went on claiming every scope it declares. The key is dropped
 * explicitly here rather than left to a conditional spread, because "absent" and "present
 * and null" are the same to `?? measured` and very different to `health.forcedState === UP`.
 */
export function withForcedState(
  health: UplinkHealth,
  forced: UplinkState | null,
): UplinkHealth {
  const measured = deriveState(health.scopes);
  const { forcedState: _released, ...rest } = health;
  return {
    ...rest,
    state: forced ?? measured,
    ...(forced ? { forcedState: forced } : {}),
  };
}

/** The scopes this uplink can ACTUALLY reach right now, narrowest first. */
export function liveScopes(health: UplinkHealth): readonly ReachabilityScope[] {
  if (health.state === UplinkState.DOWN) return [];
  // A forced-UP uplink whose probes have never run is trusted for what it declares —
  // otherwise BR-10 could not rescue a node whose probe targets are themselves blocked.
  if (health.forcedState === UplinkState.UP && health.lastProbedAtMs === null) {
    return [...health.scopes].map((scope) => scope.scope).sort(compareScopes);
  }
  return health.scopes
    .filter((scope) => scope.live)
    .map((scope) => scope.scope)
    .sort(compareScopes);
}

/** The narrowest scope this uplink currently reaches — what the client's indicator shows. */
export function narrowestLiveScope(health: UplinkHealth): ReachabilityScope | null {
  return narrowest(liveScopes(health));
}

/** Usable for selection: anything not fully down (TP-05 step 1 says `up` or `degraded`). */
export function isSelectable(health: UplinkHealth): boolean {
  return health.state === UplinkState.UP || health.state === UplinkState.DEGRADED;
}

const compareScopes = (a: ReachabilityScope, b: ReachabilityScope): number =>
  scopeRank(a) - scopeRank(b);
