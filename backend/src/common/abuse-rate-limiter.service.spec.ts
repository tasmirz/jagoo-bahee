import { HttpException } from '@nestjs/common'
import { AbuseRateLimiterService } from './abuse-rate-limiter.service'

describe('AbuseRateLimiterService', () => {
  function makeService() {
    const counts = new Map<string, number>()
    const client = {
      incr: jest.fn(async (key: string) => {
        const next = (counts.get(key) || 0) + 1
        counts.set(key, next)
        return next
      }),
      pexpire: jest.fn(async () => 1)
    }
    const service = new AbuseRateLimiterService({ getClient: () => client } as any, { collection: jest.fn() } as any)
    return { service, client }
  }

  it('blocks after the configured shared bucket limit', async () => {
    const { service, client } = makeService()

    await service.hit('auth-submit', 'ip|ua|pubkey', 2, 60_000)
    await service.hit('auth-submit', 'ip|ua|pubkey', 2, 60_000)
    await expect(service.hit('auth-submit', 'ip|ua|pubkey', 2, 60_000)).rejects.toBeInstanceOf(HttpException)

    expect(client.pexpire).toHaveBeenCalledTimes(1)
  })

  it('uses separate buckets for different subjects', async () => {
    const { service } = makeService()

    await service.hit('message-send', 'actor-a|ip', 1, 60_000)
    await service.hit('message-send', 'actor-b|ip', 1, 60_000)

    await expect(service.hit('message-send', 'actor-a|ip', 1, 60_000)).rejects.toBeInstanceOf(HttpException)
  })

  it('fails closed in production when Redis is unavailable', async () => {
    const previousEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const service = new AbuseRateLimiterService({
      getClient: () => {
        throw new Error('redis down')
      }
    } as any, { collection: jest.fn() } as any)

    await expect(service.hit('auth-submit', 'subject', 1, 60_000)).rejects.toThrow('Rate limiter unavailable')
    process.env.NODE_ENV = previousEnv
  })
})
