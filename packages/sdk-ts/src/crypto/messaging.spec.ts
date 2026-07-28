import { describe, expect, it } from 'vitest';
import { messagingKeyPair, openFirstMessage, sealFirstMessage } from './messaging.js';

describe('hybrid Forum messaging (MS-01, MSG-09)', () => {
  it('round-trips X25519 + ML-KEM-768 + ChaCha20-Poly1305 deterministically', () => {
    const recipient = messagingKeyPair(new Uint8Array(32).fill(1), new Uint8Array(64).fill(2));
    const aad = new TextEncoder().encode('thread-7:0');
    const sealed = sealFirstMessage(
      recipient.publicKey,
      new TextEncoder().encode('নিরাপদ বার্তা'),
      aad,
      new Uint8Array(32).fill(3),
      new Uint8Array(32).fill(4),
      new Uint8Array(12).fill(5),
    );
    expect(new TextDecoder().decode(openFirstMessage(recipient.secretKey, sealed, aad))).toBe(
      'নিরাপদ বার্তা',
    );
  });

  it('rejects ciphertext or associated-data tampering', () => {
    const recipient = messagingKeyPair(new Uint8Array(32).fill(6), new Uint8Array(64).fill(7));
    const sealed = sealFirstMessage(
      recipient.publicKey,
      new Uint8Array([1, 2, 3]),
      new Uint8Array([8]),
      new Uint8Array(32).fill(9),
      new Uint8Array(32).fill(10),
      new Uint8Array(12).fill(11),
    );
    expect(() => openFirstMessage(recipient.secretKey, sealed, new Uint8Array([9]))).toThrow();
  });
});
