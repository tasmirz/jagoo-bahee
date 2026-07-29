/**
 * In-memory doubles for the P3 transport ports (AR-03).
 *
 * "Every port gets a production adapter AND an in-memory double. Unit tests use doubles;
 * integration tests use real adapters." For transport that rule earns its keep more than
 * anywhere else: the scenarios P3 exists for — an ISP islanded, an IX cut, a gateway
 * blackholing one scope but not another — cannot be produced on a developer's machine with
 * real sockets. `ScriptedScopeProbe` is the iptables rule, expressed as a value.
 */

import {
  LocalDiscovery,
  NatTraversal,
  ScopeProbe,
  type DiscoveredNode,
  type ProbeOutcome,
  type ReachabilityReport,
} from '../../../core/ports/transport.port.js';
import type { ReachabilityScope } from '../../../core/ports/network.port.js';

/**
 * A probe whose answers the test controls.
 *
 * Targets are addressed as `scope:<SCOPE>` so a test can block a whole scope with one call,
 * which is exactly what "the IX went down" looks like from a node's point of view: every
 * `NATIONAL` target stops answering at once while `ISP_LOCAL` is untouched.
 *
 * Per-uplink blocking exists because a partition is rarely symmetric — the bridge node's
 * ISP-A interface can die while its ISP-B interface is fine, and TG-06 is precisely that.
 */
export class ScriptedScopeProbe extends ScopeProbe {
  private readonly blockedScopes = new Set<string>();
  private readonly blockedUplinks = new Set<string>();
  /** Every probe made, so a test can assert an uplink was probed independently (TP-09). */
  readonly calls: { target: string; sourceIp: string | undefined }[] = [];
  rttMs = 5;

  block(scope: ReachabilityScope): void {
    this.blockedScopes.add(scope);
  }

  unblock(scope: ReachabilityScope): void {
    this.blockedScopes.delete(scope);
  }

  /**
   * Cut one interface: every scope on it goes dark, others are unaffected.
   *
   * Keyed on the uplink ID rather than the source address, because a test that dials for
   * real has to give every uplink a source address the host can actually bind — and two
   * uplinks then share one. The uplink ID is the operator's own label and is unique by
   * construction, which is why `ScopeProbe.probe` carries it.
   */
  blockUplink(uplinkId: string): void {
    this.blockedUplinks.add(uplinkId);
  }

  unblockUplink(uplinkId: string): void {
    this.blockedUplinks.delete(uplinkId);
  }

  async probe(
    target: string,
    options: { readonly uplinkId: string; readonly sourceIp?: string; readonly timeoutMs: number },
  ): Promise<ProbeOutcome> {
    this.calls.push({ target, sourceIp: options.sourceIp });
    if (this.blockedUplinks.has(options.uplinkId)) return { reachable: false };
    const scope = target.startsWith('scope:') ? target.slice('scope:'.length) : target;
    if (this.blockedScopes.has(scope)) return { reachable: false };
    return { reachable: true, rttMs: this.rttMs };
  }
}

/** The probe target a `ScriptedScopeProbe` understands for a scope. */
export const scopeTarget = (scope: ReachabilityScope): string => `scope:${scope}`;

export class InMemoryNatTraversal extends NatTraversal {
  report: ReachabilityReport = {
    reflexiveAddress: null,
    localAddress: null,
    cgnat: false,
    portMapping: { mapped: false, externalPort: null, method: 'none', detail: 'double' },
    checkedAtMs: 0,
  };
  released = false;

  async discover(): Promise<ReachabilityReport> {
    return this.report;
  }

  async release(): Promise<void> {
    this.released = true;
  }
}

export class InMemoryLocalDiscovery extends LocalDiscovery {
  announced: { serverId: string; displayName: string; port: number } | null = null;
  neighbours: DiscoveredNode[] = [];
  stopped = false;

  async announce(record: { serverId: string; displayName: string; port: number }): Promise<void> {
    this.announced = record;
  }

  async browse(): Promise<readonly DiscoveredNode[]> {
    return this.neighbours;
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }
}
