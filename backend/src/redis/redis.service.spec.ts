import { RedisService } from './redis.service'

describe('RedisService cache helpers', () => {
  function makeService() {
    const store = new Map<string, string>()
    let scanSnapshot: string[] | null = null
    const service = new RedisService()
    ;(service as any).client = {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: string) => {
        store.set(key, value)
        return Promise.resolve('OK')
      }),
      del: jest.fn((...keys: string[]) => {
        keys.forEach((key) => store.delete(key))
        return Promise.resolve(keys.length)
      }),
      scan: jest.fn((cursor: string) => {
        if (cursor === '0') {
          scanSnapshot = Array.from(store.keys()).filter((key) => key.startsWith('prefix:'))
          return Promise.resolve(['1', scanSnapshot.slice(0, 1)])
        }
        return Promise.resolve(['0', (scanSnapshot ?? []).slice(1)])
      })
    }
    return { service, store }
  }

  it('rememberJson caches loaded values and avoids duplicate loader calls', async () => {
    const { service } = makeService()
    const loader = jest.fn().mockResolvedValue({ ok: true, count: 1n })

    await expect(service.rememberJson('key', 60, loader)).resolves.toEqual({ ok: true, count: 1n })
    await expect(service.rememberJson('key', 60, loader)).resolves.toEqual({ ok: true, count: '1' })

    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('stableStringify sorts object keys and normalizes nested values', () => {
    const { service } = makeService()

    expect(service.stableStringify({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}')
  })

  it('delPattern deletes scanned matching keys', async () => {
    const { service, store } = makeService()
    store.set('prefix:a', '1')
    store.set('prefix:b', '2')
    store.set('other:c', '3')

    await service.delPattern('prefix:*')

    expect(store.has('prefix:a')).toBe(false)
    expect(store.has('prefix:b')).toBe(false)
    expect(store.has('other:c')).toBe(true)
  })
})
