/**
 * Deterministic decoding rejects every non-canonical form (EN-02, pipeline step 2).
 *
 * The decoder's job is not "understand these bytes" — it is "accept these bytes only if
 * they are the one canonical form". Each test below is a DIFFERENT byte string that decodes
 * to the same meaning as a valid envelope. In v1 the equivalent of every one of these was
 * accepted, which is how a signature over one message validated another.
 */

import { describe, expect, it } from 'vitest';
import { canonicalBytes, encodeSignedEnvelope } from '../core/canonical.js';
import { decodeSignedEnvelope, DecodeError } from '../core/decode.js';
import { ByteWriter, writeLengthDelimited, writeVarintField } from '../core/wire.js';
import { FIELD, type SignedEnvelope } from '../core/types.js';
import { envelope } from './fixtures.js';

function signed(name: string, signature = new Uint8Array(64).fill(9)): SignedEnvelope {
  return { ...envelope(name), signature };
}

describe('decodeSignedEnvelope — round trip', () => {
  it('round-trips every fixture byte-for-byte', () => {
    for (const name of [
      'minimal',
      'forum-post-full',
      'anti-abuse-epoch-only',
      'large-timestamp',
      'bangla-broadcast',
      'checkin-zero-cost',
    ]) {
      const env = signed(name);
      const raw = encodeSignedEnvelope(env);
      const decoded = decodeSignedEnvelope(raw);
      expect(encodeSignedEnvelope(decoded), name).toEqual(raw);
      expect(canonicalBytes(decoded), name).toEqual(canonicalBytes(env));
    }
  });

  it('preserves an int64 timestamp above 2^53 exactly', () => {
    const env = signed('large-timestamp');
    const decoded = decodeSignedEnvelope(encodeSignedEnvelope(env));
    expect(decoded.created_at_ms).toBe(env.created_at_ms);
  });
});

describe('decodeSignedEnvelope — rejects non-canonical encodings', () => {
  it('rejects fields in descending order', () => {
    // Same meaning, different bytes. Protobuf permits any order; EN-01 rule 1 does not.
    const w = new ByteWriter(64);
    writeVarintField(w, FIELD.PLANE, 1n);
    writeVarintField(w, FIELD.VERSION, 1n);
    expect(() => decodeSignedEnvelope(w.finish())).toThrow(DecodeError);
  });

  it('rejects a repeated field', () => {
    const w = new ByteWriter(64);
    writeVarintField(w, FIELD.VERSION, 1n);
    writeVarintField(w, FIELD.VERSION, 1n);
    expect(() => decodeSignedEnvelope(w.finish())).toThrow(/appears twice/);
  });

  it('rejects an explicitly-encoded zero that the canonical form omits', () => {
    // EN-01 rule 2: zero values are omitted ENTIRELY — no tag, no length, nothing.
    // Emitting `version=1, plane=0` is a second encoding of `version=1`.
    const w = new ByteWriter(64);
    writeVarintField(w, FIELD.VERSION, 1n);
    writeVarintField(w, FIELD.PLANE, 0n);
    expect(() => decodeSignedEnvelope(w.finish())).toThrow(/not in canonical form/);
  });

  it('rejects an empty anti_abuse submessage', () => {
    // Proto3 would allow `{}` set or unset. Allowing both is a second accepted form, so
    // the canonical rule is "omit when empty" and this must be rejected.
    const w = new ByteWriter(64);
    writeVarintField(w, FIELD.VERSION, 1n);
    writeLengthDelimited(w, FIELD.ANTI_ABUSE, new Uint8Array(0));
    expect(() => decodeSignedEnvelope(w.finish())).toThrow(/not in canonical form/);
  });

  it('rejects an unknown envelope field', () => {
    // EN-01 rule 3. Retaining unknown fields would mean the bytes that were signed are not
    // the bytes that get re-emitted downstream.
    const w = new ByteWriter(64);
    writeVarintField(w, FIELD.VERSION, 1n);
    writeVarintField(w, 99, 1n);
    expect(() => decodeSignedEnvelope(w.finish())).toThrow(/unknown envelope field 99/);
  });

  it('rejects an unknown anti_abuse field', () => {
    const inner = new ByteWriter(16);
    writeVarintField(inner, 7, 1n);
    const w = new ByteWriter(64);
    writeVarintField(w, FIELD.VERSION, 1n);
    writeLengthDelimited(w, FIELD.ANTI_ABUSE, inner.finish());
    expect(() => decodeSignedEnvelope(w.finish())).toThrow(/unknown anti_abuse field 7/);
  });

  it('rejects an unsupported wire type', () => {
    // fixed64 (wire type 1) appears nowhere in the schema — no floats exist in a signed
    // structure at all (EN-01 rule 5).
    const w = new ByteWriter(16);
    w.tag(FIELD.VERSION, 1);
    w.bytes(new Uint8Array(8));
    expect(() => decodeSignedEnvelope(w.finish())).toThrow(/unsupported wire type/);
  });

  it('rejects a non-minimal (overlong) varint', () => {
    const w = new ByteWriter(32);
    w.tag(FIELD.VERSION, 0);
    for (let i = 0; i < 11; i += 1) w.byte(0x80);
    w.byte(0x00);
    expect(() => decodeSignedEnvelope(w.finish())).toThrow(/longer than 10 bytes/);
  });

  it('rejects a truncated varint', () => {
    const w = new ByteWriter(8);
    w.tag(FIELD.VERSION, 0);
    w.byte(0x80);
    expect(() => decodeSignedEnvelope(w.finish())).toThrow(/truncated varint/);
  });

  it('rejects a length that runs past the buffer', () => {
    const w = new ByteWriter(8);
    w.tag(FIELD.DOMAIN, 2);
    w.varint(99n);
    w.bytes(new Uint8Array(2));
    expect(() => decodeSignedEnvelope(w.finish())).toThrow(/exceeds buffer/);
  });

  it('rejects invalid UTF-8 in a string field', () => {
    const w = new ByteWriter(32);
    writeVarintField(w, FIELD.VERSION, 1n);
    writeLengthDelimited(w, FIELD.DOMAIN, new Uint8Array([0xff, 0xfe]));
    expect(() => decodeSignedEnvelope(w.finish())).toThrow(/not valid UTF-8/);
  });

  it('rejects trailing bytes appended after a valid envelope', () => {
    // The v1 attack shape: same valid prefix, extra data appended.
    const raw = encodeSignedEnvelope(signed('minimal'));
    const tampered = new Uint8Array(raw.length + 2);
    tampered.set(raw);
    tampered.set([0x00, 0x00], raw.length);
    expect(() => decodeSignedEnvelope(tampered)).toThrow(DecodeError);
  });

  it('rejects a non-NFC string, because re-encoding would normalise it', () => {
    // A decomposed Bangla string decodes fine but re-encodes to its NFC form, so the
    // round-trip differs and it is rejected. Two devices must not be able to produce two
    // content IDs for the same text.
    const w = new ByteWriter(64);
    writeVarintField(w, FIELD.VERSION, 1n);
    writeLengthDelimited(w, FIELD.SCOPE, new TextEncoder().encode('café'));
    expect(() => decodeSignedEnvelope(w.finish())).toThrow(/not in canonical form/);
  });
});
