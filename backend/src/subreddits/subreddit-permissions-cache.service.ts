import { Injectable } from '@nestjs/common'
import { RedisService } from 'src/redis/redis.service'

export interface CachedModeratorStatus {
  isModerator: boolean
  isCreator: boolean
  isBanned: boolean
  statusFlags: number
  hasModPermissions: boolean
  roleId?: string
  roleName?: string
  permissions?: string
}

@Injectable()
export class SubredditPermissionsCacheService {
  private readonly CACHE_PREFIX = 'subreddit:mod:'
  private readonly CACHE_TTL = 300 // 5 minutes in seconds

  constructor(private redisService: RedisService) {}

  /**
   * Get cached moderator status for a user in a subreddit
   */
  async getModeratorStatus(subredditId: string, userId: string): Promise<CachedModeratorStatus | null> {
    try {
      const key = this.getCacheKey(subredditId, userId)
      const cached = await this.redisService.getClient().get(key)

      if (cached) {
        console.log('[PermissionsCache] Cache HIT for', { subredditId, userId })
        return JSON.parse(cached)
      }

      console.log('[PermissionsCache] Cache MISS for', { subredditId, userId })
      return null
    } catch (error) {
      console.error('[PermissionsCache] Error getting cache:', error)
      return null
    }
  }

  /**
   * Set moderator status in cache with 5 minute TTL
   */
  async setModeratorStatus(subredditId: string, userId: string, status: CachedModeratorStatus): Promise<void> {
    try {
      const key = this.getCacheKey(subredditId, userId)
      await this.redisService.getClient().setex(key, this.CACHE_TTL, JSON.stringify(status))
      console.log('[PermissionsCache] Cached for 5 minutes:', { subredditId, userId })
    } catch (error) {
      console.error('[PermissionsCache] Error setting cache:', error)
    }
  }

  /**
   * Invalidate cache for a specific user-subreddit combination
   */
  async invalidateModeratorStatus(subredditId: string, userId: string): Promise<void> {
    try {
      const key = this.getCacheKey(subredditId, userId)
      await this.redisService.getClient().del(key)
      console.log('[PermissionsCache] Invalidated cache for', { subredditId, userId })
    } catch (error) {
      console.error('[PermissionsCache] Error invalidating cache:', error)
    }
  }

  /**
   * Invalidate all cache entries for a subreddit
   * Useful when roles or permissions are updated
   */
  async invalidateSubreddit(subredditId: string): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}${subredditId}:*`
      const keys = await this.redisService.getClient().keys(pattern)

      if (keys.length > 0) {
        await this.redisService.getClient().del(...keys)
        console.log('[PermissionsCache] Invalidated', keys.length, 'entries for subreddit', subredditId)
      }
    } catch (error) {
      console.error('[PermissionsCache] Error invalidating subreddit cache:', error)
    }
  }

  /**
   * Invalidate all cache entries for a user across all subreddits
   * Useful when a user is banned globally or role assignments change
   */
  async invalidateUser(userId: string): Promise<void> {
    try {
      const pattern = `${this.CACHE_PREFIX}*:${userId}`
      const keys = await this.redisService.getClient().keys(pattern)

      if (keys.length > 0) {
        await this.redisService.getClient().del(...keys)
        console.log('[PermissionsCache] Invalidated', keys.length, 'entries for user', userId)
      }
    } catch (error) {
      console.error('[PermissionsCache] Error invalidating user cache:', error)
    }
  }

  private getCacheKey(subredditId: string, userId: string): string {
    return `${this.CACHE_PREFIX}${subredditId}:${userId}`
  }
}
