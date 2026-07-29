import { describe, expect, it } from 'vitest';
import { openRatchetMessage, sealRatchetMessage } from './signal.js';

describe('MS-02 symmetric ratchet', () => {
  it('decrypts in order, detects a counter gap, and destroys the previous-key path', () => {
    const initial = { chainKey: new Uint8Array(32).fill(7), counter: 0n };
    const first = sealRatchetMessage(
      initial,
      new TextEncoder().encode('one'),
      new Uint8Array(),
      new Uint8Array(12).fill(1),
    );
    const opened = openRatchetMessage(initial, first);
    expect(new TextDecoder().decode(opened.plaintext)).toBe('one');
    expect(opened.next).toEqual(first.next);

    const second = sealRatchetMessage(
      first.next,
      new TextEncoder().encode('two'),
      new Uint8Array(),
      new Uint8Array(12).fill(2),
    );
    expect(() => openRatchetMessage(initial, second)).toThrow(/counter gap/);
    expect(new TextDecoder().decode(openRatchetMessage(first.next, second).plaintext)).toBe('two');
  });
});
