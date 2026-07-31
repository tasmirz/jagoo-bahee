/**
 * The Signal vault must survive a cold start — and only when it was sealed to survive one.
 *
 * ── The defect this pins ────────────────────────────────────────────────────────────
 * `activeSigner` is module state and starts every launch empty. The Forum plane has always
 * had `restoreForumSession` to reopen its vault; the Signal plane had nothing. So after any
 * process death — reload, swipe-away, OS kill — every Signal action threw "Unlock your
 * Signal identity first": sending a message, emitting a broadcast, declaring a channel,
 * publishing prekeys. One missing restore, reported as several unrelated broken features,
 * because each surface named its own failure and none of them said "signed out".
 *
 * ── And the half that must NOT happen ───────────────────────────────────────────────
 * Silent restore tries the empty passphrase and only the empty passphrase. A vault someone
 * put a passphrase on has to stay shut, or the protection they chose is decorative. That is
 * the third case here, and it is the one that fails if the restore is ever "improved" into
 * caching a passphrase or trying the Forum one behind the person's back.
 */

import { jsCryptoBackend, setCryptoBackend, type CryptoBackend } from '@jagoo/sdk/crypto';
import {
  createSignalIdentity,
  lockSignalIdentity,
  restoreSignalSession,
  signalSessionSummary,
} from './signal';

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

/**
 * Cheap, but still a function OF the passphrase. Production scrypt allocates 64 MiB, and a
 * constant stub would make the wrong-passphrase case pass for the wrong reason — the vault
 * would open with any secret at all.
 */
const cheapVault: CryptoBackend = {
  ...jsCryptoBackend,
  id: 'cheap-vault',
  scrypt: (password, salt, params) => {
    const material = new Uint8Array(password.length + salt.length);
    material.set(password);
    material.set(salt, password.length);
    return jsCryptoBackend.sha256(material).slice(0, params.dkLen);
  },
};

describe('Signal session restore', () => {
  beforeAll(() => setCryptoBackend(cheapVault));
  afterAll(() => {
    lockSignalIdentity();
    setCryptoBackend(jsCryptoBackend);
  });

  it('reports not-configured when there is no vault, without inventing a session', async () => {
    expect(await restoreSignalSession(null)).toMatchObject({
      configured: false,
      unlocked: false,
    });
  });

  it('reopens a device-lock vault after the signer is gone', async () => {
    await createSignalIdentity('');
    const created = await signalSessionSummary();
    expect(created.unlocked).toBe(true);

    // What a process death does: the vault stays on disk, the signer does not.
    lockSignalIdentity();
    expect((await signalSessionSummary()).unlocked).toBe(false);

    const restored = await restoreSignalSession(null);
    expect(restored).toMatchObject({ configured: true, unlocked: true });
    // Same identity, not a new one — a restore that minted a fresh key would be worse than
    // staying locked, because nobody could reach the person at the key they published.
    expect(restored.identityId).toBe(created.identityId);
  });

  it('leaves a passphrase-protected vault locked', async () => {
    await createSignalIdentity('correct horse battery staple');
    lockSignalIdentity();

    const restored = await restoreSignalSession(null);
    expect(restored).toMatchObject({ configured: true, unlocked: false });
    expect(restored.identityId).toBeUndefined();
  });
});
