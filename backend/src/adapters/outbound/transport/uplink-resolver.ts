/**
 * Source-IP binding for outbound gRPC (T3.3, TP-08, TG-01) — see ADR-014.
 *
 * ── The requirement ────────────────────────────────────────────────────────────────
 * "Outbound federation connections MUST be bound to a specific uplink's source IP. Without
 * source binding, the OS routing table picks the interface and multi-homing does not work."
 * On a bridge node with one interface per ISP that is not a detail: every connection would
 * leave through whichever interface the kernel's default route names, both islands would be
 * reached over one ISP, and the bridge would merge nothing while appearing to work.
 *
 * ── Why a resolver and not a channel option ────────────────────────────────────────
 * `@grpc/grpc-js` has no `localAddress` channel option. It does have a documented extension
 * point — `experimental.registerResolver` — and its connector calls `net.connect(address)`
 * with the address object the resolver produced. `net.connect` accepts `localAddress` in its
 * options, so an address carrying that key binds the socket. This is the narrowest possible
 * hook: one registration, no patching, and the alternative (a per-uplink local CONNECT proxy)
 * would put a userspace splice in front of every federation byte. ADR-014 records the
 * coupling and the test that detects it breaking.
 *
 * Targets look like `jbuplink://203.0.113.10/node-b.example.org:8444`, which grpc-js's URI
 * parser splits into scheme / authority (the source address) / path (the real destination).
 */

import { experimental } from '@grpc/grpc-js';
import type { ChannelOptions } from '@grpc/grpc-js';

export const UPLINK_SCHEME = 'jbuplink';

/** `jbuplink://<sourceIp>/<host>:<port>` — the target a source-bound channel dials. */
export function uplinkTarget(sourceIp: string, hostPort: string): string {
  return `${UPLINK_SCHEME}://${sourceIp}/${hostPort}`;
}

/** True when this target will be dialled through the source-binding resolver. */
export function isUplinkTarget(target: string): boolean {
  return target.startsWith(`${UPLINK_SCHEME}://`);
}

interface GrpcUri {
  readonly scheme?: string;
  readonly authority?: string;
  readonly path: string;
}

/**
 * Minimum wall-clock gap between two resolutions of one target.
 *
 * ── This is not a tuning knob; it is the fix for a 100%-CPU spin ────────────────────
 * grpc-js asks the resolver to re-resolve every time a connection attempt fails. A source
 * address that no longer exists on the host fails `net.connect` with `EADDRNOTAVAIL`
 * IMMEDIATELY — no SYN, no timeout — so "fail, re-resolve, fail" is a tight synchronous
 * loop with nothing in it to yield. `resolver-dns` never hits this because it rate-limits
 * with `grpc.dns_min_time_between_resolutions_ms`; a static resolver that answers instantly
 * must do the same or it pegs a core.
 *
 * Found by the ISP suite hanging with one worker at 100% CPU. The failure mode is real in
 * production, not just in a test: it is exactly what a node does when an uplink's address is
 * withdrawn while peers are still queued against it — which is the uplink-failover case P3
 * exists to handle.
 */
const DEFAULT_MIN_RESOLUTION_INTERVAL_MS = 5_000;

/**
 * Resolves `jbuplink://source/host:port` to one address carrying `localAddress`.
 *
 * No DNS. The destination is resolved by the kernel at `net.connect` time exactly as it
 * would be for a `dns:` target, and doing our own lookup here would mean a second resolver
 * cache with its own staleness — during an outage, the one thing worse than a stale address
 * is two disagreeing ones. Re-resolution therefore cannot produce a different answer; the
 * only thing it can do is burn CPU, which is what the interval above prevents.
 */
class UplinkResolver {
  private readonly minIntervalMs: number;
  private lastResolvedAtMs = 0;
  private pending: NodeJS.Timeout | null = null;

  constructor(
    private readonly target: GrpcUri,
    private readonly listener: (
      endpointList: unknown,
      attributes: Record<string, unknown>,
      serviceConfig: unknown,
      resolutionNote: string,
    ) => boolean,
    channelOptions?: ChannelOptions,
  ) {
    const configured = channelOptions?.['grpc.dns_min_time_between_resolutions_ms'];
    this.minIntervalMs =
      typeof configured === 'number' ? configured : DEFAULT_MIN_RESOLUTION_INTERVAL_MS;
  }

  updateResolution(): void {
    if (this.pending) return;
    const wait = Math.max(0, this.lastResolvedAtMs + this.minIntervalMs - Date.now());
    // Always through a timer, never synchronously with the constructor — the Resolver
    // contract forbids that, and grpc-js's channel is not yet listening when it runs.
    this.pending = setTimeout(() => {
      this.pending = null;
      this.lastResolvedAtMs = Date.now();
      this.emit();
    }, wait);
    this.pending.unref?.();
  }

  private emit(): void {
    const sourceIp = this.target.authority ?? '';
    const { host, port } = splitHostPort(this.target.path);
    const address: Record<string, unknown> = { host, port };
    if (sourceIp) address['localAddress'] = sourceIp;
    this.listener(
      experimental.statusOrFromValue([{ addresses: [address] }]) as unknown,
      {},
      null,
      '',
    );
  }

  destroy(): void {
    if (this.pending) clearTimeout(this.pending);
    this.pending = null;
  }

  /** The `:authority` the peer sees — the real destination, never our source address. */
  static getDefaultAuthority(target: GrpcUri): string {
    return target.path;
  }
}

function splitHostPort(path: string): { host: string; port: number } {
  if (path.startsWith('[')) {
    const close = path.indexOf(']');
    const host = path.slice(1, close);
    const port = Number(path.slice(close + 2) || '8444');
    return { host, port };
  }
  const colon = path.lastIndexOf(':');
  if (colon < 0) return { host: path, port: 8444 };
  return { host: path.slice(0, colon), port: Number(path.slice(colon + 1)) };
}

let registered = false;

/**
 * Idempotent — grpc-js throws on a duplicate scheme registration, and the two-node and ISP
 * suites both construct several senders in one process.
 */
export function registerUplinkResolver(): void {
  if (registered) return;
  registered = true;
  (
    experimental.registerResolver as unknown as (
      scheme: string,
      resolver: unknown,
    ) => void
  )(UPLINK_SCHEME, UplinkResolver);
}

/**
 * Channel options for a source-bound channel.
 *
 * `grpc.default_authority` is set explicitly because two channels to the same peer over two
 * different uplinks must present the same authority — the peer is one server, and it must
 * not see two.
 */
export function uplinkChannelOptions(hostPort: string): ChannelOptions {
  return { 'grpc.default_authority': hostPort };
}
