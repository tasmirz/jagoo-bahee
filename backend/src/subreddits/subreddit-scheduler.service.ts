import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { SubredditMember } from './schemas/subreddit-member.schema'
import { ModLogService } from 'src/moderation/mod-log.service'

@Injectable()
export class SubredditSchedulerService {
  private readonly logger = new Logger(SubredditSchedulerService.name)
  constructor(
    @InjectModel(SubredditMember.name) private readonly memberModel: Model<SubredditMember>,
    private readonly modLog: ModLogService
  ) {}

  // run every minute
  @Cron(CronExpression.EVERY_MINUTE)
  async handleCron() {
    try {
      const now = new Date()
      // find members with bannedUntil in the past and banned bit set
      const expired = await this.memberModel
        .find({ bannedUntil: { $lte: now }, statusFlags: { $bitsAllSet: 4 } } as any)
        .exec()
      for (const m of expired) {
        try {
          const prev = BigInt(m.statusFlags || 0)
          m.statusFlags = prev & ~BigInt(4)
          m.bannedUntil = null as any
          m.banReason = null as any
          await m.save()
          await this.modLog.createLog({
            subredditId: m.subredditId,
            moderatorId: null as any,
            action: 'unban_expired',
            targetType: 'user',
            targetId: m.userId,
            reason: 'Temporary ban expired'
          } as any)
        } catch (e) {
          // ignore per-member errors
        }
      }
    } catch (e) {
      this.logger.error('Failed to run ban expiry job', e)
    }
  }
}
