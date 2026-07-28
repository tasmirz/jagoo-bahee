/**
 * T0.22 / P0-G7 — pipeline steps 3, 4 and 5: VERSION, DOMAIN, PLANE.
 *
 * Three pure functions, each independently testable, each reachable by a test on every
 * error path. They perform no I/O and no database writes, which is what lets an
 * invalid-envelope flood be rejected without amplifying into writes (VP-01).
 *
 * ── EN-02: reject, never guess ───────────────────────────────────────────────────────
 * An unknown version is hard-rejected. There is no "try the v1 shape too" path, because
 * accepting more than one form per version is precisely the v1 signature-confusion bug
 * (see `field-omission.spec.ts`). A verifier that cannot parse a version rejects it.
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §5-6
 */

import type { DomainRegistry } from './domain-registry.js';
import { ENVELOPE_VERSION, type ParsedEnvelope, type Plane } from './envelope.js';
import { EnvelopeRejected, RejectionCode } from './errors.js';

/** Step 3 — VERSION. */
export function acceptVersion(version: number): void {
  if (version !== ENVELOPE_VERSION) {
    throw new EnvelopeRejected(
      RejectionCode.UNKNOWN_VERSION,
      `envelope version ${version} is not supported`,
      { field: 'version' },
    );
  }
}

/** Step 4 — DOMAIN. Unknown means "not registered on this node", which is a hard no. */
export function acceptDomain(domain: string, registry: DomainRegistry): void {
  if (!registry.has(domain)) {
    throw new EnvelopeRejected(RejectionCode.UNKNOWN_DOMAIN, 'domain is not registered', {
      field: 'domain',
    });
  }
}

/**
 * Step 5 — PLANE.
 *
 * The envelope's `plane` is signed (field 2), so this compares the signed value against
 * the plane the handler declared. A mismatch means someone is trying to route a FORUM
 * envelope into a SIGNAL handler or the reverse — the linkage attack the two-plane design
 * exists to prevent (SEP-02).
 */
export function acceptPlane(domain: string, plane: Plane, registry: DomainRegistry): void {
  const expected = registry.planeFor(domain);
  if (expected === null) {
    throw new EnvelopeRejected(RejectionCode.UNKNOWN_DOMAIN, 'domain is not registered', {
      field: 'domain',
    });
  }
  if (expected !== plane) {
    throw new EnvelopeRejected(
      RejectionCode.PLANE_MISMATCH,
      "envelope plane does not match the domain's plane",
      { field: 'plane' },
    );
  }
}

/** Steps 3-5 in order, as the pipeline runs them. */
export function acceptEnvelopeHeader(env: ParsedEnvelope, registry: DomainRegistry): void {
  acceptVersion(env.version);
  acceptDomain(env.domain, registry);
  acceptPlane(env.domain, env.plane, registry);
}
