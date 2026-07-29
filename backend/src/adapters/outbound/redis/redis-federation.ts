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
import {
  PeerQuotaLimiter,
  type QuotaRequest,
  type QuotaVerdict,
} from '../../../core/ports/network.port.js';
import { OperatorAlerts, type OperatorAlert } from '../../../core/ports/alerts.port.js';

/**
 * Two continuous-refill token buckets — envelopes and bytes — decided and spent together.
 *
 * KEYS[1] envelope tokens · KEYS[2] envelope last-refill
 * KEYS[3] byte tokens     · KEYS[4] byte last-refill
 * ARGV[1] perMinute · ARGV[2] cost · ARGV[3] bytesPerMinute · ARGV[4] byteCost
 * ARGV[5] nowMs     · ARGV[6] ttlMs
 *
 * Returns `{allowed, overByMilliTokens}`.
 *
 * ── Why one script and not two ──────────────────────────────────────────────────────
 * FD-15 grants both allowances and a peer is over quota if it exceeds either, so the two
 * decisions are one decision. Running them as separate scripts would debit the envelope
 * bucket before discovering the byte bucket refuses, and a peer sending oversized envelopes
 * would burn its envelope allowance on requests that were never admitted — turning a byte
 * breach into an envelope breach and telling the peer to slow down when it should be
 * sending less. Nothing is debited unless both pass.
 *
 * Tokens are carried as thousandths because Lua numbers are doubles and Redis returns
 * integers — scaling keeps the fractional refill a peer earns between two envelopes, which
 * at 120/min is 0.5 tokens per second and would otherwise round away to nothing.
 */
const QUOTA_LUA = `
local now = tonumber(ARGV[5])
local ttl = tonumber(ARGV[6])

local function bucket(tokensKey, atKey, perMinute, cost)
  local capacity = perMinute * 1000
  local tokens = tonumber(redis.call('GET', tokensKey))
  local last = tonumber(redis.call('GET', atKey))
  if tokens == nil then tokens = capacity end
  if last == nil then last = now end
  if now > last then
    tokens = math.min(capacity, tokens + ((now - last) / 60000) * capacity)
  end
  return tokens, math.max(0, cost - tokens)
end

local envCost = tonumber(ARGV[2]) * 1000
local byteCost = tonumber(ARGV[4]) * 1000
local envTokens, envShort = bucket(KEYS[1], KEYS[2], tonumber(ARGV[1]), envCost)
local byteTokens, byteShort = bucket(KEYS[3], KEYS[4], tonumber(ARGV[3]), byteCost)

local allowed = 0
local overBy = math.max(envShort, byteShort)
if envShort == 0 and byteShort == 0 then
  allowed = 1
  envTokens = envTokens - envCost
  byteTokens = byteTokens - byteCost
end

-- The refilled timestamps are written even on refusal: time passing is not something a
-- refusal should undo, or a rejected peer would never accrue its way back to allowed.
redis.call('SET', KEYS[1], math.floor(envTokens), 'PX', ttl)
redis.call('SET', KEYS[2], now, 'PX', ttl)
redis.call('SET', KEYS[3], math.floor(byteTokens), 'PX', ttl)
redis.call('SET', KEYS[4], now, 'PX', ttl)
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

  async consume(request: QuotaRequest): Promise<QuotaVerdict> {
    // A class this peer may not send has a zero rate. Treating zero as "unlimited" would
    // invert FG-09 — a PROBATION peer's BULK envelopes would be admitted, not refused.
    if (request.perMinute <= 0) return { allowed: false, overBy: request.cost };
    if (request.bytesPerMinute <= 0) return { allowed: false, overBy: request.bytes };

    const prefix = `jb:fedquota:${request.peerId}:${request.priority}`;
    const result = (await this.redis.eval(
      QUOTA_LUA,
      4,
      `${prefix}:tokens`,
      `${prefix}:at`,
      `${prefix}:bytes`,
      `${prefix}:bytesat`,
      String(request.perMinute),
      String(request.cost),
      String(request.bytesPerMinute),
      String(request.bytes),
      String(request.nowMs),
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
