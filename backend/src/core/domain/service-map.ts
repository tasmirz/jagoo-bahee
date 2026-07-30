/**
 * Translating a node's LOCAL service addresses into the addresses a client can actually reach.
 *
 * Pure by AR-01: no file reads, no clock, no network. The adapter supplies the parsed file and
 * this decides what it means.
 */

export interface ServiceMap {
  /** Host clients reach this deployment on — a tunnel host, a public DNS name, a WAN IP. */
  readonly publicHost: string;
  readonly scheme: 'http' | 'https';
  /** localPort -> publicPort, exactly the mapping a tunnel performs. */
  readonly ports: ReadonlyMap<number, number>;
}

/**
 * Hosts a client cannot be assumed to reach just because the NODE can.
 *
 * `127.0.0.1` is the obvious one, but a private LAN address is the case that actually bites:
 * a node reached over a tunnel happily advertises `192.168.1.20:3100`, which resolves for the
 * operator sitting next to it and for nobody else. Treating only loopback as local is why that
 * failure looked like "the audit log is down" rather than "this address was never yours to use".
 */
export function isClientUnreachableHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host === '::' || host === '0.0.0.0') return true;
  // IPv4-mapped IPv6 (::ffff:192.168.1.20) is the same address wearing a different notation.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  const candidate = mapped ? mapped[1]! : host;
  const octets = candidate.split('.');
  if (octets.length !== 4) {
    // fc00::/7 — unique local addresses.
    return /^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host);
  }
  const parsed = octets.map((value) => Number(value));
  if (parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b] = parsed as [number, number, number, number];
  if (a === 127 || a === 0) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/**
 * Strips a port from a host value, leaving a bare hostname.
 *
 * Fastify's `request.hostname` includes the port on some versions and not others, and the
 * difference is invisible until deployment: assigning `"bore.pub:12001"` to `URL.hostname` is
 * rejected by the URL spec as an invalid hostname, and rejected SILENTLY — the assignment is a
 * no-op, the URL keeps its old host, and the node advertises the unreachable address it was
 * trying to replace while reporting success. Normalising here removes the version dependency.
 */
export function hostWithoutPort(value: string): string {
  const host = value.trim();
  if (!host) return host;
  // [::1]:3000 and [::1] — the brackets delimit the address, so anything after them is the port.
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    return close === -1 ? host : host.slice(1, close);
  }
  // A bare IPv6 address has several colons and no port; only a single colon can be a separator.
  const first = host.indexOf(':');
  if (first === -1 || first !== host.lastIndexOf(':')) return host;
  return host.slice(0, first);
}

interface ServiceMapFile {
  readonly publicHost?: unknown;
  readonly scheme?: unknown;
  readonly ports?: unknown;
}

/**
 * Parses the operator's port map, returning null for anything it cannot fully understand.
 *
 * Deliberately total: a malformed map degrades to "advertise local addresses", never to a boot
 * failure. An operator editing a tunnel port at 3am under a shutdown must not be able to take the
 * node offline with a trailing comma, and a node that refuses to start is strictly worse than one
 * whose auxiliary services need a manual address in the client.
 */
export function parseServiceMap(input: unknown): ServiceMap | null {
  if (!input || typeof input !== 'object') return null;
  const file = input as ServiceMapFile;
  const publicHost = typeof file.publicHost === 'string' ? file.publicHost.trim() : '';
  if (!publicHost) return null;
  // A host with a port or a scheme in it is a different shape than this file documents; guessing
  // which half the operator meant would produce `bore.pub:9000:3100`.
  if (publicHost.includes('/') || publicHost.includes(':')) return null;
  const scheme = file.scheme === 'https' ? 'https' : 'http';
  const ports = new Map<number, number>();
  if (file.ports && typeof file.ports === 'object') {
    for (const [local, remote] of Object.entries(file.ports as Record<string, unknown>)) {
      const from = Number(local);
      const to = Number(remote);
      if (!isPort(from) || !isPort(to)) continue;
      ports.set(from, to);
    }
  }
  return { publicHost, scheme, ports };
}

function isPort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

/**
 * Rewrites one local address for publication. Returns null when the map does not cover it, so the
 * caller can fall back rather than advertise a host with a port the tunnel never opened —
 * a confidently wrong address costs more to debug than an obviously local one.
 */
export function publicAddressFor(map: ServiceMap, localPort: number): string | null {
  const remote = map.ports.get(localPort);
  if (remote === undefined) return null;
  const omitPort =
    (map.scheme === 'http' && remote === 80) || (map.scheme === 'https' && remote === 443);
  return omitPort
    ? `${map.scheme}://${map.publicHost}`
    : `${map.scheme}://${map.publicHost}:${remote}`;
}
