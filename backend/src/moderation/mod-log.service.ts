import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { ModerationEventsService } from './moderation-events.service'
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
  constructor(
    @InjectModel(ModLog.name) private readonly model: Model<ModLog>,
    private readonly events?: ModerationEventsService
  ) {}

  async createLog(dto: CreateModLogDto) {
    const systemAction = !dto.moderatorId || String(dto.action || '').startsWith('system.')
    if (!systemAction && !dto.moderatorSignature) {
      throw new BadRequestException('moderatorSignature required for moderation events')
    }
    const doc = {
      subredditId: dto.subredditId ? new Types.ObjectId(String(dto.subredditId)) : undefined,
      moderatorId: dto.moderatorId ? new Types.ObjectId(String(dto.moderatorId)) : undefined,
      action: dto.action,
      targetType: dto.targetType,
      targetId: dto.targetId ? new Types.ObjectId(String(dto.targetId)) : undefined,
      reason: dto.reason,
      details: dto.details || {},
      moderatorSignature: dto.moderatorSignature || 'server-attested-system-event'
    }
    const log = await this.model.create(doc)
    if (doc.subredditId) {
      await this.events?.createEvent({
        subredditId: doc.subredditId,
        actorAuthId: doc.moderatorId,
        action: doc.action,
        targetType: doc.targetType,
        targetId: doc.targetId,
        reason: doc.reason,
        details: doc.details,
        moderatorSignature: doc.moderatorSignature
      })
    }
    return log
  }

  async listForSubreddit(subredditId: string | Types.ObjectId, limit = 50, skip = 0) {
    const q: any = { subredditId: new Types.ObjectId(String(subredditId)) }
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
    const safeSkip = Math.min(Math.max(Number(skip) || 0, 0), 10000)
    return this.model.find(q).sort({ createdAt: -1 }).limit(safeLimit).skip(safeSkip).lean().exec()
  }
}
