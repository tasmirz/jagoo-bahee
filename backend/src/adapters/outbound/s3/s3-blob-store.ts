import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BlobStore,
  type BlobMetadata,
  type UploadTicket,
} from '../../../core/ports/content.port.js';
import type { Clock } from '../../../core/ports/system.port.js';

export class S3BlobStore extends BlobStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly clock: Clock,
    private readonly expiresInSeconds = 15 * 60,
  ) {
    super();
  }

  async presignUpload(
    key: string,
    mime: string,
    size: number,
    sha256: Uint8Array,
  ): Promise<UploadTicket> {
    const checksum = Buffer.from(sha256).toString('base64');
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mime,
      ContentLength: size,
      ChecksumSHA256: checksum,
      Metadata: { 'jb-sha256': Buffer.from(sha256).toString('hex') },
    });
    return {
      url: await getSignedUrl(this.client, command, { expiresIn: this.expiresInSeconds }),
      key,
      expiresAtMs: this.clock.nowMs() + this.expiresInSeconds * 1000,
      headers: {
        'content-type': mime,
        'x-amz-checksum-sha256': checksum,
        'x-amz-meta-jb-sha256': Buffer.from(sha256).toString('hex'),
      },
    };
  }

  async presignDownload(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: this.expiresInSeconds },
    );
  }

  async confirm(key: string): Promise<BlobMetadata> {
    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    const digest = head.Metadata?.['jb-sha256'];
    if (!head.ContentType || head.ContentLength === undefined || !digest) {
      throw new Error('uploaded object is missing signed metadata');
    }
    return {
      key,
      mime: head.ContentType,
      size: head.ContentLength,
      sha256: new Uint8Array(Buffer.from(digest, 'hex')),
    };
  }
}
