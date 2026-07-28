/**
 * Canonical envelope encoding — the single most important function in the system.
 *
 * Every signature and every content ID in the network is computed over the output of
 * this function. TypeScript, Rust and Python MUST agree on it byte for byte, which is
 * what `pnpm vectors` proves and what CI blocks on (EN-04, P0-G1, NFR-M09).
 *
 * ── EN-01, the five rules ────────────────────────────────────────────────────────────
 *   1. Fields in strictly ascending field number.
 *   2. Default / zero values omitted ENTIRELY — no tag, no length, nothing.
 *   3. No unknown fields retained or re-emitted.
 *   4. Strings NFC-normalised before encoding.
 *   5. No float or double anywhere in a signed structure.
 *
 * ── EN-02, exactly one accepted form ────────────────────────────────────────────────
 * Fallback chains and multi-shape acceptance are forbidden. A verifier that cannot parse
 * a version rejects it; it never guesses.
 *
 * This is not a theoretical concern. v1 accepted a signature valid over EITHER of two
 * canonical forms, the legacy one omitting `url`, `attachmentIds` and `poll`. A signature
 * the user produced over a plain text post therefore also validated a post carrying an
 * attacker-chosen URL and arbitrary attachments — and the verification UI showed a green
 * check on the forgery. `vectors/field-omission.spec.ts` is the regression (P0-G4).
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §1–2
 */

import {
  ByteWriter,
  encodeUtf8Nfc,
  writeLengthDelimited,
  writeVarintField,
} from './wire.js';
import {
  ANTI_ABUSE_FIELD,
  FIELD,
  type AntiAbuse,
  type CanonicalEnvelope,
  type SignedEnvelope,
} from './types.js';

/**
 * True when the anti-abuse block carries no information.
 *
 * Normative choice: an all-empty AntiAbuse is omitted from the envelope entirely rather
 * than emitted as a zero-length message. Proto3 would allow either — `{}` set versus
 * unset — and allowing both would be a second accepted form. Rust and Python implement
 * the identical rule.
 */
function isAntiAbuseEmpty(a: AntiAbuse | undefined): boolean {
  if (!a) return true;
  return (
    (a.credential?.length ?? 0) === 0 &&
    (a.nullifier?.length ?? 0) === 0 &&
    (a.epoch ?? 0) === 0 &&
    (a.pow?.length ?? 0) === 0
  );
}

/** AntiAbuse submessage, same five rules applied recursively. */
function encodeAntiAbuse(a: AntiAbuse): Uint8Array {
  const w = new ByteWriter(64);
  if (a.credential?.length) writeLengthDelimited(w, ANTI_ABUSE_FIELD.CREDENTIAL, a.credential);
  if (a.nullifier?.length) writeLengthDelimited(w, ANTI_ABUSE_FIELD.NULLIFIER, a.nullifier);
  if (a.epoch) writeVarintField(w, ANTI_ABUSE_FIELD.EPOCH, BigInt(a.epoch));
  if (a.pow?.length) writeLengthDelimited(w, ANTI_ABUSE_FIELD.POW, a.pow);
  return w.finish();
}

/**
 * Canonical bytes of fields 1..12 — what gets signed and what the content ID hashes.
 *
 * The signature (field 13) is deliberately excluded, so the content ID is stable across
 * re-signing (EN-03).
 */
export function canonicalBytes(env: CanonicalEnvelope): Uint8Array {
  const w = new ByteWriter(512);

  // Ascending field number, zero values omitted. The ordering is not an optimisation —
  // it is the whole contract.
  if (env.version) writeVarintField(w, FIELD.VERSION, BigInt(env.version));
  if (env.plane) writeVarintField(w, FIELD.PLANE, BigInt(env.plane));
  if (env.domain) writeLengthDelimited(w, FIELD.DOMAIN, encodeUtf8Nfc(env.domain));
  if (env.author_key.length) writeLengthDelimited(w, FIELD.AUTHOR_KEY, env.author_key);
  if (env.key_alg) writeVarintField(w, FIELD.KEY_ALG, BigInt(env.key_alg));
  if (env.parent) writeLengthDelimited(w, FIELD.PARENT, encodeUtf8Nfc(env.parent));
  if (env.scope) writeLengthDelimited(w, FIELD.SCOPE, encodeUtf8Nfc(env.scope));
  if (env.created_at_ms) writeVarintField(w, FIELD.CREATED_AT_MS, env.created_at_ms);
  if (env.nonce.length) writeLengthDelimited(w, FIELD.NONCE, env.nonce);
  if (env.priority) writeVarintField(w, FIELD.PRIORITY, BigInt(env.priority));
  if (env.body.length) writeLengthDelimited(w, FIELD.BODY, env.body);

  if (!isAntiAbuseEmpty(env.anti_abuse)) {
    writeLengthDelimited(w, FIELD.ANTI_ABUSE, encodeAntiAbuse(env.anti_abuse as AntiAbuse));
  }

  return w.finish();
}

/**
 * Full wire bytes including the signature — what actually travels over a transport.
 *
 * PC-01: the caller checks this length against the domain's class budget at
 * construction, with a typed error. A class-0 broadcast that only turns out to be 600
 * bytes at send time is a failure in the field, not in the lab.
 */
export function encodeSignedEnvelope(env: SignedEnvelope): Uint8Array {
  const w = new ByteWriter(640);
  w.bytes(canonicalBytes(env));
  if (env.signature.length) writeLengthDelimited(w, FIELD.SIGNATURE, env.signature);
  return w.finish();
}
