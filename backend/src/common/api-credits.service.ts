import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { createHash, randomBytes } from 'crypto'
import { RedisService } from 'src/redis/redis.service'

export interface CreditStatus {
  subject: string
  credits: number
  maxCredits: number
  refillPerMinute: number
}

export interface CreditChallenge {
  challenge: string
  difficulty: number
  algorithm: string
}

export interface CreditEarningMechanism {
  readonly name: string
  issue?(subject: string): Promise<CreditChallenge>
  redeem?(subject: string, payload: Record<string, unknown>): Promise<number>
  applyAutomatic?(status: CreditStatus, stored: { credits: number; updatedAt: number }, now: number): CreditStatus
}

@Injectable()
export class ApiCreditsService {
  private readonly autoRefillMechanism: CreditEarningMechanism = {
    name: 'time-refill',
    applyAutomatic: (status, stored, now) => {
      const elapsedMinutes = Math.max(0, (now - Number(stored.updatedAt || now)) / 60000)
      return {
        ...status,
        credits: Math.min(status.maxCredits, Number(stored.credits || 0) + elapsedMinutes * status.refillPerMinute)
      }
    }
  }

  private readonly proofOfWorkMechanism: CreditEarningMechanism = {
    name: 'sha256-leading-zeroes',
    issue: async (subject) => {
      const challenge = randomBytes(24).toString('base64url')
      const difficulty = await this.currentDifficulty(subject)
      await this.redis.setJson(this.challengeKey(challenge), { subject, difficulty }, 5 * 60)
      return { challenge, difficulty, algorithm: 'sha256(challenge + nonce) has leading zero hex digits' }
    },
    redeem: async (subject, payload) => {
      const challenge = String(payload.challenge || '')
      const nonce = Number(payload.nonce)
      const stored = await this.redis.getJson<{ subject: string; difficulty: number }>(this.challengeKey(challenge))
      if (!stored || stored.subject !== subject) throw new HttpException('Invalid credit challenge', HttpStatus.BAD_REQUEST)
      const hash = createHash('sha256').update(challenge + String(nonce)).digest('hex')
      if (!hash.startsWith('0'.repeat(stored.difficulty))) throw new HttpException('Invalid credit proof', HttpStatus.BAD_REQUEST)
      await this.redis.delKeys(this.challengeKey(challenge))
      return Number(process.env.API_CREDIT_POW_REWARD || 30)
    }
  }

  constructor(private readonly redis: RedisService) {}

  async consume(subject: string, cost = 1): Promise<CreditStatus> {
    const status = await this.getStatus(subject)
    if (status.credits < cost) {
      throw new HttpException('API credits exhausted', HttpStatus.TOO_MANY_REQUESTS)
    }
    const next = { ...status, credits: status.credits - cost }
    await this.persist(subject, next.credits)
    return next
  }

  async getStatus(subject: string): Promise<CreditStatus> {
    const maxCredits = Number(process.env.API_CREDIT_MAX || 120)
    const refillPerMinute = Number(process.env.API_CREDIT_REFILL_PER_MINUTE || 30)
    const now = Date.now()
    try {
      const raw = await this.redis.getJson<{ credits: number; updatedAt: number }>(this.key(subject))
      if (!raw) {
        await this.persist(subject, maxCredits)
        return { subject, credits: maxCredits, maxCredits, refillPerMinute }
      }
      const status = this.autoRefillMechanism.applyAutomatic!(
        { subject, credits: Number(raw.credits || 0), maxCredits, refillPerMinute },
        raw,
        now
      )
      await this.persist(subject, status.credits)
      return status
    } catch (error) {
      if (process.env.NODE_ENV === 'production' && process.env.ABUSE_LIMIT_FAIL_OPEN !== 'true') {
        throw new ServiceUnavailableException('API credit service unavailable')
      }
      return { subject, credits: maxCredits, maxCredits, refillPerMinute }
    }
  }

  async issueChallenge(subject: string) {
    return this.proofOfWorkMechanism.issue!(subject)
  }

  async redeemChallenge(subject: string, challenge: string, nonce: number) {
    const reward = await this.proofOfWorkMechanism.redeem!(subject, { challenge, nonce })
    const status = await this.getStatus(subject)
    const credits = Math.min(status.maxCredits, status.credits + reward)
    await this.persist(subject, credits)
    return { ...status, credits }
  }

  private async persist(subject: string, credits: number) {
    await this.redis.setJson(this.key(subject), { credits, updatedAt: Date.now() }, 60 * 60 * 24)
  }

  private key(subject: string) {
    return `jb:api-credits:${this.digest(subject)}`
  }

  private challengeKey(challenge: string) {
    return `jb:api-credit-challenge:${this.digest(challenge)}`
  }

  private async currentDifficulty(subject: string) {
    const base = Number(process.env.API_CREDIT_POW_DIFFICULTY || 4)
    const max = Number(process.env.API_CREDIT_POW_MAX_DIFFICULTY || 6)
    const status = await this.getStatus(subject)
    const pressure = status.maxCredits > 0 ? 1 - status.credits / status.maxCredits : 0
    const bump = pressure > 0.8 ? 2 : pressure > 0.5 ? 1 : 0
    return Math.min(max, Math.max(1, base + bump))
  }

  private digest(value: string) {
    return createHash('sha256').update(value).digest('hex')
  }
}
