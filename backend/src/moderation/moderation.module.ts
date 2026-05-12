import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ModLog, ModLogSchema } from './schemas/mod-log.schema'
import { ServerAcknowledgement, ServerAcknowledgementSchema } from './schemas/server-acknowledgement.schema'
import { Report, ReportSchema } from './schemas/report.schema'
import { ModLogService } from './mod-log.service'
import { ServerAcknowledgementsService } from './server-acknowledgements.service'
import { ModerationController } from './moderation.controller'
import { ReportsController } from './reports.controller'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ModLog.name, schema: ModLogSchema },
      { name: ServerAcknowledgement.name, schema: ServerAcknowledgementSchema },
      { name: Report.name, schema: ReportSchema }
    ])
  ],
  providers: [ModLogService, ServerAcknowledgementsService],
  controllers: [ModerationController, ReportsController],
  exports: [ModLogService, ServerAcknowledgementsService]
})
export class ModerationModule {}
