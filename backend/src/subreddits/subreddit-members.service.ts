import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { SubredditMember } from './schemas/subreddit-member.schema'
import { ModLogService } from 'src/moderation/mod-log.service'
import { RedisService } from 'src/redis/redis.service'
import { COMMUNITY_ROLE_BITS, permissionNames, permissionsForRoleMask } from './community-permissions'
import { getAuthPublicKeyById, verifySignature } from 'src/common/signature.util'

type MemberType = 'member' | 'muted' | 'banned' | 'moderator' | 'contributor'

export interface SubredditPermissionSummary {
  subredditId: string
  userId: string
  statusFlags: string
  roleFlags: string
  permissionMask: string
  isMember: boolean
  isMuted: boolean
  isBanned: boolean
  isModerator: boolean
  isContributor: boolean
  permissions: string[]
}

const MEMBER_TYPE_FLAGS: Record<MemberType, bigint> = {
  member: BigInt(1),
  muted: BigInt(2),
  banned: BigInt(4),
  moderator: BigInt(8),
  contributor: BigInt(16)
}

@Injectable()
export class SubredditMembersService {
  constructor(
    @InjectModel(SubredditMember.name) private readonly model: Model<SubredditMember>,
    private readonly modLogService: ModLogService,
    private readonly redis: RedisService
  ) {}

  async addMember(data: Partial<SubredditMember>): Promise<SubredditMember> {
    try {
      const created = new this.model(data)
      const saved = await created.save()
      await this.invalidatePermissionCache(String(saved.subredditId), String(saved.userId))
      return saved
    } catch (err) {
      throw new HttpException(err.message || 'Could not add member', HttpStatus.BAD_REQUEST)
    }
  }

  /**
   * List members with optional search by username or publicKey and optional member type filter.
   * Returns members with user info inlined as `user`.
   */
  async list(
    subredditId: string,
    options: { q?: string; type?: string; limit?: number; skip?: number } = {}
  ): Promise<any[]> {
    const { q, type, limit = 50, skip = 0 } = options
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
    const safeSkip = Math.min(Math.max(Number(skip) || 0, 0), 10000)
    if (!Types.ObjectId.isValid(subredditId)) return []

    const pipeline: any[] = [
      { $match: { subredditId: new Types.ObjectId(subredditId) } },
      // join user
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } }
    ]

    // search by username or publicKey
    if (q) {
      const or: any[] = []
      // username partial, case-insensitive
      or.push({ 'user.username': { $regex: q, $options: 'i' } })

      // try to interpret q as hex public key
      try {
        const buf = Buffer.from(q, 'hex')
        if (buf.length > 0) {
          // join auth collection and match
          pipeline.push({
            $lookup: {
              from: 'auths',
              // user._id corresponds to the Auth document _id
              localField: 'user._id',
              foreignField: '_id',
              as: 'auth'
            }
          })
          pipeline.push({ $unwind: { path: '$auth', preserveNullAndEmptyArrays: true } })
          or.push({ 'auth.publicKey': buf })
        }
      } catch (e) {
        // ignore invalid hex
      }

      pipeline.push({ $match: { $or: or } })
    }

    // filter by member type (statusFlags bitmap)
    if (type) {
      const t = type.toLowerCase() as MemberType
      if (MEMBER_TYPE_FLAGS[t]) {
        const flag = MEMBER_TYPE_FLAGS[t]
        // bitwise AND to check flag presence: (statusFlags & flag) != 0
        pipeline.push({
          $match: {
            $expr: { $ne: [{ $bitAnd: ['$statusFlags', flag] }, 0] }
          }
        })
      }
    }

    // sort, paginate
    pipeline.push({ $sort: { createdAt: -1 } })
    pipeline.push({ $skip: safeSkip })
    pipeline.push({ $limit: safeLimit })

    const results = await this.model.aggregate(pipeline).exec()
    return results
  }

  async findOne(id: string): Promise<SubredditMember | null> {
    if (!Types.ObjectId.isValid(id)) return null
    return this.model.findById(id).exec()
  }

  async remove(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false
    const existing = await this.model.findById(id).lean().exec()
    const res = await this.model.findByIdAndDelete(id).exec()
    if (existing) await this.invalidatePermissionCache(String(existing.subredditId), String(existing.userId))
    return !!res
  }

  async updateStatus(
    id: string,
    statusFlags: bigint,
    moderatorId?: string,
    moderatorSignature?: string
  ): Promise<SubredditMember | null> {
    if (!Types.ObjectId.isValid(id)) return null
    if (moderatorId) {
      await this.assertModeratorSignature(
        moderatorId,
        `update_member_status|${id}|${statusFlags?.toString?.() || String(statusFlags)}`,
        moderatorSignature
      )
    }
    const updated = await this.model.findByIdAndUpdate(id, { statusFlags }, { new: true }).exec()
    if (updated) await this.invalidatePermissionCache(String(updated.subredditId), String(updated.userId))
    try {
      if (updated) {
        await this.modLogService.createLog({
          subredditId: updated.subredditId,
          moderatorId,
          action: 'update_member_status',
          targetType: 'user',
          targetId: updated._id as Types.ObjectId,
          reason: undefined,
          details: { statusFlags: statusFlags?.toString?.() },
          moderatorSignature
        })
      }
    } catch (e) {
      // swallow logging errors — non-fatal
    }
    return updated
  }

  async banMember(
    id: string,
    until?: Date,
    reason?: string,
    moderatorId?: string,
    moderatorSignature?: string
  ): Promise<SubredditMember | null> {
    if (!Types.ObjectId.isValid(id)) return null
    if (moderatorId) {
      await this.assertModeratorSignature(
        moderatorId,
        `ban_user|${id}|${until?.toISOString?.() || ''}|${reason || ''}`,
        moderatorSignature
      )
    }
    const update: any = { statusFlags: BigInt(0) } // clear flags then set banned bit below
    if (until) update.bannedUntil = until
    if (reason) update.banReason = reason
    // set banned bit (bit 2) on statusFlags
    const member = await this.model.findById(id).exec()
    if (!member) return null
    const flags = BigInt(member.statusFlags || 0)
    const newFlags = flags | (BigInt(1) << BigInt(2))
    update.statusFlags = newFlags
    const updated = await this.model.findByIdAndUpdate(id, update, { new: true }).exec()
    if (updated) await this.invalidatePermissionCache(String(updated.subredditId), String(updated.userId))
    try {
      if (updated) {
        await this.modLogService.createLog({
          subredditId: updated.subredditId,
          moderatorId,
          action: 'ban_user',
          targetType: 'user',
          targetId: updated.userId as Types.ObjectId,
          reason: reason,
          details: { bannedUntil: until },
          moderatorSignature
        })
      }
    } catch (e) {
      // ignore logging failures
    }
    return updated
  }

  async findBySubredditAndUser(subredditId: string, userId: string): Promise<SubredditMember | null> {
    if (!Types.ObjectId.isValid(subredditId) || !Types.ObjectId.isValid(userId)) return null

    const cacheKey = this.memberCacheKey(subredditId, userId)
    const cached = await this.redis.getJson<SubredditMember>(cacheKey)
    if (cached) return cached as any

    const member = await this.model
      .findOne({ subredditId: new Types.ObjectId(subredditId), userId: new Types.ObjectId(userId) })
      .lean()
      .exec()

    if (member) {
      await this.redis.setJson(cacheKey, member, Number(process.env.PERMISSION_CACHE_TTL_SECONDS || 300))
    }
    return member as any
  }

  async getPermissionSummary(subredditId: string, userId: string): Promise<SubredditPermissionSummary | null> {
    if (!Types.ObjectId.isValid(subredditId) || !Types.ObjectId.isValid(userId)) return null
    const cacheKey = this.permissionCacheKey(subredditId, userId)
    return this.redis.rememberJson(cacheKey, Number(process.env.PERMISSION_CACHE_TTL_SECONDS || 300), async () => {
      const member = await this.model
        .findOne({ subredditId: new Types.ObjectId(subredditId), userId: new Types.ObjectId(userId) })
        .lean()
        .exec()
      if (!member) return null
      return this.buildPermissionSummary(
        subredditId,
        userId,
        BigInt((member as any).statusFlags || 0),
        BigInt((member as any).roleFlags || this.defaultRoleFlags(BigInt((member as any).statusFlags || 0))),
        BigInt((member as any).permissionOverrides || 0)
      )
    })
  }

  async invalidatePermissionCache(subredditId: string, userId: string): Promise<void> {
    await this.redis.delKeys(this.memberCacheKey(subredditId, userId), this.permissionCacheKey(subredditId, userId))
  }

  private buildPermissionSummary(subredditId: string, userId: string, flags: bigint, roleFlags = this.defaultRoleFlags(flags), permissionOverrides = BigInt(0)): SubredditPermissionSummary {
    const isMember = (flags & MEMBER_TYPE_FLAGS.member) !== BigInt(0)
    const isMuted = (flags & MEMBER_TYPE_FLAGS.muted) !== BigInt(0)
    const isBanned = (flags & MEMBER_TYPE_FLAGS.banned) !== BigInt(0)
    const isModerator = (flags & MEMBER_TYPE_FLAGS.moderator) !== BigInt(0)
    const isContributor = (flags & MEMBER_TYPE_FLAGS.contributor) !== BigInt(0)
    const permissionMask = permissionsForRoleMask(roleFlags) | permissionOverrides

    return {
      subredditId,
      userId,
      statusFlags: flags.toString(),
      roleFlags: roleFlags.toString(),
      permissionMask: permissionMask.toString(),
      isMember,
      isMuted,
      isBanned,
      isModerator,
      isContributor,
      permissions: permissionNames(permissionMask)
    }
  }

  private defaultRoleFlags(statusFlags: bigint) {
    let roleFlags = BigInt(0)
    if ((statusFlags & MEMBER_TYPE_FLAGS.member) !== BigInt(0)) roleFlags |= COMMUNITY_ROLE_BITS.member
    if ((statusFlags & MEMBER_TYPE_FLAGS.contributor) !== BigInt(0)) roleFlags |= COMMUNITY_ROLE_BITS.contributor
    if ((statusFlags & MEMBER_TYPE_FLAGS.moderator) !== BigInt(0)) roleFlags |= COMMUNITY_ROLE_BITS.moderator
    return roleFlags
  }

  private memberCacheKey(subredditId: string, userId: string) {
    return `jb:member:${subredditId}:${userId}`
  }

  private permissionCacheKey(subredditId: string, userId: string) {
    return `jb:permissions:${subredditId}:${userId}`
  }

  private async assertModeratorSignature(moderatorId: string, payload: string, moderatorSignature?: string) {
    if (!moderatorSignature) throw new HttpException('Missing moderator signature', HttpStatus.FORBIDDEN)
    const pub = await getAuthPublicKeyById((this.model as any).db, String(moderatorId))
    if (!pub || !verifySignature(pub, payload, moderatorSignature)) {
      throw new HttpException('Invalid moderator signature', HttpStatus.FORBIDDEN)
    }
  }
}
