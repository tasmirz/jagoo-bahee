import { describe, expect, it } from 'vitest';
import { ReachabilityScope } from '../../ports/network.port.js';
import { classifyLink, isPrivate, normaliseAddress, subnetOf } from './link-scope.js';

const NODE = ['192.168.1.20', 'fd00:abcd:1::20'];

describe('classifyLink — TP-20, the client↔node link', () => {
  it('reports LAN when the caller shares one of this node’s subnets', () => {
    const result = classifyLink('192.168.1.77', NODE);
    expect(result.scope).toBe(ReachabilityScope.LAN);
    expect(result.basis).toBe('shared-subnet');
  });

  it('reports LAN for a caller on the node itself', () => {
    expect(classifyLink('127.0.0.1', NODE).basis).toBe('loopback');
    expect(classifyLink('::1', NODE).scope).toBe(ReachabilityScope.LAN);
  });

  /**
   * The whole point of the change. Before it, a node whose uplink declared LAN told this
   * caller "Same network — nothing you post leaves this building yet".
   */
  it('does NOT report LAN for a public caller, whatever the node’s own reach is', () => {
    const result = classifyLink('203.0.113.9', NODE);
    expect(result.scope).toBe(ReachabilityScope.GLOBAL);
    expect(result.basis).toBe('public-address');
  });

  it('does NOT report LAN for a private caller on a different segment', () => {
    // Two offices both numbered 192.168.x. Private is evidence of "not the open internet",
    // never of "the same wire".
    const result = classifyLink('192.168.9.4', NODE);
    expect(result.scope).toBe(ReachabilityScope.ISP_LOCAL);
    expect(result.basis).toBe('private-range');
  });

  it('matches an IPv4 caller reported through a dual-stack listener', () => {
    // `::ffff:192.168.1.77` compared as IPv6 never matches an IPv4 interface address, so a
    // phone on the same Wi-Fi would read as remote purely because the socket was dual-stack.
    expect(classifyLink('::ffff:192.168.1.77', NODE).scope).toBe(ReachabilityScope.LAN);
  });

  it('matches IPv6 callers on the node’s /64', () => {
    expect(classifyLink('fd00:abcd:1::99', NODE).basis).toBe('shared-subnet');
    expect(classifyLink('fd00:abcd:2::99', NODE).basis).toBe('private-range');
  });

  it('answers "unknown" rather than guessing when the address is unusable', () => {
    expect(classifyLink('', NODE)).toEqual({ scope: null, basis: 'unknown' });
    expect(classifyLink('not-an-address', NODE)).toEqual({ scope: null, basis: 'unknown' });
  });

  it('never treats the node’s own loopback entry as a shared subnet', () => {
    // Otherwise every 127.x-advertising node would call every caller local.
    expect(classifyLink('127.0.0.5', ['127.0.0.1']).basis).toBe('loopback');
    expect(classifyLink('198.51.100.7', ['127.0.0.1']).scope).toBe(ReachabilityScope.GLOBAL);
  });

  it('strips a port before comparing', () => {
    expect(classifyLink('192.168.1.77:51234', NODE).scope).toBe(ReachabilityScope.LAN);
  });

  /**
   * The regression that made `shared-subnet` dead code in production (TP-20).
   *
   * `ServiceDirectory.localAddresses()` publishes URLs, because that list is what a client
   * dials. Every test above hands `classifyLink` hand-written bare IPs, so the parser was
   * never asked the question production asks it, and a phone on the same Wi-Fi read
   * "Nearby network" while the sheet beside it reported the node's reach as LAN.
   */
  it('matches when the node’s own addresses are published as URLs', () => {
    const published = ['http://192.168.1.20:3000', 'http://[fd00:abcd:1::20]:3000'];
    expect(classifyLink('192.168.1.77', published).basis).toBe('shared-subnet');
    expect(classifyLink('fd00:abcd:1::99', published).basis).toBe('shared-subnet');
    // Still no false positive from a different segment reached over the same URL shape.
    expect(classifyLink('192.168.9.4', published).scope).toBe(ReachabilityScope.ISP_LOCAL);
  });

  it('ignores a hostname-only node address instead of inventing a match', () => {
    expect(classifyLink('192.168.1.77', ['https://node.example:443']).scope).toBe(
      ReachabilityScope.ISP_LOCAL,
    );
  });
});

describe('link-scope helpers', () => {
  it('folds IPv4-mapped IPv6 and brackets', () => {
    expect(normaliseAddress('[::ffff:10.0.0.4]')).toBe('10.0.0.4');
  });

  it('reduces every shape a host is written in to a bare IP', () => {
    expect(normaliseAddress('http://192.168.1.20:3000')).toBe('192.168.1.20');
    expect(normaliseAddress('https://192.168.1.20')).toBe('192.168.1.20');
    expect(normaliseAddress('http://192.168.1.20:3000/v1/envelopes?x=1')).toBe('192.168.1.20');
    expect(normaliseAddress('http://[fd00::20]:3000')).toBe('fd00::20');
    expect(normaliseAddress('[::1]:3000')).toBe('::1');
    expect(normaliseAddress('fd00:abcd:1::20')).toBe('fd00:abcd:1::20');
    expect(normaliseAddress('::1')).toBe('::1');
  });

  it('returns nothing for anything that does not name an IP', () => {
    for (const value of ['', '   ', 'node.example', 'https://node.example:443', '999.1.1.1']) {
      expect(normaliseAddress(value), value).toBe('');
    }
  });

  it('recognises every private range and no public one', () => {
    for (const address of ['10.1.2.3', '172.16.0.1', '172.31.255.1', '192.168.0.1', '169.254.1.1', 'fd00::1']) {
      expect(isPrivate(address), address).toBe(true);
    }
    for (const address of ['172.15.0.1', '172.32.0.1', '8.8.8.8', '2001:4860::1']) {
      expect(isPrivate(address), address).toBe(false);
    }
  });

  it('derives /24 and /64', () => {
    expect(subnetOf('192.168.1.77')).toBe('192.168.1.0/24');
    expect(subnetOf('fd00:abcd:1:2:3:4:5:6')).toBe('fd00:abcd:1:2::/64');
  });
});
