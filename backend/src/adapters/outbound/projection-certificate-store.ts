/**
 * `CertificateStore` backed by the projections written by the certificate handlers.
 *
 * ── Why not a separate certificate table ────────────────────────────────────────────
 * Trust state is derived state. Reading it from the same projections the envelope log
 * rebuilds means `rebuild-projections` reconstructs the instance's entire notion of which
 * keys are certified and which are revoked (P1-G3, ADM-42). A separately-managed table
 * would be a second source of truth, and the first thing to diverge silently after a
 * restore.
 *
 * The port stays read-only (ISP): the pipeline asks whether a key was certified at an
 * instant, and never learns that a handler somewhere writes the answer.
 */

import { CertificateStore, type KeyCertificate, type KeyRevocation } from '../../core/ports/identity.port.js';
import type { ProjectionStore } from '../../core/ports/storage.port.js';
import {
  CERTIFICATES_COLLECTION,
  REVOCATIONS_COLLECTION,
  RevocationKindName,
  type CertificateDoc,
  type RevocationDoc,
} from '../../features/forum/identity/certificate.projection.js';

export class ProjectionCertificateStore extends CertificateStore {
  constructor(private readonly projections: ProjectionStore) {
    super();
  }

  async certificateAt(key: Uint8Array, atMs: number): Promise<KeyCertificate | null> {
    const id = Buffer.from(key).toString('hex');
    const doc = await this.projections
      .collection<CertificateDoc>(CERTIFICATES_COLLECTION)
      .findOne({ id });
    if (!doc) return null;

    // The window is half-open: valid_until is the first instant the certificate no longer
    // covers, which keeps two consecutive certificates from both claiming one millisecond.
    if (atMs < doc.validFromMs || atMs >= doc.validUntilMs) return null;

    const pqAttestation = Buffer.from(doc.pqAttestation, 'base64');
    return {
      key,
      issuedAtMs: doc.certifiedAtMs,
      ...(pqAttestation.length > 0 ? { pqAttestation: new Uint8Array(pqAttestation) } : {}),
    };
  }

  async revocationFor(key: Uint8Array): Promise<KeyRevocation | null> {
    const id = Buffer.from(key).toString('hex');
    const doc = await this.projections
      .collection<RevocationDoc>(REVOCATIONS_COLLECTION)
      .findOne({ id });
    if (!doc) return null;

    return {
      key,
      effectiveFromMs: doc.effectiveFromMs,
      reason: RevocationKindName[doc.kind] ?? 'REVOKED',
    };
  }
}
