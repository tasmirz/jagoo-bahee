/**
 * Pipeline steps 9 and 10 — SIGNATURE and CERTIFICATE.
 *
 * Step 9 verifies over the canonical bytes of fields 1..12 — the same bytes the content ID
 * hashes, produced by the same encoder that Rust and Python agree with byte-for-byte
 * (P0-G1). There is exactly one accepted form. No fallback chain, nothing to "also try":
 * that ambiguity IS the v1 signature-confusion bug.
 *
 * Step 10 is separated from step 9 because they answer different questions. Step 9 asks
 * "did this key sign these bytes"; step 10 asks "was this key allowed to, at that moment".
 *
 * Specification: Plans/02-CONTRACTS-CORE.md §5, Plans/01-IDENTITY-PLANES.md §6
 */

import type { SignatureVerifier, CertificateStore } from '../../ports/identity.port.js';
import type { ParsedEnvelope } from '../envelope.js';
import { EnvelopeRejected, RejectionCode } from '../errors.js';

/** Step 9 — SIGNATURE. Pure given the verifier; no I/O. */
export function acceptSignature(
  env: ParsedEnvelope,
  canonical: Uint8Array,
  verifier: SignatureVerifier,
): void {
  const ok = verifier.verify(env.keyAlg, env.authorKey, canonical, env.signature);
  if (!ok) {
    throw new EnvelopeRejected(RejectionCode.BAD_SIGNATURE, 'signature verification failed', {
      field: 'signature',
    });
  }
}

/**
 * Step 10 — CERTIFICATE.
 *
 * ── KY-01: revocation is NOT retroactive ────────────────────────────────────────────
 * Content signed BEFORE `effective_from_ms` stays valid. If revoking a key invalidated
 * everything it ever signed, rotating a key would erase a person's entire history — and
 * worse, coercing someone into revoking would become a tool for retroactively deleting
 * their posts. So a revocation only bites content created at or after the instant it
 * takes effect.
 */
export async function acceptCertificate(
  env: ParsedEnvelope,
  store: CertificateStore,
  requiresCertificate = true,
): Promise<void> {
  // Certificate publication is the one bootstrap exception. The generated registry, not
  // a domain string branch, declares it; its handler validates the self-signature and PQ
  // attestation before the certificate is persisted (ADR-004).
  if (!requiresCertificate) return;

  const createdAt = Number(env.createdAtMs);

  const certificate = await store.certificateAt(env.plane, env.authorKey, createdAt);
  if (!certificate) {
    // ER-02: says nothing about whether this key is known to the node. Naming the key would
    // turn the write endpoint into an oracle for which identities exist here.
    throw new EnvelopeRejected(RejectionCode.NO_CERTIFICATE, 'author key is not certified');
  }

  const revocation = await store.revocationFor(env.plane, env.authorKey);
  if (revocation && createdAt >= revocation.effectiveFromMs) {
    throw new EnvelopeRejected(RejectionCode.KEY_REVOKED, 'author key was revoked');
  }
}
