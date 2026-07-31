import { fileSystemPath, parseRnsTcpEndpoints } from './rns';
import type * as RnsModule from './rns';

describe('Signal RNS bootstrap parsing', () => {
  it('accepts only explicit TCP relay endpoints', () => {
    expect(parseRnsTcpEndpoints(['tcp://relay.example:4242', 'https://not-rns.example', 'tcp://missing-port'])).toEqual([
      { kind: 'tcp', host: 'relay.example', port: 4242, enabled: true },
    ]);
  });
});

/**
 * `FileSystem.documentDirectory` is a URI, and the Reticulum runtime calls `os.makedirs` on
 * whatever it is handed. Passing the URI through made Python read `file:///data/...` as a
 * RELATIVE path whose first component is `file:`, resolve it against `/`, and fail with
 * "[Errno 30] Read-only file system: 'file:'" — an error naming the root filesystem for a
 * directory inside the app's own private storage.
 */
describe('fileSystemPath', () => {
  it('strips the scheme Expo puts on its directories', () => {
    expect(fileSystemPath('file:///data/user/0/com.jagoobahee.app/files/jagoo-signal-rns')).toBe(
      '/data/user/0/com.jagoobahee.app/files/jagoo-signal-rns',
    );
  });

  it('produces an absolute path, which is the property Python checks', () => {
    expect(fileSystemPath('file:///data/user/0/pkg/files/x').startsWith('/')).toBe(true);
    expect(fileSystemPath('file:///data/user/0/pkg/files/x')).not.toContain('://');
  });

  it('decodes percent-encoding rather than passing "%20" to the filesystem', () => {
    expect(fileSystemPath('file:///data/My%20Files/rns')).toBe('/data/My Files/rns');
  });

  it('leaves a plain path alone, so calling it twice is safe', () => {
    expect(fileSystemPath('/data/user/0/pkg/files/rns')).toBe('/data/user/0/pkg/files/rns');
  });

  it('does not throw on malformed encoding', () => {
    // A lone '%' is not valid percent-encoding; the raw path is better than an exception on
    // the one call that decides whether the mesh transport can start at all.
    expect(fileSystemPath('file:///data/100%/rns')).toBe('/data/100%/rns');
  });
});

/**
 * The mesh transport must start when the node cannot be reached — that is the entire point
 * of it. `startSignalRns` used to await the bootstrap fetch inside a `Promise.all`, so an
 * unreachable node rejected the whole call with "Network request failed" and RNS never
 * started: the fallback required the network it is a fallback for.
 *
 * What the node supplies is a list of TCP relays and a propagation node, both optimisations
 * over the internet. On a real deployment it can be — and on the node this was reproduced
 * against, was — literally `{"tcpEndpoints":[],"lxmfPropagationDestination":null}`, so the
 * blocking call was gating the radio on an answer containing nothing.
 */
describe('RNS bootstrap never blocks the start', () => {
  const cache = new Map<string, string>();

  beforeEach(() => {
    cache.clear();
    jest.resetModules();
  });

  const load = (behaviour: { readonly ok: boolean }) => {
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: {
        getItem: async (key: string) => cache.get(key) ?? null,
        setItem: async (key: string, value: string) => {
          cache.set(key, value);
        },
      },
    }));
    jest.doMock('../../data/request', () => ({
      networkRequest: async () => {
        if (!behaviour.ok) throw new Error('Network request failed');
        return {
          ok: true,
          json: async () => ({
            tcpEndpoints: ['tcp://relay.example:4242'],
            lxmfPropagationDestination: 'abc',
          }),
        };
      },
    }));
    jest.doMock('../../signer/signal', () => ({ signalRnsTransportIdentity: async () => ({}) }));
    // `require`, not dynamic `import`: this Jest config has no ESM VM modules, and the point
    // of `resetModules` + `doMock` is a fresh CommonJS instance per case anyway.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./rns') as typeof RnsModule;
  };

  it('uses the node when it answers, and remembers it', async () => {
    const { bootstrapOrCached } = load({ ok: true });
    const result = await bootstrapOrCached('http://node.test');
    expect(result.source).toBe('node');
    expect(result.bootstrap.tcpEndpoints).toEqual(['tcp://relay.example:4242']);
    expect(cache.get('jb.signal.rns-bootstrap.v1')).toContain('relay.example');
  });

  it('falls back to the last answer instead of refusing to start', async () => {
    cache.set(
      'jb.signal.rns-bootstrap.v1',
      JSON.stringify({ tcpEndpoints: ['tcp://relay.example:4242'], lxmfPropagationDestination: null }),
    );
    const { bootstrapOrCached } = load({ ok: false });
    const result = await bootstrapOrCached('http://node.test');
    expect(result.source).toBe('cache');
    expect(result.bootstrap.tcpEndpoints).toEqual(['tcp://relay.example:4242']);
  });

  it('starts with nothing rather than throwing, which is the blackout case', async () => {
    const { bootstrapOrCached } = load({ ok: false });
    const result = await bootstrapOrCached('http://node.test');
    // AutoInterface alone is local Wi-Fi discovery and needs no server at all.
    expect(result).toEqual({
      source: 'none',
      bootstrap: { tcpEndpoints: [], lxmfPropagationDestination: null },
    });
  });
});
