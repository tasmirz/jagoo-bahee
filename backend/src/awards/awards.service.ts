import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
// Use model names directly to avoid depending on individual schema files
import { CreateAwardTypeDto } from './dto/create-award-type.dto'
import { UpdateAwardTypeDto } from './dto/update-award-type.dto'
import { CreateAwardDto } from './dto/create-award.dto'
import { UsersService } from 'src/users/users.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PostsService } from 'src/posts/posts.service'
import { CommentsService } from 'src/comments/comments.service'

@Injectable()
export class AwardsService {
  constructor(
    @InjectModel('AwardType') private readonly awardTypeModel: Model<any>,
    @InjectModel('Award') private readonly awardModel: Model<any>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => PostsService))
    private readonly postsService: PostsService,
    @Inject(forwardRef(() => CommentsService))
    private readonly commentsService: CommentsService
  ) {}

  // AwardType operations
  async createAwardType(dto: CreateAwardTypeDto) {
    const doc = await this.awardTypeModel.create({ ...dto })
    return doc
  }

  async listAwardTypes(query: any = {}) {
    const filter: any = {}
    if (query.name) filter.name = new RegExp(escapeRegExp(String(query.name).slice(0, 80)), 'i')
    if (typeof query.isActive === 'boolean') filter.isActive = query.isActive

    const limit = query.limit && query.limit > 0 && query.limit <= 100 ? query.limit : 20
    const page = query.page && query.page > 0 ? query.page : 1

    const [items, total] = await Promise.all([
      this.awardTypeModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.awardTypeModel.countDocuments(filter)
    ])

    return { items, total, page, limit }
  }

  async getAwardType(id: string) {
    const doc = await this.awardTypeModel.findById(id).lean()
    if (!doc) throw new NotFoundException('AwardType not found')
    return doc
  }

  async updateAwardType(id: string, dto: UpdateAwardTypeDto) {
    const updated = await this.awardTypeModel.findByIdAndUpdate(id, { $set: dto }, { new: true }).lean()
    if (!updated) throw new NotFoundException('AwardType not found')
    return updated
  }

  async deleteAwardType(id: string) {
    await this.awardTypeModel.deleteOne({ _id: new Types.ObjectId(id) })
    return { success: true }
  }

  // Awards
  async giveAward(giverId: string, dto: CreateAwardDto) {
    // Basic validations: awardType exists
    const awardType = await this.awardTypeModel.findById(dto.awardTypeId)
    if (!awardType) throw new NotFoundException('AwardType not found')

    // Find target author
    let targetAuthorId: string | null = null
    try {
      if (dto.targetType === 'post') {
        const post = await this.postsService.findById(dto.targetId)
        targetAuthorId = String((post as any).authorId)
      } else {
        const comment = await this.commentsService.findById(dto.targetId)
        targetAuthorId = String((comment as any).authorId)
      }
    } catch (e) {
      throw new NotFoundException('Target content not found')
    }

    if (!targetAuthorId) throw new NotFoundException('Target author not found')

    const doc = await this.awardModel.create({
      awardTypeId: new Types.ObjectId(dto.awardTypeId),
      giverId: new Types.ObjectId(giverId),
      targetId: new Types.ObjectId(dto.targetId),
      targetType: dto.targetType,
      isAnonymous: dto.isAnonymous || false,
      message: dto.message
    })

    // Notify target
    try {
      await this.notificationsService.create({
        userId: targetAuthorId,
        type: 'award_received',
        actorId: giverId,
        targetId: String(doc._id),
        targetType: 'award',
        message: `You received a ${awardType.name} award!`
      } as any)
    } catch (e) {}

    // charge giver (deduct cost from karma for simplicity)
    if (awardType.cost > 0) {
      await this.usersService.adjustKarma(giverId, 'post', -awardType.cost)
    }
    // give some karma to target
    await this.usersService.adjustKarma(targetAuthorId, dto.targetType as any, 5)

    return doc
  }

  async listAwardsForTarget(targetId: string, targetType: 'post' | 'comment', limit = 50) {
    return this.awardModel
      .find({ targetId: new Types.ObjectId(targetId), targetType })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
