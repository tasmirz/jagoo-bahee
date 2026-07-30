import {
  jsCryptoBackend,
  setCryptoBackend,
  type CryptoBackend,
} from '@jagoo/sdk/crypto';
import * as SecureStore from 'expo-secure-store';
import {
  LEGACY_FORUM_VAULT_ID,
  SecureForumSigner,
  deleteForumIdentityVault,
  selectForumIdentityVault,
} from './index';
import { SecureSignalSigner } from './signal';

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

describe('signer hot-path root memoisation', () => {
  it('runs BIP-39 PBKDF2 once per plane unlock, not once per signature', async () => {
    setCryptoBackend(jsCryptoBackend);
    const mnemonic = `${'abandon '.repeat(23)}art`;
    let seedDerivations = 0;
    const probe: CryptoBackend = {
      ...jsCryptoBackend,
      id: 'memoisation-probe',
      // Vault cost is unrelated to the assertion and would make this unit test allocate
      // the production 64 MiB scrypt work area twice.
      scrypt: (_password, _salt, params) => new Uint8Array(params.dkLen).fill(9),
      pbkdf2Sha512(password, salt, iterations, length) {
        seedDerivations += 1;
        return jsCryptoBackend.pbkdf2Sha512(password, salt, iterations, length);
      },
    };
    setCryptoBackend(probe);

    const forum = await SecureForumSigner.create('correct horse', mnemonic);
    const signal = await SecureSignalSigner.create('correct horse', mnemonic);
    try {
      await forum.identity({ kind: 'device' });
      await forum.sign({ kind: 'device' }, new Uint8Array([1]));
      await forum.sign({ kind: 'device' }, new Uint8Array([2]));
      await signal.identity({ kind: 'device' });
      await signal.sign({ kind: 'device' }, new Uint8Array([3]));
      await signal.sign({ kind: 'device' }, new Uint8Array([4]));
      expect(seedDerivations).toBe(2);
    } finally {
      forum.lock();
      signal.lock();
      setCryptoBackend(jsCryptoBackend);
    }
  });

  it('keeps separate Forum roots in independently selectable vaults', async () => {
    const fastBackend: CryptoBackend = {
      ...jsCryptoBackend,
      id: 'multi-vault-probe',
      scrypt: (_password, _salt, params) => new Uint8Array(params.dkLen).fill(7),
    };
    setCryptoBackend(fastBackend);
    try {
      selectForumIdentityVault('profile_one');
      const first = await SecureForumSigner.create('correct horse battery staple');
      const firstIdentity = await first.identity({ kind: 'device' });
      expect(await SecureStore.getItemAsync('jb.forum.root.v1.profile_one')).toBeTruthy();
      first.lock();

      selectForumIdentityVault('profile_two');
      const second = await SecureForumSigner.create('correct horse battery staple');
      const secondIdentity = await second.identity({ kind: 'device' });
      second.lock();
      expect(secondIdentity.id).not.toBe(firstIdentity.id);
      expect(await SecureStore.getItemAsync('jb.forum.root.v1.profile_one')).toBeTruthy();
      expect(await SecureStore.getItemAsync('jb.forum.root.v1.profile_two')).toBeTruthy();

      selectForumIdentityVault('profile_one');
      expect(await SecureStore.getItemAsync('jb.forum.root.v1.profile_one')).toBeTruthy();
      const restoredFirst = await SecureForumSigner.unlock('correct horse battery staple');
      await expect(restoredFirst.identity({ kind: 'device' })).resolves.toEqual(firstIdentity);
      restoredFirst.lock();
    } finally {
      await deleteForumIdentityVault('profile_one');
      await deleteForumIdentityVault('profile_two');
      selectForumIdentityVault(LEGACY_FORUM_VAULT_ID);
      setCryptoBackend(jsCryptoBackend);
    }
  });
});
