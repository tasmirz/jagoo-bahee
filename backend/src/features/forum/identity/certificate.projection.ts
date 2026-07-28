/**
 * Key certificate and revocation projection (T1.9, T1.10, AUTH-13 … AUTH-16).
 *
 * ── Certificates are DERIVED state, like everything else ────────────────────────────
 * They are projected from `jb:key:certify:*:v1` envelopes, so `rebuild-projections`
 * reconstructs the entire trust state of the instance from the log alone (P1-G3). The
 * alternative — a separately-managed certificate table — would be a second source of truth
 * that a rebuild could not reproduce, and the first thing to silently diverge.
 *
 * ── KY-01: revocation is never retroactive ──────────────────────────────────────────
 * A revocation row records the instant it takes effect and nothing else. Content signed
 * before that instant stays valid forever. If revoking erased history, then coercing
 * someone into revoking their key would become a way to retroactively delete everything
 * they ever wrote — which is precisely the censorship primitive this system exists to deny.
 */

export const CERTIFICATES_COLLECTION = 'forum_key_certificates';
export const REVOCATIONS_COLLECTION = 'forum_key_revocations';

export interface CertificateDoc {
  /** Author public key, hex. One current certificate per key. */
  readonly id: string;
  readonly plane: number;
  readonly deviceKey: string;
  /** ML-DSA-44 public key, base64. Verified once, then cached (ADR-003 §3). */
  readonly pqKey: string;
  readonly pqAttestation: string;
  readonly validFromMs: number;
  readonly validUntilMs: number;
  readonly selfSignature: string;
  /** content ID of the certifying envelope — provenance for the audit view. */
  readonly contentId: string;
  readonly certifiedAtMs: number;
}

/** Plans/01 §6 `RevocationKind`. */
export const RevocationKind = {
  UNSPECIFIED: 0,
  ROTATE: 1,
  COMPROMISE: 2,
  DURESS: 3,
  RETIRE: 4,
} as const;

export interface RevocationDoc {
  /** Revoked public key, hex. */
  readonly id: string;
  readonly plane: number;
  readonly revokedKey: string;
  readonly kind: number;
  /** Content created at or after this instant is rejected; earlier content stays valid. */
  readonly effectiveFromMs: number;
  /** ROTATE: the successor inherits standing. Empty otherwise. */
  readonly replacementKey: string;
  readonly contentId: string;
  readonly revokedAtMs: number;
}

export const RevocationKindName: Record<number, string> = {
  0: 'UNSPECIFIED',
  1: 'ROTATE',
  2: 'COMPROMISE',
  3: 'DURESS',
  4: 'RETIRE',
};
