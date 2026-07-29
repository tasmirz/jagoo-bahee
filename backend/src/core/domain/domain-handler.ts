/**
 * The extension point (Plans/07-ARCHITECTURE.md §3, CLAUDE.md §4.3).
 *
 * Adding a content type adds a `DomainHandler` and a registry row. It does not add a
 * branch anywhere. If implementing a feature seems to require editing the pipeline, the
 * registry row or the body schema is wrong — that is the Open/Closed test this design is
 * built around, and `registry.spec.ts` asserts it by registering a handler for a domain
 * the core has never heard of.
 *
 * The four methods are separated by *when they may touch the world*, not by convenience:
 *   validate    pure, no I/O at all — unit-testable with nothing wired up
 *   authorize   reads projections, writes nothing
 *   project     writes, inside the same transaction as the log append (steps 16/17)
 *   afterCommit side effects that must not be able to roll the transaction back
 */

import type { ParsedEnvelope, Plane } from './envelope.js';

export interface ValidationOk {
  readonly ok: true;
}
export interface ValidationFailure {
  readonly ok: false;
  readonly reason: string;
  readonly field?: string;
}
export type ValidationResult = ValidationOk | ValidationFailure;

export const valid: ValidationResult = { ok: true };
export function invalid(reason: string, field?: string): ValidationResult {
  return field === undefined ? { ok: false, reason } : { ok: false, reason, field };
}

export interface AuthAllowed {
  readonly allowed: true;
}
export interface AuthDenied {
  readonly allowed: false;
  readonly reason: string;
}
export type AuthDecision = AuthAllowed | AuthDenied;

export const allowed: AuthDecision = { allowed: true };
export function denied(reason: string): AuthDecision {
  return { allowed: false, reason };
}

/**
 * A transaction handle. Opaque to the core on purpose — the core must not learn that the
 * store is Mongo, only that writes can be grouped atomically (AR-01).
 */
export interface Tx {
  readonly id: string;
  /** Adapter-owned session/transaction context. The core never interprets it. */
  readonly context?: unknown;
}

/**
 * Lets an in-memory double honour rollback semantics without leaking a database driver
 * into the core. Mongo adapters ignore this and use the session in `Tx.context`.
 */
export interface RollbackHooks {
  onRollback(action: () => void): void;
}

export function registerRollback(tx: Tx, action: () => void): void {
  const hooks = tx.context as Partial<RollbackHooks> | undefined;
  hooks?.onRollback?.(action);
}

/**
 * Provenance the pipeline knows and the envelope cannot carry.
 *
 * The context CLAUDE.md §4.3 has always shown in the `DomainHandler` sketch. It exists for
 * exactly one kind of question: "which node did this originate on?"
 *
 * ── Why an identifier can need this ────────────────────────────────────────────────
 * A community ID is `<name>@<origin_fp>` and Plans/02 §7 requires it to be STABLE ACROSS
 * NODES. The origin fingerprint is a server key, and no field of the signed envelope names
 * a server — so a receiving node that derived it from ITS OWN key would project the same
 * community under a different ID than the one every post's `scope` refers to. That is not
 * a cosmetic mismatch: it is the community becoming unreachable the moment it federates,
 * and it is the exact class of defect ID-01 exists to catch.
 *
 * This is provenance, never content. It is not signed, never re-encoded, and never
 * influences whether an envelope is valid — only how a projection is keyed. See ADR-010
 * for the multi-hop limitation and the contract change that removes it.
 */
export interface HandlerContext {
  /** `jbs1…` — this node for a local publish, the delivering peer for a federated one. */
  readonly originServerId: string;
}

export interface DomainHandler<TBody = unknown> {
  readonly domain: string;
  readonly plane: Plane;

  /** Pure. No clock, no random, no I/O. */
  validate(body: TBody, env: ParsedEnvelope): ValidationResult;

  /** Reads projections; writes nothing. */
  authorize(body: TBody, env: ParsedEnvelope, ctx?: HandlerContext): Promise<AuthDecision>;

  /** Writes, in the same transaction as the witness-log append. */
  project(body: TBody, env: ParsedEnvelope, tx: Tx, ctx?: HandlerContext): Promise<void>;

  /** Notifications, fanout hints. Must not be able to roll the transaction back. */
  afterCommit?(body: TBody, env: ParsedEnvelope): Promise<void>;

  /** Decode the opaque body bytes into this domain's typed body. */
  decode(body: Uint8Array): TBody;
}
