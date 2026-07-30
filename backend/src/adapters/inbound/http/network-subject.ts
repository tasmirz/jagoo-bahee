import { isIP } from 'node:net';
import type { FastifyRequest } from 'fastify';

export interface NetworkSubjects {
  readonly address: string;
  readonly subnet: string;
}

function normalise(value: string): string {
  const trimmed = value.trim().replace(/^\[|\]$/g, '');
  const withoutPort = /^\d+\.\d+\.\d+\.\d+:\d+$/.test(trimmed)
    ? trimmed.slice(0, trimmed.lastIndexOf(':'))
    : trimmed;
  if (!isIP(withoutPort)) throw new Error('request address is not a valid IP');
  return withoutPort;
}

function subnetFor(address: string): string {
  if (isIP(address) === 4) return `${address.split('.').slice(0, 3).join('.')}.0/24`;
  return `${address.split(':').slice(0, 4).join(':')}::/64`;
}

/**
 * AUTH-28/AUTH-29: User-Agent is not an input. XFF is ignored unless an operator
 * explicitly configured how many rightmost proxies are trusted.
 */
export function networkSubjects(
  remoteAddress: string,
  forwardedFor: string | undefined,
  trustedProxyHops: number,
): NetworkSubjects {
  if (!Number.isSafeInteger(trustedProxyHops) || trustedProxyHops < 0) {
    throw new Error('trustedProxyHops must be a non-negative integer');
  }
  const remote = normalise(remoteAddress);
  if (trustedProxyHops === 0 || !forwardedFor) {
    return { address: remote, subnet: subnetFor(remote) };
  }
  const chain = [...forwardedFor.split(',').map(normalise), remote];
  const clientIndex = chain.length - 1 - trustedProxyHops;
  if (clientIndex < 0) throw new Error('X-Forwarded-For has fewer hops than configured');
  const address = chain[clientIndex] as string;
  return { address, subnet: subnetFor(address) };
}

/**
 * The caller's address as this node observed it, resolved through exactly the same
 * trusted-proxy rules the anti-abuse interceptor uses.
 *
 * Shared deliberately: the scope indicator and the rate limiter must agree on who the
 * caller is, or a node behind a reverse proxy would rate-limit the real client while
 * telling it it was on the proxy's network.
 */
export function callerAddress(request: FastifyRequest): string | null {
  const configured = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  const trustedHops = Number.isSafeInteger(configured) && configured >= 0 ? configured : 0;
  const forwarded = request.headers['x-forwarded-for'];
  try {
    return networkSubjects(
      request.raw.socket.remoteAddress ?? request.ip,
      Array.isArray(forwarded) ? forwarded[0] : forwarded,
      trustedHops,
    ).address;
  } catch {
    // An unparseable or short forwarded chain means we do not know who is calling. The
    // caller of this function must render that as "unknown", never as a default scope.
    return null;
  }
}
