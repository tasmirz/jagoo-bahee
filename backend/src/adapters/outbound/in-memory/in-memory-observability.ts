import {
  Observability,
  type MetricsSnapshot,
} from '../../../core/ports/observability.port.js';

function increment(values: Map<string, number>, key: string): void {
  values.set(key, (values.get(key) ?? 0) + 1);
}

function record(values: Map<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries([...values.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export class InMemoryObservability extends Observability {
  private readonly startedAtMs = Date.now();
  private readonly requests = new Map<string, number>();
  private readonly accepted = new Map<string, number>();
  private readonly rejected = new Map<string, number>();

  request(method: string, route: string, status: number): void {
    increment(this.requests, `${method.toUpperCase()} ${route} ${status}`);
  }

  ingressAccepted(domain: string): void {
    increment(this.accepted, domain);
  }

  ingressRejected(domain: string, code: string): void {
    increment(this.rejected, `${domain}:${code}`);
  }

  snapshot(): MetricsSnapshot {
    return {
      startedAtMs: this.startedAtMs,
      requests: record(this.requests),
      ingressAccepted: record(this.accepted),
      ingressRejected: record(this.rejected),
    };
  }
}
