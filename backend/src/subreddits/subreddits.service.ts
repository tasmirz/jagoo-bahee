import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Subreddit } from './schemas/subreddit.schema'
import { SubredditMember } from './schemas/subreddit-member.schema'
import { Role } from 'src/roles/schemas/role.schema'
import { UserRole } from 'src/roles/schemas/user-role.schema'
import { AttachmentsService } from 'src/attachments/attachments.service'

@Injectable()
export class SubredditsService {
  constructor(
    @InjectModel(Subreddit.name) private readonly model: Model<Subreddit>,
    @InjectModel(SubredditMember.name) private readonly memberModel: Model<SubredditMember>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(UserRole.name) private readonly userRoleModel: Model<UserRole>,
    private readonly attachmentsService: AttachmentsService
  ) {}

  // utility to escape regex special chars for exact name match
  private escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
    const userId = data.createdBy
    if (iconAttachmentId) {
      const a = await this.attachmentsService.findOne(iconAttachmentId)
      if (!a) throw new HttpException('icon attachment not found', HttpStatus.BAD_REQUEST)
      if (String(a.ownerId) !== String(userId))
        throw new HttpException('icon attachment must belong to creator', HttpStatus.FORBIDDEN)
      if (!a.confirmed) throw new HttpException('icon upload not confirmed', HttpStatus.BAD_REQUEST)
    }
    if (bannerAttachmentId) {
      const a = await this.attachmentsService.findOne(bannerAttachmentId)
      if (!a) throw new HttpException('banner attachment not found', HttpStatus.BAD_REQUEST)
      if (String(a.ownerId) !== String(userId))
        throw new HttpException('banner attachment must belong to creator', HttpStatus.FORBIDDEN)
      if (!a.confirmed) throw new HttpException('banner upload not confirmed', HttpStatus.BAD_REQUEST)
    }

    let createdSub: Subreddit | null = null
    try {
      const toCreate: any = { ...(data as any), name }
      const doc = new this.model(toCreate)
      createdSub = await doc.save()

      // create subreddit member for creator with moderator bit set
      const userId = data.createdBy
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

  async remove(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false
    const res = await this.model.findByIdAndDelete(id).exec()
    return !!res
  }
}
