import { randomUUID } from 'node:crypto';
import { Body, Controller, Headers, HttpException, Inject, Post } from '@nestjs/common';
import { BlobStore } from '../../../core/ports/content.port.js';
import { SessionAuth } from '../../../core/ports/auth.port.js';
import { MAX_ATTACHMENT_BYTES } from '../../../features/forum/attachment/attachment.handler.js';

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
  ) {}

  private async authenticate(authorization?: string): Promise<void> {
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new HttpException({ detail: 'access token is required' }, 401);
    }
    try {
      await this.auth.verifyAccess(token);
    } catch {
      throw new HttpException({ detail: 'access token is invalid' }, 401);
    }
  }

  @Post('upload-url')
  async uploadUrl(
    @Body() body: { readonly mime?: string; readonly size?: number; readonly sha256?: string },
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    await this.authenticate(authorization);
    const mime = body?.mime;
    const size = Number(body?.size);
    if (!mime || !Number.isSafeInteger(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) {
      throw new HttpException({ detail: 'valid mime and size are required' }, 400);
    }
    const key = `forum/${randomUUID()}`;
    return { ...(await this.blobs.presignUpload(key, mime, size, sha256(body.sha256))) };
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
    await this.authenticate(authorization);
    if (!body?.key) throw new HttpException({ detail: 'key is required' }, 400);
    try {
      const found = await this.blobs.confirm(body.key);
      const expectedHash = sha256(body.sha256);
      const matches =
        found.mime === body.mime &&
        found.size === Number(body.size) &&
        Buffer.from(found.sha256).equals(Buffer.from(expectedHash));
      if (!matches) throw new Error('uploaded object metadata does not match the claim');
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
}
