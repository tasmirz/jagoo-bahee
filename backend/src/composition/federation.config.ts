/**
 * Federation configuration, parsed once, in the composition root.
 *
 * ── AR-12: federation is OFF unless configured ─────────────────────────────────────
 * A node with no `FEDERATION_PEERS` and no `FEDERATION_GRPC_LISTEN` behaves exactly as it
 * did in P1 — no server bound, no drainer running, no outbound connections. That is not a
 * degraded state; it is a single-instance deployment, and it must stay a first-class one.
 *
 * ── FD-12: outbound-only is the DEFAULT for a home or community node ───────────────
 * Federation is enabled by listing peers, not by opening a port. A node that lists peers
 * but sets no listen address federates fully in both directions over connections it
 * initiates (FD-11), which is the deployment most volunteers can actually stand up during
 * a shutdown — behind CGNAT, with no port forwarding and no static address.
 */

import { Plane, Priority } from '../core/domain/envelope.js';
import {
  ReachabilityScope,
  type PeerEndpoint,
  type PeerTrust,
} from '../core/ports/network.port.js';
import { PeerTrust as Trust } from '../core/ports/network.port.js';

export const FEDERATION_CONFIG = Symbol('FederationConfig');

export interface ConfiguredPeer {
  readonly serverId: string;
  readonly publicKey: Uint8Array;
  readonly endpoints: readonly PeerEndpoint[];
  /** An operator decision, which `evaluateTrust` honours over every derived rule. */
  readonly trust?: PeerTrust;
}

export interface FederationConfig {
  readonly enabled: boolean;
  readonly displayName: string;
  /** `host:port` for the inbound gRPC server; absent means outbound-only (FD-12). */
  readonly listen: string | null;
  readonly outboundOnly: boolean;
  readonly endpoints: readonly PeerEndpoint[];
  readonly peers: readonly ConfiguredPeer[];
  readonly planes: readonly Plane[];
  readonly acceptedClasses: readonly Priority[];
  readonly openRegistrations: boolean;
  /** Drain interval. Zero disables the timer — the drainer is then driven by tests. */
  readonly drainIntervalMs: number;
  /** FD-08 — every TRUSTED peer, at least every 5 minutes. */
  readonly gossipIntervalMs: number;
}

const DEFAULT_GOSSIP_MS = 5 * 60 * 1000;
const DEFAULT_DRAIN_MS = 1_000;

/**
 * `FEDERATION_ENDPOINTS` — a comma-separated list of `scope[:asn]=uri` pairs.
 *
 *   FEDERATION_ENDPOINTS='GLOBAL=grpc://node1.example.org:8444,ISP_LOCAL=grpc://10.20.30.40:8444'
 *   FEDERATION_PEERS='AAAA…@ISP_LOCAL:64502=grpc://jb-b1:8444#TRUSTED'
 *
 * Scope is required rather than inferred. FD-17 depends on a node knowing which of its own
 * addresses is reachable from where, and guessing from an IP range would be wrong for
 * exactly the CGNAT and multi-homed cases P3 exists to serve.
 *
 * ── The optional ASN is what makes TP-11 real ──────────────────────────────────────
 * `selectPath` step 5 picks "the highest-priority uplink whose liveScopes ∋ endpoint.scope,
 * preferring uplink.asn == endpoint.asn", and TP-11 calls that preference "the rule that
 * keeps the resilience path warm". `PeerEndpoint.asn` existed and this parser never set it,
 * so for every configured peer the preference compared `undefined` to a number and the
 * uplink was always chosen by priority alone. On a single-homed node that is invisible. On a
 * multi-homed bridge it is fatal: every ISP_LOCAL peer resolved to whichever uplink had the
 * lower priority number, so one side of the pair had no peer, `bridgeReadiness` refused with
 * "no uplink pair has a TRUSTED peer on both sides", and BR-01 could not be satisfied by any
 * configuration. Which ASN a peer sits on is exactly the fact a bridge operator has and the
 * node cannot infer, so it belongs in configuration.
 */
function parseEndpoints(raw: string | undefined): readonly PeerEndpoint[] {
  if (!raw) return [];
  const endpoints: PeerEndpoint[] = [];
  for (const item of raw.split(',')) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const descriptor = trimmed.slice(0, separator).trim();
    const address = trimmed.slice(separator + 1).trim();
    // Split on the FIRST colon only: the scope never contains one, and everything after it
    // is the AS number. The address is on the other side of the `=` and is untouched, so a
    // `grpc://host:port` is never mistaken for a scope with an ASN.
    const colon = descriptor.indexOf(':');
    const scope = (colon < 0 ? descriptor : descriptor.slice(0, colon)).toUpperCase();
    const asnText = colon < 0 ? '' : descriptor.slice(colon + 1).trim();
    if (!address || !(scope in ReachabilityScope)) continue;
    const asn = Number(asnText);
    endpoints.push({
      address,
      scope: scope as PeerEndpoint['scope'],
      // A malformed ASN is dropped rather than stored as NaN: an endpoint tagged NaN would
      // never match any uplink and would silently behave like the untagged case it was
      // written to fix.
      ...(asnText && Number.isInteger(asn) && asn > 0 ? { asn } : {}),
      inboundCapable: true,
    });
  }
  return endpoints;
}

/**
 * `FEDERATION_PEERS` — `base64key@scope[:asn]=uri[;scope[:asn]=uri][#trust]`, comma separated.
 *
 *   FEDERATION_PEERS='AAAA…@GLOBAL=grpc://node-b:8444#TRUSTED'
 *   FEDERATION_PEERS='AAAA…@ISP_LOCAL:64502=grpc://jb-b1:8444#TRUSTED'
 *
 * The KEY is the peer identity (FD-02); the URI is mutable metadata. A peer that changes
 * address keeps its identity, its history and its trust — which is the whole reason losing
 * a domain does not lose a node.
 */
function parsePeers(raw: string | undefined, serverIdOf: (key: Uint8Array) => string): readonly ConfiguredPeer[] {
  if (!raw) return [];
  const peers: ConfiguredPeer[] = [];
  for (const item of raw.split(',')) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const [body, trustText] = trimmed.split('#');
    const at = (body ?? '').indexOf('@');
    if (at < 0) continue;
    const keyText = (body ?? '').slice(0, at).trim();
    const endpointText = (body ?? '').slice(at + 1).trim();
    let publicKey: Uint8Array;
    try {
      publicKey = new Uint8Array(Buffer.from(keyText, 'base64'));
    } catch {
      continue;
    }
    if (publicKey.length !== 32) continue;

    const endpoints = endpointText
      .split(';')
      .map((pair) => parseEndpoints(pair)[0])
      .filter((endpoint): endpoint is PeerEndpoint => endpoint !== undefined);
    if (endpoints.length === 0) continue;

    const trust = trustText?.trim().toUpperCase();
    peers.push({
      serverId: serverIdOf(publicKey),
      publicKey,
      endpoints,
      ...(trust && trust in Trust ? { trust: trust as PeerTrust } : {}),
    });
  }
  return peers;
}

export function loadFederationConfig(
  env: NodeJS.ProcessEnv,
  serverIdOf: (key: Uint8Array) => string,
): FederationConfig {
  const listen = env.FEDERATION_GRPC_LISTEN?.trim() || null;
  const endpoints = parseEndpoints(env.FEDERATION_ENDPOINTS);
  const peers = parsePeers(env.FEDERATION_PEERS, serverIdOf);

  // Explicit opt-out wins; otherwise a node with no listen address IS outbound-only, which
  // is the honest reading of "I did not open a port".
  const outboundOnly = env.FEDERATION_OUTBOUND_ONLY === 'true' || listen === null;
  const requestedPlanes = new Set(
    (env.NODE_PLANES ?? 'FORUM,SIGNAL')
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
  );
  const planes = [
    ...(requestedPlanes.has('FORUM') ? [Plane.FORUM] : []),
    ...(requestedPlanes.has('SIGNAL') ? [Plane.SIGNAL] : []),
  ];
  if (planes.length === 0) {
    throw new Error('NODE_PLANES must enable FORUM, SIGNAL, or both');
  }

  return {
    enabled: peers.length > 0 || listen !== null,
    displayName: env.NODE_NAME ?? 'Jagoo Bahee node',
    listen,
    outboundOnly,
    endpoints: outboundOnly ? [] : endpoints,
    peers,
    // FD-07 / ADR-012: operators may run Forum-only, Signal-only or dual-plane nodes.
    planes,
    acceptedClasses: [Priority.BROADCAST, Priority.DIRECT, Priority.CHECKIN, Priority.BULK],
    openRegistrations: env.REGISTRATIONS_OPEN !== 'false',
    drainIntervalMs: Number(env.FEDERATION_DRAIN_INTERVAL_MS ?? DEFAULT_DRAIN_MS),
    gossipIntervalMs: Number(env.FEDERATION_GOSSIP_INTERVAL_MS ?? DEFAULT_GOSSIP_MS),
  };
}
