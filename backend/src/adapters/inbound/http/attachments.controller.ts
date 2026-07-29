import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Inject,
  Param,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { BlobStore } from '../../../core/ports/content.port.js';
import { SessionAuth } from '../../../core/ports/auth.port.js';
import { ProjectionStore } from '../../../core/ports/storage.port.js';
import {
  ATTACHMENTS_COLLECTION,
  ATTACHMENT_UPLOADS_COLLECTION,
  MAX_ATTACHMENT_BYTES,
  type AttachmentDoc,
  type AttachmentUploadDoc,
} from '../../../features/forum/attachment/attachment.handler.js';

function sha256(value: unknown): Uint8Array {
  if (typeof value !== 'string') throw new HttpException({ detail: 'sha256 is required' }, 400);
  const bytes = new Uint8Array(Buffer.from(value, 'base64'));
  if (bytes.length !== 32) throw new HttpException({ detail: 'sha256 must be 32 bytes' }, 400);
  return bytes;
}

@Controller('v1/attachments')
export class AttachmentsController {
  constructor(
    @Inject(BlobStore) private readonly blobs: BlobStore,
    @Inject(SessionAuth) private readonly auth: SessionAuth,
    @Inject(ProjectionStore) private readonly projections: ProjectionStore,
  ) {}

  private async authenticate(authorization?: string): Promise<string> {
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new HttpException({ detail: 'access token is required' }, 401);
    }
    try {
      const principal = await this.auth.verifyAccess(token);
      return Buffer.from(principal.key).toString('hex');
    } catch {
      throw new HttpException({ detail: 'access token is invalid' }, 401);
    }
  }

  private async owned(id: string, authorization?: string): Promise<AttachmentDoc> {
    const actor = await this.authenticate(authorization);
    const attachment = await this.projections
      .collection<AttachmentDoc>(ATTACHMENTS_COLLECTION)
      .findOne({ id });
    if (!attachment) throw new HttpException({ detail: 'attachment not found' }, 404);
    if (attachment.ownerKey !== actor) {
      throw new HttpException({ detail: 'attachment belongs to another identity' }, 403);
    }
    return attachment;
  }

  @Put('local-upload/:id')
  async localUpload(
    @Param('id') id: string,
    @Body() body: Uint8Array,
  ): Promise<{ readonly uploaded: true }> {
    const key = `forum/${id}`;
    const upload = await this.projections
      .collection<AttachmentUploadDoc>(ATTACHMENT_UPLOADS_COLLECTION)
      .findOne({ id: key });
    if (!upload) throw new HttpException({ detail: 'upload ticket not found' }, 404);
    const bytes = new Uint8Array(body);
    if (bytes.length === 0 || bytes.length > MAX_ATTACHMENT_BYTES) {
      throw new HttpException({ detail: 'upload body is empty or too large' }, 400);
    }
    try {
      await this.blobs.write(key, bytes);
      return { uploaded: true };
    } catch (error) {
      throw new HttpException({ detail: (error as Error).message }, 400);
    }
  }

  @Get('local-download/:id')
  async localDownload(
    @Param('id') id: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    try {
      const payload = await this.blobs.read(`forum/${id}`);
      void reply.header('content-type', payload.mime).send(Buffer.from(payload.bytes));
    } catch {
      throw new HttpException({ detail: 'blob not found' }, 404);
    }
  }

  @Post('upload-url')
  async uploadUrl(
    @Body() body: { readonly mime?: string; readonly size?: number; readonly sha256?: string },
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    const actor = await this.authenticate(authorization);
    const mime = body?.mime;
    const size = Number(body?.size);
    if (!mime || !Number.isSafeInteger(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) {
      throw new HttpException({ detail: 'valid mime and size are required' }, 400);
    }
    const key = `forum/${randomUUID()}`;
    const digest = sha256(body.sha256);
    const ticket = await this.blobs.presignUpload(key, mime, size, digest);
    await this.projections.transaction(async (tx) => {
      await this.projections
        .collection<AttachmentUploadDoc>(ATTACHMENT_UPLOADS_COLLECTION)
        .put(
          key,
          {
            id: key,
            ownerKey: actor,
            storageKey: key,
            contentSha256: Buffer.from(digest).toString('hex'),
            mime,
            sizeBytes: size,
            confirmedAtMs: null,
          },
          tx,
        );
    });
    return { ...ticket };
  }

  @Post('confirm')
  async confirm(
    @Body()
    body: {
      readonly key?: string;
      readonly mime?: string;
      readonly size?: number;
      readonly sha256?: string;
    },
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    const actor = await this.authenticate(authorization);
    if (!body?.key) throw new HttpException({ detail: 'key is required' }, 400);
    try {
      const uploads = this.projections.collection<AttachmentUploadDoc>(
        ATTACHMENT_UPLOADS_COLLECTION,
      );
      const upload = await uploads.findOne({ id: body.key });
      if (!upload) throw new HttpException({ detail: 'upload ticket not found' }, 404);
      if (upload.ownerKey !== actor) {
        throw new HttpException({ detail: 'upload ticket belongs to another identity' }, 403);
      }
      const found = await this.blobs.confirm(body.key);
      const expectedHash = sha256(body.sha256);
      const matches =
        found.mime === body.mime &&
        found.size === Number(body.size) &&
        Buffer.from(found.sha256).equals(Buffer.from(expectedHash));
      if (!matches) throw new Error('uploaded object metadata does not match the claim');
      await this.projections.transaction(async (tx) => {
        await uploads.put(
          upload.id,
          { ...upload, confirmedAtMs: Date.now() },
          tx,
        );
      });
      return {
        confirmed: true,
        key: found.key,
        mime: found.mime,
        size: found.size,
        sha256: Buffer.from(found.sha256).toString('base64'),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ detail: (error as Error).message }, 400);
    }
  }

  @Get()
  async list(
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly items: readonly AttachmentDoc[] }> {
    const actor = await this.authenticate(authorization);
    const items = await this.projections
      .collection<AttachmentDoc>(ATTACHMENTS_COLLECTION)
      .find({ ownerKey: actor }, 1_000);
    return { items };
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ): Promise<AttachmentDoc> {
    return this.owned(id, authorization);
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly url: string }> {
    const attachment = await this.owned(id, authorization);
    return { url: await this.blobs.presignDownload(attachment.storageKey) };
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly deleted: true }> {
    const attachment = await this.owned(id, authorization);
    await this.blobs.delete(attachment.storageKey);
    return { deleted: true };
  }

  @Delete('storage/:key')
  async deleteByStorageKey(
    @Param('key') key: string,
    @Headers('authorization') authorization?: string,
  ): Promise<{ readonly deleted: true }> {
    const actor = await this.authenticate(authorization);
    const attachments = await this.projections
      .collection<AttachmentDoc>(ATTACHMENTS_COLLECTION)
      .find({ storageKey: key }, 2);
    const attachment = attachments.find((candidate) => candidate.ownerKey === actor);
    if (!attachment) throw new HttpException({ detail: 'attachment not found' }, 404);
    await this.blobs.delete(key);
    return { deleted: true };
  }
}
