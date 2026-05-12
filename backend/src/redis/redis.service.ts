import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null

  onModuleInit() {
    const url = process.env.REDIS_URL || 'redis://127.0.0.1:6380'
    this.client = new Redis(url)
  }

  onModuleDestroy() {
    if (this.client) this.client.quit()
  }

  getClient() {
    if (!this.client) throw new Error('Redis client not initialized')
    return this.client
  }
}
