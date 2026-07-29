/**
 * In-memory doubles for the per-peer quota limiter and the operator alert sink (AR-03).
 *
 * The limiter applies the SAME pure transition as the Redis adapter — `consume` from
 * `core/domain/federation/quota.ts`. That is what makes FG-09 a unit test whose result
 * transfers: if the two adapters implemented the arithmetic separately, the double would
 * be testing the double.
 *
 * It is atomic for the same reason the Redis one is, just for free: Node is
 * single-threaded, so the read-decide-write sequence inside `consume` cannot interleave.
 * The Redis adapter has to buy that with a Lua script.
 */

import { consumePair, newBucket, type BucketState } from '../../../core/domain/federation/quota.js';
import {
  PeerQuotaLimiter,
  type QuotaRequest,
  type QuotaVerdict,
} from '../../../core/ports/network.port.js';
import { OperatorAlerts, type OperatorAlert } from '../../../core/ports/alerts.port.js';

export class InMemoryPeerQuotaLimiter extends PeerQuotaLimiter {
  private readonly envelopeBuckets = new Map<string, BucketState>();
  private readonly byteBuckets = new Map<string, BucketState>();

  async consume(request: QuotaRequest): Promise<QuotaVerdict> {
    // A class the peer may not send has a zero rate. Refusing it here rather than treating
    // zero as "unlimited" is the difference between FG-09 passing and being inverted.
    if (request.perMinute <= 0) return { allowed: false, overBy: request.cost };
    if (request.bytesPerMinute <= 0) return { allowed: false, overBy: request.bytes };

    const key = `${request.peerId}|${request.priority}`;
    const decision = consumePair({
      envelopes: this.envelopeBuckets.get(key) ?? newBucket(request.perMinute, request.nowMs),
      bytes: this.byteBuckets.get(key) ?? newBucket(request.bytesPerMinute, request.nowMs),
      envelopeCost: request.cost,
      envelopesPerMinute: request.perMinute,
      byteCost: request.bytes,
      bytesPerMinute: request.bytesPerMinute,
      nowMs: request.nowMs,
    });

    this.envelopeBuckets.set(key, decision.envelopes);
    this.byteBuckets.set(key, decision.bytes);
    return { allowed: decision.allowed, overBy: decision.overBy };
  }
}

/** Bounded, newest-first. An alert list that grows without limit is its own outage. */
export class InMemoryOperatorAlerts extends OperatorAlerts {
  private readonly alerts: OperatorAlert[] = [];
  private sequence = 0;

  constructor(private readonly capacity = 500) {
    super();
  }

  async raise(alert: Omit<OperatorAlert, 'id'>): Promise<void> {
    this.sequence += 1;
    this.alerts.unshift({ ...alert, id: `alert-${this.sequence}` });
    if (this.alerts.length > this.capacity) this.alerts.length = this.capacity;
  }

  async list(limit: number): Promise<readonly OperatorAlert[]> {
    return this.alerts.slice(0, limit);
  }
}
