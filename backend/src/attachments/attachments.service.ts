import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Attachment } from './schemas/attachment.schema'
import { MinioService } from './minio.service'

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectModel(Attachment.name) private readonly model: Model<Attachment>,
    private readonly minio: MinioService
  ) {}

  async create(data: Partial<Attachment>): Promise<Attachment> {
    try {
      const created = new this.model(data)
      return await created.save()
    } catch (err) {
      throw new HttpException(err.message || 'Could not create attachment', HttpStatus.BAD_REQUEST)
    }
  }

  async findAll(filter: any = {}, limit = 50, skip = 0): Promise<Attachment[]> {
    return this.model.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).exec()
  }

  async findOne(id: string): Promise<Attachment | null> {
    if (!Types.ObjectId.isValid(id)) return null
    return this.model.findById(id).exec()
  }

  async update(id: string, update: Partial<Attachment>): Promise<Attachment | null> {
    if (!Types.ObjectId.isValid(id)) return null
    return this.model.findByIdAndUpdate(id, update, { new: true }).exec()
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
      isNSFW = false
    } = payload

    if (!ownerId) throw new HttpException('ownerId required', HttpStatus.BAD_REQUEST)

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
      isNSFW
    })

    try {
      const saved = await doc.save()

      // Ensure bucket exists (no-op if exists)
      await this.minio.ensureBucket()

      // Get a presigned PUT url (short expiry)
      const url = await this.minio.presignedPutObject(minioKey)

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

      // find DB record by minioKey
      const doc = await this.model.findOne({ minioKey: key }).exec()
      if (!doc) {
        // create record if it doesn't exist
        const created = new this.model({
          ownerId: new Types.ObjectId(ownerId),
          minioKey: key,
          originalFilename: opts.filename ?? key,
          mimeType: contentType,
          sizeBytes: size ?? 0,
          signature: '',
          contentHash: '',
          confirmed: true,
          confirmedAt: new Date()
        })
        return await created.save()
      }

      doc.confirmed = true
      doc.confirmedAt = new Date()
      if (opts.filename) doc.originalFilename = opts.filename
      if (contentType) doc.mimeType = contentType
      if (size) doc.sizeBytes = size
      return await doc.save()
    } catch (err) {
      throw new HttpException('Object not found in storage', HttpStatus.BAD_REQUEST)
    }
  }

  async getPresignedGet(key: string) {
    // ensure DB record exists and is confirmed
    const doc = await this.model.findOne({ minioKey: key }).exec()
    if (!doc || !doc.confirmed) throw new HttpException('File not available', HttpStatus.NOT_FOUND)
    return this.minio.presignedGetObject(key)
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
    const abac = BigInt(user.abac ?? 0)
    const isMod = (abac & BigInt(1 << 4)) !== BigInt(0)
    const isAdmin = (abac & BigInt(1 << 5)) !== BigInt(0)
    if (isMod || isAdmin) return doc
    throw new HttpException('Forbidden', HttpStatus.FORBIDDEN)
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
}
