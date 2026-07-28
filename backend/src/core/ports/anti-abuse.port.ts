/**
 * Anti-abuse ports.
 *
 * ── The load-bearing constraint ──────────────────────────────────────────────────────
 * Every one of these must work against a FULLY ANONYMOUS actor. Requiring identity to stop
 * spam hands the adversary a censorship lever, which in this threat model is worse than
 * the spam. Cost — memory-hard PoW, credits, blind credentials, epoch nullifiers — is the
 * anti-abuse primitive, not identity (VIS-07).
 *
 * A check-in costs zero credits and needs no credential. Telling people you are alive is
 * never rate-limited.
 */

export interface CreditSubject {
  /** Never a User-Agent, and never a raw XFF hop (T1.17, P1-G4/G5). */
  readonly kind: 'key' | 'nullifier' | 'peer';
  readonly value: string;
}

export interface CreditStatus {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAtMs: number;
}

export interface PowChallenge {
  /** Stateless HMAC challenge — the server stores nothing, so 10^5 challenges cost 0 bytes. */
  readonly challenge: Uint8Array;
  readonly difficulty: number;
  readonly expiresAtMs: number;
  readonly algorithm?: 'argon2id';
  readonly memoryKiB?: number;
  readonly iterations?: number;
  readonly parallelism?: number;
  readonly boundTo?: Uint8Array;
}

export interface PowSolution {
  readonly challenge: Uint8Array;
  readonly solution: Uint8Array;
}

/**
 * Verifies an opaque proof carried in `Envelope.anti_abuse.pow`.
 *
 * The envelope deliberately carries a byte string rather than a server session ID: a
 * stateless HMAC challenge can be verified by any node after store-and-forward, without
 * allocating memory per request (AB-04 / P1-G9).
 */
export abstract class PowVerifier {
  abstract issue(authorKey: Uint8Array): Promise<PowChallenge>;
  abstract verify(authorKey: Uint8Array, proof: Uint8Array): Promise<boolean>;
}

export abstract class CreditLedger {
  /**
   * MUST be one atomic Redis Lua script. Read-modify-write and INCR-then-PEXPIRE are both
   * forbidden: 50 concurrent requests against 10 credits must yield exactly 10 successes
   * (P1-G6).
   */
  abstract consume(subject: CreditSubject, cost: number): Promise<CreditStatus>;
  abstract issueChallenge(subject: CreditSubject): Promise<PowChallenge>;
  abstract redeem(subject: CreditSubject, solution: PowSolution): Promise<CreditStatus>;
}

export abstract class NullifierRegistry {
  /** False if already claimed this epoch. One claim per (nullifier, epoch, scope). */
  abstract claim(nullifier: Uint8Array, epoch: number, scope: string): Promise<boolean>;
}

export abstract class CredentialIssuer {
  /** Blind signature: the issued credential must be unlinkable to the issuing session. */
  abstract issue(blinded: Uint8Array): Promise<Uint8Array>;
  abstract verify(credential: Uint8Array): Promise<boolean>;
  abstract parameters(): Promise<{ readonly n: string; readonly e: string; readonly width: number }>;
}
