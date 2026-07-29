/**
 * ── TP-02: the per-scope metric is a GATE, not a dashboard nicety ────────────────────
 * "The node MUST export a metric per scope (attempts, successes, latency) so operators can
 * see that the narrow paths are actually being used, not silently failing over to GLOBAL."
 * TG-03 is that assertion: the selector demonstrably prefers `ISP_LOCAL` over `NATIONAL`
 * when both are alive, and the metric is what makes "demonstrably" mean something. Without
 * it, a path selector that had quietly stopped preferring the narrow scope would look
 * identical to one that had not — everything would still work, over the wrong link, until
 * the day the wrong link was the one that died.
 */

export interface ScopeMetric {
  readonly attempts: number;
  readonly successes: number;
  readonly failures: number;
  /** Mean over successful dials only; a timeout's latency is not a latency. */
  readonly meanLatencyMs: number;
  readonly lastOkAtMs: number | null;
}

export interface MetricsSnapshot {
  readonly startedAtMs: number;
  readonly requests: Readonly<Record<string, number>>;
  readonly ingressAccepted: Readonly<Record<string, number>>;
  readonly ingressRejected: Readonly<Record<string, number>>;
  /** TP-02 — keyed by `ReachabilityScope`. */
  readonly scopes: Readonly<Record<string, ScopeMetric>>;
  /** TP-10 — "the IX went down at 03:14" is operationally critical information. */
  readonly uplinkTransitions: readonly {
    readonly uplinkId: string;
    readonly from: string;
    readonly to: string;
    readonly atMs: number;
  }[];
}

/**
 * Aggregate-only telemetry. Callers may pass route templates, domains, typed error codes,
 * scopes and uplink ids, but never addresses, identity keys, content, tokens, or message
 * metadata. An uplink id is an operator's own label for their own interface; a peer address
 * is a targeting signal, and it does not appear here.
 */
export abstract class Observability {
  abstract request(method: string, route: string, status: number): void;
  abstract ingressAccepted(domain: string): void;
  abstract ingressRejected(domain: string, code: string): void;
  /** TP-02 — one call per dial attempt, whatever its outcome. */
  abstract transportAttempt(scope: string, ok: boolean, latencyMs: number | null): void;
  /** TP-10 — logged AND exported; a transition nobody can see is a transition nobody fixes. */
  abstract uplinkTransition(uplinkId: string, from: string, to: string, atMs: number): void;
  abstract snapshot(): MetricsSnapshot;
}
