import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Attachment } from './schemas/attachment.schema'
import { MinioService } from './minio.service'
import { createHash } from 'crypto'
import { Readable } from 'stream'
import { getAuthPublicKeyById, verifySignature } from 'src/common/signature.util'

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectModel(Attachment.name) private readonly model: Model<Attachment>,
    private readonly minio: MinioService
  ) {}

  async create(data: Partial<Attachment>): Promise<Attachment> {
    try {
      if (!data.ownerId) throw new HttpException('ownerId required', HttpStatus.BAD_REQUEST)
      const created = new this.model(data)
      return await created.save()
    } catch (err) {
      throw new HttpException(err.message || 'Could not create attachment', HttpStatus.BAD_REQUEST)
    }
  }

  async findAll(filter: any = {}, limit = 50, skip = 0): Promise<Attachment[]> {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
    const safeSkip = Math.min(Math.max(Number(skip) || 0, 0), 10000)
    return this.model.find(filter).sort({ createdAt: -1 }).limit(safeLimit).skip(safeSkip).exec()
  }

  async findOne(id: string): Promise<Attachment | null> {
    if (!Types.ObjectId.isValid(id)) return null
    return this.model.findById(id).exec()
  }

  async update(id: string, update: Partial<Attachment>): Promise<Attachment | null> {
    if (!Types.ObjectId.isValid(id)) return null
    const doc = await this.model.findById(id).exec()
    if (!doc) return null

    const allowed: Partial<Attachment> = {}
    if (!doc.confirmed) {
      for (const key of ['type', 'originalFilename', 'mimeType', 'sizeBytes', 'signature', 'contentHash', 'isPublic', 'isNSFW'] as const) {
        if (update[key] !== undefined) {
          ;(allowed as any)[key] = update[key]
        }
      }
    } else {
      for (const key of ['isPublic', 'isNSFW', 'attachedToType', 'attachedToId'] as const) {
        if (update[key] !== undefined) {
          ;(allowed as any)[key] = update[key]
        }
      }
    }

    return this.model.findByIdAndUpdate(id, allowed, { new: true }).exec()
  }

  async remove(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false
    const res = await this.model.findByIdAndDelete(id).exec()
    return !!res
  }

  /**
   * Create an attachment DB entry and return a presigned PUT URL for direct upload to MinIO.
   * The client should upload the file directly to the returned URL and then the object will be
   * available under the returned minioKey.
   */
  async createUploadUrl(payload: {
    ownerId: string
    originalFilename: string
    mimeType: string
    sizeBytes: number
    type: string
    signature: string
    contentHash: string
    attachedToType?: string
    attachedToId?: string
    isPublic?: boolean
    isNSFW?: boolean
    exposeOriginalFilename?: boolean
  }) {
    const {
      ownerId,
      originalFilename,
      mimeType,
      sizeBytes,
      type,
      signature,
      contentHash,
      attachedToType,
      attachedToId,
      isPublic = true,
      isNSFW = false,
      exposeOriginalFilename = false
    } = payload

    if (!ownerId) throw new HttpException('ownerId required', HttpStatus.BAD_REQUEST)
    const maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024)
    const declaredSize = Number(sizeBytes || 0)
    if (!declaredSize || declaredSize < 1 || declaredSize > maxUploadBytes) {
      throw new HttpException(`File size must be between 1 and ${maxUploadBytes} bytes`, HttpStatus.BAD_REQUEST)
    }
    if (!/^[a-fA-F0-9]{64}$/.test(String(contentHash || ''))) {
      throw new HttpException('contentHash must be a SHA-256 hex digest', HttpStatus.BAD_REQUEST)
    }
    if (!signature) throw new HttpException('signature required', HttpStatus.BAD_REQUEST)

    // create a safe minio key: ownerId/timestamp-rand-original
    const safeName = originalFilename ? originalFilename.replace(/[^a-zA-Z0-9._-]/g, '-') : 'file'
    const minioKey = `${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`

    const doc = new this.model({
      ownerId: new Types.ObjectId(ownerId),
      type,
      minioKey,
      originalFilename,
      mimeType,
      sizeBytes,
      signature,
      contentHash,
      attachedToType,
      attachedToId: attachedToId ? new Types.ObjectId(attachedToId) : undefined,
      isPublic,
      isNSFW,
      exposeOriginalFilename
    })

    try {
      const saved = await doc.save()

      // Ensure bucket exists (no-op if exists)
      await this.minio.ensureBucket()

      // Get a presigned PUT url (short expiry)
      const url = await this.minio.presignedPutObject(minioKey, 60 * 5, { contentType: mimeType, contentLength: declaredSize })

      return { attachment: saved, uploadUrl: url, minioKey }
    } catch (err) {
      throw new HttpException(err.message || 'Could not create upload url', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async confirmUpload(key: string, ownerId: string, opts: { filename?: string; contentType?: string } = {}) {
    // verify object exists in MinIO
    try {
      const head = await this.minio.headObject(key)
      const size = (head as any).ContentLength ?? null
      const contentType = (head as any).ContentType ?? opts.contentType
      const maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024)
      if (Number(size || 0) < 1 || Number(size || 0) > maxUploadBytes) {
        throw new HttpException(`File size must be between 1 and ${maxUploadBytes} bytes`, HttpStatus.BAD_REQUEST)
      }

      // find DB record by minioKey
      const doc = await this.model.findOne({ minioKey: key }).exec()
      if (!doc) {
        throw new HttpException('Attachment upload record not found', HttpStatus.NOT_FOUND)
      }
      if (String(doc.ownerId) !== String(ownerId)) throw new HttpException('Forbidden', HttpStatus.FORBIDDEN)

      const computedHash = await this.computeObjectSha256(key)
      if (doc.contentHash && doc.contentHash !== computedHash) {
        throw new HttpException('Attachment content hash mismatch', HttpStatus.BAD_REQUEST)
      }
      const mimeType = contentType || doc.mimeType
      const proofPayload = attachmentProofPayload(String(doc.ownerId), computedHash, Number(size || 0), mimeType)
      const publicKey = await getAuthPublicKeyById((this.model as any).db, String(doc.ownerId))
      if (!publicKey) throw new HttpException('Owner public key not found', HttpStatus.BAD_REQUEST)
      if (!verifySignature(publicKey, proofPayload, doc.signature)) {
        throw new HttpException('Invalid attachment signature', HttpStatus.BAD_REQUEST)
      }

      doc.confirmed = true
      doc.confirmedAt = new Date()
      doc.contentHash = computedHash
      doc.mimeType = mimeType
      if (size) doc.sizeBytes = size
      return await doc.save()
    } catch (err) {
      if (err instanceof HttpException) throw err
      throw new HttpException('Object not found in storage', HttpStatus.BAD_REQUEST)
    }
  }

  async getPresignedGet(key: string) {
    // ensure DB record exists and is confirmed
    const doc = await this.model.findOne({ minioKey: key }).exec()
    if (!doc || !doc.confirmed) throw new HttpException('File not available', HttpStatus.NOT_FOUND)
    return this.minio.presignedGetObject(key)
  }

  sanitizeForRequester(doc: Attachment | any, user?: any) {
    const obj = doc?.toObject ? doc.toObject() : { ...doc }
    if (!obj) return obj
    const canSeeFilename = obj.exposeOriginalFilename || String(obj.ownerId) === String(user?.id) || this.isAdminOrModerator(user)
    if (!canSeeFilename) obj.originalFilename = ''
    return obj
  }

  async deleteFileRecordAndObject(doc: Attachment) {
    try {
      await this.minio.deleteObject(doc.minioKey)
    } catch (err) {
      // log and continue to remove DB record; cleanup job will retry S3 deletes
    }
    await this.model.findByIdAndDelete(doc._id).exec()
  }

  // Ownership/abac helpers
  async assertOwnerOrAdminOrModerator(minioKey: string, user: any) {
    const doc = await this.findOneByMinioKey(minioKey)
    if (!doc) throw new HttpException('Not found', HttpStatus.NOT_FOUND)
    // owner
    if (String(doc.ownerId) === String(user.id)) return doc
    // check abac flags: moderator or admin
    if (this.isAdminOrModerator(user)) return doc
    throw new HttpException('Forbidden', HttpStatus.FORBIDDEN)
  }

  async assertRecordOwnerOrAdminOrModerator(id: string, user: any) {
    const doc = await this.findOne(id)
    if (!doc) throw new HttpException('Not found', HttpStatus.NOT_FOUND)
    if (String(doc.ownerId) === String(user.id)) return doc
    if (this.isAdminOrModerator(user)) return doc
    throw new HttpException('Forbidden', HttpStatus.FORBIDDEN)
  }

  isAdminOrModerator(user: any) {
    const abac = BigInt(user?.abac ?? 0)
    const isMod = (abac & BigInt(1 << 4)) !== BigInt(0)
    const isAdmin = (abac & BigInt(1 << 5)) !== BigInt(0)
    return isMod || isAdmin
  }

  // cleanup helpers
  async findUnconfirmedOlderThan(date: Date) {
    return this.model.find({ confirmed: false, createdAt: { $lt: date } }).exec()
  }

  async findOrphansOlderThan(date: Date) {
    return this.model.find({ confirmed: true, attachedToId: { $exists: false }, confirmedAt: { $lt: date } }).exec()
  }

  async findOneByMinioKey(key: string) {
    return this.model.findOne({ minioKey: key }).exec()
  }

  async findByAttachedTo(type: string, id: string) {
    if (!Types.ObjectId.isValid(id)) return []
    return this.model.find({ attachedToType: type, attachedToId: new Types.ObjectId(id) }).exec()
  }

  /** Delete all attachments for a given content (post/comment) and remove records */
  async deleteByAttachedTo(type: string, id: string) {
    const docs = await this.findByAttachedTo(type, id)
    for (const d of docs) {
      await this.deleteFileRecordAndObject(d)
    }
    return docs.length
  }

  private async computeObjectSha256(key: string) {
    const object = await this.minio.getObject(key)
    const body = (object as any).Body
    const hash = createHash('sha256')
    if (body && typeof body.transformToByteArray === 'function') {
      hash.update(Buffer.from(await body.transformToByteArray()))
      return hash.digest('hex')
    }
    if (!body || typeof body.pipe !== 'function') {
      throw new HttpException('Object body is not readable', HttpStatus.BAD_REQUEST)
    }
    await new Promise<void>((resolve, reject) => {
      ;(body as Readable)
        .on('data', (chunk) => hash.update(chunk))
        .on('error', reject)
        .on('end', resolve)
    })
    return hash.digest('hex')
  }
}

export function attachmentProofPayload(ownerId: string, contentHash: string, sizeBytes: number, mimeType: string) {
  return JSON.stringify({
    ownerId: String(ownerId),
    contentHash: String(contentHash),
    sizeBytes: Number(sizeBytes),
    mimeType: String(mimeType || '')
  })
}
