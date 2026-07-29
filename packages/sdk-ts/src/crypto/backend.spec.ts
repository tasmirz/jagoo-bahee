import { describe, expect, it } from 'vitest';
import { contentIdFromCanonical } from '../core/content-id.js';
import {
  cryptoBackend,
  resetCryptoBackendForTesting,
  setCryptoBackend,
  type CryptoBackend,
} from './backend.js';
import { jsCryptoBackend } from './js-backend.js';

describe('CryptoBackend seam (ADR-017)', () => {
  it('is consulted by canonical content hashing rather than bypassed', () => {
    let calls = 0;
    const probe: CryptoBackend = {
      ...jsCryptoBackend,
      id: 'probe',
      sha256(data) {
        calls += 1;
        return jsCryptoBackend.sha256(data);
      },
    };

    try {
      setCryptoBackend(probe);
      expect(contentIdFromCanonical(new Uint8Array([1, 2, 3]))).toMatch(/^jb1/);
      expect(calls).toBe(1);
      expect(cryptoBackend().id).toBe('probe');
    } finally {
      resetCryptoBackendForTesting();
    }
  });
});
