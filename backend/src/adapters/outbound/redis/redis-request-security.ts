import type Redis from 'ioredis';
import {
  RequestSecurity,
  type IpBlock,
  type RequestDecision,
  type RequestSubject,
} from '../../../core/ports/request-security.port.js';
import { OPERATOR_CONFIG_KEY } from './redis-operator-config.js';

const CHECK = `
local addressBlock = redis.call('GET', KEYS[1])
local subnetBlock = redis.call('GET', KEYS[2])
if addressBlock or subnetBlock then return {0, 0, ARGV[2], 1} end
local limit = tonumber(redis.call('HGET', KEYS[4], 'requestLimitPerMinute') or ARGV[1])
local count = redis.call('INCR', KEYS[3])
if count == 1 then redis.call('PEXPIRE', KEYS[3], ARGV[2]) end
local ttl = redis.call('PTTL', KEYS[3])
if count > limit then return {0, 0, ttl, 0} end
return {1, limit - count, ttl, 0}
`;

export class RedisRequestSecurity extends RequestSecurity {
  constructor(
    private readonly redis: Redis,
    private readonly limit = 300,
    private readonly windowMs = 60_000,
  ) {
    super();
  }

  private blockKey(subject: string): string {
    return `jb:request:block:${subject}`;
  }

  async check(subject: RequestSubject): Promise<RequestDecision> {
    const result = (await this.redis.eval(
      CHECK,
      4,
      this.blockKey(subject.address),
      this.blockKey(subject.subnet),
      `jb:request:count:${subject.address}`,
      OPERATOR_CONFIG_KEY,
      this.limit,
      this.windowMs,
    )) as [number, number, number, number];
    return {
      allowed: result[0] === 1,
      remaining: result[1],
      retryAfterMs: Math.max(0, result[2]),
      blocked: result[3] === 1,
    };
  }

  async setLimitPerMinute(value: number): Promise<void> {
    await this.redis.hset(OPERATOR_CONFIG_KEY, 'requestLimitPerMinute', String(value));
  }

  async blocks(): Promise<readonly IpBlock[]> {
    const subjects = await this.redis.smembers('jb:request:blocks');
    const values = await Promise.all(subjects.map((subject) => this.redis.get(this.blockKey(subject))));
    return values.flatMap((value) => (value ? [JSON.parse(value) as IpBlock] : []));
  }

  async block(value: IpBlock): Promise<void> {
    const ttl = value.expiresAtMs === null ? null : Math.max(1, value.expiresAtMs - Date.now());
    const transaction = this.redis.multi();
    transaction.sadd('jb:request:blocks', value.subject);
    if (ttl === null) transaction.set(this.blockKey(value.subject), JSON.stringify(value));
    else transaction.set(this.blockKey(value.subject), JSON.stringify(value), 'PX', ttl);
    await transaction.exec();
  }

  async unblock(subject: string): Promise<void> {
    await this.redis.multi().del(this.blockKey(subject)).srem('jb:request:blocks', subject).exec();
  }
}
