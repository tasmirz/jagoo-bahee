import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null

  onModuleInit() {
    const url = process.env.REDIS_URL || 'redis://127.0.0.1:6380'
    this.client = new Redis(url)
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit()
      this.client = null
    }
  }

  getClient() {
    if (!this.client) throw new Error('Redis client not initialized')
    return this.client
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.getClient().get(key)
      return raw ? (JSON.parse(raw) as T) : null
    } catch (e) {
      return null
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.getClient().set(key, JSON.stringify(value, this.jsonReplacer), 'EX', ttlSeconds)
    } catch (e) {
      // Cache failures should never break request handling.
    }
  }

  async rememberJson<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.getJson<T>(key)
    if (cached !== null) return cached
    const value = await loader()
    if (value !== undefined) await this.setJson(key, value, ttlSeconds)
    return value
  }

  async delKeys(...keys: string[]): Promise<void> {
    const filtered = keys.filter(Boolean)
    if (filtered.length === 0) return
    try {
      await this.getClient().del(...filtered)
    } catch (e) {}
  }

  async setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean> {
    try {
      const result = await this.getClient().set(key, value, 'PX', ttlMs, 'NX')
      return result === 'OK'
    } catch (e) {
      return false
    }
  }

  async delPattern(pattern: string): Promise<void> {
    try {
      const client = this.getClient()
      let cursor = '0'
      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = nextCursor
        if (keys.length > 0) await client.del(...keys)
      } while (cursor !== '0')
    } catch (e) {}
  }

  private jsonReplacer(_key: string, value: unknown) {
    return typeof value === 'bigint' ? value.toString() : value
  }

  stableStringify(value: unknown): string {
    return JSON.stringify(this.normalizeForKey(value))
  }

  private normalizeForKey(value: any): any {
    if (value === null || value === undefined) return value
    if (typeof value === 'bigint') return value.toString()
    if (typeof value !== 'object') return value
    if (typeof value.toHexString === 'function') return value.toHexString()
    if (value instanceof Date) return value.toISOString()
    if (Array.isArray(value)) return value.map((item) => this.normalizeForKey(item))

    return Object.keys(value)
      .sort()
      .reduce((acc: Record<string, unknown>, key) => {
        acc[key] = this.normalizeForKey(value[key])
        return acc
      }, {})
  }
}
