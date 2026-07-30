import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
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
  /**
   * @param client        used for real server-to-store traffic; its endpoint may be internal.
   * @param signingClient used ONLY to presign. Defaults to `client`.
   *
   * ── Why presigning needs its own client ────────────────────────────────────────────────
   * SigV4 signs the `host` header, so a presigned URL is only valid for the host it was signed
   * for. A node whose store lives at `http://minio:9000` therefore cannot hand that URL to a
   * phone and cannot repair it by rewriting the host either — the client would get
   * `SignatureDoesNotMatch`, which reads as corruption rather than misconfiguration.
   *
   * Splitting the clients lets the node keep talking to the store over its internal name while
   * signing for the address the client will really use (`S3_PUBLIC_ENDPOINT`). Credentials and
   * region are identical; only the endpoint differs, so the signature is valid at both ends.
   */
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly clock: Clock,
    private readonly expiresInSeconds = 15 * 60,
    private readonly signingClient: S3Client = client,
  ) {
    super();
  }

  async ready(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
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
      url: await getSignedUrl(this.signingClient, command, { expiresIn: this.expiresInSeconds }),
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
      this.signingClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: this.expiresInSeconds },
    );
  }

  async write(key: string, bytes: Uint8Array): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.length,
      }),
    );
  }

  async read(key: string): Promise<{ readonly bytes: Uint8Array; readonly mime: string }> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error('blob body is unavailable');
    return {
      bytes: new Uint8Array(await result.Body.transformToByteArray()),
      mime: result.ContentType ?? 'application/octet-stream',
    };
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

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
