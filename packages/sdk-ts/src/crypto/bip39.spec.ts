import {
  entropyToMnemonic as referenceEntropyToMnemonic,
  mnemonicToSeedSync,
  validateMnemonic as referenceValidateMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { describe, expect, it } from 'vitest';
import {
  entropyToMnemonic,
  mnemonicToSeed,
  validateMnemonic,
} from './bip39.js';

describe('shared BIP-39 semantics', () => {
  it('matches the reference for 128-bit and 256-bit entropy', () => {
    for (const length of [16, 32]) {
      const entropy = Uint8Array.from({ length }, (_, index) => index);
      const mnemonic = entropyToMnemonic(entropy);
      expect(mnemonic).toBe(referenceEntropyToMnemonic(entropy, wordlist));
      expect(validateMnemonic(mnemonic)).toBe(true);
      expect(referenceValidateMnemonic(mnemonic, wordlist)).toBe(true);
      expect(mnemonicToSeed(mnemonic, 'বাংলা')).toEqual(
        mnemonicToSeedSync(mnemonic, 'বাংলা'),
      );
    }
  });
});
