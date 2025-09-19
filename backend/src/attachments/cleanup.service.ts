import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { AttachmentsService } from './attachments.service'
import config from 'src/config'

@Injectable()
export class AttachmentsCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttachmentsCleanupService.name)
  // TTLs can be configured via env
  private UNCONFIRMED_TTL = config.attachments.unconfirmedTtlSec // seconds
  private ORPHAN_TTL = config.attachments.orphanTtlSec // seconds
  private intervalHandle?: NodeJS.Timeout

  constructor(private readonly attachments: AttachmentsService) {}

  onModuleInit() {
    // run every hour
    this.intervalHandle = setInterval(() => this.handleCleanup(), 1000 * 60 * 60)
  }

  onModuleDestroy() {
    if (this.intervalHandle) clearInterval(this.intervalHandle)
  }

  async handleCleanup() {
    this.logger.debug('Running attachments cleanup')
    const now = new Date()
    const unconfirmedBefore = new Date(now.getTime() - this.UNCONFIRMED_TTL * 1000)
    const orphansBefore = new Date(now.getTime() - this.ORPHAN_TTL * 1000)

    try {
      const unconfirmed = await this.attachments.findUnconfirmedOlderThan(unconfirmedBefore)
      for (const u of unconfirmed) {
        try {
          await this.attachments.deleteFileRecordAndObject(u)
          this.logger.log(`Deleted unconfirmed attachment ${u.minioKey}`)
        } catch (err) {
          this.logger.warn(`Failed to delete unconfirmed ${u.minioKey}: ${err.message}`)
        }
      }

      const orphans = await this.attachments.findOrphansOlderThan(orphansBefore)
      for (const o of orphans) {
        try {
          await this.attachments.deleteFileRecordAndObject(o)
          this.logger.log(`Deleted orphaned attachment ${o.minioKey}`)
        } catch (err) {
          this.logger.warn(`Failed to delete orphan ${o.minioKey}: ${err.message}`)
        }
      }
    } catch (err) {
      this.logger.error('Cleanup failed: ' + err.message)
    }
  }
}
