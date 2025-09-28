import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
// Use model names directly to avoid depending on individual schema files
import { CreateAwardTypeDto } from './dto/create-award-type.dto'
import { UpdateAwardTypeDto } from './dto/update-award-type.dto'
import { CreateAwardDto } from './dto/create-award.dto'

@Injectable()
export class AwardsService {
  constructor(
    @InjectModel('AwardType') private readonly awardTypeModel: Model<any>,
    @InjectModel('Award') private readonly awardModel: Model<any>
  ) {}

  // AwardType operations
  async createAwardType(dto: CreateAwardTypeDto) {
    const doc = await this.awardTypeModel.create({ ...dto })
    return doc
  }

  async listAwardTypes(query: any = {}) {
    const filter: any = {}
    if (query.name) filter.name = new RegExp(query.name, 'i')
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

    const doc = await this.awardModel.create({
      awardTypeId: new Types.ObjectId(dto.awardTypeId),
      giverId: new Types.ObjectId(giverId),
      targetId: new Types.ObjectId(dto.targetId),
      targetType: dto.targetType,
      isAnonymous: dto.isAnonymous || false,
      message: dto.message
    })

    // TODO: charge giver, increment award counts, notify target
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
