/**
 * TP-09, TP-10, BR-10 — the uplink state machine.
 *
 * The asymmetry is the interesting part and is asserted directly: a scope dies only after
 * `failureThreshold` consecutive failures but recovers on the FIRST success. Slow to declare
 * death avoids tearing down every stream on one dropped packet (BR-07); slow to declare life
 * would leave the narrow path unused exactly when it came back, which is the opposite of
 * what TP-01 is for.
 */

import { describe, expect, it } from 'vitest';
import { ReachabilityScope } from '../../ports/network.port.js';
import {
  applyProbeRound,
  initialHealth,
  isSelectable,
  liveScopes,
  narrowestLiveScope,
  UplinkState,
  withForcedState,
} from './uplink-state.js';

const NOW = 1_767_225_600_000;
const SCOPES = [
  ReachabilityScope.GLOBAL,
  ReachabilityScope.NATIONAL,
  ReachabilityScope.ISP_LOCAL,
] as const;

const round = (
  health: ReturnType<typeof initialHealth>,
  reachable: Partial<Record<ReachabilityScope, boolean>>,
  nowMs = NOW,
) =>
  applyProbeRound(
    health,
    SCOPES.map((scope) => ({ scope, reachable: reachable[scope] ?? false })),
    { failureThreshold: 3, nowMs },
  );

describe('TP-09 — declared is configuration, live is measured', () => {
  it('starts UNKNOWN, which is not DOWN: we have not looked yet', () => {
    const health = initialHealth(SCOPES);
    expect(health.state).toBe(UplinkState.UNKNOWN);
    expect(liveScopes(health)).toEqual([]);
  });

  it('reports UP only when every declared scope answered', () => {
    const applied = round(initialHealth(SCOPES), {
      GLOBAL: true,
      NATIONAL: true,
      ISP_LOCAL: true,
    });
    expect(applied.health.state).toBe(UplinkState.UP);
    expect(applied.transition).toEqual({ from: UplinkState.UNKNOWN, to: UplinkState.UP });
  });

  it('reports DEGRADED — and stays usable — when only some scopes answer', () => {
    // This is the shutdown: the international transit is gone, the ISP is intact. A
    // "degraded" uplink is the one carrying all the traffic that still moves.
    const applied = round(initialHealth(SCOPES), { ISP_LOCAL: true });
    expect(applied.health.state).toBe(UplinkState.DEGRADED);
    expect(isSelectable(applied.health)).toBe(true);
    expect(liveScopes(applied.health)).toEqual([ReachabilityScope.ISP_LOCAL]);
  });

  it('reports DOWN when nothing answers, and is then not selectable', () => {
    const applied = round(initialHealth(SCOPES), {});
    expect(applied.health.state).toBe(UplinkState.DOWN);
    expect(isSelectable(applied.health)).toBe(false);
  });

  it('ignores a result for a scope this uplink never declared', () => {
    const health = initialHealth([ReachabilityScope.ISP_LOCAL]);
    const applied = applyProbeRound(
      health,
      [{ scope: ReachabilityScope.GLOBAL, reachable: true }],
      { failureThreshold: 3, nowMs: NOW },
    );
    expect(liveScopes(applied.health)).toEqual([]);
  });
});

describe('the threshold is asymmetric on purpose', () => {
  it('keeps a scope live until the threshold is reached', () => {
    let health = round(initialHealth(SCOPES), {
      GLOBAL: true,
      NATIONAL: true,
      ISP_LOCAL: true,
    }).health;

    // One and two dropped probes are not an outage; three are.
    health = round(health, { NATIONAL: true, ISP_LOCAL: true }).health;
    expect(liveScopes(health)).toContain(ReachabilityScope.GLOBAL);
    health = round(health, { NATIONAL: true, ISP_LOCAL: true }).health;
    expect(liveScopes(health)).toContain(ReachabilityScope.GLOBAL);
    health = round(health, { NATIONAL: true, ISP_LOCAL: true }).health;
    expect(liveScopes(health)).not.toContain(ReachabilityScope.GLOBAL);
    expect(health.state).toBe(UplinkState.DEGRADED);
  });

  it('recovers on the FIRST success — the narrow path must not wait to come back', () => {
    let health = round(initialHealth(SCOPES), {}).health;
    health = round(health, {}).health;
    health = round(health, {}).health;
    expect(health.state).toBe(UplinkState.DOWN);

    health = round(health, { ISP_LOCAL: true }).health;
    expect(liveScopes(health)).toEqual([ReachabilityScope.ISP_LOCAL]);
    expect(health.state).toBe(UplinkState.DEGRADED);
  });

  it('reports a transition only when the state actually changed (TP-10)', () => {
    const first = round(initialHealth(SCOPES), { GLOBAL: true, NATIONAL: true, ISP_LOCAL: true });
    expect(first.transition).not.toBeNull();
    const second = round(first.health, { GLOBAL: true, NATIONAL: true, ISP_LOCAL: true });
    expect(second.transition).toBeNull();
  });
});

describe('BR-10 — the operator override', () => {
  it('forcing DOWN takes the uplink out of selection even while probes pass', () => {
    const measured = round(initialHealth(SCOPES), {
      GLOBAL: true,
      NATIONAL: true,
      ISP_LOCAL: true,
    }).health;
    const forced = withForcedState(measured, UplinkState.DOWN);
    expect(forced.state).toBe(UplinkState.DOWN);
    expect(isSelectable(forced)).toBe(false);
  });

  it('releasing the override restores the MEASURED state, not the forced one', () => {
    const measured = round(initialHealth(SCOPES), { ISP_LOCAL: true }).health;
    const forced = withForcedState(measured, UplinkState.DOWN);
    expect(withForcedState(forced, null).state).toBe(UplinkState.DEGRADED);
  });

  it('forcing UP before any probe trusts what the uplink declares', () => {
    // Otherwise BR-10 could not rescue a node whose probe targets are themselves blocked —
    // which is precisely a situation "the probes cannot detect".
    const forced = withForcedState(initialHealth(SCOPES), UplinkState.UP);
    expect(liveScopes(forced)).toEqual([
      ReachabilityScope.ISP_LOCAL,
      ReachabilityScope.NATIONAL,
      ReachabilityScope.GLOBAL,
    ]);
  });

  it('a forced-UP uplink still reports honest per-scope truth once probed', () => {
    const probed = round(withForcedState(initialHealth(SCOPES), UplinkState.UP), {
      ISP_LOCAL: true,
    }).health;
    expect(liveScopes(probed)).toEqual([ReachabilityScope.ISP_LOCAL]);
  });

  it('the override survives a probe round', () => {
    const forced = withForcedState(initialHealth(SCOPES), UplinkState.DOWN);
    const applied = round(forced, { GLOBAL: true, NATIONAL: true, ISP_LOCAL: true });
    expect(applied.health.state).toBe(UplinkState.DOWN);
  });
});

describe('narrowestLiveScope — what the client indicator shows (TG-10)', () => {
  it('is the narrowest scope actually reachable, not the widest declared', () => {
    const health = round(initialHealth(SCOPES), { GLOBAL: true, ISP_LOCAL: true }).health;
    expect(narrowestLiveScope(health)).toBe(ReachabilityScope.ISP_LOCAL);
  });

  it('is null when nothing works, so "no path" is never displayed as a scope', () => {
    expect(narrowestLiveScope(round(initialHealth(SCOPES), {}).health)).toBeNull();
  });
});
