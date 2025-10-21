import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { ModLog } from './schemas/mod-log.schema'

export interface CreateModLogDto {
  subredditId: Types.ObjectId | string
  moderatorId?: Types.ObjectId | string
  action: string
  targetType: string
  targetId?: Types.ObjectId | string
  reason?: string
  details?: Record<string, any>
  moderatorSignature?: string
}

@Injectable()
export class ModLogService {
  constructor(@InjectModel(ModLog.name) private readonly model: Model<ModLog>) {}

  async createLog(dto: CreateModLogDto) {
    const doc = {
      subredditId: dto.subredditId ? new Types.ObjectId(String(dto.subredditId)) : undefined,
      moderatorId: dto.moderatorId ? new Types.ObjectId(String(dto.moderatorId)) : undefined,
      action: dto.action,
      targetType: dto.targetType,
      targetId: dto.targetId ? new Types.ObjectId(String(dto.targetId)) : undefined,
      reason: dto.reason,
      details: dto.details || {},
      moderatorSignature: dto.moderatorSignature || ''
    }
    return this.model.create(doc)
  }

  async listForSubreddit(subredditId: string | Types.ObjectId, limit = 50, skip = 0) {
    const q: any = { subredditId: new Types.ObjectId(String(subredditId)) }
    return this.model.find(q).sort({ createdAt: -1 }).limit(Number(limit)).skip(Number(skip)).lean().exec()
  }
}
