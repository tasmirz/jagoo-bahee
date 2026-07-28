/**
 * Redis-backed anti-abuse state. Every mutation is one Lua evaluation: no
 * read-modify-write races, and no TTL-less intermediate keys (AUTH-30).
 */

import type Redis from 'ioredis';
import type { NonceStore } from '../../../core/app/ingress.js';
import { registerRollback, type Tx } from '../../../core/domain/domain-handler.js';
import {
  CreditLedger,
  NullifierRegistry,
  type CreditStatus,
  type CreditSubject,
  type PowChallenge,
  type PowSolution,
  type PowVerifier,
} from '../../../core/ports/anti-abuse.port.js';

const CONSUME_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then current = tonumber(ARGV[1]) else current = tonumber(current) end
local cost = tonumber(ARGV[2])
if cost == 0 then
  return {1, current, redis.call('PTTL', KEYS[1])}
end
if current < cost then
  return {0, current, redis.call('PTTL', KEYS[1])}
end
local remaining = current - cost
redis.call('SET', KEYS[1], remaining, 'PX', ARGV[3])
return {1, remaining, tonumber(ARGV[3])}
`;

const GRANT_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then current = tonumber(ARGV[1]) else current = tonumber(current) end
local remaining = math.min(tonumber(ARGV[2]), current + tonumber(ARGV[3]))
redis.call('SET', KEYS[1], remaining, 'PX', ARGV[4])
return remaining
`;

const CLAIM_LUA = `
if redis.call('SET', KEYS[1], '1', 'NX', 'PX', ARGV[1]) then return 1 end
return 0
`;

export class RedisCreditLedger extends CreditLedger {
  constructor(
    private readonly redis: Redis,
    private readonly pow: PowVerifier,
    private readonly initialBalance = 100,
    private readonly maximumBalance = 1000,
    private readonly ttlMs = 24 * 60 * 60 * 1000,
  ) {
    super();
  }

  private key(subject: CreditSubject): string {
    return `jb:credit:${subject.kind}:${subject.value}`;
  }

  async consume(subject: CreditSubject, cost: number): Promise<CreditStatus> {
    const result = (await this.redis.eval(
      CONSUME_LUA,
      1,
      this.key(subject),
      this.initialBalance,
      cost,
      this.ttlMs,
    )) as [number, number, number];
    return {
      allowed: result[0] === 1,
      remaining: Number(result[1]),
      resetAtMs: Date.now() + Math.max(0, Number(result[2])),
    };
  }

  async issueChallenge(subject: CreditSubject): Promise<PowChallenge> {
    if (subject.kind !== 'key') throw new Error('PoW challenges must be bound to an author key');
    return this.pow.issue(Buffer.from(subject.value, 'hex'));
  }

  async redeem(subject: CreditSubject, solution: PowSolution): Promise<CreditStatus> {
    if (subject.kind !== 'key') throw new Error('PoW redemption must be bound to an author key');
    if (!(await this.pow.verify(Buffer.from(subject.value, 'hex'), solution.solution))) {
      return { allowed: false, remaining: 0, resetAtMs: 0 };
    }
    const remaining = Number(
      await this.redis.eval(
        GRANT_LUA,
        1,
        this.key(subject),
        this.initialBalance,
        this.maximumBalance,
        10,
        this.ttlMs,
      ),
    );
    return { allowed: true, remaining, resetAtMs: Date.now() + this.ttlMs };
  }
}

export class RedisNullifierRegistry extends NullifierRegistry {
  constructor(
    private readonly redis: Redis,
    private readonly ttlMs = 8 * 24 * 60 * 60 * 1000,
  ) {
    super();
  }

  async claim(nullifier: Uint8Array, epoch: number, scope: string): Promise<boolean> {
    const key = `jb:nullifier:${epoch}:${Buffer.from(scope).toString('base64url')}:${Buffer.from(nullifier).toString('hex')}`;
    return Number(await this.redis.eval(CLAIM_LUA, 1, key, this.ttlMs)) === 1;
  }
}

export class RedisNonceStore implements NonceStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlMs = 8 * 24 * 60 * 60 * 1000,
  ) {}

  private key(authorKey: Uint8Array, nonce: Uint8Array): string {
    return `jb:nonce:${Buffer.from(authorKey).toString('hex')}:${Buffer.from(nonce).toString('hex')}`;
  }

  async seen(authorKey: Uint8Array, nonce: Uint8Array): Promise<boolean> {
    if (nonce.length === 0) return false;
    return (await this.redis.exists(this.key(authorKey, nonce))) === 1;
  }

  async reserve(authorKey: Uint8Array, nonce: Uint8Array, tx: Tx): Promise<boolean> {
    if (nonce.length === 0) return true;
    const key = this.key(authorKey, nonce);
    const accepted = (await this.redis.set(key, '1', 'PX', this.ttlMs, 'NX')) === 'OK';
    if (accepted) registerRollback(tx, () => void this.redis.del(key));
    return accepted;
  }
}
