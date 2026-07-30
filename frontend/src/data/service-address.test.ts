import {
  isUnreachableHost,
  normaliseServiceAddress,
  resolveServiceAddress,
  type AdvertisedService,
} from './service-address';

const blob = (address: string): AdvertisedService => ({ kind: 'blob', address });

describe('resolveServiceAddress', () => {
  // ── The case the user actually hits: node on the LAN, service claiming loopback ──────────
  // "127.0.0.1" evaluated on a phone means the phone. Keeping the port and borrowing the node's
  // host is the whole rule.
  it('keeps the port and borrows the node host when the server is on the LAN', () => {
    expect(resolveServiceAddress('http://192.168.1.20:3000', blob('http://127.0.0.1:9000'))).toEqual(
      { address: 'http://192.168.1.20:9000', source: 'node-host' },
    );
  });

  it('does the same for an un-mapped tunnel', () => {
    expect(resolveServiceAddress('http://bore.pub:12001', blob('http://127.0.0.1:9000'))).toEqual({
      address: 'http://bore.pub:9000',
      source: 'node-host',
    });
  });

  // A node whose own LAN address leaked into the advertisement is unreachable from anywhere else,
  // and used to be passed through untouched because it is not literally 127.0.0.1.
  it('rewrites a private-LAN advertised host when reached over a tunnel', () => {
    expect(
      resolveServiceAddress('http://bore.pub:12001', blob('http://192.168.1.20:9000')),
    ).toEqual({ address: 'http://bore.pub:9000', source: 'node-host' });
  });

  it('uses a mapped tunnel address verbatim, port and all', () => {
    expect(resolveServiceAddress('http://bore.pub:12001', blob('http://bore.pub:12002'))).toEqual({
      address: 'http://bore.pub:12002',
      source: 'advertised',
    });
  });

  it('uses a public hostname verbatim', () => {
    expect(
      resolveServiceAddress('https://node.example.org', {
        kind: 'mcaptcha',
        address: 'https://captcha.example.org',
      }),
    ).toEqual({ address: 'https://captcha.example.org', source: 'advertised' });
  });

  it('carries the node scheme across when it borrows the node host', () => {
    expect(
      resolveServiceAddress('https://node.example.org', blob('http://127.0.0.1:9000')),
    ).toEqual({ address: 'https://node.example.org:9000', source: 'node-host' });
  });

  it('is a no-op when both node and service are loopback', () => {
    expect(resolveServiceAddress('http://127.0.0.1:3000', blob('http://127.0.0.1:9000'))).toEqual({
      address: 'http://127.0.0.1:9000',
      source: 'node-host',
    });
  });

  describe('overrides', () => {
    it('wins over a perfectly good advertised address', () => {
      expect(
        resolveServiceAddress('http://bore.pub:12001', blob('http://bore.pub:12002'), '10.0.0.5:9000'),
      ).toEqual({ address: 'http://10.0.0.5:9000', source: 'override' });
    });

    it('is ignored when blank', () => {
      expect(
        resolveServiceAddress('http://bore.pub:12001', blob('http://127.0.0.1:9000'), '   ').source,
      ).toBe('node-host');
    });

    // Degrading to "possibly wrong address" beats degrading to "no address at all": a stored
    // override that stopped parsing must not blank the service out.
    it('falls back to discovery when it no longer parses', () => {
      expect(
        resolveServiceAddress('http://bore.pub:12001', blob('http://127.0.0.1:9000'), 'not a url'),
      ).toEqual({ address: 'http://bore.pub:9000', source: 'node-host' });
    });
  });

  it('returns a malformed advertised address untouched rather than throwing', () => {
    expect(resolveServiceAddress('http://bore.pub:12001', blob(']['))).toEqual({
      address: '][',
      source: 'advertised',
    });
  });
});

describe('normaliseServiceAddress', () => {
  it('adds a scheme when the user omits one', () => {
    expect(normaliseServiceAddress('192.168.1.20:9000')).toBe('http://192.168.1.20:9000');
  });

  it('strips a trailing path and query', () => {
    expect(normaliseServiceAddress('http://bore.pub:9000/foo/?a=1')).toBe('http://bore.pub:9000/foo');
  });

  it.each(['', '   ', 'ftp://example.org', 'not a url'])('rejects %p', (input) => {
    expect(() => normaliseServiceAddress(input)).toThrow();
  });
});

describe('isUnreachableHost', () => {
  it.each(['127.0.0.1', 'localhost', '10.0.0.7', '192.168.1.20', '172.16.0.1', '169.254.1.1'])(
    'flags %s',
    (host) => expect(isUnreachableHost(host)).toBe(true),
  );

  // The private-range boundary: 172.16-172.31 only. Getting it wrong silently rewrites a real
  // public address to the node's host.
  it.each(['bore.pub', '8.8.8.8', '172.32.0.1', '172.15.0.1', 'example.org'])(
    'leaves %s alone',
    (host) => expect(isUnreachableHost(host)).toBe(false),
  );
});
