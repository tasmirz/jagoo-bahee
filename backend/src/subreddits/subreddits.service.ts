import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Subreddit } from './schemas/subreddit.schema'
import { SubredditMember } from './schemas/subreddit-member.schema'
import { Post } from 'src/posts/schemas/post.schema'
import { Comment } from 'src/comments/schemas/comment.schema'
import { AttachmentsService } from 'src/attachments/attachments.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { ModLogService } from 'src/moderation/mod-log.service'
import { verifySignature, getAuthPublicKeyById } from 'src/common/signature.util'
import { UsersService } from 'src/users/users.service'
import { AuthService } from 'src/auth/auth.service'
import { RedisService } from 'src/redis/redis.service'

@Injectable()
export class SubredditsService {
  constructor(
    @InjectModel(Subreddit.name) private readonly model: Model<Subreddit>,
    @InjectModel(SubredditMember.name) private readonly memberModel: Model<SubredditMember>,
    @InjectModel(Post.name) private readonly postModel: Model<Post>,
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    private readonly attachmentsService: AttachmentsService,
    private readonly notificationsService: NotificationsService,
    private readonly modLog: ModLogService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly redis: RedisService
  ) {}

  private readonly cacheTtlSeconds = Number(process.env.CACHE_TTL_SECONDS || 60)

  private async invalidateSubredditCache(subreddit?: any) {
    await this.redis.delPattern('jb:subreddits:list:*')
    if (subreddit?._id) await this.redis.delKeys(`jb:subreddits:one:${String(subreddit._id)}`)
    if (subreddit?.name) await this.redis.delKeys(`jb:subreddits:one:${String(subreddit.name).toLowerCase()}`)
  }

  private async invalidatePermissionCache(subredditId: string, userId: string) {
    await this.redis.delKeys(`jb:member:${subredditId}:${userId}`, `jb:permissions:${subredditId}:${userId}`)
  }

  public async nameAvailability(name: string) {
    return await this.model.findOne({ name: this.escapeRegExp(name.toLowerCase().trim()) }).exec()
  }
  // helper: check if an actor (auth id) has a permission in subreddit via UserRole->Role or global ABAC admin
  private async hasPermission(actorAuthId: string, subredditId: any, permission: string): Promise<boolean> {
    if (!actorAuthId) return false
    // global admin check via auth.abac
    try {
      const authDoc = await this.authService.findById(actorAuthId)
      if (authDoc && authDoc.abac) {
        const abac = BigInt(authDoc.abac || BigInt(0))
        const isAdmin = (abac & (BigInt(1) << BigInt(5))) !== BigInt(0)
        if (isAdmin) return true
      }
    } catch (e) {
      // ignore
    }

    // check user roles (userId is an ObjectId in users collection) — we need mapping from auth to userId
    // Find the User document that references this auth id
    let user: any = null
    try {
      user = await this.usersService.findByAuthId(new Types.ObjectId(actorAuthId))
    } catch (e) {
      user = null
    }
    if (!user) return false

    const userId = String((user as any)._id)
    const key = `jb:permissions:${String(subredditId)}:${userId}`
    const summary = await this.redis.rememberJson<any>(key, Number(process.env.PERMISSION_CACHE_TTL_SECONDS || 300), async () => {
      const member = await this.memberModel
        .findOne({
          userId: new Types.ObjectId(userId),
          subredditId: new Types.ObjectId(String(subredditId))
        })
        .lean()
        .exec()
      if (!member) return null
      const flags = BigInt((member as any).statusFlags || 0)
      const isModerator = (flags & BigInt(8)) === BigInt(8)
      return {
        subredditId: String(subredditId),
        userId,
        statusFlags: flags.toString(),
        isModerator,
        permissions: isModerator
          ? ['community.update', 'member.ban', 'member.unban', 'member.kick', 'member.role.update', 'post.moderate', 'comment.moderate', 'modlog.read', 'report.review']
          : []
      }
    })
    if (!summary) return false
    return summary.isModerator || summary.permissions?.includes(permission)
  }

  // Kick user: remove membership but allow rejoin
  async kickUser(
    subredditIdOrName: string,
    targetUserId: string,
    moderatorAuth: any,
    reason: string,
    moderatorSignature?: string
  ) {
    if (!moderatorAuth || !moderatorAuth.id) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    const subreddit = await this.findOne(subredditIdOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    // permission check: members.kick
    const allowed = await this.hasPermission(String(moderatorAuth.id), String(subreddit._id), 'members.kick')
    if (!allowed) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN)

    // find target user (user profile id)
    const targetUser = await this.usersService.findById(targetUserId)
    if (!targetUser) throw new HttpException('Target user not found', HttpStatus.BAD_REQUEST)

    // prevent kicking mods/owner
    const targetMember = await this.memberModel
      .findOne({
        subredditId: new Types.ObjectId(String(subreddit._id)),
        userId: new Types.ObjectId(String((targetUser as any)._id))
      })
      .exec()
    if (targetMember && (BigInt(targetMember.statusFlags) & BigInt(8)) !== BigInt(0)) {
      throw new HttpException('Cannot kick a moderator', HttpStatus.FORBIDDEN)
    }

    if (String(subreddit.createdBy) === String(targetUser._id)) {
      throw new HttpException('Cannot kick subreddit creator', HttpStatus.FORBIDDEN)
    }

    // build payload and verify moderatorSignature: canonical payload is action|subredditId|targetUserId|reason|timestamp
    if (!moderatorSignature) throw new HttpException('Missing moderator signature', HttpStatus.FORBIDDEN)
    const payload = `kick|${String(subreddit._id)}|${String(targetUser._id)}|${reason || ''}`
    const pub = await getAuthPublicKeyById((this as any).model.db, String(moderatorAuth.id))
    if (!pub) throw new HttpException('Moderator public key not found', HttpStatus.FORBIDDEN)
    const ok = verifySignature(pub, payload, moderatorSignature)
    if (!ok) throw new HttpException('Invalid moderator signature', HttpStatus.FORBIDDEN)

    // remove membership (keep record) — we'll unset isMember bit and keep doc
    if (targetMember) {
      const prevFlags = BigInt(targetMember.statusFlags)
      const memberBit = BigInt(1)
      const wasMember = (prevFlags & memberBit) !== BigInt(0)
      targetMember.statusFlags = prevFlags & ~memberBit
      await targetMember.save()
      await this.invalidatePermissionCache(String(subreddit._id), String((targetUser as any)._id))
      if (wasMember) {
        await this.model.findByIdAndUpdate(subreddit._id, { $inc: { memberCount: -1 } }).exec()
        await this.invalidateSubredditCache(subreddit)
      }

      // create mod log
      const log = await this.modLog.createLog({
        subredditId: subreddit._id,
        moderatorId: String(moderatorAuth.id),
        action: 'kick_user',
        targetType: 'user',
        targetId: String((targetUser as any)._id),
        reason,
        details: { previousStatusFlags: String(prevFlags), kickedAt: new Date() },
        moderatorSignature
      } as any)

      // notify
      try {
        await this.notificationsService.create({
          userId: String((targetUser as any)._id),
          type: 'mod_action',
          actorId: String(moderatorAuth.id),
          targetId: String(subreddit._id),
          targetType: 'subreddit',
          message: `You have been removed from r/${subreddit.name}. Reason: ${reason}`
        } as any)
      } catch (e) {}

      return {
        success: true,
        action: 'kick',
        userId: String(targetUser._id),
        modLogId: String((log as any)._id),
        canRejoin: true
      }
    }

    throw new HttpException('User is not a member', HttpStatus.BAD_REQUEST)
  }

  // Ban user: supports temporary/permanent and optional deleteContent
  async banUser(
    subredditIdOrName: string,
    payload: {
      userId: string
      reason: string
      duration?: number
      banType: 'temporary' | 'permanent'
      note?: string
      deleteContent?: boolean
    },
    moderatorAuth: any,
    moderatorSignature?: string
  ) {
    if (!moderatorAuth || !moderatorAuth.id) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    const { userId, reason, duration, banType, note, deleteContent } = payload
    const subreddit = await this.findOne(subredditIdOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    // permission check
    const perm = banType === 'permanent' ? 'members.ban_permanent' : 'members.ban'
    const allowed = await this.hasPermission(String(moderatorAuth.id), String(subreddit._id), perm)
    if (!allowed) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN)

    // target user
    const targetUser = await this.usersService.findById(userId)
    if (!targetUser) throw new HttpException('Target user not found', HttpStatus.BAD_REQUEST)
    if (String(subreddit.createdBy) === String(targetUser._id))
      throw new HttpException('Cannot ban subreddit creator', HttpStatus.FORBIDDEN)

    // verify moderator signature
    if (!moderatorSignature) throw new HttpException('Missing moderator signature', HttpStatus.FORBIDDEN)
    const banPayload = `ban|${String(subreddit._id)}|${String(targetUser._id)}|${banType}|${duration || 0}|${reason || ''}`
    const pub2 = await getAuthPublicKeyById((this as any).model.db, String(moderatorAuth.id))
    if (!pub2) throw new HttpException('Moderator public key not found', HttpStatus.FORBIDDEN)
    const ok2 = verifySignature(pub2, banPayload, moderatorSignature)
    if (!ok2) throw new HttpException('Invalid moderator signature', HttpStatus.FORBIDDEN)

    // ensure member record exists
    let member = await this.memberModel
      .findOne({
        subredditId: new Types.ObjectId(String(subreddit._id)),
        userId: new Types.ObjectId(String((targetUser as any)._id))
      })
      .exec()
    const prevFlags = member ? BigInt(member.statusFlags) : BigInt(0)
    if (!member) {
      member = await this.memberModel.create({
        subredditId: new Types.ObjectId(String(subreddit._id)),
        userId: new Types.ObjectId(String((targetUser as any)._id)),
        statusFlags: BigInt(0)
      })
    }

    // check existing ban
    if ((BigInt(member.statusFlags) & BigInt(4)) !== BigInt(0)) {
      // already banned — check expiry
      if (member.bannedUntil && member.bannedUntil > new Date()) {
        throw new HttpException('User already banned', HttpStatus.BAD_REQUEST)
      }
    }

    let bannedUntil: Date | null = null
    if (banType === 'temporary' && duration && duration > 0) {
      bannedUntil = new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
    }

    // set banned bit and unset member bit
    const memberBit = BigInt(1)
    member.statusFlags = (BigInt(member.statusFlags) | BigInt(4)) & ~memberBit
    member.bannedUntil = bannedUntil as any
    member.banReason = reason
    await member.save()
    await this.invalidatePermissionCache(String(subreddit._id), String((targetUser as any)._id))

    // decrement memberCount if previously member
    if ((prevFlags & BigInt(1)) !== BigInt(0)) {
      await this.model.findByIdAndUpdate(subreddit._id, { $inc: { memberCount: -1 } }).exec()
      await this.invalidateSubredditCache(subreddit)
    }

    // optional content deletion — best effort
    if (deleteContent) {
      try {
        // update posts and comments in this subreddit by this user — best-effort batch
        const postsColl = (this as any).model.db.collection('posts')
        const commentsColl = (this as any).model.db.collection('comments')
        const postTargets = await postsColl
          .find({
            subredditId: new Types.ObjectId(String(subreddit._id)),
            authorId: new Types.ObjectId(String((targetUser as any)._id))
          })
          .project({ _id: 1, statusFlags: 1, contentHash: 1 })
          .toArray()
        const commentTargets = await commentsColl
          .find({
            subredditId: new Types.ObjectId(String(subreddit._id)),
            authorId: new Types.ObjectId(String((targetUser as any)._id))
          })
          .project({ _id: 1, statusFlags: 1, contentHash: 1 })
          .toArray()
        await postsColl.updateMany(
          {
            subredditId: new Types.ObjectId(String(subreddit._id)),
            authorId: new Types.ObjectId(String((targetUser as any)._id))
          },
          {
            $set: {
              statusFlags: BigInt(64),
              removalReason: 'User banned - content removed',
              removedBy: new Types.ObjectId(String(moderatorAuth.id))
            }
          }
        )
        await commentsColl.updateMany(
          {
            subredditId: new Types.ObjectId(String(subreddit._id)),
            authorId: new Types.ObjectId(String((targetUser as any)._id))
          },
          {
            $set: {
              statusFlags: BigInt(4),
              removalReason: 'User banned - content removed',
              removedBy: new Types.ObjectId(String(moderatorAuth.id))
            }
          }
        )
        for (const target of postTargets) {
          await this.modLog.createLog({
            subredditId: subreddit._id,
            moderatorId: String(moderatorAuth.id),
            action: 'post.remove.batch_ban',
            targetType: 'post',
            targetId: String(target._id),
            reason: 'User banned - content removed',
            details: {
              batchAction: 'ban_user_delete_content',
              targetHash: target.contentHash || null,
              previousStatusFlags: String(target.statusFlags ?? '')
            },
            moderatorSignature
          } as any)
        }
        for (const target of commentTargets) {
          await this.modLog.createLog({
            subredditId: subreddit._id,
            moderatorId: String(moderatorAuth.id),
            action: 'comment.remove.batch_ban',
            targetType: 'comment',
            targetId: String(target._id),
            reason: 'User banned - content removed',
            details: {
              batchAction: 'ban_user_delete_content',
              targetHash: target.contentHash || null,
              previousStatusFlags: String(target.statusFlags ?? '')
            },
            moderatorSignature
          } as any)
        }
      } catch (e) {
        // ignore
      }
    }

    // mod log
    const log = await this.modLog.createLog({
      subredditId: subreddit._id,
      moderatorId: String(moderatorAuth.id),
      action: 'ban_user',
      targetType: 'user',
      targetId: String((targetUser as any)._id),
      reason,
      details: {
        banType,
        duration: duration || 'permanent',
        bannedUntil: bannedUntil || null,
        contentDeleted: !!deleteContent,
        moderatorNote: note,
        previousStatusFlags: String(prevFlags)
      },
      moderatorSignature
    } as any)

    // notify
    try {
      const msg =
        banType === 'permanent'
          ? `You have been permanently banned from r/${subreddit.name}. Reason: ${reason}`
          : `You have been banned from r/${subreddit.name} for ${duration} days. Reason: ${reason}`
      await this.notificationsService.create({
        userId: String((targetUser as any)._id),
        type: 'mod_action',
        actorId: String(moderatorAuth.id),
        targetId: String(subreddit._id),
        targetType: 'subreddit',
        message: msg
      } as any)
    } catch (e) {}

    return {
      success: true,
      action: 'ban',
      userId: String(targetUser._id),
      banType,
      bannedUntil: bannedUntil || null,
      modLogId: String((log as any)._id),
      contentDeleted: !!deleteContent
    }
  }

  // unban user
  async unbanUser(
    subredditIdOrName: string,
    targetUserId: string,
    moderatorAuth: any,
    moderatorSignature?: string,
    reason?: string
  ) {
    if (!moderatorAuth || !moderatorAuth.id) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    const subreddit = await this.findOne(subredditIdOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    const allowed = await this.hasPermission(String(moderatorAuth.id), String(subreddit._id), 'members.unban')
    if (!allowed) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN)
    // require and verify moderator signature
    if (!moderatorSignature) throw new HttpException('Missing moderator signature', HttpStatus.FORBIDDEN)
    const unbanPayload = `unban|${String(subreddit._id)}|${String(targetUserId)}|${reason || ''}`
    const pub = await getAuthPublicKeyById((this as any).model.db, String(moderatorAuth.id))
    if (!pub) throw new HttpException('Moderator public key not found', HttpStatus.FORBIDDEN)
    const ok = verifySignature(pub, unbanPayload, moderatorSignature)
    if (!ok) throw new HttpException('Invalid moderator signature', HttpStatus.FORBIDDEN)

    const member = await this.memberModel
      .findOne({
        subredditId: new Types.ObjectId(String(subreddit._id)),
        userId: new Types.ObjectId(String(targetUserId))
      })
      .exec()
    if (!member || (BigInt(member.statusFlags) & BigInt(4)) === BigInt(0))
      throw new HttpException('User is not banned', HttpStatus.BAD_REQUEST)

    const prevFlags = BigInt(member.statusFlags)
    member.statusFlags = prevFlags & ~BigInt(4)
    member.bannedUntil = null as any
    member.banReason = null as any
    await member.save()

    const log = await this.modLog.createLog({
      subredditId: subreddit._id,
      moderatorId: String(moderatorAuth.id),
      action: 'unban_user',
      targetType: 'user',
      targetId: String(targetUserId),
      reason: reason || 'Unbanned',
      moderatorSignature
    } as any)
    try {
      await this.notificationsService.create({
        userId: String(targetUserId),
        type: 'mod_action',
        actorId: String(moderatorAuth.id),
        targetId: String(subreddit._id),
        targetType: 'subreddit',
        message: `Your ban from r/${subreddit.name} has been lifted`
      } as any)
    } catch (e) {}

    return { success: true, action: 'unban', userId: targetUserId, modLogId: String((log as any)._id) }
  }

  // utility to escape regex special chars for exact name match
  private escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /** Join a subreddit (public or requires approval) */
  async join(id: string, user: any) {
    if (!user || !user.id) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    const subreddit = await this.findOne(id)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    if (subreddit.isPrivate) {
      // private subreddits require invitation/approval — for now return forbidden
      throw new HttpException('Subreddit is private', HttpStatus.FORBIDDEN)
    }

    // Resolve the provided user (which may be an auth id) to a User profile id
    let profileId: any = null
    try {
      const maybe = await this.usersService.findByAuthId(user.id)
      if (maybe && (maybe as any)._id) profileId = String((maybe as any)._id)
    } catch (e) {
      profileId = null
    }
    // If not resolved, assume the caller passed a profile id already
    if (!profileId) profileId = String(user.id)

    // upsert member: if exists, set isMember bit; else create
    const existing = await this.memberModel
      .findOne({ subredditId: subreddit._id, userId: new Types.ObjectId(profileId) })
      .exec()
    const isMemberBit = BigInt(1)
    if (existing) {
      const prevFlags = BigInt(existing.statusFlags || 0)
      const wasMember = (prevFlags & isMemberBit) !== BigInt(0)
      existing.statusFlags = prevFlags | isMemberBit
      await existing.save()
      await this.invalidatePermissionCache(String(subreddit._id), profileId)
      if (!wasMember) {
        await this.model.findByIdAndUpdate(subreddit._id, { $inc: { memberCount: 1 } }).exec()
        await this.invalidateSubredditCache(subreddit)
      }
    } else {
      const member = new this.memberModel({
        subredditId: subreddit._id,
        userId: new Types.ObjectId(profileId),
        statusFlags: isMemberBit
      })
      await member.save()
      await this.invalidatePermissionCache(String(subreddit._id), profileId)
      await this.model.findByIdAndUpdate(subreddit._id, { $inc: { memberCount: 1 } }).exec()
      await this.invalidateSubredditCache(subreddit)
    }

    // notify subreddit mods (best-effort)
    try {
      const mods = await this.memberModel
        .find({ subredditId: subreddit._id, statusFlags: { $bitsAllSet: 8 } } as any)
        .lean()
      for (const m of mods) {
        try {
          await this.notificationsService.create({
            userId: String(m.userId),
            type: 'mod_action',
            actorId: String(user.id),
            targetId: String(subreddit._id),
            targetType: 'subreddit',
            message: `User ${String(user.id)} joined ${subreddit.name}`
          } as any)
        } catch (e) {}
      }
    } catch (e) {}

    return { success: true }
  }

  /** Leave a subreddit */
  async leave(id: string, user: any) {
    if (!user || !user.id) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    const subreddit = await this.findOne(id)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    // Resolve the calling user to profile id (user.id may be auth id)
    let profileId: string | null = null
    try {
      const maybe = await this.usersService.findByAuthId(user.id)
      if (maybe && (maybe as any)._id) profileId = String((maybe as any)._id)
    } catch (e) {
      profileId = null
    }
    if (!profileId) profileId = String(user.id)

    const existing = await this.memberModel
      .findOne({ subredditId: subreddit._id, userId: new Types.ObjectId(profileId) })
      .exec()
    if (existing) {
      const prevFlags = BigInt(existing.statusFlags || 0)
      const memberBit = BigInt(1)
      if ((prevFlags & memberBit) !== BigInt(0)) {
        existing.statusFlags = prevFlags & ~memberBit
        await existing.save()
        await this.invalidatePermissionCache(String(subreddit._id), profileId)
        await this.model.findByIdAndUpdate(subreddit._id, { $inc: { memberCount: -1 } }).exec()
        await this.invalidateSubredditCache(subreddit)
      }
    }
    return { success: true }
  }

  async create(data: Partial<Subreddit> & { createdBy?: string }): Promise<Subreddit> {
    if (!data.name) throw new HttpException('name required', HttpStatus.BAD_REQUEST)
    const name = data.name.toLowerCase().trim()

    // check uniqueness (case-insensitive)
    const existing = await this.model
      .findOne({ name: { $regex: `^${this.escapeRegExp(name)}$`, $options: 'i' } })
      .exec()
    if (existing) throw new HttpException('Subreddit name already exists', HttpStatus.CONFLICT)

    // validate attachments (ownership & confirmed) before creating subreddit
    const iconAttachmentId = (data as any).iconAttachmentId
    const bannerAttachmentId = (data as any).bannerAttachmentId
    // Resolve createdBy (may be auth id or profile id) to a profile id
    let creatorProfileId: string | null = null
    if (data.createdBy) {
      try {
        const maybe = await this.usersService.findByAuthId(data.createdBy)
        if (maybe && (maybe as any)._id) creatorProfileId = String((maybe as any)._id)
      } catch (e) {
        creatorProfileId = null
      }
      if (!creatorProfileId) creatorProfileId = String(data.createdBy)
    }
    if (iconAttachmentId) {
      const a = await this.attachmentsService.findOne(iconAttachmentId)
      if (!a) throw new HttpException('icon attachment not found', HttpStatus.BAD_REQUEST)
      if (creatorProfileId && String(a.ownerId) !== String(creatorProfileId))
        throw new HttpException('icon attachment must belong to creator', HttpStatus.FORBIDDEN)
      if (!a.confirmed) throw new HttpException('icon upload not confirmed', HttpStatus.BAD_REQUEST)
    }
    if (bannerAttachmentId) {
      const a = await this.attachmentsService.findOne(bannerAttachmentId)
      if (!a) throw new HttpException('banner attachment not found', HttpStatus.BAD_REQUEST)
      if (creatorProfileId && String(a.ownerId) !== String(creatorProfileId))
        throw new HttpException('banner attachment must belong to creator', HttpStatus.FORBIDDEN)
      if (!a.confirmed) throw new HttpException('banner upload not confirmed', HttpStatus.BAD_REQUEST)
    }

    let createdSub: Subreddit | null = null
    try {
      const toCreate: any = { ...(data as any), name }
      const doc = new this.model(toCreate)
      createdSub = await doc.save()

      // create subreddit member for creator with moderator bit set
      const userId = creatorProfileId || (data.createdBy as any)
      if (!userId) throw new HttpException('creator user id missing', HttpStatus.BAD_REQUEST)

      // set member + moderator bits: member(1) | moderator(8) => 9
      const statusFlags = BigInt(1) | BigInt(8)
      const member = new this.memberModel({
        subredditId: createdSub._id,
        userId: new Types.ObjectId(userId),
        statusFlags
      })
      await member.save()
      await this.invalidatePermissionCache(String(createdSub._id), String(userId))

      // link attachments to subreddit (non-transactional — already validated)
      try {
        if (iconAttachmentId) {
          await this.attachmentsService.update(iconAttachmentId, {
            attachedToType: 'subreddit',
            attachedToId: createdSub._id as any
          })
        }
        if (bannerAttachmentId) {
          await this.attachmentsService.update(bannerAttachmentId, {
            attachedToType: 'subreddit',
            attachedToId: createdSub._id as any
          })
        }
      } catch (e) {
        // non-fatal: log or ignore — attachments linking can be retried by maintenance
      }

      await this.invalidateSubredditCache(createdSub)
      return createdSub
    } catch (err) {
      // try cleanup if subreddit was partially created
      if (createdSub && createdSub._id) {
        try {
          await this.model.findByIdAndDelete(createdSub._id).exec()
        } catch (e) {
          // ignore
        }
      }
      throw new HttpException(err.message || 'Could not create subreddit', err.status || HttpStatus.BAD_REQUEST)
    }
  }

  async findAll(filter: any = {}, limit = 50, skip = 0, sort: 'popular' | 'newest' | 'alphabetical' = 'newest'): Promise<Subreddit[]> {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
    const safeSkip = Math.max(Number(skip) || 0, 0)
    const sortSpec =
      sort === 'popular' ? { memberCount: -1, createdAt: -1 } : sort === 'alphabetical' ? { name: 1 } : { createdAt: -1 }
    const key = `jb:subreddits:list:${this.redis.stableStringify(filter)}:${safeLimit}:${safeSkip}:${sort}`
    return this.redis.rememberJson(key, this.cacheTtlSeconds, () =>
      this.model
        .find(filter)
        .sort(sortSpec as any)
        .limit(safeLimit)
        .skip(safeSkip)
        .populate('createdBy', 'username')
        .lean()
        .exec() as any
    )
  }

  async suggest(q = '', limit = 8) {
    const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 12)
    const term = q.trim()
    const filter = term
      ? { $or: [{ name: { $regex: this.escapeRegExp(term), $options: 'i' } }, { displayName: { $regex: this.escapeRegExp(term), $options: 'i' } }] }
      : {}
    const key = `jb:subreddits:suggest:${term.toLowerCase()}:${safeLimit}`
    return this.redis.rememberJson(key, this.cacheTtlSeconds, () =>
      this.model
        .find(filter)
        .sort({ memberCount: -1, createdAt: -1 })
        .limit(safeLimit)
        .select('name displayName description memberCount')
        .lean()
        .exec() as any
    )
  }

  async findOne(idOrName: string): Promise<Subreddit | null> {
    const normalized = Types.ObjectId.isValid(idOrName) ? idOrName : idOrName.toLowerCase()
    return this.redis.rememberJson(`jb:subreddits:one:${normalized}`, this.cacheTtlSeconds, () => {
      if (Types.ObjectId.isValid(idOrName)) {
        return this.model.findById(idOrName).lean().exec() as any
      }
      return this.model.findOne({ name: idOrName.toLowerCase() }).lean().exec() as any
    })
  }

  async update(id: string, update: Partial<Subreddit>): Promise<Subreddit | null> {
    if (!Types.ObjectId.isValid(id)) return null
    const doc = await this.model.findByIdAndUpdate(id, update, { new: true }).exec()
    await this.invalidateSubredditCache(doc)
    return doc
  }

  async transferOwnership(id: string, newOwnerId: string, actor: any): Promise<Subreddit | null> {
    if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(newOwnerId)) {
      throw new HttpException('Invalid community or user id', HttpStatus.BAD_REQUEST)
    }

    const subreddit = await this.findOne(id)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    const abac = BigInt(actor?.abac ?? 0)
    const isAdmin = (abac & (BigInt(1) << BigInt(5))) !== BigInt(0)
    const actorProfile = actor?.id ? await this.usersService.findByAuthId(actor.id).catch(() => null) : null
    const isOwner = actorProfile?._id && String((subreddit as any).createdBy) === String(actorProfile._id)

    if (!isAdmin && !isOwner) {
      throw new HttpException('Only the owner or a global admin can transfer ownership', HttpStatus.FORBIDDEN)
    }

    const doc = await this.model
      .findByIdAndUpdate(id, { createdBy: new Types.ObjectId(newOwnerId) }, { new: true })
      .exec()
    await this.invalidateSubredditCache(doc)
    return doc
  }

  async stats(idOrName: string) {
    const subreddit = await this.findOne(idOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    const subredditId = new Types.ObjectId(String((subreddit as any)._id))
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const [postCount, commentCount, recentPostAuthors, recentCommentAuthors] = await Promise.all([
      this.postModel.countDocuments({ subredditId }),
      this.commentModel.countDocuments({ subredditId }),
      this.postModel.distinct('authorId', { subredditId, createdAt: { $gte: since } }),
      this.commentModel.distinct('authorId', { subredditId, createdAt: { $gte: since } })
    ])

    const activeUsers = new Set([...recentPostAuthors, ...recentCommentAuthors].map(String)).size
    const postsByDay = await this.postModel.aggregate([
      { $match: { subredditId } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 30 },
      { $project: { _id: 0, date: '$_id', count: 1 } }
    ])

    const topContributors = await this.postModel.aggregate([
      { $match: { subredditId } },
      { $group: { _id: '$authorId', postCount: { $sum: 1 }, karma: { $sum: '$score' } } },
      { $sort: { postCount: -1, karma: -1 } },
      { $limit: 10 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: { $toString: '$_id' },
          username: { $ifNull: ['$user.username', 'unknown'] },
          postCount: 1,
          commentCount: { $literal: 0 },
          karma: { $ifNull: ['$karma', 0] }
        }
      }
    ])

    return {
      memberCount: (subreddit as any).memberCount || 0,
      postCount,
      commentCount,
      activeUsers,
      growthRate: 0,
      topContributors,
      postsByDay: postsByDay.reverse(),
      engagementRate: ((subreddit as any).memberCount || 0) > 0 ? activeUsers / (subreddit as any).memberCount : 0
    }
  }

  // list moderators for a subreddit
  async listModerators(idOrName: string) {
    const subreddit = await this.findOne(idOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)
    const mods = await this.memberModel
      .find({ subredditId: subreddit._id, statusFlags: { $bitsAllSet: BigInt(8) } })
      .lean()
    const out: any[] = []
    for (const m of mods) {
      let user: any = null
      try {
        user = await this.usersService.findById(String(m.userId))
      } catch (e) {
        user = null
      }
      out.push({ member: m, user })
    }
    return out
  }

  // list recent mod logs for subreddit
  async listModLogs(idOrName: string, limit = 50, skip = 0) {
    const subreddit = await this.findOne(idOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)
    // delegate to modLog service
    return this.modLog.listForSubreddit(String(subreddit._id), limit, skip)
  }

  // list currently banned members with user info
  async listBans(idOrName: string) {
    const subreddit = await this.findOne(idOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)
    const banned = await this.memberModel
      .find({ subredditId: subreddit._id, statusFlags: { $bitsAllSet: 4 } } as any)
      .lean()
    const out: any[] = []
    for (const m of banned) {
      let user: any = null
      try {
        user = await this.usersService.findById(String(m.userId))
      } catch (e) {
        user = null
      }
      out.push({ member: m, user })
    }
    return out
  }

  // add a moderator (sets moderator bit)
  async addModerator(idOrName: string, userId: string, moderatorAuth: any, moderatorSignature?: string) {
    if (!moderatorAuth || !moderatorAuth.id) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    const subreddit = await this.findOne(idOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    const allowed = await this.hasPermission(
      String(moderatorAuth.id),
      subreddit._id as any as Types.ObjectId,
      'assign_roles'
    )
    if (!allowed) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN)
    if (!moderatorSignature) throw new HttpException('Missing moderator signature', HttpStatus.FORBIDDEN)
    const addPayload = `add_moderator|${String(subreddit._id)}|${String(userId)}`
    const addPub = await getAuthPublicKeyById((this as any).model.db, String(moderatorAuth.id))
    if (!addPub || !verifySignature(addPub, addPayload, moderatorSignature)) {
      throw new HttpException('Invalid moderator signature', HttpStatus.FORBIDDEN)
    }

    const user = await this.usersService.findById(userId)
    if (!user) throw new HttpException('User not found', HttpStatus.BAD_REQUEST)

    let member = await this.memberModel
      .findOne({ subredditId: subreddit._id, userId: new Types.ObjectId(String((user as any)._id)) })
      .exec()
    const prevFlags = member ? BigInt(member.statusFlags) : BigInt(0)
    const modBit = BigInt(8)
    const memberBit = BigInt(1)
    if (!member) {
      member = new this.memberModel({
        subredditId: subreddit._id,
        userId: new Types.ObjectId(String((user as any)._id)),
        statusFlags: memberBit | modBit
      })
      await member.save()
      await this.model.findByIdAndUpdate(subreddit._id, { $inc: { memberCount: 1 } }).exec()
      await this.invalidateSubredditCache(subreddit)
    } else {
      member.statusFlags = BigInt(member.statusFlags) | modBit | memberBit
      await member.save()
      await this.invalidatePermissionCache(String(subreddit._id), String((user as any)._id))
    }

    const log = await this.modLog.createLog({
      subredditId: subreddit._id,
      moderatorId: String(moderatorAuth.id),
      action: 'add_moderator',
      targetType: 'user',
      targetId: String((user as any)._id),
      reason: 'added as moderator',
      details: { previousStatusFlags: String(prevFlags) },
      moderatorSignature
    } as any)
    try {
      await this.notificationsService.create({
        userId: String(user._id),
        type: 'mod_action',
        actorId: String(moderatorAuth.id),
        targetId: String(subreddit._id),
        targetType: 'subreddit',
        message: `You have been made a moderator of r/${subreddit.name}`
      } as any)
    } catch (e) {}

    return { success: true, userId: String(user._id), modLogId: String((log as any)._id) }
  }

  // remove moderator (unset moderator bit)
  async removeModerator(idOrName: string, userId: string, moderatorAuth: any, moderatorSignature?: string) {
    if (!moderatorAuth || !moderatorAuth.id) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    const subreddit = await this.findOne(idOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    const allowed = await this.hasPermission(
      String(moderatorAuth.id),
      subreddit._id as any as Types.ObjectId,
      'assign_roles'
    )
    if (!allowed) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN)
    if (!moderatorSignature) throw new HttpException('Missing moderator signature', HttpStatus.FORBIDDEN)
    const removePayload = `remove_moderator|${String(subreddit._id)}|${String(userId)}`
    const removePub = await getAuthPublicKeyById((this as any).model.db, String(moderatorAuth.id))
    if (!removePub || !verifySignature(removePub, removePayload, moderatorSignature)) {
      throw new HttpException('Invalid moderator signature', HttpStatus.FORBIDDEN)
    }

    const member = await this.memberModel
      .findOne({ subredditId: subreddit._id, userId: new Types.ObjectId(String(userId)) })
      .exec()
    if (!member) throw new HttpException('User is not a member/moderator', HttpStatus.BAD_REQUEST)
    const prevFlags = BigInt(member.statusFlags)
    const modBit = BigInt(8)
    if ((prevFlags & modBit) === BigInt(0)) throw new HttpException('User is not a moderator', HttpStatus.BAD_REQUEST)

    member.statusFlags = prevFlags & ~modBit
    await member.save()
    await this.invalidatePermissionCache(String(subreddit._id), String(userId))
    await this.invalidateSubredditCache(subreddit)

    const log = await this.modLog.createLog({
      subredditId: subreddit._id,
      moderatorId: String(moderatorAuth.id),
      action: 'remove_moderator',
      targetType: 'user',
      targetId: String(userId),
      reason: 'removed moderator',
      moderatorSignature
    } as any)
    try {
      await this.notificationsService.create({
        userId: String(userId),
        type: 'mod_action',
        actorId: String(moderatorAuth.id),
        targetId: String(subreddit._id),
        targetType: 'subreddit',
        message: `You are no longer a moderator of r/${subreddit.name}`
      } as any)
    } catch (e) {}

    return { success: true, userId: String(userId), modLogId: String((log as any)._id) }
  }

  async remove(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false
    const existing = await this.model.findById(id).lean().exec()
    const res = await this.model.findByIdAndDelete(id).exec()
    await this.invalidateSubredditCache(existing)
    return !!res
  }
}
