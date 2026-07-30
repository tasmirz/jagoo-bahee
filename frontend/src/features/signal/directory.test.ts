import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadSignalDirectoryCache,
  searchCachedSignalDirectory,
  searchSignalDirectory,
} from './directory';

const INDEX = 'https://signal-index.example';

const serverRow = (id: string, displayName: string) => ({
  id,
  codename: id,
  displayName,
  bio: 'Relief coordinator',
  identityKey: 'ab'.repeat(32),
  rnsPublicKey: 'AQ==',
  lxmfDestinationHash: 'aa'.repeat(16),
  transportBindingSignature: 'Ag==',
  claims: [{ kind: 1, value: '+8801700000000', proof: '' }],
  languages: ['bn'],
  revision: '1',
});

function respondWith(items: readonly unknown[]): void {
  globalThis.fetch = jest.fn(async () =>
    ({ ok: true, json: async () => ({ items }) }) as unknown as Response,
  ) as unknown as typeof fetch;
}

function failNetwork(): void {
  globalThis.fetch = jest.fn(async () => {
    throw new Error('Network request failed');
  }) as unknown as typeof fetch;
}

describe('Signal directory offline cache', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
    jest.restoreAllMocks();
  });

  it('caches every profile the index returns while the network still works', async () => {
    respondWith([serverRow('jbi1amina', 'Amina')]);
    const result = await searchSignalDirectory(INDEX, 'amina');

    expect(result.source).toBe('network');
    expect(result.profiles[0]?.identityKey).toBe('ab'.repeat(32));
    // Discovery is the first thing to disappear, so it is cached before it is needed (TP-05).
    await expect(loadSignalDirectoryCache()).resolves.toMatchObject({
      profiles: [{ profile: { id: 'jbi1amina' } }],
    });
  });

  it('answers from the cache when the index is unreachable, and says so', async () => {
    respondWith([serverRow('jbi1amina', 'Amina'), serverRow('jbi1rafi', 'Rafi')]);
    await searchSignalDirectory(INDEX);

    failNetwork();
    const offline = await searchSignalDirectory(INDEX, 'rafi');

    expect(offline.source).toBe('cache');
    expect(offline.profiles.map((profile) => profile.id)).toEqual(['jbi1rafi']);
    expect(offline.notice).toContain('Network request failed');
    expect(offline.refreshedAtMs).toBeGreaterThan(0);
  });

  it('raises the network error rather than showing an empty cache as "no results"', async () => {
    failNetwork();
    await expect(searchSignalDirectory(INDEX, 'amina')).rejects.toThrow('Network request failed');
  });

  it('matches offline on the same fields the index matches on', async () => {
    respondWith([serverRow('jbi1amina', 'Amina')]);
    await searchSignalDirectory(INDEX);
    const cache = await loadSignalDirectoryCache();

    expect(searchCachedSignalDirectory(cache, 'RELIEF')).toHaveLength(1);
    expect(searchCachedSignalDirectory(cache, '+880170')).toHaveLength(1);
    expect(searchCachedSignalDirectory(cache, 'nobody')).toHaveLength(0);
  });

  it('keeps a profile the index no longer returns — a stale address beats no address (TP-06)', async () => {
    respondWith([serverRow('jbi1amina', 'Amina')]);
    await searchSignalDirectory(INDEX);

    respondWith([serverRow('jbi1rafi', 'Rafi')]);
    await searchSignalDirectory(INDEX);

    const cache = await loadSignalDirectoryCache();
    expect(cache.profiles.map((row) => row.profile.id).sort()).toEqual(['jbi1amina', 'jbi1rafi']);
  });
});
