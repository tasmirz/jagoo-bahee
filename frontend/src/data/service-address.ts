/**
 * Working out where an auxiliary service actually is, from the client's side.
 *
 * The node describes its own services honestly, but "honestly" and "usefully" differ the moment
 * the client is not on the node's network: `http://127.0.0.1:9000` is a true statement about the
 * node and a useless one for a phone. This module turns what the node said into something the
 * device can dial, and it is pure so the rule is testable without a node, a network, or a store.
 */

export type ServiceKind = 'audit-log' | 'mcaptcha' | 'blob' | 'federation';

export interface AdvertisedService {
  readonly kind: ServiceKind;
  readonly address: string;
}

/**
 * Mirrors `isClientUnreachableHost` in the backend core. Both sides need the judgement — the node
 * to decide what to advertise, the client to decide what to trust — and neither can import the
 * other's module, so the duplication is deliberate. The client-side copy is the one that matters
 * when the node is older than the app.
 */
export function isUnreachableHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;
  if (host === '::1' || host === '::' || host === '0.0.0.0') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
  const candidate = mapped ? mapped[1]! : host;
  const octets = candidate.split('.');
  if (octets.length !== 4) {
    return /^f[cd][0-9a-f]{2}:/.test(host) || /^fe80:/.test(host);
  }
  const parsed = octets.map((value) => Number(value));
  if (parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b] = parsed as [number, number, number, number];
  if (a === 127 || a === 0 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export type ServiceAddressSource = 'override' | 'node-host' | 'advertised';

export interface ResolvedService {
  readonly address: string;
  readonly source: ServiceAddressSource;
}

/**
 * Normalises a user-typed address. Exported so the settings screen can validate before saving —
 * an override that fails to parse must be rejected at the keyboard, not silently dropped later.
 */
export function normaliseServiceAddress(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Enter a service address.');
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Use an address like 192.168.1.20:9000.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('A service address must use HTTP or HTTPS.');
  }
  if (!url.hostname) throw new Error('That address has no host.');
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

/**
 * Resolves one advertised service against the address the client actually used for the node.
 *
 * Three cases, most authoritative first:
 *
 *   override    — the operator or user said so. Always wins, including over a working discovery,
 *                 because the only reason to type one is that discovery was wrong.
 *   node-host   — the advertised host is one this device cannot be assumed to reach, so keep the
 *                 SERVICE's port and borrow the NODE's host. Covers both "server is on my LAN"
 *                 and an un-mapped tunnel, where the node is bore.pub and the service claims
 *                 127.0.0.1.
 *   advertised  — a public host (`bore.pub:12002`, `captcha.example.org`) is already correct;
 *                 rewriting it would break a deployment that was configured properly.
 */
export function resolveServiceAddress(
  nodeBaseUrl: string,
  service: AdvertisedService,
  override?: string | null,
): ResolvedService {
  if (override && override.trim()) {
    try {
      return { address: normaliseServiceAddress(override), source: 'override' };
    } catch {
      // A stored override that no longer parses must not blank out the service; fall through to
      // discovery so the app degrades to "possibly wrong address" instead of "no address at all".
    }
  }
  let advertised: URL;
  try {
    advertised = new URL(service.address);
  } catch {
    return { address: service.address, source: 'advertised' };
  }
  if (!isUnreachableHost(advertised.hostname)) {
    return { address: stripTrailingSlash(advertised), source: 'advertised' };
  }
  let node: URL;
  try {
    node = new URL(nodeBaseUrl);
  } catch {
    return { address: stripTrailingSlash(advertised), source: 'advertised' };
  }
  // The node's host needs no reachability test: this device just used it. That is exactly why it
  // is the right host to borrow — including when it is itself a LAN address, which is the common
  // case (node on 192.168.1.20 advertising a store on 127.0.0.1, where "127.0.0.1" from a phone
  // means the phone). Rewriting to a loopback node host is a harmless no-op.
  const rewritten = new URL(advertised.toString());
  rewritten.protocol = node.protocol;
  rewritten.hostname = node.hostname;
  return { address: stripTrailingSlash(rewritten), source: 'node-host' };
}

function stripTrailingSlash(url: URL): string {
  return url.toString().replace(/\/$/, '');
}
