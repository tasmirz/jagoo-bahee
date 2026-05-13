import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { Request } from 'express'
import { createHash } from 'crypto'
import { RedisService } from 'src/redis/redis.service'
import { InjectConnection } from '@nestjs/mongoose'
import { Connection } from 'mongoose'
import { ApiCreditsService } from './api-credits.service'

@Injectable()
export class AbuseRateLimiterService {
  constructor(
    private readonly redis: RedisService,
    @InjectConnection() private readonly connection: Connection,
    private readonly apiCredits: ApiCreditsService
  ) {}

  async hit(scope: string, subject: string, limit: number, windowMs: number): Promise<void> {
    await this.apiCredits.consume(subject, Number(process.env.API_CREDIT_REQUEST_COST || 1))
    const override = await this.getScopeOverride(scope)
    if (override) {
      limit = override.limit
      windowMs = override.windowMs
    }
    const key = `jb:abuse:${scope}:${this.digest(subject)}`
    let count = 0
    try {
      const client = this.redis.getClient()
      count = await client.incr(key)
      if (count === 1) await client.pexpire(key, windowMs)
    } catch {
      if (process.env.NODE_ENV === 'production' && process.env.ABUSE_LIMIT_FAIL_OPEN !== 'true') {
        throw new ServiceUnavailableException('Rate limiter unavailable')
      }
      return
    }
    if (count > limit) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS)
    }
  }

  tracker(req?: Request, actorId?: string, extra?: string): string {
    const ip = this.clientIp(req)
    const userAgent = String(req?.headers?.['user-agent'] || 'unknown').slice(0, 120)
    return [actorId || 'anonymous', ip, userAgent, extra || ''].join('|')
  }

  async assertIpAllowed(req?: Request): Promise<void> {
    const ip = this.clientIp(req)
    try {
      const blocked = await this.redis.getClient().get(`jb:security:ip-block:${ip}`)
      if (blocked) throw new HttpException('IP blocked', HttpStatus.FORBIDDEN)
      const dbBlocked = await this.connection.collection('ipblocks').findOne({ ip })
      if (dbBlocked) {
        await this.redis.getClient().set(`jb:security:ip-block:${ip}`, '1')
        throw new HttpException('IP blocked', HttpStatus.FORBIDDEN)
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      if (process.env.NODE_ENV === 'production' && process.env.ABUSE_LIMIT_FAIL_OPEN !== 'true') {
        throw new ServiceUnavailableException('Rate limiter unavailable')
      }
    }
  }

  clientIp(req?: Request): string {
    const forwardedFor = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
    return forwardedFor || req?.ip || req?.socket?.remoteAddress || 'unknown'
  }

  private async getScopeOverride(scope: string): Promise<{ limit: number; windowMs: number } | null> {
    try {
      const config = await this.redis.getJson<Record<string, { limit?: number; windowMs?: number }>>('jb:config:rate-limits')
      let item = config?.[scope]
      if (!item) {
        const persisted = await this.connection.collection('serverconfigs').findOne({ key: 'security' })
        item = persisted?.rateLimits?.[scope]
        if (persisted?.rateLimits) await this.redis.setJson('jb:config:rate-limits', persisted.rateLimits, 60 * 60 * 24 * 365)
      }
      const limit = Number(item?.limit)
      const windowMs = Number(item?.windowMs)
      if (Number.isFinite(limit) && limit > 0 && Number.isFinite(windowMs) && windowMs >= 1000) {
        return { limit: Math.floor(limit), windowMs: Math.floor(windowMs) }
      }
    } catch {}
    return null
  }

  private digest(value: string) {
    return createHash('sha256').update(value).digest('hex')
  }
}
