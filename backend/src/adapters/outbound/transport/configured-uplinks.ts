/**
 * `UplinkManager` from configuration (T3.2, TP-08, TP-09, TP-10, BR-10).
 *
 * ── AR-12, one rung up: transport is OFF unless configured ──────────────────────────
 * With no `UPLINKS`, this manager holds exactly one implicit uplink that declares every
 * scope, binds nothing, and probes nothing. Every scope is then "live", every peer is
 * reachable on the single uplink, no fanout is ever a bridge crossing, and the node behaves
 * bit-for-bit as it did in P2. Multi-homing is opt-in, and a single-homed VPS must never pay
 * for it.
 *
 * ── A scope with no probe target is assumed live, and that is deliberate ────────────
 * The alternative — "unmeasured means dead" — would make a node with uplinks but no `probe.
 * targets` unable to select any path at all, which is a configuration mistake turning into a
 * total outage. "We have no way to test this, so we will try it and find out" is the honest
 * reading, and a failed dial then feeds TP-12's backoff exactly as it should.
 */

import {
  applyProbeRound,
  initialHealth,
  isSelectable,
  liveScopes,
  narrowestLiveScope,
  UplinkState,
  withForcedState,
  type ScopeProbeResult,
  type UplinkHealth,
} from '../../../core/domain/transport/uplink-state.js';
import { narrowest } from '../../../core/domain/transport/scope.js';
import type { UplinkView } from '../../../core/domain/transport/path-selection.js';
import type { ReachabilityScope } from '../../../core/ports/network.port.js';
import {
  UplinkManager,
  type ScopeProbe,
  type Unsubscribe,
  type Uplink,
  type UplinkTransition,
} from '../../../core/ports/transport.port.js';
import type { Clock } from '../../../core/ports/system.port.js';
import type { ProbeConfig, UplinkConfig } from '../../../composition/transport.config.js';

export interface ConfiguredUplinkDeps {
  readonly uplinks: readonly UplinkConfig[];
  readonly probe: ProbeConfig;
  readonly prober: ScopeProbe;
  readonly clock: Clock;
}

export class ConfiguredUplinkManager extends UplinkManager {
  private readonly health = new Map<string, UplinkHealth>();
  private readonly listeners = new Set<(transition: UplinkTransition) => void>();

  constructor(private readonly deps: ConfiguredUplinkDeps) {
    super();
    for (const config of deps.uplinks) {
      // Born UP, not UNKNOWN.
      //
      // `UNKNOWN` makes `isSelectable` false, which takes every path with it. A node that
      // could select nothing until its first probe round completed would spend its first
      // seconds unable to federate at all — and if the probe targets themselves are blocked,
      // it would never recover. "We have not measured this, so try it and find out" is the
      // honest starting position, and a dial that fails feeds TP-12's backoff exactly as it
      // should. Probing demotes; it does not have to promote.
      const base = initialHealth(config.declaredScopes);
      this.health.set(config.id, {
        ...base,
        state: UplinkState.UP,
        scopes: base.scopes.map((scope) => ({ ...scope, live: true })),
      });
    }
  }

  uplinks(): readonly Uplink[] {
    return this.deps.uplinks.map((config) => this.toUplink(config));
  }

  get(id: string): Uplink | null {
    const config = this.deps.uplinks.find((candidate) => candidate.id === id);
    return config ? this.toUplink(config) : null;
  }

  forScope(scope: ReachabilityScope): readonly Uplink[] {
    return this.uplinks().filter(
      (uplink) => isSelectable(uplink.health) && liveScopes(uplink.health).includes(scope),
    );
  }

  views(): readonly UplinkView[] {
    return this.uplinks().map((uplink) => ({
      id: uplink.id,
      sourceIp: uplink.sourceIp,
      ...(uplink.asn === undefined ? {} : { asn: uplink.asn }),
      ...(uplink.ispName === undefined ? {} : { ispName: uplink.ispName }),
      priority: uplink.priority,
      liveScopes: liveScopes(uplink.health),
      selectable: isSelectable(uplink.health),
    }));
  }

  /**
   * One probe pass over every uplink × every declared scope.
   *
   * Uplinks are probed concurrently and scopes within an uplink sequentially: the point of
   * TP-09 is that uplinks are independent, and running them in series would make a single
   * dead link's timeouts delay every other link's verdict by the full probe budget — which,
   * with a 30-second interval and three uplinks, is how a probe loop falls behind reality.
   */
  async probeAll(): Promise<readonly UplinkTransition[]> {
    const nowMs = this.deps.clock.nowMs();
    const rounds = await Promise.all(
      this.deps.uplinks.map(async (config) => ({
        config,
        results: await this.probeUplink(config),
      })),
    );

    const transitions: UplinkTransition[] = [];
    for (const { config, results } of rounds) {
      if (results.length === 0) continue;
      const current = this.health.get(config.id) ?? initialHealth(config.declaredScopes);
      const applied = applyProbeRound(current, results, {
        failureThreshold: this.deps.probe.failureThreshold,
        nowMs,
      });
      this.health.set(config.id, applied.health);
      if (applied.transition) {
        transitions.push({
          uplink: this.toUplink(config),
          from: applied.transition.from,
          to: applied.transition.to,
          atMs: nowMs,
        });
      }
    }

    for (const transition of transitions) {
      for (const listener of this.listeners) listener(transition);
    }
    return transitions;
  }

  force(id: string, state: UplinkState | null): void {
    const config = this.deps.uplinks.find((candidate) => candidate.id === id);
    if (!config) return;
    const current = this.health.get(id) ?? initialHealth(config.declaredScopes);
    const next = withForcedState(current, state);
    this.health.set(id, next);
    if (next.state !== current.state) {
      const transition: UplinkTransition = {
        uplink: this.toUplink(config),
        from: current.state,
        to: next.state,
        atMs: this.deps.clock.nowMs(),
      };
      for (const listener of this.listeners) listener(transition);
    }
  }

  onChange(listener: (transition: UplinkTransition) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  currentScope(): ReachabilityScope | null {
    const scopes: ReachabilityScope[] = [];
    for (const uplink of this.uplinks()) {
      const scope = narrowestLiveScope(uplink.health);
      if (scope) scopes.push(scope);
    }
    return narrowest(scopes);
  }

  private async probeUplink(config: UplinkConfig): Promise<readonly ScopeProbeResult[]> {
    const results: ScopeProbeResult[] = [];
    for (const scope of config.declaredScopes) {
      const targets = this.deps.probe.targets[scope] ?? [];
      if (targets.length === 0) {
        // See the header note: unmeasurable is not unreachable. Reported as reachable rather
        // than omitted, so a scope with no target stays live instead of decaying to false
        // because nothing ever refreshed it.
        results.push({ scope, reachable: true });
        continue;
      }
      let best: ScopeProbeResult = { scope, reachable: false };
      for (const target of targets) {
        const outcome = await this.deps.prober.probe(target, {
          uplinkId: config.id,
          ...(config.sourceIp ? { sourceIp: config.sourceIp } : {}),
          timeoutMs: this.deps.probe.timeoutMs,
        });
        if (outcome.reachable) {
          // One answering target is enough. Requiring all of them would report an outage
          // whenever a single well-known address happened to be down.
          best = { scope, reachable: true, ...(outcome.rttMs === undefined ? {} : { rttMs: outcome.rttMs }) };
          break;
        }
      }
      results.push(best);
    }
    return results;
  }

  private toUplink(config: UplinkConfig): Uplink {
    return {
      id: config.id,
      ...(config.interfaceName === undefined ? {} : { interfaceName: config.interfaceName }),
      sourceIp: config.sourceIp,
      ...(config.asn === undefined ? {} : { asn: config.asn }),
      ...(config.ispName === undefined ? {} : { ispName: config.ispName }),
      ...(config.region === undefined ? {} : { region: config.region }),
      declaredScopes: config.declaredScopes,
      ...(config.inboundPort === undefined ? {} : { inboundPort: config.inboundPort }),
      priority: config.priority,
      health: this.health.get(config.id) ?? initialHealth(config.declaredScopes),
    };
  }
}
