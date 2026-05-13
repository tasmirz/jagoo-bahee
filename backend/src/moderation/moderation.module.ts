import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Auth, AuthSchema } from 'src/auth/schemas/auth.schema'
import { ModLog, ModLogSchema } from './schemas/mod-log.schema'
import { ServerAcknowledgement, ServerAcknowledgementSchema } from './schemas/server-acknowledgement.schema'
import { AuditReceipt, AuditReceiptSchema } from './schemas/audit-receipt.schema'
import { ModerationEvent, ModerationEventSchema } from './schemas/moderation-event.schema'
import { Report, ReportSchema } from './schemas/report.schema'
import { ModLogService } from './mod-log.service'
import { ServerAcknowledgementsService } from './server-acknowledgements.service'
import { AuditReceiptsService } from './audit-receipts.service'
import { ModerationEventsService } from './moderation-events.service'
import { AuditController } from './audit.controller'
import { ModerationController } from './moderation.controller'
import { ReportsController } from './reports.controller'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Auth.name, schema: AuthSchema },
      { name: ModLog.name, schema: ModLogSchema },
      { name: ModerationEvent.name, schema: ModerationEventSchema },
      { name: ServerAcknowledgement.name, schema: ServerAcknowledgementSchema },
      { name: AuditReceipt.name, schema: AuditReceiptSchema },
      { name: Report.name, schema: ReportSchema }
    ])
  ],
  providers: [ModLogService, ModerationEventsService, ServerAcknowledgementsService, AuditReceiptsService],
  controllers: [ModerationController, ReportsController, AuditController],
  exports: [ModLogService, ModerationEventsService, ServerAcknowledgementsService, AuditReceiptsService]
})
export class ModerationModule {}
