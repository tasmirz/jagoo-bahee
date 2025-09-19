import { Injectable } from '@nestjs/common'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import config from 'src/config'

@Injectable()
export class MinioService {
  private client: S3Client
  private bucket = config.minio.bucket

  constructor() {
    const endpoint = config.minio.endpoint
    const region = config.minio.region
    const accessKeyId = config.minio.accessKeyId
    const secretAccessKey = config.minio.secretAccessKey
    this.client = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true
    } as any)
  }

  async ensureBucket() {
    // MinIO bucket creation can be performed via S3 API, but leaving as no-op —
    // assume the bucket exists or is created by provisioning.
    return
  }

  async presignedPutObject(objectName: string, expiresSeconds = 60 * 5): Promise<string> {
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: objectName })
    return getSignedUrl(this.client, cmd, { expiresIn: expiresSeconds })
  }

  async presignedGetObject(objectName: string, expiresSeconds = 60 * 60): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: objectName })
    return getSignedUrl(this.client, cmd, { expiresIn: expiresSeconds })
  }

  async headObject(objectName: string) {
    const cmd = new HeadObjectCommand({ Bucket: this.bucket, Key: objectName })
    return this.client.send(cmd)
  }

  async deleteObject(objectName: string) {
    const cmd = new DeleteObjectCommand({ Bucket: this.bucket, Key: objectName })
    return this.client.send(cmd)
  }
}
