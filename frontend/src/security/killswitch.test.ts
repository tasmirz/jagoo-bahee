/**
 * The killswitch has to be right in both directions, and the wrong direction is the scary one.
 *
 * A false NEGATIVE means someone types their duress passphrase under coercion and the app
 * cheerfully reports "wrong password" — the vault survives and so does the coercion. A false
 * POSITIVE means an ordinary typo wipes both identities. Both are asserted here, along with
 * the property that makes the feature safe to ship at all: with nothing armed, the check is
 * false for every input, so unlock paths can call it unconditionally.
 */

import {
  clearKillswitchPassphrase,
  isKillswitchConfigured,
  isKillswitchPassphrase,
  setKillswitchPassphrase,
} from './killswitch';

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked',
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
});

jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: jest.fn(async (length: number) =>
    Uint8Array.from({ length }, (_, index) => index + 1),
  ),
}));

// Production scrypt is 64 MiB and this test arms the switch several times. Still a function
// OF the passphrase — a constant stub would make every assertion below pass for free.
jest.mock('@jagoo/sdk/crypto', () => {
  const actual = jest.requireActual('@jagoo/sdk/crypto');
  return {
    ...actual,
    cryptoBackend: () => ({
      ...actual.jsCryptoBackend,
      scrypt: (password: Uint8Array, salt: Uint8Array, params: { dkLen: number }) => {
        const material = new Uint8Array(password.length + salt.length);
        material.set(password);
        material.set(salt, password.length);
        return actual.jsCryptoBackend.sha256(material).slice(0, params.dkLen);
      },
    }),
  };
});

describe('killswitch passphrase', () => {
  afterEach(async () => clearKillswitchPassphrase());

  it('is inert until armed, so unlock paths can always ask', async () => {
    expect(await isKillswitchConfigured()).toBe(false);
    expect(await isKillswitchPassphrase('')).toBe(false);
    expect(await isKillswitchPassphrase('anything at all')).toBe(false);
  });

  it('recognises the passphrase it was armed with', async () => {
    await setKillswitchPassphrase('burn it down');
    expect(await isKillswitchConfigured()).toBe(true);
    expect(await isKillswitchPassphrase('burn it down')).toBe(true);
  });

  it('does not fire on the app password, a near miss, or empty input', async () => {
    await setKillswitchPassphrase('burn it down');
    for (const wrong of ['correct horse battery staple', 'burn it down ', 'Burn it down', '']) {
      expect(await isKillswitchPassphrase(wrong)).toBe(false);
    }
  });

  it('stops recognising it once removed', async () => {
    await setKillswitchPassphrase('burn it down');
    await clearKillswitchPassphrase();
    expect(await isKillswitchConfigured()).toBe(false);
    expect(await isKillswitchPassphrase('burn it down')).toBe(false);
  });

  it('never stores the passphrase itself', async () => {
    await setKillswitchPassphrase('burn it down');
    const SecureStore = jest.requireMock('expo-secure-store');
    const stored = await SecureStore.getItemAsync('jb.killswitch.v1');
    expect(stored).not.toBeNull();
    expect(stored).not.toContain('burn it down');
  });

  it('refuses a passphrase too short to be meant', async () => {
    await expect(setKillswitchPassphrase('ab')).rejects.toThrow(/at least 4/);
    expect(await isKillswitchConfigured()).toBe(false);
  });
});
