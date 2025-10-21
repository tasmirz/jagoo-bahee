import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Subreddit } from './schemas/subreddit.schema'
import { SubredditMember } from './schemas/subreddit-member.schema'
import { Role } from 'src/roles/schemas/role.schema'
import { UserRole } from 'src/roles/schemas/user-role.schema'
import { AttachmentsService } from 'src/attachments/attachments.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { ModLogService } from 'src/moderation/mod-log.service'
import { verifySignature, getAuthPublicKeyById } from 'src/common/signature.util'
import { UsersService } from 'src/users/users.service'

@Injectable()
export class SubredditsService {
  constructor(
    @InjectModel(Subreddit.name) private readonly model: Model<Subreddit>,
    @InjectModel(SubredditMember.name) private readonly memberModel: Model<SubredditMember>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(UserRole.name) private readonly userRoleModel: Model<UserRole>,
    private readonly attachmentsService: AttachmentsService,
    private readonly notificationsService: NotificationsService,
    private readonly modLog: ModLogService,
    private readonly usersService: UsersService
  ) {}

  // helper: check if an actor (auth id) has a permission in subreddit via UserRole->Role or global ABAC admin
  private async hasPermission(actorAuthId: string, subredditId: any, permission: string): Promise<boolean> {
    if (!actorAuthId) return false
    // global admin check via auth.abac
    // Here we need to fetch the auth document to inspect abac — but the auth id is the JWT id (auth doc id)
    try {
      const authDoc = await (this as any).model.db.collection('auths').findOne({ _id: new Types.ObjectId(actorAuthId) })
      if (authDoc && authDoc.abac) {
        const abac = BigInt(authDoc.abac || 0)
        const isAdmin = (abac & BigInt(1 << 5)) !== BigInt(0)
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

    const ur = await this.userRoleModel
      .findOne({
        userId: new Types.ObjectId(String((user as any)._id)),
        subredditId: new Types.ObjectId(String(subredditId))
      })
      .exec()
    if (!ur) return false
    const role = await this.roleModel.findById(ur.roleId).exec()
    if (!role) return false
    return (role.permissions || []).includes(permission)
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
      targetMember.statusFlags = prevFlags & ~BigInt(1)
      await targetMember.save()
      await this.model.findByIdAndUpdate(subreddit._id, { $inc: { memberCount: -1 } }).exec()

      // create mod log
      const log = await this.modLog.createLog({
        subredditId: subreddit._id,
        moderatorId: String(moderatorAuth.id),
        action: 'kick_user',
        targetType: 'user',
        targetId: String((targetUser as any)._id),
        reason,
        details: { previousStatusFlags: String(prevFlags), kickedAt: new Date() }
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
    member.statusFlags = (BigInt(member.statusFlags) | BigInt(4)) & ~BigInt(1)
    member.bannedUntil = bannedUntil as any
    member.banReason = reason
    await member.save()

    // decrement memberCount if previously member
    if ((prevFlags & BigInt(1)) !== BigInt(0)) {
      await this.model.findByIdAndUpdate(subreddit._id, { $inc: { memberCount: -1 } }).exec()
    }

    // optional content deletion — best effort
    if (deleteContent) {
      try {
        // update posts and comments in this subreddit by this user — best-effort batch
        const postsColl = (this as any).model.db.collection('posts')
        const commentsColl = (this as any).model.db.collection('comments')
        await postsColl.updateMany(
          {
            subredditId: new Types.ObjectId(String(subreddit._id)),
            authorId: new Types.ObjectId(String((targetUser as any)._id))
          },
          {
            $set: {
              statusFlags: 1,
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
              statusFlags: 1,
              removalReason: 'User banned - content removed',
              removedBy: new Types.ObjectId(String(moderatorAuth.id))
            }
          }
        )
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
      }
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
      reason: reason || 'Unbanned'
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
      existing.statusFlags = BigInt(existing.statusFlags) | isMemberBit
      await existing.save()
    } else {
      const member = new this.memberModel({
        subredditId: subreddit._id,
        userId: new Types.ObjectId(profileId),
        statusFlags: isMemberBit
      })
      await member.save()
    }

    // increment memberCount
    await this.model.findByIdAndUpdate(subreddit._id, { $inc: { memberCount: 1 } }).exec()

    // notify subreddit mods (best-effort)
    try {
      const mods = await this.memberModel
        .find({ subredditId: subreddit._id, statusFlags: { $bitsAllSet: BigInt(8) } })
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

    const res = await this.memberModel
      .findOneAndDelete({ subredditId: subreddit._id, userId: new Types.ObjectId(profileId) })
      .exec()
    if (res) {
      await this.model.findByIdAndUpdate(subreddit._id, { $inc: { memberCount: -1 } }).exec()
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

      // create owner role
      const role = new this.roleModel({
        name: 'owner',
        subredditId: createdSub._id,
        permissions: ['manage_subreddit', 'ban_user', 'edit_rules', 'assign_roles'],
        isSystemRole: false
      })
      const savedRole = await role.save()

      // link user to role
      const userRole = new this.userRoleModel({
        userId: new Types.ObjectId(userId),
        subredditId: createdSub._id,
        roleId: savedRole._id,
        assignedBy: new Types.ObjectId(userId)
      })
      await userRole.save()

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
      // try cleanup if subreddit was partially created outside transaction
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

  async findAll(filter: any = {}, limit = 50, skip = 0): Promise<Subreddit[]> {
    return this.model.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).exec()
  }

  async findOne(idOrName: string): Promise<Subreddit | null> {
    if (Types.ObjectId.isValid(idOrName)) {
      return this.model.findById(idOrName).exec()
    }
    // allow lookup by name
    return this.model.findOne({ name: idOrName.toLowerCase() }).exec()
  }

  async update(id: string, update: Partial<Subreddit>): Promise<Subreddit | null> {
    if (!Types.ObjectId.isValid(id)) return null
    return this.model.findByIdAndUpdate(id, update, { new: true }).exec()
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
    return this.modLog.listForSubreddit(String(subreddit._id), Number(limit), Number(skip))
  }

  // list currently banned members with user info
  async listBans(idOrName: string) {
    const subreddit = await this.findOne(idOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)
    const banned = await this.memberModel
      .find({ subredditId: subreddit._id, statusFlags: { $bitsAllSet: BigInt(4) } })
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
  async addModerator(idOrName: string, userId: string, moderatorAuth: any) {
    if (!moderatorAuth || !moderatorAuth.id) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    const subreddit = await this.findOne(idOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    const allowed = await this.hasPermission(
      String(moderatorAuth.id),
      subreddit._id as any as Types.ObjectId,
      'assign_roles'
    )
    if (!allowed) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN)

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
    } else {
      member.statusFlags = BigInt(member.statusFlags) | modBit | (BigInt(member.statusFlags) | memberBit)
      await member.save()
    }

    const log = await this.modLog.createLog({
      subredditId: subreddit._id,
      moderatorId: String(moderatorAuth.id),
      action: 'add_moderator',
      targetType: 'user',
      targetId: String((user as any)._id),
      reason: 'added as moderator',
      details: { previousStatusFlags: String(prevFlags) }
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
  async removeModerator(idOrName: string, userId: string, moderatorAuth: any) {
    if (!moderatorAuth || !moderatorAuth.id) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)
    const subreddit = await this.findOne(idOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    const allowed = await this.hasPermission(
      String(moderatorAuth.id),
      subreddit._id as any as Types.ObjectId,
      'assign_roles'
    )
    if (!allowed) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN)

    const member = await this.memberModel
      .findOne({ subredditId: subreddit._id, userId: new Types.ObjectId(String(userId)) })
      .exec()
    if (!member) throw new HttpException('User is not a member/moderator', HttpStatus.BAD_REQUEST)
    const prevFlags = BigInt(member.statusFlags)
    const modBit = BigInt(8)
    if ((prevFlags & modBit) === BigInt(0)) throw new HttpException('User is not a moderator', HttpStatus.BAD_REQUEST)

    member.statusFlags = prevFlags & ~modBit
    await member.save()

    const log = await this.modLog.createLog({
      subredditId: subreddit._id,
      moderatorId: String(moderatorAuth.id),
      action: 'remove_moderator',
      targetType: 'user',
      targetId: String(userId),
      reason: 'removed moderator'
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
    const res = await this.model.findByIdAndDelete(id).exec()
    return !!res
  }
}
