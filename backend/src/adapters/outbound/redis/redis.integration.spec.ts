import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryPowVerifier } from '../in-memory/in-memory-services.js';
import {
  INTEGRATION_HOOK_TIMEOUT_MS,
  integrationUrl,
} from '../../../testing/integration-env.js';
import { RedisCreditLedger } from './redis-services.js';
import { RedisTaggedCache } from './tagged-cache.js';

const url = integrationUrl('REDIS_URL');
const integration = describe.skipIf(!url);

integration('Redis production adapters', () => {
  let redis: Redis;
  const suffix = randomUUID();

  beforeAll(async () => {
    redis = new Redis(url!, { maxRetriesPerRequest: 1 });
    await redis.ping();
  }, INTEGRATION_HOOK_TIMEOUT_MS);

  afterAll(async () => {
    await redis?.del(
      `jb:credit:key:${suffix}`,
      `jb:cache:feed:${suffix}`,
      `jb:cache-tag:test:${suffix}`,
    );
    await redis?.quit();
  });

  it('P1-G6 — 50 concurrent requests against 10 credits succeed exactly 10 times', async () => {
    const ledger = new RedisCreditLedger(redis, new InMemoryPowVerifier(), 10, 10);
    const attempts = await Promise.all(
      Array.from({ length: 50 }, () => ledger.consume({ kind: 'key', value: suffix }, 1)),
    );
    expect(attempts.filter((attempt) => attempt.allowed)).toHaveLength(10);
    await expect(ledger.consume({ kind: 'key', value: suffix }, 0)).resolves.toMatchObject({
      remaining: 0,
    });
  });

  it('T1.33 — tagged invalidation removes only members of the tag set', async () => {
    const cache = new RedisTaggedCache(redis);
    await cache.put(`feed:${suffix}`, { ok: true }, [`test:${suffix}`], 60_000);
    await expect(cache.get(`feed:${suffix}`)).resolves.toEqual({ ok: true });
    await expect(cache.invalidate(`test:${suffix}`)).resolves.toBe(1);
    await expect(cache.get(`feed:${suffix}`)).resolves.toBeNull();
  });
});
