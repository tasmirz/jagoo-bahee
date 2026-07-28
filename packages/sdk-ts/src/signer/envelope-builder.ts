/**
 * Envelope construction and verification.
 *
 * PC-01 is the reason this is a builder and not a plain object literal: class 0–2 size
 * budgets MUST be enforced AT CONSTRUCTION with a typed error, never discovered at send
 * time. A 600-byte "emergency broadcast" that fails when the radio is the only path left
 * is a failure in the field.
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §9 · Plans/01 §7
 */

import { canonicalBytes, encodeSignedEnvelope } from '../core/canonical.js';
import { contentIdFromCanonical } from '../core/content-id.js';
import { verify as ed25519Verify } from '../crypto/ed25519.js';
import {
  ENVELOPE_VERSION,
  KeyAlg,
  NONCE_BYTES,
  Plane,
  Priority,
  type CanonicalEnvelope,
  type SignedEnvelope,
} from '../core/types.js';
import { lookupDomain, type DomainSpec } from '../gen/registry.js';

export class EnvelopeTooLargeError extends Error {
  constructor(
    readonly domain: string,
    readonly actualBytes: number,
    readonly maxBytes: number,
  ) {
    super(
      `PC-01: ${domain} produced ${actualBytes} bytes, exceeding its ${maxBytes}-byte budget. ` +
        `Shorten the body — this class must fit a constrained transport.`,
    );
    this.name = 'EnvelopeTooLargeError';
  }
}

export class UnknownDomainError extends Error {
  constructor(readonly domain: string) {
    super(`RG-01: "${domain}" is not in the registry. There is no dynamic or implicit domain.`);
    this.name = 'UnknownDomainError';
  }
}

export class PlaneMismatchError extends Error {
  constructor(readonly domain: string, expected: Plane, actual: Plane) {
    super(`SEP-03: ${domain} belongs to plane ${Plane[expected]}, got ${Plane[actual]}.`);
    this.name = 'PlaneMismatchError';
  }
}

export interface BuildEnvelopeInput {
  readonly domain: string;
  readonly plane: Plane;
  readonly authorKey: Uint8Array;
  readonly body: Uint8Array;
  readonly nowMs: bigint;
  readonly nonce: Uint8Array;
  readonly parent?: string;
  readonly scope?: string;
  readonly antiAbuse?: CanonicalEnvelope['anti_abuse'];
}

const PLANE_BY_NAME: Record<string, Plane> = { FORUM: Plane.FORUM, SIGNAL: Plane.SIGNAL };
const PRIORITY_BY_NAME: Record<string, Priority> = {
  BROADCAST: Priority.BROADCAST,
  DIRECT: Priority.DIRECT,
  CHECKIN: Priority.CHECKIN,
  BULK: Priority.BULK,
};

/**
 * Build the unsigned canonical envelope for a domain.
 *
 * Priority and plane come from the registry rather than the caller — the caller cannot
 * mislabel a broadcast as bulk to dodge its size budget, and cannot lift a Forum body
 * into a Signal envelope.
 */
export function buildEnvelope(input: BuildEnvelopeInput): CanonicalEnvelope {
  const spec: DomainSpec | null = lookupDomain(input.domain);
  if (!spec) throw new UnknownDomainError(input.domain);

  const registryPlane = PLANE_BY_NAME[spec.plane] as Plane;
  if (registryPlane !== input.plane) {
    throw new PlaneMismatchError(input.domain, registryPlane, input.plane);
  }

  if (!spec.idempotent && input.nonce.length !== NONCE_BYTES) {
    throw new Error(
      `AB-05: ${input.domain} is non-idempotent and requires a ${NONCE_BYTES}-byte nonce.`,
    );
  }

  return {
    version: ENVELOPE_VERSION,
    plane: input.plane,
    domain: input.domain,
    author_key: input.authorKey,
    key_alg: KeyAlg.ED25519,
    parent: input.parent ?? '',
    scope: input.scope ?? '',
    created_at_ms: input.nowMs,
    nonce: input.nonce,
    priority: PRIORITY_BY_NAME[spec.priority] as Priority,
    body: input.body,
    ...(input.antiAbuse ? { anti_abuse: input.antiAbuse } : {}),
  };
}

/**
 * Attach a signature and check the size budget.
 *
 * The budget is checked on the FULL encoded envelope including the signature and
 * anti-abuse fields (PC-01), which is the only measurement that matters on the wire.
 */
export function sealEnvelope(env: CanonicalEnvelope, signature: Uint8Array): {
  envelope: SignedEnvelope;
  contentId: string;
  wireBytes: Uint8Array;
} {
  const spec = lookupDomain(env.domain);
  if (!spec) throw new UnknownDomainError(env.domain);

  const signed: SignedEnvelope = { ...env, signature };
  const wireBytes = encodeSignedEnvelope(signed);

  if (wireBytes.length > spec.maxBytes) {
    throw new EnvelopeTooLargeError(env.domain, wireBytes.length, spec.maxBytes);
  }

  return { envelope: signed, contentId: contentIdFromCanonical(canonicalBytes(env)), wireBytes };
}

/**
 * Verify authorship offline.
 *
 * THR-01 / AC-11: a client holding an author's public key can determine, with NO network
 * access and NO trusted server, whether content was genuinely authored by that key and
 * has not been modified. This function is that guarantee — it touches nothing but its
 * arguments.
 */
export function verifyEnvelope(env: SignedEnvelope): boolean {
  if (env.key_alg !== KeyAlg.ED25519) return false;
  return ed25519Verify(env.signature, canonicalBytes(env), env.author_key);
}
