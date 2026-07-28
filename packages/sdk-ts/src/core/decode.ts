/**
 * Deterministic envelope decoding — pipeline step 2 (PARSE).
 *
 * ── The canonicality check, and why it is shaped this way ────────────────────────────
 * A decoder that merely *parses* is not enough. EN-02 permits exactly ONE encoded form per
 * envelope, and a permissive decoder silently accepts several: fields out of order, an
 * explicitly-encoded zero that the canonical rules say to omit, a non-minimal varint, a
 * trailing unknown field. Each of those is a second accepted form, and a second accepted
 * form is precisely the v1 signature-confusion bug.
 *
 * Rather than re-stating all five canonical rules inside the decoder — where they would
 * drift from the encoder's copy — this decodes and then **re-encodes and compares bytes**.
 * If the input was not already exactly what `canonicalBytes` would have produced, it is
 * rejected. One check, no duplicated rules, and nothing to fall back to.
 *
 * The comparison is against the encoder that Rust and Python agree with byte-for-byte
 * (P0-G1), so "canonical" means the same thing on every node in the network.
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §1-2, §5 step 2
 */

import { canonicalBytes, encodeSignedEnvelope } from './canonical.js';
import { bytesEqual, WIRE_LEN, WIRE_VARINT } from './wire.js';
import {
  ANTI_ABUSE_FIELD,
  FIELD,
  type AntiAbuse,
  type CanonicalEnvelope,
  type SignedEnvelope,
} from './types.js';

export class DecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecodeError';
  }
}

/** Cursor over a byte buffer. Every read is bounds-checked — the input is hostile. */
class ByteReader {
  #pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  get done(): boolean {
    return this.#pos >= this.buf.length;
  }
  get position(): number {
    return this.#pos;
  }

  /**
   * Base-128 varint. Rejects a non-minimal encoding (more than 10 bytes) and truncation.
   * Overlong varints are a classic way to produce two byte strings with one meaning.
   */
  varint(): bigint {
    let result = 0n;
    let shift = 0n;
    let bytesRead = 0;

    for (;;) {
      if (this.#pos >= this.buf.length) throw new DecodeError('truncated varint');
      const byte = this.buf[this.#pos++] as number;
      bytesRead += 1;
      if (bytesRead > 10) throw new DecodeError('varint is longer than 10 bytes');
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7n;
    }
    return result;
  }

  take(n: number): Uint8Array {
    if (n < 0) throw new DecodeError('negative length');
    if (this.#pos + n > this.buf.length) throw new DecodeError('length exceeds buffer');
    const out = this.buf.subarray(this.#pos, this.#pos + n);
    this.#pos += n;
    return out;
  }
}

interface RawField {
  readonly field: number;
  readonly wireType: number;
  readonly varint?: bigint;
  readonly bytes?: Uint8Array;
}

/** Read every field, in the order they appear. Ordering is validated by the caller. */
function readFields(buf: Uint8Array): RawField[] {
  const reader = new ByteReader(buf);
  const out: RawField[] = [];

  while (!reader.done) {
    const tag = reader.varint();
    const field = Number(tag >> 3n);
    const wireType = Number(tag & 0x7n);
    if (field === 0) throw new DecodeError('field number 0 is invalid');

    if (wireType === WIRE_VARINT) {
      out.push({ field, wireType, varint: reader.varint() });
    } else if (wireType === WIRE_LEN) {
      const len = Number(reader.varint());
      out.push({ field, wireType, bytes: reader.take(len) });
    } else {
      // Groups (3, 4) and fixed32/64 (5, 1) appear nowhere in the envelope schema. Anything
      // using them is either a different schema or an attempt to smuggle a second form.
      throw new DecodeError(`unsupported wire type ${wireType} on field ${field}`);
    }
  }
  return out;
}

const KNOWN_ENVELOPE_FIELDS = new Set<number>(Object.values(FIELD));
const KNOWN_ANTI_ABUSE_FIELDS = new Set<number>(Object.values(ANTI_ABUSE_FIELD));

/** Ascending, no repeats — canonical order (EN-01 rule 1). */
function assertAscendingUnique(fields: readonly RawField[], where: string): void {
  let previous = 0;
  for (const f of fields) {
    if (f.field === previous) throw new DecodeError(`${where}: field ${f.field} appears twice`);
    if (f.field < previous) {
      throw new DecodeError(`${where}: field ${f.field} is out of order after ${previous}`);
    }
    previous = f.field;
  }
}

function decodeAntiAbuse(buf: Uint8Array): AntiAbuse {
  const fields = readFields(buf);
  assertAscendingUnique(fields, 'anti_abuse');

  const out: {
    credential?: Uint8Array;
    nullifier?: Uint8Array;
    epoch?: number;
    pow?: Uint8Array;
  } = {};

  for (const f of fields) {
    if (!KNOWN_ANTI_ABUSE_FIELDS.has(f.field)) {
      // EN-01 rule 3: unknown fields are rejected, never retained. Retaining them would
      // mean the bytes that were signed are not the bytes that get re-emitted.
      throw new DecodeError(`unknown anti_abuse field ${f.field}`);
    }
    switch (f.field) {
      case ANTI_ABUSE_FIELD.CREDENTIAL:
        out.credential = Uint8Array.from(f.bytes ?? []);
        break;
      case ANTI_ABUSE_FIELD.NULLIFIER:
        out.nullifier = Uint8Array.from(f.bytes ?? []);
        break;
      case ANTI_ABUSE_FIELD.EPOCH:
        out.epoch = Number(f.varint ?? 0n);
        break;
      case ANTI_ABUSE_FIELD.POW:
        out.pow = Uint8Array.from(f.bytes ?? []);
        break;
    }
  }
  return out;
}

const textDecoder = new TextDecoder('utf-8', { fatal: true });

function decodeString(bytes: Uint8Array | undefined, field: string): string {
  try {
    return textDecoder.decode(bytes ?? new Uint8Array(0));
  } catch {
    throw new DecodeError(`${field} is not valid UTF-8`);
  }
}

/**
 * Decode a signed envelope (fields 1..13) and verify it is in canonical form.
 *
 * Throws `DecodeError` on anything that is not exactly one accepted form. The caller maps
 * that to `MALFORMED` at pipeline step 2.
 */
export function decodeSignedEnvelope(raw: Uint8Array): SignedEnvelope {
  const fields = readFields(raw);
  assertAscendingUnique(fields, 'envelope');

  let signature = new Uint8Array(0);
  let antiAbuse: AntiAbuse | undefined;

  const base: {
    version: number;
    plane: number;
    domain: string;
    author_key: Uint8Array;
    key_alg: number;
    parent: string;
    scope: string;
    created_at_ms: bigint;
    nonce: Uint8Array;
    priority: number;
    body: Uint8Array;
  } = {
    version: 0,
    plane: 0,
    domain: '',
    author_key: new Uint8Array(0),
    key_alg: 0,
    parent: '',
    scope: '',
    created_at_ms: 0n,
    nonce: new Uint8Array(0),
    priority: 0,
    body: new Uint8Array(0),
  };

  for (const f of fields) {
    if (!KNOWN_ENVELOPE_FIELDS.has(f.field)) {
      throw new DecodeError(`unknown envelope field ${f.field}`);
    }
    switch (f.field) {
      case FIELD.VERSION:
        base.version = Number(f.varint ?? 0n);
        break;
      case FIELD.PLANE:
        base.plane = Number(f.varint ?? 0n);
        break;
      case FIELD.DOMAIN:
        base.domain = decodeString(f.bytes, 'domain');
        break;
      case FIELD.AUTHOR_KEY:
        base.author_key = Uint8Array.from(f.bytes ?? []);
        break;
      case FIELD.KEY_ALG:
        base.key_alg = Number(f.varint ?? 0n);
        break;
      case FIELD.PARENT:
        base.parent = decodeString(f.bytes, 'parent');
        break;
      case FIELD.SCOPE:
        base.scope = decodeString(f.bytes, 'scope');
        break;
      case FIELD.CREATED_AT_MS:
        base.created_at_ms = f.varint ?? 0n;
        break;
      case FIELD.NONCE:
        base.nonce = Uint8Array.from(f.bytes ?? []);
        break;
      case FIELD.PRIORITY:
        base.priority = Number(f.varint ?? 0n);
        break;
      case FIELD.BODY:
        base.body = Uint8Array.from(f.bytes ?? []);
        break;
      case FIELD.ANTI_ABUSE:
        antiAbuse = decodeAntiAbuse(f.bytes ?? new Uint8Array(0));
        break;
      case FIELD.SIGNATURE:
        signature = Uint8Array.from(f.bytes ?? []);
        break;
    }
  }

  const envelope: SignedEnvelope = {
    ...(base as unknown as CanonicalEnvelope),
    ...(antiAbuse ? { anti_abuse: antiAbuse } : {}),
    signature,
  };

  // ── The canonicality gate ──────────────────────────────────────────────────────────
  // Round-trip: whatever we just understood, re-encode it. If the bytes differ, the input
  // was a DIFFERENT encoding of the same meaning — an explicitly-encoded zero, a
  // non-minimal varint, an empty anti_abuse submessage that should have been omitted. All
  // of those are rejected, because accepting any of them is a second valid form (EN-02).
  if (!bytesEqual(encodeSignedEnvelope(envelope), raw)) {
    throw new DecodeError('envelope is not in canonical form');
  }

  return envelope;
}

/** Canonical bytes of an already-decoded envelope — fields 1..12, what the signature covers. */
export function canonicalBytesOf(envelope: CanonicalEnvelope): Uint8Array {
  return canonicalBytes(envelope);
}
