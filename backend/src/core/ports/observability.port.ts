export interface MetricsSnapshot {
  readonly startedAtMs: number;
  readonly requests: Readonly<Record<string, number>>;
  readonly ingressAccepted: Readonly<Record<string, number>>;
  readonly ingressRejected: Readonly<Record<string, number>>;
}

/**
 * Aggregate-only telemetry. Callers may pass route templates, domains, and typed error
 * codes, but never addresses, identity keys, content, tokens, or message metadata.
 */
export abstract class Observability {
  abstract request(method: string, route: string, status: number): void;
  abstract ingressAccepted(domain: string): void;
  abstract ingressRejected(domain: string, code: string): void;
  abstract snapshot(): MetricsSnapshot;
}
