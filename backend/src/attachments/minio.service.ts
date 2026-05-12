import { Injectable, OnModuleInit } from '@nestjs/common'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import config from 'src/config'

@Injectable()
export class MinioService implements OnModuleInit {
  private client: S3Client
  private bucket = config.minio.bucket
  private bucketReady = false

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

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return
    // Ensure bucket exists on startup
    await this.ensureBucket()
  }

  async ensureBucket() {
    if (this.bucketReady) return

    try {
      // Check if bucket exists
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
      console.log(`[MinIO] Bucket "${this.bucket}" already exists`)
    } catch (error) {
      // Bucket doesn't exist, create it
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }))
        console.log(`[MinIO] Created bucket "${this.bucket}"`)
      } catch (createError) {
        console.error(`[MinIO] Error creating bucket:`, createError)
        throw createError
      }
    }

    // Set CORS policy for browser uploads. Keep production origins explicit.
    try {
      const allowedOrigins = (process.env.MINIO_CORS_ALLOWED_ORIGINS || process.env.FRONTEND_ORIGIN || 'http://localhost:3001')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: allowedOrigins,
                AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
                AllowedHeaders: ['content-type', 'authorization', 'x-amz-date', 'x-amz-content-sha256'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3600
              }
            ]
          }
        })
      )
      console.log(`[MinIO] CORS configured for bucket "${this.bucket}"`)
    } catch (corsError) {
      const message = corsError instanceof Error ? corsError.message : String(corsError)
      console.warn(`[MinIO] Could not set CORS (might already be set):`, message)
    }

    this.bucketReady = true
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
