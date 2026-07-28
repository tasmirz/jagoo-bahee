import { isIP } from 'node:net';

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
