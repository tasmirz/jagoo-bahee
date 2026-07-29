/**
 * P3 transport ports — uplinks, probing, NAT traversal, local discovery, bridging.
 *
 * ── Why these are separate ports and not one `Network` interface ────────────────────
 * Interface Segregation, and it is load-bearing here rather than tidy (AR-02, L-19). The
 * path router needs uplink state and never a port mapping; the NAT adapter needs to publish
 * a reflexive address and never learns what a peer is; the bridge needs classes and quotas
 * and never a socket. One fat port would make the composition root construct a UPnP client
 * in order to rank two endpoints — and in P2 exactly that shape (`FederationOut` carrying
 * both halves) was a hard build failure, not an aesthetic complaint.
 *
 * ── AR-12, one rung up ──────────────────────────────────────────────────────────────
 * Federation is off unless configured; transport is off unless configured. A node with no
 * `UPLINKS` gets one implicit uplink that declares every scope and probes nothing, so it
 * behaves exactly as it did in P2. Multi-homing, probing, source binding and bridging are
 * all opt-in, and none of them may become a dependency of ordinary operation.
 */

import type { Priority } from '../domain/envelope.js';
import type {
  BridgeStats,
  RelayDecision,
} from '../domain/transport/bridge-policy.js';
import type { UplinkHealth, UplinkState } from '../domain/transport/uplink-state.js';
import type { UplinkView } from '../domain/transport/path-selection.js';
import type { ParsedEnvelope } from '../domain/envelope.js';
import type { ReachabilityScope } from './network.port.js';

/**
 * One network interface and what it can reach.
 *
 * `declaredScopes` is what the operator configured; `health.scopes` is what probing found.
 * TP-09 requires the selector to use the measured value, so both are carried and never
 * conflated.
 */
export interface Uplink {
  readonly id: string;
  readonly interfaceName?: string;
  /** TP-08 — outbound sockets are bound to this address. Empty means "let the OS decide". */
  readonly sourceIp: string;
  readonly asn?: number;
  readonly ispName?: string;
  readonly region?: string;
  readonly declaredScopes: readonly ReachabilityScope[];
  /** Absent means outbound-only on this uplink (FD-12 is a per-uplink property too). */
  readonly inboundPort?: number;
  readonly priority: number;
  readonly health: UplinkHealth;
}

export interface UplinkTransition {
  readonly uplink: Uplink;
  readonly from: UplinkState;
  readonly to: UplinkState;
  readonly atMs: number;
}

export type Unsubscribe = () => void;

/**
 * TP-08 / TP-09 / TP-10 — the node's own side of the network.
 *
 * `probeAll` is a single pass with no timer of its own, exactly like `FederationOutboxService
 * .drain()`: a test calls it and asserts rather than waiting, and scheduling is a deployment
 * concern that belongs in the composition root (AR-11).
 */
export abstract class UplinkManager {
  abstract uplinks(): readonly Uplink[];
  abstract get(id: string): Uplink | null;
  /** Uplinks that can CURRENTLY reach a scope — measured, not declared. */
  abstract forScope(scope: ReachabilityScope): readonly Uplink[];
  /** The projection `rankPaths` consumes. Kept here so the selector never sees an adapter. */
  abstract views(): readonly UplinkView[];
  /** One probe round over every uplink. Returns the transitions it caused (TP-10). */
  abstract probeAll(): Promise<readonly UplinkTransition[]>;
  /** BR-10 — force an uplink up or down; `null` releases the override. */
  abstract force(id: string, state: UplinkState | null): void;
  abstract onChange(listener: (transition: UplinkTransition) => void): Unsubscribe;
  /** The narrowest scope any uplink currently reaches — what TG-10's indicator reports. */
  abstract currentScope(): ReachabilityScope | null;
}

export interface ProbeOutcome {
  readonly reachable: boolean;
  readonly rttMs?: number;
}

/**
 * A liveness probe for one (uplink, scope) pair.
 *
 * Deliberately not "ping the internet". TP-09 probes each uplink independently against
 * targets chosen per scope, because "can I reach 8.8.8.8" and "can I reach a node inside my
 * own ISP" are different questions and during a shutdown they have different answers.
 */
export abstract class ScopeProbe {
  abstract probe(
    target: string,
    options: {
      /** Which uplink is asking. TP-09's independence is stated here, not inferred. */
      readonly uplinkId: string;
      readonly sourceIp?: string;
      readonly timeoutMs: number;
    },
  ): Promise<ProbeOutcome>;
}

/** How the node is reachable from outside, as measured rather than as configured. */
export interface ReachabilityReport {
  /** TP-15 — the address the outside world sees, learned via STUN. */
  readonly reflexiveAddress: string | null;
  readonly localAddress: string | null;
  /**
   * TP-15 — a reflexive address inside 100.64.0.0/10 means the ISP is carrier-grade NATing
   * us. No port forward can fix that, so saying so plainly is the whole value: an operator
   * who knows will set up a reverse tunnel instead of spending an evening in a router UI.
   */
  readonly cgnat: boolean;
  /** TP-14 — did UPnP-IGD or NAT-PMP actually map the port, and if not, why. */
  readonly portMapping: {
    readonly mapped: boolean;
    readonly externalPort: number | null;
    readonly method: 'upnp-igd' | 'nat-pmp' | 'none';
    readonly detail: string;
  };
  readonly checkedAtMs: number;
}

/**
 * TP-14 / TP-15 — port mapping and reflexive discovery.
 *
 * Every method here is allowed to fail and MUST report the failure clearly. A node whose
 * mapping attempt failed keeps working outbound-only (FD-12), which is not a degraded state;
 * pretending the mapping succeeded is what produces peers retrying a port that will never
 * answer.
 */
export abstract class NatTraversal {
  abstract discover(options: {
    readonly port: number;
    readonly sourceIp?: string;
  }): Promise<ReachabilityReport>;
  abstract release(): Promise<void>;
}

export interface DiscoveredNode {
  readonly address: string;
  readonly scope: ReachabilityScope;
  readonly serverId?: string;
  readonly displayName?: string;
  readonly discoveredAtMs: number;
  readonly via: 'mdns' | 'ssdp';
}

/**
 * TP-18 — mDNS/SSDP on the local segment.
 *
 * One of six discovery mechanisms, and the only one that works with no prior knowledge and
 * no internet: on a LAN-scope outage it is how a phone finds the node in the same building.
 * Discovery is the single point of failure for the whole resilience story, which is why it
 * must not have one path.
 */
export abstract class LocalDiscovery {
  abstract announce(record: {
    readonly serverId: string;
    readonly displayName: string;
    readonly port: number;
  }): Promise<void>;
  abstract browse(timeoutMs: number): Promise<readonly DiscoveredNode[]>;
  abstract stop(): Promise<void>;
}

/**
 * BR-01 … BR-06 — the multi-homed relay.
 *
 * `shouldRelay` is synchronous and pure-adjacent by design: it is called on the fanout path
 * of every accepted envelope, and a decision that awaited I/O there would put the bridge's
 * bookkeeping inside the latency budget of every write on the node.
 */
export abstract class BridgeRelay {
  abstract readonly enabled: boolean;
  abstract shouldRelay(envelope: ParsedEnvelope, viaUplinkId: string, bytes: number): RelayDecision;
  /** Which uplink an envelope from this peer arrived on, as best we can establish it. */
  abstract uplinkForPeer(peerId: string): Promise<string | null>;
  /** The peers reachable on an uplink — the targets a relay decision resolves to. */
  abstract peersOn(uplinkId: string): Promise<readonly string[]>;
  abstract recordRelay(
    fromUplink: string,
    toUplink: string,
    priority: Priority,
    bytes: number,
  ): void;
  abstract stats(): Promise<BridgeStats>;
}
