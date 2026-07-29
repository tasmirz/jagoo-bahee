/**
 * Redis-backed per-peer quota buckets and operator alerts (T2.10, FD-15, FD-16).
 *
 * ── One Lua evaluation per decision, and that is not negotiable ─────────────────────
 * CLAUDE.md §5.5 bans read-modify-write on any counter. A quota is the counter where
 * losing that race matters most: two concurrent `Deliver` streams from the same peer would
 * each GET the same remaining allowance, each decide it was sufficient, and each SET it
 * back — so a peer gets double its grant precisely when it is pushing hardest. Refilling,
 * deciding and spending happen inside the script, atomically, or they are not a quota.
 *
 * `INCR`-then-`PEXPIRE` is banned for the same class of reason: the window between the two
 * leaves a key with no TTL, and a crash there leaks a bucket that never refills.
 */

import type Redis from 'ioredis';
import type { Priority } from '../../../core/domain/envelope.js';
import { PeerQuotaLimiter, type QuotaVerdict } from '../../../core/ports/network.port.js';
import { OperatorAlerts, type OperatorAlert } from '../../../core/ports/alerts.port.js';

/**
 * Continuous-refill token bucket.
 *
 * KEYS[1] tokens · KEYS[2] last-refill timestamp
 * ARGV[1] perMinute · ARGV[2] cost · ARGV[3] nowMs · ARGV[4] ttlMs
 *
 * Returns `{allowed, overByMilliTokens}`. Tokens are carried as thousandths because Lua
 * numbers are doubles and Redis returns integers — scaling keeps the fractional refill a
 * peer earns between two envelopes, which at 120/min is 0.5 tokens per second and would
 * otherwise round away to nothing.
 */
const QUOTA_LUA = `
local perMinute = tonumber(ARGV[1])
local cost = tonumber(ARGV[2]) * 1000
local now = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local capacity = perMinute * 1000

local tokens = tonumber(redis.call('GET', KEYS[1]))
local last = tonumber(redis.call('GET', KEYS[2]))
if tokens == nil then tokens = capacity end
if last == nil then last = now end

if now > last then
  tokens = math.min(capacity, tokens + ((now - last) / 60000) * capacity)
end

local allowed = 0
local overBy = 0
if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
else
  overBy = cost - tokens
end

redis.call('SET', KEYS[1], math.floor(tokens), 'PX', ttl)
redis.call('SET', KEYS[2], now, 'PX', ttl)
return {allowed, math.floor(overBy)}
`;

export class RedisPeerQuotaLimiter extends PeerQuotaLimiter {
  constructor(
    private readonly redis: Redis,
    /** Long enough that an idle peer's bucket is simply refilled from full on return. */
    private readonly ttlMs = 10 * 60 * 1000,
  ) {
    super();
  }

  async consume(
    peerId: string,
    priority: Priority,
    cost: number,
    perMinute: number,
    nowMs: number,
  ): Promise<QuotaVerdict> {
    // A class this peer may not send has a zero rate. Treating zero as "unlimited" would
    // invert FG-09 — a PROBATION peer's BULK envelopes would be admitted, not refused.
    if (perMinute <= 0) return { allowed: false, overBy: cost };

    const result = (await this.redis.eval(
      QUOTA_LUA,
      2,
      `jb:fedquota:${peerId}:${priority}:tokens`,
      `jb:fedquota:${peerId}:${priority}:at`,
      String(perMinute),
      String(cost),
      String(nowMs),
      String(this.ttlMs),
    )) as [number, number];

    return { allowed: result[0] === 1, overBy: result[1] / 1000 };
  }
}

/**
 * Alerts in a capped Redis list, so they survive a restart.
 *
 * FD-09 findings in particular must not be lost by the very restart a tampered peer might
 * provoke — an alert that only lives in process memory is an alert an attacker can clear.
 */
export class RedisOperatorAlerts extends OperatorAlerts {
  private static readonly KEY = 'jb:alerts';

  constructor(
    private readonly redis: Redis,
    private readonly capacity = 500,
  ) {
    super();
  }

  async raise(alert: Omit<OperatorAlert, 'id'>): Promise<void> {
    const id = `${alert.raisedAtMs}-${alert.code}-${alert.subject}`;
    await this.redis
      .multi()
      .lpush(RedisOperatorAlerts.KEY, JSON.stringify({ ...alert, id }))
      .ltrim(RedisOperatorAlerts.KEY, 0, this.capacity - 1)
      .exec();
  }

  async list(limit: number): Promise<readonly OperatorAlert[]> {
    const rows = await this.redis.lrange(RedisOperatorAlerts.KEY, 0, Math.max(0, limit - 1));
    const alerts: OperatorAlert[] = [];
    for (const row of rows) {
      try {
        alerts.push(JSON.parse(row) as OperatorAlert);
      } catch {
        // A corrupt row must not hide the rest of the operator's alerts.
      }
    }
    return alerts;
  }
}
