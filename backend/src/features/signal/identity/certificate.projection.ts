import type { Plane } from '../../../core/domain/envelope.js';

/** ADR-012 / AC-12: physically separate from every Forum identity collection. */
export const SIGNAL_CERTIFICATES_COLLECTION = 'signal_key_certificates';
export const SIGNAL_REVOCATIONS_COLLECTION = 'signal_key_revocations';

export interface SignalCertificateDoc {
  readonly id: string;
  readonly plane: Plane;
  readonly deviceKey: string;
  readonly pqKey: string;
  readonly pqAttestation: string;
  readonly validFromMs: number;
  readonly validUntilMs: number;
  readonly selfSignature: string;
  readonly contentId: string;
  readonly certifiedAtMs: number;
}

export interface SignalRevocationDoc {
  readonly id: string;
  readonly plane: Plane;
  readonly revokedKey: string;
  readonly kind: number;
  readonly effectiveFromMs: number;
  readonly replacementKey: string;
  readonly contentId: string;
  readonly revokedAtMs: number;
}
