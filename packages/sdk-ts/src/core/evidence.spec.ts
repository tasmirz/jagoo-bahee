import { sha256 } from '@noble/hashes/sha256';
import { concatBytes } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { ed25519 } from '../crypto/index.js';
import {
  receiptSigningBytes,
  sthSigningBytes,
  verifyReceipt,
  type OfflineReceipt,
} from './evidence.js';

describe('offline publication evidence', () => {
  it('verifies authorship of the STH, receipt, and RFC 6962 inclusion together', () => {
    const seed = new Uint8Array(32).fill(5);
    const serverKey = ed25519.derivePublicKey(seed);
    const contentId = `jb1${'a'.repeat(52)}`;
    const rootHash = sha256(
      concatBytes(new Uint8Array([0]), new TextEncoder().encode(contentId)),
    );
    const unsignedSth = { treeSize: 1, rootHash, timestampMs: 123 };
    const sth = {
      ...unsignedSth,
      serverKey,
      signature: ed25519.sign(sthSigningBytes(unsignedSth), seed),
    };
    const unsignedReceipt = {
      contentId,
      logIndex: 17,
      leafIndex: 0,
      acceptedAtMs: 123,
      serverId: 'jbs1test',
      serverKey,
      sth,
      inclusionProof: [],
    };
    const receipt: OfflineReceipt = {
      ...unsignedReceipt,
      signature: ed25519.sign(receiptSigningBytes(unsignedReceipt), seed),
    };

    expect(verifyReceipt(receipt)).toBe(true);
    expect(verifyReceipt({ ...receipt, leafIndex: 1 })).toBe(false);
  });
});
