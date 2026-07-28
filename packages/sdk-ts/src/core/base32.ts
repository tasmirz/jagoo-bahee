/**
 * RFC 4648 base32, lowercase, no padding.
 *
 * Used for every stable identifier in the system — content IDs, identity IDs, channel
 * IDs, server IDs (Plans/02 §7). Lowercase and unpadded so an ID survives being read
 * aloud, written on a poster, or typed into a manual node-entry field during a blackout
 * (TP-19), where a `=` character or mixed case is a transcription error waiting to happen.
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

const DECODE = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) {
    const c = ALPHABET.charCodeAt(i);
    table[c] = i;
    // Accept uppercase on input — humans transcribing an ID should not be punished
    // for shift key state. Output is always lowercase.
    table[c - 32] = i;
  }
  return table;
})();

export function base32Encode(data: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;

  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];

  return out;
}

export function base32Decode(s: string): Uint8Array {
  const out = new Uint8Array(Math.floor((s.length * 5) / 8));
  let bits = 0;
  let value = 0;
  let written = 0;

  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    const digit = code < 128 ? DECODE[code] : -1;
    if (digit === undefined || digit < 0) {
      throw new Error(`base32: invalid character ${JSON.stringify(s[i])} at index ${i}`);
    }
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      out[written++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }

  return out.subarray(0, written);
}
