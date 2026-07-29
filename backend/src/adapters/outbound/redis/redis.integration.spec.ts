import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryPowVerifier } from '../in-memory/in-memory-services.js';
import {
  INTEGRATION_HOOK_TIMEOUT_MS,
  integrationUrl,
} from '../../../testing/integration-env.js';
import { Priority } from '../../../core/domain/envelope.js';
import { RedisCreditLedger } from './redis-services.js';
import { RedisPeerQuotaLimiter } from './redis-federation.js';
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
    const quotaKeys = await redis?.keys(`jb:fedquota:${suffix}*`);
    await redis?.del(
      `jb:credit:key:${suffix}`,
      `jb:cache:feed:${suffix}`,
      `jb:cache-tag:test:${suffix}`,
      ...(quotaKeys ?? []),
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

  /**
   * FD-15 — the byte grant, against the real Lua.
   *
   * The all-or-nothing property is the part only a real server can settle: the in-memory
   * double gets atomicity free from Node's single thread, so it would pass whether the
   * script debits both buckets together or not.
   */
  describe('FD-15 — per-peer byte quota', () => {
    const peer = `${suffix}-bytes`;

    it('refuses an envelope that exceeds bytes_per_min even with envelope tokens to spare', async () => {
      const limiter = new RedisPeerQuotaLimiter(redis);
      const request = {
        peerId: peer,
        priority: Priority.BULK,
        cost: 1,
        perMinute: 1_000,
        bytes: 4_000,
        bytesPerMinute: 5_000,
        nowMs: Date.now(),
      };

      // First fits inside the 5 000-byte grant.
      await expect(limiter.consume(request)).resolves.toMatchObject({ allowed: true });
      // Second would take it to 8 000. Envelope tokens are nowhere near exhausted.
      await expect(limiter.consume(request)).resolves.toMatchObject({ allowed: false });
    });

    it('does not spend an envelope token on a request the byte bucket refused', async () => {
      const limiter = new RedisPeerQuotaLimiter(redis);
      const peerId = `${peer}-atomic`;
      const nowMs = Date.now();

      // One envelope token, and a byte grant far too small for the request.
      await expect(
        limiter.consume({
          peerId,
          priority: Priority.BULK,
          cost: 1,
          perMinute: 1,
          bytes: 10_000,
          bytesPerMinute: 100,
          nowMs,
        }),
      ).resolves.toMatchObject({ allowed: false });

      // The token must still be there: a small envelope now fits. If the refused request
      // had debited it, this would be refused too — a byte breach masquerading as an
      // envelope breach.
      await expect(
        limiter.consume({
          peerId,
          priority: Priority.BULK,
          cost: 1,
          perMinute: 1,
          bytes: 10,
          bytesPerMinute: 100,
          nowMs,
        }),
      ).resolves.toMatchObject({ allowed: true });
    });
  });
});
