import {
  jsCryptoBackend,
  setCryptoBackend,
  type CryptoBackend,
} from '@jagoo/sdk/crypto';
import { SecureForumSigner } from './index';
import { SecureSignalSigner } from './signal';

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
});
