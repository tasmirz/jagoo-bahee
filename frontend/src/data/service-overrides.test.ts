import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearServiceOverrides,
  editableServiceKinds,
  isEditableService,
  loadServiceOverrides,
  setServiceOverride,
} from './service-overrides';

const KEY = 'jb.service-overrides.v1';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('service overrides', () => {
  it('round-trips a saved address, normalised', async () => {
    await setServiceOverride('blob', '192.168.1.20:9000');
    expect(await loadServiceOverrides()).toEqual({ blob: 'http://192.168.1.20:9000' });
  });

  it('clears an override when given null or blank', async () => {
    await setServiceOverride('blob', '192.168.1.20:9000');
    await setServiceOverride('blob', null);
    expect(await loadServiceOverrides()).toEqual({});
    await setServiceOverride('mcaptcha', 'bore.pub:7000');
    await setServiceOverride('mcaptcha', '   ');
    expect(await loadServiceOverrides()).toEqual({});
  });

  it('rejects an unusable address at save time rather than storing it', async () => {
    await expect(setServiceOverride('blob', 'ftp://nope')).rejects.toThrow();
    expect(await loadServiceOverrides()).toEqual({});
  });

  it('keeps the other entries when one stored value is unusable', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ blob: 'not a url', mcaptcha: 'http://bore.pub:7000' }),
    );
    expect(await loadServiceOverrides()).toEqual({ mcaptcha: 'http://bore.pub:7000' });
  });

  it.each(['', 'null', '{', '[]', '"a string"'])(
    'returns no overrides rather than throwing for stored %p',
    async (stored) => {
      await AsyncStorage.setItem(KEY, stored);
      await expect(loadServiceOverrides()).resolves.toEqual({});
    },
  );

  it('clears everything', async () => {
    await setServiceOverride('blob', 'bore.pub:9000');
    await clearServiceOverrides();
    expect(await loadServiceOverrides()).toEqual({});
  });

  it('offers exactly the three client-dialled services, never federation', async () => {
    expect(editableServiceKinds()).toEqual(['audit-log', 'mcaptcha', 'blob']);
    expect(isEditableService('federation')).toBe(false);
  });
});

/**
 * The "not during welcome" requirement, enforced rather than merely intended.
 *
 * Someone connecting under a shutdown must not be asked to hand-configure service URLs before
 * they can post: a wrong value there is indistinguishable from the server being down, and they
 * have nothing working yet to compare it against. This asserts the onboarding module cannot
 * reach the override machinery at all, so the requirement cannot be undone by a later edit that
 * looked locally reasonable.
 */
describe('onboarding does not expose service overrides', () => {
  const welcome = readFileSync(
    join(__dirname, '..', 'features', 'onboarding', 'welcome-flow.tsx'),
    'utf8',
  );

  it('does not import the override store', () => {
    expect(welcome).not.toMatch(/service-overrides/);
  });

  it('does not import the resolution rule either', () => {
    expect(welcome).not.toMatch(/service-address/);
  });

  // Control: the file was actually read and does contain what onboarding is supposed to do.
  // Without this, a renamed or moved file would make both assertions above pass vacuously.
  it('was read and is the real onboarding flow', () => {
    expect(welcome).toMatch(/discovery|homeNode|HomeNode/);
    expect(welcome.length).toBeGreaterThan(500);
  });
});
