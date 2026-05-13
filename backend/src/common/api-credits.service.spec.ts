import { ApiCreditsService } from './api-credits.service'

describe('ApiCreditsService', () => {
  function makeService() {
    const store = new Map<string, string>()
    const redis = {
      getJson: jest.fn(async (key: string) => {
        const raw = store.get(key)
        return raw ? JSON.parse(raw) : null
      }),
      setJson: jest.fn(async (key: string, value: unknown) => {
        store.set(key, JSON.stringify(value))
      }),
      delKeys: jest.fn(async (...keys: string[]) => {
        keys.forEach((key) => store.delete(key))
      })
    }
    return { service: new ApiCreditsService(redis as any), redis }
  }

  it('auto-refills and consumes API credits', async () => {
    const { service } = makeService()
    const first = await service.consume('actor|ip', 5)
    expect(first.credits).toBeLessThan(Number(process.env.API_CREDIT_MAX || 120))

    const status = await service.getStatus('actor|ip')
    expect(status.credits).toBeGreaterThanOrEqual(first.credits)
  })

  it('issues and redeems computational credit challenges', async () => {
    const { service } = makeService()
    const prevDifficulty = process.env.API_CREDIT_POW_DIFFICULTY
    process.env.API_CREDIT_POW_DIFFICULTY = '2'
    const challenge = await service.issueChallenge('actor|ip')
    let nonce = 0
    while (true) {
      const crypto = await import('crypto')
      const hash = crypto.createHash('sha256').update(challenge.challenge + String(nonce)).digest('hex')
      if (hash.startsWith('0'.repeat(challenge.difficulty))) break
      nonce += 1
    }

    const redeemed = await service.redeemChallenge('actor|ip', challenge.challenge, nonce)
    expect(redeemed.credits).toBeGreaterThan(0)
    process.env.API_CREDIT_POW_DIFFICULTY = prevDifficulty
  })
})
