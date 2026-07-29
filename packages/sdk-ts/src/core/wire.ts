/**
 * Protobuf wire primitives, written by hand.
 *
 * The canonical encoder cannot delegate to a general-purpose protobuf library: those
 * libraries legitimately preserve unknown fields, tolerate multiple valid orderings, and
 * differ on whether an explicitly-set zero is emitted. Every one of those degrees of
 * freedom is a second accepted form, and EN-02 permits exactly one.
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §1
 */

export const WIRE_VARINT = 0;
export const WIRE_LEN = 2;

/** Growable byte sink. Avoids O(n²) concatenation while encoding. */
export class ByteWriter {
  #buf: Uint8Array;
  #len = 0;

  constructor(initialCapacity = 256) {
    this.#buf = new Uint8Array(initialCapacity);
  }

  #ensure(extra: number): void {
    const needed = this.#len + extra;
    if (needed <= this.#buf.length) return;
    let cap = this.#buf.length * 2;
    while (cap < needed) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.#buf.subarray(0, this.#len));
    this.#buf = next;
  }

  byte(b: number): void {
    this.#ensure(1);
    this.#buf[this.#len++] = b;
  }

  bytes(src: Uint8Array): void {
    this.#ensure(src.length);
    this.#buf.set(src, this.#len);
    this.#len += src.length;
  }

  /** Base-128 varint, little-endian groups, high bit as continuation. */
  varint(value: bigint): void {
    let v = value;
    if (v < 0n) {
      // Two's complement over 64 bits — protobuf encodes a negative int64 as ten bytes.
      v = (1n << 64n) + v;
    }
    while (v >= 0x80n) {
      this.byte(Number((v & 0x7fn) | 0x80n));
      v >>= 7n;
    }
    this.byte(Number(v));
  }

  tag(fieldNumber: number, wireType: number): void {
    this.varint(BigInt((fieldNumber << 3) | wireType));
  }

  finish(): Uint8Array {
    return this.#buf.slice(0, this.#len);
  }

  get length(): number {
    return this.#len;
  }
}

/**
 * NFC normalisation before encoding (EN-01).
 *
 * Two visually identical strings can have different UTF-8 bytes — "é" is either U+00E9
 * or U+0065 U+0301. Without normalisation the same text signed on two devices produces
 * two different content IDs, which breaks dedupe, replay protection, and cross-node
 * references all at once.
 */
export function encodeUtf8Nfc(s: string): Uint8Array {
  return new TextEncoder().encode(s.normalize('NFC'));
}

/** Writes `tag, length, payload`. Used for string, bytes, and nested message fields. */
export function writeLengthDelimited(w: ByteWriter, fieldNumber: number, payload: Uint8Array): void {
  w.tag(fieldNumber, WIRE_LEN);
  w.varint(BigInt(payload.length));
  w.bytes(payload);
}

export function writeVarintField(w: ByteWriter, fieldNumber: number, value: bigint): void {
  w.tag(fieldNumber, WIRE_VARINT);
  w.varint(value);
}

/**
 * Length-prefixed concatenation, for signing structures that are NOT envelopes.
 *
 * Receipts, tree heads and the federation handshake payloads all need a deterministic
 * byte string to sign, but none of them is an `Envelope`, so none goes through the
 * canonical encoder. Plain concatenation would be ambiguous — `["ab","c"]` and
 * `["a","bc"]` produce identical bytes — and an attacker who controls two adjacent
 * fields can exploit exactly that to make one signed statement read as another.
 * A four-byte big-endian length before every part removes the ambiguity.
 *
 * Nested repeated fields frame their elements with this same function and contribute the
 * result as a single part, so structure is preserved to any depth.
 */
export function frameParts(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((size, part) => size + 4 + part.length, 0));
  const view = new DataView(out.buffer);
  let offset = 0;
  for (const part of parts) {
    view.setUint32(offset, part.length, false);
    offset += 4;
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Constant-time-ish equality for byte arrays. Used on signature and hash comparisons. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}
