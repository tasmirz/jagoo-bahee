/**
 * Operator alerts — findings a human has to see.
 *
 * Separate from `Observability`, which is aggregate-only counters. An alert names a
 * specific peer and a specific finding, because "a peer rewrote its log" is unactionable
 * without knowing which peer (FD-09), and "quota breached" is unactionable without knowing
 * who breached it (FD-16).
 *
 * ── This is the one place peer identity is deliberately recorded ────────────────────
 * `Observability` may never carry an address or a key. An alert may carry a SERVER ID,
 * which is a node operator's public identity, never a user's. The distinction matters:
 * publishing which peers a node federates with is normal federation metadata, and
 * `/v1/federation/peers` already exposes it; publishing which humans use it is not.
 */

export const AlertSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  /** A finding that means a peer is compromised or dishonest. Never auto-resolves. */
  CRITICAL: 'CRITICAL',
} as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export interface OperatorAlert {
  readonly id: string;
  readonly severity: AlertSeverity;
  /** Stable machine-readable code, e.g. `peer.forked`, `peer.demoted`, `outbox.dead-letter`. */
  readonly code: string;
  readonly subject: string;
  readonly detail: string;
  readonly raisedAtMs: number;
}

export abstract class OperatorAlerts {
  abstract raise(alert: Omit<OperatorAlert, 'id'>): Promise<void>;
  abstract list(limit: number): Promise<readonly OperatorAlert[]>;
}
