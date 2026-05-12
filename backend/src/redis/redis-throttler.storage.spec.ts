import { RedisThrottlerStorage } from './redis-throttler.storage'

describe('RedisThrottlerStorage', () => {
  function makeStorage() {
    const values = new Map<string, { value: string; expiresAt: number }>()
    const now = 1_000_000
    const client = {
      pttl: jest.fn((key: string) => {
        const entry = values.get(key)
        return Promise.resolve(entry ? Math.max(0, entry.expiresAt - now) : -2)
      }),
      get: jest.fn((key: string) => Promise.resolve(values.get(key)?.value ?? null)),
      incr: jest.fn((key: string) => {
        const next = Number(values.get(key)?.value || 0) + 1
        values.set(key, { value: String(next), expiresAt: values.get(key)?.expiresAt ?? now + 60000 })
        return Promise.resolve(next)
      }),
      pexpire: jest.fn((key: string, ttl: number) => {
        const entry = values.get(key)
        if (entry) values.set(key, { ...entry, expiresAt: now + ttl })
        return Promise.resolve(1)
      }),
      set: jest.fn((key: string, value: string, _px: string, ttl: number) => {
        values.set(key, { value, expiresAt: now + ttl })
        return Promise.resolve('OK')
      })
    }

    return {
      storage: new RedisThrottlerStorage({ getClient: () => client } as any),
      client
    }
  }

  it('uses Redis counters and blocks after the configured limit', async () => {
    const { storage, client } = makeStorage()

    await expect(storage.increment('GET:/auth/challenge:ip', 60000, 2, 30000, 'default')).resolves.toMatchObject({
      totalHits: 1,
      isBlocked: false
    })
    await expect(storage.increment('GET:/auth/challenge:ip', 60000, 2, 30000, 'default')).resolves.toMatchObject({
      totalHits: 2,
      isBlocked: false
    })
    await expect(storage.increment('GET:/auth/challenge:ip', 60000, 2, 30000, 'default')).resolves.toMatchObject({
      totalHits: 3,
      isBlocked: true,
      timeToBlockExpire: 30
    })

    expect(client.set).toHaveBeenCalledWith(expect.stringContaining('jb:throttle:'), '1', 'PX', 30000)
  })
})
