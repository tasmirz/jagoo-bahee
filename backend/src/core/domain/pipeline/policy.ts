/**
 * Pipeline steps 1, 6, 7 — SIZE, ALG POLICY, PRIORITY.
 *
 * All three are policy lookups against the generated registry row, not conditionals on the
 * domain string. That is the whole point: adding a domain adds a row, and these functions
 * do not change (AR-05, P1-G11).
 *
 * Every function here is pure and performs no I/O, so a flood of invalid envelopes is
 * rejected without touching the database (VP-01).
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §5
 */

import type { DomainSpec } from '@jagoo/sdk';
import type { ParsedEnvelope, Priority } from '../envelope.js';
import { EnvelopeRejected, RejectionCode } from '../errors.js';

/** Registry priority names → the signed enum values. */
const PRIORITY_BY_NAME: Record<string, Priority> = {
  BROADCAST: 1,
  DIRECT: 2,
  CHECKIN: 3,
  BULK: 4,
};

/** Registry key-algorithm names → the signed enum values. */
const KEY_ALG_BY_NAME: Record<string, number> = {
  ED25519: 1,
  ML_DSA_44: 2,
  FALCON_512: 3,
};

/**
 * Hard size ceilings per priority class, applied to RAW BYTES before parsing (PC-01).
 *
 * These are checked pre-parse on purpose: an attacker who can make the node parse a 10 MB
 * "broadcast" before rejecting it has a cheap amplification primitive. Class 0–2 budgets
 * are small because those classes must survive a LoRa frame budget, and they are enforced
 * at construction with a typed error rather than discovered at send time.
 */
export const CLASS_SIZE_BUDGET: Record<number, number> = {
  1: 512, // BROADCAST
  2: 1024, // DIRECT
  3: 512, // CHECKIN
  4: 65536, // BULK — the registry row may lower this further
};

/**
 * Step 1 — SIZE, on raw bytes, before PARSE.
 *
 * `spec` is optional because at step 1 the domain has not been read yet: the only bound
 * available pre-parse is the largest thing this node will ever accept. The per-domain
 * `maxBytes` is re-checked once the row is known.
 */
export function acceptSize(raw: Uint8Array, absoluteMax = 65536): void {
  if (raw.length > absoluteMax) {
    throw new EnvelopeRejected(
      RejectionCode.TOO_LARGE,
      `envelope is ${raw.length} bytes, limit is ${absoluteMax}`,
    );
  }
  if (raw.length === 0) {
    throw new EnvelopeRejected(RejectionCode.MALFORMED, 'envelope is empty');
  }
}

/** Step 1b — the per-domain budget, once the registry row is known. */
export function acceptDomainSize(raw: Uint8Array, spec: DomainSpec): void {
  const budget = Math.min(spec.maxBytes, CLASS_SIZE_BUDGET[PRIORITY_BY_NAME[spec.priority]!] ?? spec.maxBytes);
  if (raw.length > budget) {
    throw new EnvelopeRejected(
      RejectionCode.TOO_LARGE,
      `envelope is ${raw.length} bytes, budget for ${spec.priority} is ${budget}`,
    );
  }
}

/**
 * Step 6 — ALG POLICY.
 *
 * The registry names which algorithms a domain accepts. This is where the post-quantum
 * budget decision is enforced: per-message signatures stay Ed25519 at 64 bytes, because one
 * ML-DSA-44 signature is ~2420 bytes — roughly twelve LoRa frames before any content.
 */
export function acceptAlgPolicy(env: ParsedEnvelope, spec: DomainSpec): void {
  const permitted = spec.keyAlgs.map((name) => KEY_ALG_BY_NAME[name]);
  if (!permitted.includes(env.keyAlg)) {
    throw new EnvelopeRejected(
      RejectionCode.ALG_NOT_PERMITTED,
      `key algorithm is not permitted for this domain`,
      { field: 'key_alg' },
    );
  }
}

/**
 * Step 7 — PRIORITY.
 *
 * The class is declared by the contract, not chosen by the sender. Without this check a
 * sender could label bulk forum traffic as BROADCAST and jump every outbound queue —
 * starving the emergency channel that priority ordering exists to protect.
 */
export function acceptPriority(env: ParsedEnvelope, spec: DomainSpec): void {
  const expected = PRIORITY_BY_NAME[spec.priority];
  if (expected !== env.priority) {
    throw new EnvelopeRejected(
      RejectionCode.PRIORITY_MISMATCH,
      'priority does not match the class declared for this domain',
      { field: 'priority' },
    );
  }
}

export function priorityOf(spec: DomainSpec): Priority {
  return PRIORITY_BY_NAME[spec.priority] as Priority;
}
