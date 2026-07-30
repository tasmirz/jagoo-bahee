/**
 * Transport configuration, parsed once, in the composition root (T3.2, `Plans/06` §4).
 *
 * ── AR-12: transport is OFF unless configured ──────────────────────────────────────
 * A node with no `UPLINKS` gets ONE implicit uplink that declares every scope, binds no
 * source address and probes nothing. Path selection then always succeeds on the first
 * endpoint, nothing is ever a bridge crossing, and the node behaves exactly as it did in P2.
 * Multi-homing, probing, source binding and bridging are opt-in — a single-homed VPS must
 * never pay for a feature it does not use, and "the default deployment is unchanged" is what
 * makes it safe to ship this phase at all.
 *
 * ── Environment variables, not only a YAML file ────────────────────────────────────
 * `Plans/06` §4 sketches `node.config.yaml`. Both are supported and the file wins when
 * present, because the deployment target is a container: an operator who has to bake a YAML
 * file into an image to change one ASN will instead not change it. `UPLINKS` in the
 * environment is what `ops/isp-compose.yml` uses, which means the format the gate exercises
 * is the format an operator types.
 */

import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { Priority } from '../core/domain/envelope.js';
import { DISABLED_BRIDGE, type BridgeConfig } from '../core/domain/transport/bridge-policy.js';
import { ReachabilityScope } from '../core/ports/network.port.js';

export const TRANSPORT_CONFIG = Symbol('TransportConfig');

export interface UplinkConfig {
  readonly id: string;
  readonly interfaceName?: string;
  /** TP-08 — the address outbound sockets bind to. Empty means "let the OS decide". */
  readonly sourceIp: string;
  readonly asn?: number;
  readonly ispName?: string;
  readonly region?: string;
  readonly declaredScopes: readonly ReachabilityScope[];
  /** Absent means outbound-only on this uplink. */
  readonly inboundPort?: number;
  readonly priority: number;
}

export interface ProbeConfig {
  readonly targets: Readonly<Partial<Record<ReachabilityScope, readonly string[]>>>;
  readonly intervalMs: number;
  readonly failureThreshold: number;
  readonly timeoutMs: number;
}

export interface NatConfig {
  readonly upnp: boolean;
  readonly natPmp: boolean;
  /** TP-15 — STUN servers for reflexive discovery, `host:port`. */
  readonly stunServers: readonly string[];
  readonly port: number;
}

export interface TunnelConfig {
  /** TP-16 — accept reverse tunnels from `TRUSTED` peers that cannot be reached. */
  readonly accept: boolean;
  /** The `TRUSTED` peer this node tunnels THROUGH, as `serverId@https://host`. */
  readonly through: string | null;
}

export interface TransportConfig {
  /** True when anything beyond the implicit single uplink is configured. */
  readonly configured: boolean;
  /**
   * True when there is anything to measure.
   *
   * Separate from `configured` because the probe loop used to be gated on the latter, so a
   * node that set `PROBE_TARGETS` but not `UPLINKS` never probed at all: `lastProbedAtMs`
   * stayed null, the constructor's optimistic "every declared scope is live" was never
   * revised, and the node reported an assumed scope with the confidence of a measured one.
   * Configuring targets is an explicit request to measure and is now honoured on its own.
   */
  readonly probing: boolean;
  readonly uplinks: readonly UplinkConfig[];
  readonly probe: ProbeConfig;
  readonly bridge: BridgeConfig;
  readonly nat: NatConfig;
  readonly tunnel: TunnelConfig;
  /** TP-18 — mDNS/SSDP announce and browse on the local segment. */
  readonly localDiscovery: boolean;
}

const ALL_SCOPES: readonly ReachabilityScope[] = [
  ReachabilityScope.LAN,
  ReachabilityScope.ISP_LOCAL,
  ReachabilityScope.NATIONAL,
  ReachabilityScope.GLOBAL,
];

/** The AR-12 default: one uplink, every scope, no binding, no probing. */
/**
 * Scopes a node may claim with no evidence at all.
 *
 * ── Why LAN is absent, and why that is a correctness fix, not a downgrade ───────────
 * `currentScope()` reports the NARROWEST live scope, and the default probe config has no
 * targets for any scope. "Unmeasurable is not unreachable" then marks every declared scope
 * live — so a stock node declaring LAN reported LAN, and the client rendered "Same network —
 * Only this local network. Nothing you post leaves this building yet."
 *
 * For a node reachable over the internet that sentence is false, and it is false in the
 * direction that matters: it tells someone their post is contained when it is being
 * published. In this system that is not a cosmetic mislabel.
 *
 * The asymmetry is deliberate. A wide scope claimed without evidence over-promises reach, and
 * the transport layer discovers the truth on the next send. A NARROW scope claimed without
 * evidence under-promises reach to the person deciding whether it is safe to post, and
 * nothing corrects it. So the wide scopes stay assumable and LAN has to be earned — by an
 * operator declaring it in `UPLINKS`, or by a LAN probe target that actually answers.
 */
const ASSUMABLE_SCOPES: readonly ReachabilityScope[] = [
  ReachabilityScope.ISP_LOCAL,
  ReachabilityScope.NATIONAL,
  ReachabilityScope.GLOBAL,
];

export const IMPLICIT_UPLINK: UplinkConfig = {
  id: 'default',
  sourceIp: '',
  declaredScopes: ASSUMABLE_SCOPES,
  priority: 0,
};

const DEFAULT_PROBE: ProbeConfig = {
  targets: {},
  intervalMs: 30_000,
  failureThreshold: 3,
  timeoutMs: 2_000,
};

/**
 * `UPLINKS` — one uplink per comma-separated item:
 *
 *   UPLINKS='isp-a|203.0.113.10|64501|ISP-A|GLOBAL,NATIONAL,ISP_LOCAL|8444|1'
 *   fields:   id  | source ip   | asn | isp  | scopes                  | port | priority
 *
 * Positional rather than key=value because it is typed into a compose file by hand, and a
 * misspelled key in a `key=value` list is silently ignored while a missing field here is a
 * parse failure the operator sees immediately. Trailing fields may be omitted.
 */
export function parseUplinks(raw: string | undefined): readonly UplinkConfig[] {
  if (!raw?.trim()) return [];
  const uplinks: UplinkConfig[] = [];
  for (const item of raw.split(',')) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const [id, sourceIp, asn, ispName, scopes, inboundPort, priority] = trimmed.split('|');
    if (!id?.trim()) continue;
    const declared = parseScopes(scopes);
    uplinks.push({
      id: id.trim(),
      sourceIp: (sourceIp ?? '').trim(),
      ...(asn?.trim() && Number.isFinite(Number(asn)) ? { asn: Number(asn) } : {}),
      ...(ispName?.trim() ? { ispName: ispName.trim() } : {}),
      declaredScopes: declared.length > 0 ? declared : ALL_SCOPES,
      ...(inboundPort?.trim() && Number.isFinite(Number(inboundPort))
        ? { inboundPort: Number(inboundPort) }
        : {}),
      priority: priority?.trim() && Number.isFinite(Number(priority)) ? Number(priority) : 1,
    });
  }
  return uplinks;
}

function parseScopes(raw: string | undefined): readonly ReachabilityScope[] {
  if (!raw?.trim()) return [];
  const scopes: ReachabilityScope[] = [];
  for (const item of raw.split(/[;+]/)) {
    const name = item.trim().toUpperCase();
    if (name in ReachabilityScope) scopes.push(name as ReachabilityScope);
  }
  return scopes;
}

/**
 * `PROBE_TARGETS` — `SCOPE=target;target,SCOPE=target`.
 *
 *   PROBE_TARGETS='GLOBAL=1.1.1.1:443;8.8.8.8:443,ISP_LOCAL=10.20.0.1:8444'
 */
export function parseProbeTargets(
  raw: string | undefined,
): Readonly<Partial<Record<ReachabilityScope, readonly string[]>>> {
  if (!raw?.trim()) return {};
  const targets: Partial<Record<ReachabilityScope, string[]>> = {};
  for (const item of raw.split(',')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const scope = item.slice(0, separator).trim().toUpperCase();
    if (!(scope in ReachabilityScope)) continue;
    const list = item
      .slice(separator + 1)
      .split(';')
      .map((target) => target.trim())
      .filter(Boolean);
    if (list.length === 0) continue;
    targets[scope as ReachabilityScope] = list;
  }
  return targets;
}

/**
 * `BRIDGE_PAIRS` — `isp-a:isp-b,isp-b:isp-c`. Bridging is enabled by naming a pair, never by
 * a boolean alone: BR-01 makes bridging opt-in, and an `enabled: true` with no pairs is a
 * node that thinks it is a bridge and is not.
 */
export function parseBridge(env: NodeJS.ProcessEnv): BridgeConfig {
  const raw = env.BRIDGE_PAIRS?.trim();
  if (!raw) return DISABLED_BRIDGE;
  const pairs: [string, string][] = [];
  for (const item of raw.split(',')) {
    const [left, right] = item.split(':');
    if (left?.trim() && right?.trim()) pairs.push([left.trim(), right.trim()]);
  }
  if (pairs.length === 0) return DISABLED_BRIDGE;

  const classes = parsePriorities(env.BRIDGE_CLASSES) ?? [
    Priority.BROADCAST,
    Priority.DIRECT,
    Priority.CHECKIN,
    Priority.BULK,
  ];
  return {
    enabled: true,
    pairs,
    classes,
    envelopesPerMin: numberOr(env.BRIDGE_ENVELOPES_PER_MIN, 2_000),
    bytesPerMin: numberOr(env.BRIDGE_BYTES_PER_MIN, 5_000_000),
  };
}

function parsePriorities(raw: string | undefined): readonly Priority[] | null {
  if (!raw?.trim()) return null;
  const names: Record<string, Priority> = {
    BROADCAST: Priority.BROADCAST,
    DIRECT: Priority.DIRECT,
    CHECKIN: Priority.CHECKIN,
    BULK: Priority.BULK,
  };
  const classes = raw
    .split(';')
    .map((item) => names[item.trim().toUpperCase()])
    .filter((value): value is Priority => value !== undefined);
  return classes.length > 0 ? classes : null;
}

function numberOr(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadTransportConfig(env: NodeJS.ProcessEnv): TransportConfig {
  const fromFile = env.NODE_CONFIG_FILE ? readConfigFile(env.NODE_CONFIG_FILE) : null;
  const uplinks = fromFile?.uplinks ?? parseUplinks(env.UPLINKS);
  const targets = fromFile?.probeTargets ?? parseProbeTargets(env.PROBE_TARGETS);

  return {
    configured: uplinks.length > 0,
    probing: uplinks.length > 0 || Object.keys(targets).length > 0,
    // AR-12 — the implicit uplink is not a fallback, it is the default deployment.
    uplinks: uplinks.length > 0 ? uplinks : [IMPLICIT_UPLINK],
    probe: {
      targets,
      intervalMs: numberOr(env.PROBE_INTERVAL_MS, DEFAULT_PROBE.intervalMs),
      failureThreshold: numberOr(env.PROBE_FAILURE_THRESHOLD, DEFAULT_PROBE.failureThreshold),
      timeoutMs: numberOr(env.PROBE_TIMEOUT_MS, DEFAULT_PROBE.timeoutMs),
    },
    bridge: fromFile?.bridge ?? parseBridge(env),
    nat: {
      // TP-14 — attempted only when asked. An unsolicited SSDP burst from every node on a
      // network is a fingerprint, and on a hostile network a fingerprint is a target.
      upnp: env.NAT_UPNP === 'true',
      natPmp: env.NAT_PMP === 'true',
      stunServers: (env.STUN_SERVERS ?? '')
        .split(',')
        .map((server) => server.trim())
        .filter(Boolean),
      port: numberOr(env.FEDERATION_GRPC_LISTEN?.split(':').pop(), 8444),
    },
    tunnel: {
      accept: env.TUNNEL_ACCEPT === 'true',
      through: env.TUNNEL_THROUGH?.trim() || null,
    },
    localDiscovery: env.LOCAL_DISCOVERY === 'true',
  };
}

interface FileConfig {
  readonly uplinks?: readonly UplinkConfig[];
  readonly probeTargets?: Readonly<Partial<Record<ReachabilityScope, readonly string[]>>>;
  readonly bridge?: BridgeConfig;
}

/**
 * `node.config.yaml` in the shape `Plans/06` §4 documents.
 *
 * A missing or malformed file is a hard failure rather than a silent fall-back to the
 * environment: an operator who wrote a config file and had it ignored would run a node that
 * looks configured and is not, which during a shutdown is the worst of the three outcomes.
 */
function readConfigFile(path: string): FileConfig {
  const document = parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown> | null;
  if (!document || typeof document !== 'object') {
    throw new Error(`NODE_CONFIG_FILE ${path} is not a YAML mapping`);
  }

  const uplinks = Array.isArray(document['uplinks'])
    ? (document['uplinks'] as Record<string, unknown>[]).map((entry, index): UplinkConfig => {
        const id = String(entry['id'] ?? `uplink-${index}`);
        const scopes = Array.isArray(entry['scopes'])
          ? (entry['scopes'] as unknown[])
              .map((scope) => String(scope).toUpperCase())
              .filter((scope): scope is ReachabilityScope => scope in ReachabilityScope)
          : ALL_SCOPES;
        return {
          id,
          ...(entry['interface'] ? { interfaceName: String(entry['interface']) } : {}),
          sourceIp: String(entry['source_ip'] ?? ''),
          ...(entry['asn'] === undefined ? {} : { asn: Number(entry['asn']) }),
          ...(entry['isp_name'] ? { ispName: String(entry['isp_name']) } : {}),
          ...(entry['region'] ? { region: String(entry['region']) } : {}),
          declaredScopes: scopes,
          ...(entry['inbound_port'] === undefined
            ? {}
            : { inboundPort: Number(entry['inbound_port']) }),
          priority: entry['priority'] === undefined ? 1 : Number(entry['priority']),
        };
      })
    : undefined;

  const probe = document['probe'] as Record<string, unknown> | undefined;
  const probeTargets: Partial<Record<ReachabilityScope, readonly string[]>> = {};
  const rawTargets = probe?.['targets'] as Record<string, unknown> | undefined;
  for (const [scope, list] of Object.entries(rawTargets ?? {})) {
    const name = scope.toUpperCase();
    if (name in ReachabilityScope && Array.isArray(list)) {
      probeTargets[name as ReachabilityScope] = list.map((target) => String(target));
    }
  }

  const bridgeDocument = document['bridge'] as Record<string, unknown> | undefined;
  const relayBetween = Array.isArray(bridgeDocument?.['relay_between'])
    ? (bridgeDocument['relay_between'] as unknown[]).map(String)
    : [];
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < relayBetween.length; i += 1) {
    for (let j = i + 1; j < relayBetween.length; j += 1) {
      pairs.push([relayBetween[i] as string, relayBetween[j] as string]);
    }
  }
  const bridge: BridgeConfig | undefined =
    bridgeDocument?.['enabled'] === true && pairs.length > 0
      ? {
          enabled: true,
          pairs,
          classes: parsePriorities(
            Array.isArray(bridgeDocument['classes'])
              ? (bridgeDocument['classes'] as unknown[]).map(String).join(';')
              : undefined,
          ) ?? [Priority.BROADCAST, Priority.DIRECT, Priority.CHECKIN, Priority.BULK],
          envelopesPerMin: Number(bridgeDocument['quota_envelopes_per_min'] ?? 2_000),
          bytesPerMin: Number(bridgeDocument['quota_bytes_per_min'] ?? 5_000_000),
        }
      : undefined;

  return {
    ...(uplinks && uplinks.length > 0 ? { uplinks } : {}),
    ...(Object.keys(probeTargets).length > 0 ? { probeTargets } : {}),
    ...(bridge ? { bridge } : {}),
  };
}
