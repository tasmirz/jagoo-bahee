import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadActiveProfileId,
  loadIdentityProfiles,
  removeIdentityProfile,
  saveIdentityProfile,
  setActiveProfileId,
  type IdentityProfile,
} from './identity-profiles';

const profile = (vaultId: string): IdentityProfile => ({
  vaultId,
  identityId: `jbi1${vaultId}`,
  label: `Identity ${vaultId}`,
  homeNode: {
    baseUrl: `http://${vaultId}.example`,
    transport: 'direct',
    savedAtMs: 1,
    discovery: {
      status: 'ok',
      node: {
        serverId: `jbs1${'a'.repeat(52)}`,
        serverKey: 'AA==',
        displayName: `Node ${vaultId}`,
        requestedAddress: `http://${vaultId}.example`,
        localAddresses: [],
      },
      services: { auditLogs: [], mcaptcha: [] },
      endpoints: { federations: '/federations', verify: '/verify', status: '/status' },
    },
  },
  createdAtMs: 1,
  lastUsedAtMs: 1,
});

describe('identity profiles', () => {
  afterEach(async () => AsyncStorage.clear());

  it('stores multiple identities and selects one independently', async () => {
    await saveIdentityProfile(profile('one'));
    await saveIdentityProfile(profile('two'));
    await setActiveProfileId('two');

    expect(await loadActiveProfileId()).toBe('two');
    expect((await loadIdentityProfiles()).map((item) => item.vaultId).sort()).toEqual([
      'one',
      'two',
    ]);
  });

  it('moves selection to a remaining identity after removal', async () => {
    await saveIdentityProfile(profile('one'));
    await saveIdentityProfile(profile('two'));
    await setActiveProfileId('one');
    await removeIdentityProfile('one');

    expect(await loadActiveProfileId()).toBe('two');
  });

  it('clears the selection only when the last identity goes', async () => {
    // Removing one of several must not read as being signed out of all of them, which is
    // what the old "Change home server" button did to every saved server at once.
    await saveIdentityProfile(profile('only'));
    await setActiveProfileId('only');
    await removeIdentityProfile('only');

    expect(await loadActiveProfileId()).toBeNull();
    expect(await loadIdentityProfiles()).toHaveLength(0);
  });

  it('leaves the selection alone when a non-active identity is removed', async () => {
    await saveIdentityProfile(profile('one'));
    await saveIdentityProfile(profile('two'));
    await setActiveProfileId('one');
    await removeIdentityProfile('two');

    expect(await loadActiveProfileId()).toBe('one');
  });
});
