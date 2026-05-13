import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { Request } from 'express'
import { createHash } from 'crypto'
import { RedisService } from 'src/redis/redis.service'

@Injectable()
export class AbuseRateLimiterService {
  constructor(private readonly redis: RedisService) {}

  async hit(scope: string, subject: string, limit: number, windowMs: number): Promise<void> {
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
    const forwardedFor = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
    const ip = forwardedFor || req?.ip || req?.socket?.remoteAddress || 'unknown'
    const userAgent = String(req?.headers?.['user-agent'] || 'unknown').slice(0, 120)
    return [actorId || 'anonymous', ip, userAgent, extra || ''].join('|')
  }

  private digest(value: string) {
    return createHash('sha256').update(value).digest('hex')
  }
}
