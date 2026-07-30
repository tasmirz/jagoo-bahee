import { RnTor } from 'react-native-nitro-tor';
import {
  configureClientTransport,
  isOnionAddress,
  networkRequest,
} from './request';

jest.mock('expo-file-system', () => ({
  documentDirectory: '/jagoo-test/',
  cacheDirectory: '/jagoo-test-cache/',
  makeDirectoryAsync: jest.fn(async () => undefined),
}));

const tor = RnTor as jest.Mocked<typeof RnTor>;
const originalFetch = globalThis.fetch;

describe('client request transport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configureClientTransport('direct');
    tor.getServiceStatus.mockResolvedValue(1);
    globalThis.fetch = jest.fn();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('recognises onion hosts without treating lookalike domains as onion services', () => {
    expect(isOnionAddress('http://exampleexample.onion/path')).toBe(true);
    expect(isOnionAddress('https://example.onion.invalid')).toBe(false);
  });

  it('uses the ordinary fetch implementation in direct mode', async () => {
    const response = new Response('{}', { status: 200 });
    (globalThis.fetch as jest.Mock).mockResolvedValue(response);

    await expect(networkRequest('https://node.example/health')).resolves.toBe(response);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(tor.httpGet).not.toHaveBeenCalled();
  });

  it('forces onion traffic through Tor and never falls back to direct fetch', async () => {
    tor.httpGet.mockRejectedValue(new Error('Tor route failed'));

    await expect(networkRequest('http://exampleexample.onion/health')).rejects.toThrow(
      'Tor route failed',
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(tor.httpGet).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://exampleexample.onion/health',
        trust_invalid_certs: false,
      }),
    );
  });

  it('can route a clearnet home server through selected Tor mode', async () => {
    configureClientTransport('tor');
    tor.httpGet.mockResolvedValue({ status_code: 200, body: '{"status":"ok"}', error: '' });

    const response = await networkRequest('https://node.example/health');
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
