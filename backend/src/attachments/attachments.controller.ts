import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Put,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req
} from '@nestjs/common'
import { AttachmentsService } from './attachments.service'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'

@Controller('attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Post()
  async create(@Body() body: any, @Req() req: any) {
    body.ownerId = req.user?.id
    return this.service.create(body)
  }

  /**
   * Create server-signed upload URL and attachment entry. Client will receive uploadUrl and must
   * PUT the file directly to MinIO using that URL.
   */
  @Post('upload-url')
  async createUploadUrl(@Body() body: any, @Req() req: any) {
    // enforce owner from JWT, ignore client-supplied ownerId
    body.ownerId = req.user?.id
    return this.service.createUploadUrl(body)
  }

  // compatibility alias expected by frontend: presigned-upload
  @Post('presigned-upload')
  async presignedUpload(@Body() body: any, @Req() req: any) {
    body.ownerId = req.user?.id
    return this.service.createUploadUrl(body)
  }

  /**
   * Confirm an upload after client has PUT the object to MinIO.
   * Body: { key, ownerId, filename?, contentType? }
   */
  @Post('confirm')
  async confirm(@Body() body: any, @Req() req: any) {
    const { key, filename, contentType } = body
    // ensure requester is owner or has moderator/admin ABAC bits
    await this.service.assertOwnerOrAdminOrModerator(key, req.user)
    return this.service.confirmUpload(key, req.user?.id, { filename, contentType })
  }

  // compatibility alias expected by frontend: confirm-upload
  @Post('confirm-upload')
  async confirmUploadAlias(@Body() body: any, @Req() req: any) {
    const { key, filename, contentType } = body
    await this.service.assertOwnerOrAdminOrModerator(key, req.user)
    return this.service.confirmUpload(key, req.user?.id, { filename, contentType })
  }

  /** Return a presigned GET url for a minioKey (requires confirmed) */
  @Get('download/:key')
  async download(@Param('key') key: string, @Req() req: any) {
    // ensure requester has access: owner or moderator/admin
    await this.service.assertOwnerOrAdminOrModerator(key, req.user)
    return this.service.getPresignedGet(key)
  }

  /** Delete by minioKey (owner/admin should be validated by caller) */
  @Delete('by-key/:key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeByKey(@Param('key') key: string, @Req() req: any) {
    // enforce owner or moderator/admin
    const doc = await this.service.assertOwnerOrAdminOrModerator(key, req.user)
    if (!doc) return
    await this.service.deleteFileRecordAndObject(doc)
  }

  @Get()
  async list(@Req() req: any, @Query('ownerId') ownerId?: string, @Query('limit') limit = '50', @Query('skip') skip = '0') {
    const filter: any = {}
    if (ownerId && this.service.isAdminOrModerator(req.user)) {
      filter.ownerId = ownerId
    } else {
      filter.ownerId = req.user?.id
    }
    return this.service.findAll(filter, Number(limit), Number(skip))
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: any) {
    return this.service.assertRecordOwnerOrAdminOrModerator(id, req.user)
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    await this.service.assertRecordOwnerOrAdminOrModerator(id, req.user)
    return this.service.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Req() req: any) {
    const doc = await this.service.assertRecordOwnerOrAdminOrModerator(id, req.user)
    await this.service.deleteFileRecordAndObject(doc)
  }
}
