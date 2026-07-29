import {
  Observability,
  type MetricsSnapshot,
  type ScopeMetric,
} from '../../../core/ports/observability.port.js';

function increment(values: Map<string, number>, key: string): void {
  values.set(key, (values.get(key) ?? 0) + 1);
}

function record(values: Map<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries([...values.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

interface ScopeTally {
  attempts: number;
  successes: number;
  failures: number;
  latencyTotalMs: number;
  latencySamples: number;
  lastOkAtMs: number | null;
}

/** TP-10 — a bounded window. An unbounded transition log on a Raspberry Pi is a memory leak. */
const MAX_TRANSITIONS = 200;

export class InMemoryObservability extends Observability {
  private readonly startedAtMs = Date.now();
  private readonly requests = new Map<string, number>();
  private readonly accepted = new Map<string, number>();
  private readonly rejected = new Map<string, number>();
  private readonly scopes = new Map<string, ScopeTally>();
  private readonly transitions: {
    uplinkId: string;
    from: string;
    to: string;
    atMs: number;
  }[] = [];

  request(method: string, route: string, status: number): void {
    increment(this.requests, `${method.toUpperCase()} ${route} ${status}`);
  }

  ingressAccepted(domain: string): void {
    increment(this.accepted, domain);
  }

  ingressRejected(domain: string, code: string): void {
    increment(this.rejected, `${domain}:${code}`);
  }

  transportAttempt(scope: string, ok: boolean, latencyMs: number | null): void {
    const tally = this.scopes.get(scope) ?? {
      attempts: 0,
      successes: 0,
      failures: 0,
      latencyTotalMs: 0,
      latencySamples: 0,
      lastOkAtMs: null,
    };
    tally.attempts += 1;
    if (ok) {
      tally.successes += 1;
      tally.lastOkAtMs = Date.now();
      // Latency is averaged over SUCCESSES only. Folding a timeout in would make a scope
      // look slow when what it actually is, is unreachable — and those need different fixes.
      if (latencyMs !== null) {
        tally.latencyTotalMs += latencyMs;
        tally.latencySamples += 1;
      }
    } else {
      tally.failures += 1;
    }
    this.scopes.set(scope, tally);
  }

  uplinkTransition(uplinkId: string, from: string, to: string, atMs: number): void {
    this.transitions.push({ uplinkId, from, to, atMs });
    if (this.transitions.length > MAX_TRANSITIONS) this.transitions.shift();
  }

  snapshot(): MetricsSnapshot {
    const scopes: Record<string, ScopeMetric> = {};
    for (const [scope, tally] of [...this.scopes.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      scopes[scope] = {
        attempts: tally.attempts,
        successes: tally.successes,
        failures: tally.failures,
        meanLatencyMs:
          tally.latencySamples === 0
            ? 0
            : Math.round(tally.latencyTotalMs / tally.latencySamples),
        lastOkAtMs: tally.lastOkAtMs,
      };
    }
    return {
      startedAtMs: this.startedAtMs,
      requests: record(this.requests),
      ingressAccepted: record(this.accepted),
      ingressRejected: record(this.rejected),
      scopes,
      uplinkTransitions: [...this.transitions],
    };
  }
}
