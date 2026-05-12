import { Injectable } from '@nestjs/common'
import { ThrottlerStorage } from '@nestjs/throttler'
import { createHash } from 'crypto'
import { RedisService } from './redis.service'

interface ThrottlerStorageRecord {
  totalHits: number
  timeToExpire: number
  isBlocked: boolean
  timeToBlockExpire: number
}

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<ThrottlerStorageRecord> {
    try {
      const client = this.redis.getClient()
      const safeKey = createHash('sha256').update(`${throttlerName}:${key}`).digest('hex')
      const hitKey = `jb:throttle:${safeKey}`
      const blockKey = `${hitKey}:blocked`

      const existingBlockTtl = await client.pttl(blockKey)
      if (existingBlockTtl > 0) {
        const currentHits = Number((await client.get(hitKey)) || limit + 1)
        const hitTtl = await client.pttl(hitKey)
        return {
          totalHits: currentHits,
          timeToExpire: Math.max(0, Math.ceil(hitTtl / 1000)),
          isBlocked: true,
          timeToBlockExpire: Math.ceil(existingBlockTtl / 1000)
        }
      }

      const totalHits = await client.incr(hitKey)
      if (totalHits === 1) {
        await client.pexpire(hitKey, ttl)
      }

      const timeToExpireMs = await client.pttl(hitKey)
      const isBlocked = totalHits > limit
      let timeToBlockExpire = 0

      if (isBlocked) {
        await client.set(blockKey, '1', 'PX', blockDuration)
        timeToBlockExpire = Math.ceil(blockDuration / 1000)
      }

      return {
        totalHits,
        timeToExpire: Math.max(0, Math.ceil(timeToExpireMs / 1000)),
        isBlocked,
        timeToBlockExpire
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'test') {
        return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }
      }
      throw error
    }
  }
}
