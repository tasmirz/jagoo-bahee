import { HDKey } from '@scure/bip32';
import { describe, expect, it } from 'vitest';
import { derivePath } from './bip32.js';

describe('shared hardened BIP-32 semantics', () => {
  it('matches the reference implementation across the Jagoo BIP-85 paths', () => {
    for (let seedByte = 0; seedByte < 8; seedByte += 1) {
      const seed = new Uint8Array(64).fill(seedByte);
      for (const path of [
        "m/83696968'/10'/0'",
        "m/83696968'/11'/17'",
        "m/83696968'/13'/2'",
        "m/83696968'/23'/1'",
      ]) {
        const actual = derivePath(seed, path);
        const expected = HDKey.fromMasterSeed(seed).derive(path);
        expect(actual.privateKey).toEqual(expected.privateKey);
        expect(actual.chainCode).toEqual(expected.chainCode);
      }
    }
  });

  it('rejects non-hardened derivation instead of silently selecting another algorithm', () => {
    expect(() => derivePath(new Uint8Array(32).fill(1), "m/83696968'/10/0'")).toThrow(
      /non-hardened/,
    );
  });
});
