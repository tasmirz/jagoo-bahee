import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { ModLog, ModLogSchema } from './schemas/mod-log.schema'
import { ModLogService } from './mod-log.service'

@Module({
  imports: [MongooseModule.forFeature([{ name: ModLog.name, schema: ModLogSchema }])],
  providers: [ModLogService],
  exports: [ModLogService]
})
export class ModerationModule {}
