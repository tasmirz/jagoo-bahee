import { describe, expect, it } from 'vitest';
import { isClientUnreachableHost, parseServiceMap, publicAddressFor } from './service-map.js';

describe('isClientUnreachableHost', () => {
  it.each([
    '127.0.0.1',
    '127.1.2.3',
    'localhost',
    'LOCALHOST',
    'minio.local',
    '0.0.0.0',
    '::1',
    '10.0.0.7',
    '192.168.1.20',
    '172.16.0.1',
    '172.31.255.254',
    '169.254.10.1',
    '100.64.0.1',
    '::ffff:192.168.1.20',
    'fd00::1',
    'fe80::1',
  ])('treats %s as an address the client cannot be assumed to reach', (host) => {
    expect(isClientUnreachableHost(host)).toBe(true);
  });

  it.each([
    'bore.pub',
    'example.org',
    '8.8.8.8',
    '203.0.113.5',
    // 172.32 is OUTSIDE the private range; only 172.16-172.31 is private. Getting this
    // boundary wrong would silently rewrite a real public address to the node's host.
    '172.32.0.1',
    '172.15.0.1',
    '11.0.0.1',
    '2001:db8::1',
  ])('leaves %s alone', (host) => {
    expect(isClientUnreachableHost(host)).toBe(false);
  });
});

describe('parseServiceMap', () => {
  it('reads a well-formed map', () => {
    const map = parseServiceMap({
      publicHost: 'bore.pub',
      scheme: 'http',
      ports: { '3000': 3000, '9000': 9000 },
    });
    expect(map?.publicHost).toBe('bore.pub');
    expect(map?.ports.get(9000)).toBe(9000);
  });

  it('defaults the scheme to http', () => {
    expect(parseServiceMap({ publicHost: 'bore.pub' })?.scheme).toBe('http');
  });

  // Every one of these must degrade to "advertise local addresses", never to a throw. An
  // operator editing a tunnel port under a shutdown must not be able to take the node down.
  it.each([
    ['null', null],
    ['a string', 'bore.pub'],
    ['an array', []],
    ['no publicHost', { ports: { '3000': 3000 } }],
    ['an empty publicHost', { publicHost: '   ' }],
    ['a host carrying a port', { publicHost: 'bore.pub:12001' }],
    ['a host carrying a scheme', { publicHost: 'http://bore.pub' }],
  ])('returns null for %s', (_label, input) => {
    expect(parseServiceMap(input)).toBeNull();
  });

  it('drops unusable port entries but keeps the rest', () => {
    const map = parseServiceMap({
      publicHost: 'bore.pub',
      ports: { '3000': 3000, notaport: 5, '9000': 70000, '3100': 3100 },
    });
    expect([...(map?.ports.entries() ?? [])]).toEqual([
      [3000, 3000],
      [3100, 3100],
    ]);
  });
});

describe('publicAddressFor', () => {
  const map = parseServiceMap({
    publicHost: 'bore.pub',
    ports: { '3000': 12001, '9000': 12002, '80': 80 },
  })!;

  it('maps a local port to the tunnel port', () => {
    expect(publicAddressFor(map, 9000)).toBe('http://bore.pub:12002');
  });

  it('omits the port when it is the scheme default', () => {
    expect(publicAddressFor(map, 80)).toBe('http://bore.pub');
  });

  // Falling back is the point: advertising bore.pub with a port no tunnel opened is a
  // confidently wrong address, which costs more to debug than an obviously local one.
  it('returns null for a port the map does not cover', () => {
    expect(publicAddressFor(map, 3100)).toBeNull();
  });
});
