import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Auth } from 'src/auth/schemas/auth.schema'
import { canonicalJson, sha256Hex } from 'src/common/canonical-json.util'
import { signServerMessage } from 'src/common/server-sign.util'
import { ServerAcknowledgementsService } from './server-acknowledgements.service'
import { ModerationEvent } from './schemas/moderation-event.schema'

export interface CreateModerationEventInput {
  subredditId: Types.ObjectId | string
  actorAuthId?: Types.ObjectId | string
  action: string
  targetType: string
  targetId?: Types.ObjectId | string
  reason?: string
  details?: Record<string, any>
  moderatorSignature: string
}

@Injectable()
export class ModerationEventsService {
  constructor(
    @InjectModel(ModerationEvent.name) private readonly model: Model<ModerationEvent>,
    @InjectModel(Auth.name) private readonly authModel: Model<Auth>,
    private readonly acknowledgements: ServerAcknowledgementsService
  ) {}

  async createEvent(input: CreateModerationEventInput) {
    const subredditId = new Types.ObjectId(String(input.subredditId))
    const actorAuthId = input.actorAuthId ? new Types.ObjectId(String(input.actorAuthId)) : undefined
    const targetId = input.targetId ? new Types.ObjectId(String(input.targetId)) : undefined
    const latest = await this.model.findOne({ subredditId }).sort({ createdAt: -1 }).lean().exec()
    const previousEventHash = latest?.eventHash || ''
    const actorPublicKey = actorAuthId ? await this.actorPublicKey(actorAuthId) : ''
    const previousStateHash = sha256Hex(canonicalJson(input.details?.previousState || input.details?.previous || {}))
    const newStateHash = sha256Hex(canonicalJson(input.details?.newState || input.details?.next || input.details || {}))
    const eventId = new Types.ObjectId().toHexString()
    const unsigned = {
      eventId,
      eventVersion: 1,
      subredditId: String(subredditId),
      actorAuthId: actorAuthId ? String(actorAuthId) : '',
      actorPublicKey,
      action: input.action,
      targetType: input.targetType,
      targetId: targetId ? String(targetId) : '',
      reason: input.reason || '',
      previousStateHash,
      newStateHash,
      moderatorSignature: input.moderatorSignature,
      previousEventHash
    }
    const eventHash = sha256Hex(canonicalJson(unsigned))
    const serverSignature = signServerMessage(eventHash)
    const event = await this.model.create({
      ...unsigned,
      subredditId,
      actorAuthId,
      targetId,
      eventHash,
      serverSignature
    })

    await this.acknowledgements.create({
      contentType: 'moderation_event',
      contentId: event._id as Types.ObjectId,
      authorId: actorAuthId,
      action: 'created',
      contentHash: eventHash,
      userSignature: input.moderatorSignature,
      serverSignature,
      metadata: {
        eventId,
        action: input.action,
        targetType: input.targetType,
        targetId: targetId ? String(targetId) : undefined,
        previousEventHash
      }
    })

    return event
  }

  async listForSubreddit(subredditId: string | Types.ObjectId, limit = 50, skip = 0) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
    const safeSkip = Math.min(Math.max(Number(skip) || 0, 0), 10000)
    return this.model
      .find({ subredditId: new Types.ObjectId(String(subredditId)) })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .skip(safeSkip)
      .lean()
      .exec()
  }

  async findByTarget(targetType: string, targetId: string | Types.ObjectId, limit = 50) {
    if (!Types.ObjectId.isValid(String(targetId))) return []
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
    return this.model
      .find({ targetType, targetId: new Types.ObjectId(String(targetId)) })
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec()
  }

  private async actorPublicKey(actorAuthId: Types.ObjectId) {
    const auth = await this.authModel.findById(actorAuthId).select({ publicKey: 1 }).lean().exec()
    if (!auth?.publicKey) return ''
    return Buffer.from((auth.publicKey as any).buffer || auth.publicKey).toString('base64')
  }
}
