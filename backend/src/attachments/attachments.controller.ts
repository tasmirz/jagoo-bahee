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
  HttpException,
  UseGuards,
  Req
} from '@nestjs/common'
import { AttachmentsService } from './attachments.service'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { AbacGuard } from 'src/common/guards/abac.guard'

@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Post()
  async create(@Body() body: any) {
    return this.service.create(body)
  }

  /**
   * Create server-signed upload URL and attachment entry. Client will receive uploadUrl and must
   * PUT the file directly to MinIO using that URL.
   */
  @Post('upload-url')
  @UseGuards(JwtAuthGuard)
  async createUploadUrl(@Body() body: any, @Req() req: any) {
    // enforce owner from JWT, ignore client-supplied ownerId
    body.ownerId = req.user?.id
    return this.service.createUploadUrl(body)
  }

  // compatibility alias expected by frontend: presigned-upload
  @Post('presigned-upload')
  @UseGuards(JwtAuthGuard)
  async presignedUpload(@Body() body: any, @Req() req: any) {
    console.log('[presigned-upload] Request received')
    console.log('[presigned-upload] Body:', JSON.stringify(body, null, 2))
    console.log('[presigned-upload] User:', req.user?.id)

    body.ownerId = req.user?.id

    try {
      const result = await this.service.createUploadUrl(body)
      console.log('[presigned-upload] Success! MinIO key:', result.minioKey)
      console.log('[presigned-upload] Upload URL generated (length):', result.uploadUrl?.length)
      return result
    } catch (error) {
      console.error('[presigned-upload] Error:', error.message)
      throw error
    }
  }

  /**
   * Confirm an upload after client has PUT the object to MinIO.
   * Body: { key, ownerId, filename?, contentType? }
   */
  @Post('confirm')
  @UseGuards(JwtAuthGuard)
  async confirm(@Body() body: any, @Req() req: any) {
    const { key, filename, contentType } = body
    // Use authenticated user's ID as ownerId
    const ownerId = body.ownerId || req.user?.id
    // ensure requester is owner or has moderator/admin ABAC bits
    await this.service.assertOwnerOrAdminOrModerator(key, req.user)
    return this.service.confirmUpload(key, ownerId, { filename, contentType })
  }

  // compatibility alias expected by frontend: confirm-upload
  @Post('confirm-upload')
  @UseGuards(JwtAuthGuard)
  async confirmUploadAlias(@Body() body: any, @Req() req: any) {
    console.log('[confirm-upload] Request received')
    console.log('[confirm-upload] Body:', JSON.stringify(body, null, 2))
    console.log('[confirm-upload] User:', req.user?.id)

    const { key, filename, contentType } = body
    const ownerId = body.ownerId || req.user?.id

    try {
      await this.service.assertOwnerOrAdminOrModerator(key, req.user)
      const result = await this.service.confirmUpload(key, ownerId, { filename, contentType })
      console.log('[confirm-upload] Success! Attachment ID:', result._id)
      return result
    } catch (error) {
      console.error('[confirm-upload] Error:', error.message)
      throw error
    }
  }

  /** Return a presigned GET url for a minioKey (requires confirmed) */
  @Get('download/:key')
  @UseGuards(JwtAuthGuard)
  async download(@Param('key') key: string, @Req() req: any) {
    // ensure requester has access: owner or moderator/admin
    await this.service.assertOwnerOrAdminOrModerator(key, req.user)
    return this.service.getPresignedGet(key)
  }

  /** Delete by minioKey (owner/admin should be validated by caller) */
  @Delete('by-key/:key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async removeByKey(@Param('key') key: string, @Req() req: any) {
    // enforce owner or moderator/admin
    const doc = await this.service.assertOwnerOrAdminOrModerator(key, req.user)
    if (!doc) return
    await this.service.deleteFileRecordAndObject(doc)
  }

  @Get()
  async list(@Query('ownerId') ownerId?: string, @Query('limit') limit = '50', @Query('skip') skip = '0') {
    const filter: any = {}
    if (ownerId) filter.ownerId = ownerId
    return this.service.findAll(filter, Number(limit), Number(skip))
  }

  /** Get a presigned URL for viewing an attachment */
  @Get(':id/presigned-get')
  async getPresignedUrl(@Param('id') id: string) {
    const attachment = await this.service.findOne(id)
    if (!attachment) {
      throw new HttpException('Attachment not found', HttpStatus.NOT_FOUND)
    }

    // Generate a presigned GET URL (24 hours expiry)
    const url = await this.service.minio.presignedGetObject(attachment.minioKey, 24 * 60 * 60)
    return { url }
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.service.remove(id)
  }
}
