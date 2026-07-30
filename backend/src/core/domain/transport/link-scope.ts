/**
 * How the CALLER reached this node (TP-20).
 *
 * ── Why this exists at all ─────────────────────────────────────────────────────────────
 * TP-20 requires the client to display "which scope it is currently connected on". That is
 * a property of the client↔node LINK. What `/v1/transport/scope` answered was
 * `UplinkManager.currentScope()` — the narrowest scope the NODE can reach onward, which is
 * a different question with a different answer and no reference to the caller at all. The
 * controller never read the request.
 *
 * The two are unrelated often enough to be dangerous. A node with an uplink declaring `LAN`
 * told a phone on the far side of the internet "Same network — nothing you post leaves this
 * building yet", which is the most consequential sentence the app renders and it was
 * decided without a single fact about the phone.
 *
 * ── The asymmetry that sets the default ───────────────────────────────────────────────
 * Over-claiming a WIDE link ("you are on the internet" when you are on a LAN) understates
 * containment and the next send corrects it. Under-claiming a NARROW link tells someone
 * their post is contained while it is being published, and nothing ever corrects that. So
 * `LAN` is only ever returned on positive evidence — a caller address inside one of this
 * node's own subnets, or loopback. Absent evidence the answer is `null`, meaning "this node
 * cannot tell", never a comforting guess.
 *
 * Pure by construction: no clock, no I/O, no ambient config. The adapter supplies the
 * caller address it already derives for anti-abuse and the node's own interface addresses.
 */

import { ReachabilityScope } from '../../ports/network.port.js';

/** `LAN` when the caller is demonstrably on one of this node's own segments. */
export type LinkScope =
  | typeof ReachabilityScope.LAN
  | typeof ReachabilityScope.ISP_LOCAL
  | typeof ReachabilityScope.GLOBAL;

export interface LinkClassification {
  /** Null when the address could not be parsed — never a fallback guess. */
  readonly scope: LinkScope | null;
  /**
   * Why. Rendered to the user, so it names the evidence rather than the verdict: a person
   * deciding whether it is safe to post needs to know this was observed, not assumed.
   */
  readonly basis: 'loopback' | 'shared-subnet' | 'private-range' | 'public-address' | 'unknown';
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Strip a port, brackets and the IPv4-mapped-IPv6 prefix. Returns '' when unusable. */
export function normaliseAddress(value: string): string {
  const trimmed = value.trim().replace(/^\[|\]$/g, '');
  const withoutPort = IPV4.test(trimmed.replace(/:\d+$/, '')) ? trimmed.replace(/:\d+$/, '') : trimmed;
  // `::ffff:192.0.2.1` is how a dual-stack listener reports an IPv4 peer. Comparing it as an
  // IPv6 address against an IPv4 interface address would never match, so a phone on the same
  // Wi-Fi would read as remote purely because the socket was dual-stack.
  const unmapped = withoutPort.replace(/^::ffff:/i, '');
  return IPV4.test(unmapped) || unmapped.includes(':') ? unmapped : '';
}

function isIpv4(value: string): boolean {
  const match = IPV4.exec(value);
  return match !== null && match.slice(1).every((part) => Number(part) <= 255);
}

export function isLoopback(address: string): boolean {
  return address === '::1' || address.startsWith('127.');
}

/**
 * RFC 1918 / RFC 4193 / link-local. A private caller address is evidence the caller is NOT
 * on the open internet, but it is not evidence of the same segment — two different offices
 * both use `192.168.0.0/16`. It therefore never yields `LAN` on its own.
 */
export function isPrivate(address: string): boolean {
  if (address.startsWith('10.') || address.startsWith('192.168.') || address.startsWith('169.254.')) {
    return true;
  }
  if (address.startsWith('172.')) {
    const second = Number(address.split('.')[1]);
    return second >= 16 && second <= 31;
  }
  const lower = address.toLowerCase();
  return lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd');
}

/** The /24 (IPv4) or /64 (IPv6) an address sits in. '' when it is neither. */
export function subnetOf(address: string): string {
  if (isIpv4(address)) return `${address.split('.').slice(0, 3).join('.')}.0/24`;
  if (address.includes(':')) return `${address.toLowerCase().split(':').slice(0, 4).join(':')}::/64`;
  return '';
}

/**
 * Classify the link a request arrived over.
 *
 * @param callerAddress   the client's address as the node observed it (already
 *                        proxy-resolved by the caller — this function does not trust or
 *                        parse `X-Forwarded-For`).
 * @param nodeAddresses   this node's own interface addresses.
 */
export function classifyLink(
  callerAddress: string,
  nodeAddresses: readonly string[],
): LinkClassification {
  const caller = normaliseAddress(callerAddress);
  if (!caller) return { scope: null, basis: 'unknown' };

  // The app talking to a node on the same device. Narrower than a LAN, and `LAN` is the
  // narrowest scope the contract has a name for.
  if (isLoopback(caller)) return { scope: ReachabilityScope.LAN, basis: 'loopback' };

  const callerSubnet = subnetOf(caller);
  if (callerSubnet) {
    for (const candidate of nodeAddresses) {
      const own = normaliseAddress(candidate);
      if (!own || isLoopback(own)) continue;
      if (subnetOf(own) === callerSubnet) {
        return { scope: ReachabilityScope.LAN, basis: 'shared-subnet' };
      }
    }
  }

  // Private, but not on a segment this node holds an address in. Reached over some
  // intermediate network — a second VLAN, a VPN, a carrier NAT. Not the open internet, and
  // emphatically not "same network".
  if (isPrivate(caller)) return { scope: ReachabilityScope.ISP_LOCAL, basis: 'private-range' };

  return { scope: ReachabilityScope.GLOBAL, basis: 'public-address' };
}
