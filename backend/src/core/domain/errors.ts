/**
 * The typed rejection contract (Plans/02-CONTRACTS-CORE.md §6).
 *
 * Every pipeline step rejects with one of these codes and nothing else. A bare `throw new
 * Error("bad")` from a step is a defect: the code is what the client, the federation peer
 * and the metrics all key on.
 *
 * ── ER-02, and why the detail strings look terse ─────────────────────────────────────
 * An error MUST NOT reveal whether a key exists, what a user's other content is, or any
 * cross-plane information. That constraint is why `NO_CERTIFICATE` says only that the
 * author is uncertified and never "no certificate for key jbk1…" — the latter turns the
 * write endpoint into an oracle for whether a given identity is known to this node, which
 * under a shutdown is exactly the question an adversary is asking.
 */

export const RejectionCode = {
  UNKNOWN_VERSION: 'UNKNOWN_VERSION',
  UNKNOWN_DOMAIN: 'UNKNOWN_DOMAIN',
  PLANE_MISMATCH: 'PLANE_MISMATCH',
  MALFORMED: 'MALFORMED',
  ALG_NOT_PERMITTED: 'ALG_NOT_PERMITTED',
  PRIORITY_MISMATCH: 'PRIORITY_MISMATCH',
  CLOCK_SKEW: 'CLOCK_SKEW',
  BAD_SIGNATURE: 'BAD_SIGNATURE',
  NO_CERTIFICATE: 'NO_CERTIFICATE',
  KEY_REVOKED: 'KEY_REVOKED',
  DUPLICATE: 'DUPLICATE',
  REPLAY: 'REPLAY',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  NULLIFIER_SPENT: 'NULLIFIER_SPENT',
  CREDENTIAL_INVALID: 'CREDENTIAL_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  BODY_INVALID: 'BODY_INVALID',
  TOO_LARGE: 'TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  TRANSPORT_UNSUPPORTED: 'TRANSPORT_UNSUPPORTED',
} as const;
export type RejectionCode = (typeof RejectionCode)[keyof typeof RejectionCode];

/** Codes a client can do something about, and what it should do. */
const RETRYABLE: ReadonlySet<RejectionCode> = new Set([
  RejectionCode.CLOCK_SKEW,
  RejectionCode.INSUFFICIENT_CREDITS,
  RejectionCode.NULLIFIER_SPENT,
  RejectionCode.CREDENTIAL_INVALID,
  RejectionCode.NO_CERTIFICATE,
  RejectionCode.RATE_LIMITED,
  RejectionCode.TRANSPORT_UNSUPPORTED,
]);

export interface RejectionDetail {
  /** Offending field path, when applicable. */
  readonly field?: string;
  readonly retryAfterMs?: number;
  readonly challenge?: {
    readonly challenge: Uint8Array;
    readonly difficulty: number;
    readonly expiresAtMs: number;
    readonly algorithm?: 'argon2id';
    readonly memoryKiB?: number;
    readonly iterations?: number;
    readonly parallelism?: number;
    readonly boundTo?: Uint8Array;
  };
}

export class EnvelopeRejected extends Error {
  readonly code: RejectionCode;
  readonly field: string | undefined;
  readonly retryAfterMs: number | undefined;
  readonly challenge: RejectionDetail['challenge'];

  constructor(code: RejectionCode, detail: string, extra: RejectionDetail = {}) {
    super(detail);
    this.name = 'EnvelopeRejected';
    this.code = code;
    this.field = extra.field;
    this.retryAfterMs = extra.retryAfterMs;
    this.challenge = extra.challenge;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

export function isRejection(e: unknown): e is EnvelopeRejected {
  return e instanceof EnvelopeRejected;
}
