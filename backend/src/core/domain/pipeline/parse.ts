/**
 * Pipeline step 2 — PARSE.
 *
 * Deterministic decode, unknown fields rejected, exactly one accepted form. The heavy
 * lifting lives in `@jagoo/sdk`'s decoder so that the backend and the client apply the
 * identical definition of "canonical" — a client that accepted a form the server rejected
 * (or worse, the reverse) would show a valid-signature badge on content the network
 * considers malformed.
 *
 * The content ID is DERIVED here, never taken from the wire. Trusting a transmitted
 * `content_id` would let a relay relabel content it did not author (VIS-03).
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §5 step 2
 */

import {
  canonicalBytes,
  contentIdFromCanonical,
  decodeSignedEnvelope,
  DecodeError,
} from '@jagoo/sdk/core';
import type { KeyAlg, ParsedEnvelope, Plane, Priority } from '../envelope.js';
import { EnvelopeRejected, RejectionCode } from '../errors.js';

export interface ParseResult {
  readonly envelope: ParsedEnvelope;
  /** Bytes of fields 1..12 — what the signature covers and what the content ID hashes. */
  readonly canonical: Uint8Array;
}

export function parseEnvelope(raw: Uint8Array): ParseResult {
  let decoded;
  try {
    decoded = decodeSignedEnvelope(raw);
  } catch (e) {
    if (e instanceof DecodeError) {
      // ER-02: the reason is not echoed back verbatim. A precise parser error is a probing
      // oracle — it tells an attacker exactly which byte to change next.
      throw new EnvelopeRejected(RejectionCode.MALFORMED, 'envelope could not be decoded');
    }
    throw e;
  }

  const canonical = canonicalBytes(decoded);

  const envelope: ParsedEnvelope = {
    version: decoded.version,
    plane: decoded.plane as Plane,
    domain: decoded.domain,
    authorKey: decoded.author_key,
    keyAlg: decoded.key_alg as KeyAlg,
    parent: decoded.parent,
    scope: decoded.scope,
    createdAtMs: decoded.created_at_ms,
    nonce: decoded.nonce,
    priority: decoded.priority as Priority,
    body: decoded.body,
    ...(decoded.anti_abuse ? { antiAbuse: decoded.anti_abuse } : {}),
    signature: decoded.signature,
    contentId: contentIdFromCanonical(canonical),
  };

  return { envelope, canonical };
}
