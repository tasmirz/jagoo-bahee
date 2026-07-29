import * as SecureStore from 'expo-secure-store';
import { SecureForumSigner } from '../signer';
import { SecureSignalSigner, verifySignalQrFingerprint } from '../signer/signal';

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

describe('P4-G10 independent panic wipe', () => {
  beforeEach(async () => {
    await SecureStore.setItemAsync('jb.forum.root.v1', 'forum');
    await SecureStore.setItemAsync('jb.signal.root.v1', 'signal');
    await SecureStore.setItemAsync('jb.signal.channels.v1', 'channels');
  });

  it('wiping Signal leaves Forum intact', async () => {
    await SecureSignalSigner.panicConfiguredVault();
    await expect(SecureStore.getItemAsync('jb.signal.root.v1')).resolves.toBeNull();
    await expect(SecureStore.getItemAsync('jb.signal.channels.v1')).resolves.toBeNull();
    await expect(SecureStore.getItemAsync('jb.forum.root.v1')).resolves.toBe('forum');
  });

  it('wiping Forum leaves Signal intact', async () => {
    await SecureForumSigner.panicConfiguredVault();
    await expect(SecureStore.getItemAsync('jb.forum.root.v1')).resolves.toBeNull();
    await expect(SecureStore.getItemAsync('jb.signal.root.v1')).resolves.toBe('signal');
  });
});

describe('P4-G1 offline in-person verification', () => {
  it('compares the scanned fingerprint locally without a request', () => {
    const key = new Uint8Array(32).fill(7);
    const encoded = globalThis.btoa(String.fromCharCode(...key));
    expect(verifySignalQrFingerprint(key, encoded)).toBe(true);
    expect(verifySignalQrFingerprint(key, globalThis.btoa('wrong'))).toBe(false);
  });
});
