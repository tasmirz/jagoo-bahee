import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Attachment, AttachmentSchema } from './schemas/attachment.schema'
import { AttachmentsService } from './attachments.service'
import { AttachmentsController } from './attachments.controller'
import { MinioService } from './minio.service'
import { AttachmentsCleanupService } from './cleanup.service'
import { SharedModule } from 'src/common/shared.module'

@Module({
  imports: [MongooseModule.forFeature([{ name: Attachment.name, schema: AttachmentSchema }]), SharedModule],
  providers: [AttachmentsService, MinioService, AttachmentsCleanupService],
  controllers: [AttachmentsController],
  exports: [AttachmentsService]
})
export class AttachmentsModule {}
