import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { SubredditMember } from './schemas/subreddit-member.schema'
import { ModLogService } from 'src/moderation/mod-log.service'
import { RedisService } from 'src/redis/redis.service'

type MemberType = 'member' | 'muted' | 'banned' | 'moderator' | 'contributor'

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
      return await created.save()
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
    pipeline.push({ $skip: skip })
    pipeline.push({ $limit: limit })

    const results = await this.model.aggregate(pipeline).exec()
    return results
  }

  async findOne(id: string): Promise<SubredditMember | null> {
    if (!Types.ObjectId.isValid(id)) return null
    return this.model.findById(id).exec()
  }

  async remove(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false
    const res = await this.model.findByIdAndDelete(id).exec()
    return !!res
  }

  async updateStatus(
    id: string,
    statusFlags: bigint,
    moderatorId?: string,
    moderatorSignature?: string
  ): Promise<SubredditMember | null> {
    if (!Types.ObjectId.isValid(id)) return null
    const updated = await this.model.findByIdAndUpdate(id, { statusFlags }, { new: true }).exec()
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
          moderatorSignature: moderatorSignature || ''
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
          moderatorSignature: moderatorSignature || ''
        })
      }
    } catch (e) {
      // ignore logging failures
    }
    return updated
  }

  async findBySubredditAndUser(subredditId: string, userId: string): Promise<SubredditMember | null> {
    if (!Types.ObjectId.isValid(subredditId) || !Types.ObjectId.isValid(userId)) return null

    const cacheKey = `member:${subredditId}:${userId}`
    try {
      const cached = await this.redis.getClient().get(cacheKey)
      if (cached) return JSON.parse(cached)
    } catch (e) {}

    const member = await this.model
      .findOne({ subredditId: new Types.ObjectId(subredditId), userId: new Types.ObjectId(userId) })
      .exec()

    if (member) {
      try {
        await this.redis.getClient().set(cacheKey, JSON.stringify(member), 'EX', 300)
      } catch (e) {}
    }
    return member
  }
}
