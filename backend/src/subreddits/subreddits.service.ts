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
  public async nameAvailability(name: string) {
    return await this.model.findOne({ name: this.escapeRegExp(name.toLowerCase().trim()) }).exec()
  }
  // helper: check if an actor (auth id) has a permission in subreddit via UserRole->Role or global ABAC admin
  /**
   * Check if a user has a specific permission in a subreddit
   * Hierarchy: Creator (via subreddit.createdBy) > Role Permissions (via UserRole) > Banned/Muted check (statusFlags)
   */
  async hasPermission(subredditId: string, userId: string, permission: string): Promise<boolean> {
    if (!userId) return false

    // Tier 0: Get user profile
    let user: any = null
    try {
      user = await this.usersService.findById(userId)
    } catch (e) {
      user = null
    }
    if (!user) return false

    // Check global admin via auth.abac
    try {
      const authDoc = await (this as any).model.db
        .collection('auths')
        .findOne({ _id: new Types.ObjectId(String(user.authId)) })
      if (authDoc && authDoc.abac) {
        const abac = BigInt(authDoc.abac || 0)
        const isAdmin = (abac & BigInt(1 << 5)) !== BigInt(0)
        if (isAdmin) return true
      }
    } catch (e) {
      // ignore
    }

    // Tier 1: Creator check (via subreddit.createdBy - highest authority)
    const subreddit = await this.model.findById(subredditId).exec()
    if (subreddit && String(subreddit.createdBy) === String(user._id)) {
      // Creators have ALL permissions unconditionally
      return true
    }

    // Check banned/muted status from SubredditMember
    const member = await this.memberModel
      .findOne({
        userId: new Types.ObjectId(String(user._id)),
        subredditId: new Types.ObjectId(String(subredditId))
      })
      .exec()

    if (!member) return false // Not a member

    const flags = BigInt(member.statusFlags || 0)
    const isBanned = (flags & BigInt(1)) !== BigInt(0) // Bit 0
    const isMuted = (flags & BigInt(2)) !== BigInt(0) // Bit 1

    // Banned users have no permissions (unless they're the creator, checked above)
    if (isBanned) return false

    // Muted users can't post or comment
    if (isMuted && (permission === 'posts.create' || permission === 'comments.create')) {
      return false
    }

    // Tier 2: Check role-based permissions
    const ur = await this.userRoleModel
      .findOne({
        userId: new Types.ObjectId(String(user._id)),
        subredditId: new Types.ObjectId(String(subredditId))
      })
      .exec()

    if (!ur) return false // No role assigned

    const role = await this.roleModel.findById(ur.roleId).exec()
    if (!role) return false

    // Check for ALL_PERMISSIONS bit (creator role)
    const hasAllPerms = (BigInt(role.permissions) & BigInt(1 << 28)) !== BigInt(0)
    if (hasAllPerms) return true

    // Map permission string to RolePermission bit
    const permBit = this.getPermissionBit(permission)
    if (permBit === 0) return false // Unknown permission

    // Check if role has this specific permission
    return (BigInt(role.permissions) & BigInt(permBit)) !== BigInt(0)
  }

  /**
   * Map permission string to RolePermission bit value
   * @param permission - Permission string (e.g., 'posts.delete.all')
   * @returns Permission bit value or 0 if unknown
   */
  private getPermissionBit(permission: string): number {
    const permissionMap: Record<string, number> = {
      // Content Management
      'posts.view': 1 << 0,
      'posts.create': 1 << 1,
      'posts.edit.own': 1 << 2,
      'posts.edit.all': 1 << 3,
      'posts.delete.own': 1 << 4,
      'posts.delete.all': 1 << 5,
      'posts.pin': 1 << 6,
      'posts.lock': 1 << 7,
      'posts.approve': 1 << 8,
      'posts.remove': 1 << 9,

      // Comments
      'comments.view': 1 << 10,
      'comments.create': 1 << 11,
      'comments.edit.own': 1 << 12,
      'comments.edit.all': 1 << 13,
      'comments.delete.all': 1 << 14,

      // Moderation
      'mod.view.reports': 1 << 15,
      'mod.handle.reports': 1 << 16,
      'mod.view.logs': 1 << 17,
      'mod.ban.users': 1 << 18,
      'mod.mute.users': 1 << 19,

      // Members
      'members.view': 1 << 20,
      'members.kick': 1 << 21,
      'members.invite': 1 << 22,

      // Settings
      'settings.view': 1 << 23,
      'settings.edit': 1 << 24,
      'settings.roles': 1 << 25,
      'settings.moderators': 1 << 26,
      'settings.delete': 1 << 27,
      'subreddit.delete': 1 << 27, // Alias

      // Special
      'subreddit.transfer': 999, // Special permission (creator only, no bit)
      all: 1 << 28
    }

    return permissionMap[permission] || 0
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

    // Check if target is a moderator via UserRole
    const targetUserRole = await this.userRoleModel
      .findOne({
        subredditId: new Types.ObjectId(String(subreddit._id)),
        userId: new Types.ObjectId(String((targetUser as any)._id))
      })
      .exec()
    if (targetUserRole) {
      throw new HttpException('Cannot kick a moderator - remove their role first', HttpStatus.FORBIDDEN)
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

    // check existing ban (BANNED = bit 0, value 1)
    if ((BigInt(member.statusFlags) & BigInt(1)) !== BigInt(0)) {
      // already banned — check expiry
      if (member.bannedUntil && member.bannedUntil > new Date()) {
        throw new HttpException('User already banned', HttpStatus.BAD_REQUEST)
      }
    }

    let bannedUntil: Date | null = null
    if (banType === 'temporary' && duration && duration > 0) {
      bannedUntil = new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
    }

    // set banned bit (BANNED = bit 0, value 1)
    member.statusFlags = BigInt(member.statusFlags) | BigInt(1)
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
    if (!member || (BigInt(member.statusFlags) & BigInt(1)) === BigInt(0))
      throw new HttpException('User is not banned', HttpStatus.BAD_REQUEST)

    const prevFlags = BigInt(member.statusFlags)
    member.statusFlags = prevFlags & ~BigInt(1)
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

    // Prevent creator from leaving their own subreddit
    if (String(subreddit.createdBy) === String(profileId)) {
      throw new HttpException(
        'Subreddit creator cannot leave. Transfer ownership or delete the subreddit instead.',
        HttpStatus.FORBIDDEN
      )
    }

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

      // Create subreddit member for creator (no special statusFlags)
      const userId = creatorProfileId || (data.createdBy as any)
      if (!userId) throw new HttpException('creator user id missing', HttpStatus.BAD_REQUEST)

      // Member gets no special flags - permissions handled by roles
      const member = new this.memberModel({
        subredditId: createdSub._id,
        userId: new Types.ObjectId(userId),
        statusFlags: BigInt(0) // No special flags
      })
      await member.save()

      // Increment memberCount for the creator
      await this.model.findByIdAndUpdate(createdSub._id, { $inc: { memberCount: 1 } }).exec()

      // Create creator role with ALL permissions (use ALL_PERMISSIONS bit)
      const role = new this.roleModel({
        name: 'Creator',
        subredditId: createdSub._id,
        permissions: BigInt(1 << 28), // ALL_PERMISSIONS bit (268435456)
        isSystemRole: true
      })
      const savedRole = await role.save()

      // Link user to creator role
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
    return this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .populate('createdBy', 'username')
      .exec()
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

    const allowed = await this.hasPermission(String(subreddit._id), String(moderatorAuth.id), 'assign_roles')
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

    const allowed = await this.hasPermission(String(subreddit._id), String(moderatorAuth.id), 'assign_roles')
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

  async deleteSubreddit(idOrName: string, creatorAuth: any): Promise<boolean> {
    if (!creatorAuth || !creatorAuth.id) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)

    const subreddit = await this.findOne(idOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    // Get the user from auth
    const user = await this.usersService.findByAuthId(new Types.ObjectId(creatorAuth.id))
    if (!user) throw new HttpException('User not found', HttpStatus.NOT_FOUND)

    // Check if user is the creator (via subreddit.createdBy)
    if (String(subreddit.createdBy) !== String(user._id)) {
      throw new HttpException('Only the creator can delete the subreddit', HttpStatus.FORBIDDEN)
    }

    // Delete the subreddit
    await this.model.findByIdAndDelete(subreddit._id).exec()

    // Delete all memberships
    await this.memberModel.deleteMany({ subredditId: subreddit._id }).exec()

    // Delete all roles
    await this.roleModel.deleteMany({ subredditId: subreddit._id }).exec()

    // Delete all user-role assignments
    await this.userRoleModel.deleteMany({ subredditId: subreddit._id }).exec()

    return true
  }

  async transferOwnership(idOrName: string, currentOwnerAuth: any, newOwnerId: string): Promise<any> {
    if (!currentOwnerAuth || !currentOwnerAuth.id) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED)

    const subreddit = await this.findOne(idOrName)
    if (!subreddit) throw new HttpException('Subreddit not found', HttpStatus.NOT_FOUND)

    // Get the current user from auth
    const currentUser = await this.usersService.findByAuthId(new Types.ObjectId(currentOwnerAuth.id))
    if (!currentUser) throw new HttpException('User not found', HttpStatus.NOT_FOUND)

    // Check if current user is the creator (via subreddit.createdBy)
    if (String(subreddit.createdBy) !== String(currentUser._id)) {
      throw new HttpException('Only the creator can transfer ownership', HttpStatus.FORBIDDEN)
    }

    // Get the new owner user
    const newOwner = await this.usersService.findById(new Types.ObjectId(newOwnerId))
    if (!newOwner) throw new HttpException('New owner not found', HttpStatus.NOT_FOUND)

    // Update subreddit.createdBy to new owner
    await this.model.updateOne({ _id: subreddit._id }, { $set: { createdBy: new Types.ObjectId(newOwnerId) } }).exec()

    // Find the Creator role for this subreddit
    const creatorRole = await this.roleModel
      .findOne({
        subredditId: new Types.ObjectId(String(subreddit._id)),
        name: 'Creator'
      })
      .exec()

    if (creatorRole) {
      // Remove creator role from current owner
      await this.userRoleModel
        .deleteOne({
          subredditId: new Types.ObjectId(String(subreddit._id)),
          userId: new Types.ObjectId(String(currentUser._id)),
          roleId: creatorRole._id
        })
        .exec()

      // Assign creator role to new owner
      // Check if new owner already has a member record
      let newOwnerMember = await this.memberModel
        .findOne({
          subredditId: new Types.ObjectId(String(subreddit._id)),
          userId: new Types.ObjectId(newOwnerId)
        })
        .exec()

      if (!newOwnerMember) {
        // Create membership for new owner
        await this.memberModel.create({
          subredditId: new Types.ObjectId(String(subreddit._id)),
          userId: new Types.ObjectId(newOwnerId),
          statusFlags: BigInt(0), // No special flags
          joinedAt: new Date()
        })
      }

      // Assign creator role to new owner
      await this.userRoleModel.create({
        userId: new Types.ObjectId(newOwnerId),
        subredditId: new Types.ObjectId(String(subreddit._id)),
        roleId: creatorRole._id,
        assignedBy: new Types.ObjectId(String(currentUser._id))
      })
    }

    // Log the action
    try {
      await this.modLog.createLog({
        subredditId: new Types.ObjectId(String(subreddit._id)),
        moderatorId: new Types.ObjectId(String(currentUser._id)),
        action: 'transfer_ownership',
        targetType: 'subreddit',
        targetId: new Types.ObjectId(String(subreddit._id)),
        details: { newOwnerId: String(newOwnerId) }
      })
    } catch (e) {
      console.error('Failed to log ownership transfer:', e)
    }

    return {
      success: true,
      message: 'Ownership transferred successfully',
      newOwnerId: String(newOwnerId)
    }
  }

  /**
   * Migration method - No longer needed as statusFlags don't hold creator/moderator bits
   * @deprecated Use subreddit.createdBy and Role/UserRole system instead
   */
  async fixCreatorFlags(subredditId: string, actorAuth: any): Promise<any> {
    return {
      success: false,
      message: 'This endpoint is deprecated. Permissions are now managed via Roles and UserRoles.'
    }
  }

  async remove(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false
    const res = await this.model.findByIdAndDelete(id).exec()
    return !!res
  }
}
