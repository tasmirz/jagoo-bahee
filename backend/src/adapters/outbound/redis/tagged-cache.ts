import type Redis from 'ioredis';
import { TaggedCache } from '../../../core/ports/cache.port.js';

const PUT_LUA = `
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
for i = 2, #KEYS do
  redis.call('SADD', KEYS[i], KEYS[1])
  local currentTtl = redis.call('PTTL', KEYS[i])
  if currentTtl < 0 or currentTtl < tonumber(ARGV[2]) then
    redis.call('PEXPIRE', KEYS[i], ARGV[2])
  end
end
return 1
`;

const INVALIDATE_LUA = `
local keys = redis.call('SMEMBERS', KEYS[1])
for _, key in ipairs(keys) do redis.call('DEL', key) end
redis.call('DEL', KEYS[1])
return #keys
`;

/** T1.33: invalidation walks one tag set; it never scans the keyspace. */
export class RedisTaggedCache extends TaggedCache {
  constructor(private readonly redis: Redis) {
    super();
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(`jb:cache:${key}`);
    return value === null ? null : (JSON.parse(value) as T);
  }

  async put(key: string, value: unknown, tags: readonly string[], ttlMs: number): Promise<void> {
    await this.redis.eval(
      PUT_LUA,
      1 + tags.length,
      `jb:cache:${key}`,
      ...tags.map((tag) => `jb:cache-tag:${tag}`),
      JSON.stringify(value),
      ttlMs,
    );
  }

  async invalidate(tag: string): Promise<number> {
    return Number(await this.redis.eval(INVALIDATE_LUA, 1, `jb:cache-tag:${tag}`));
  }
}
