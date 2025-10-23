import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Attachment } from './schemas/attachment.schema'
import { MinioService } from './minio.service'

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectModel(Attachment.name) private readonly model: Model<Attachment>,
    public readonly minio: MinioService
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
    originalFilename?: string
    filename?: string // alias for originalFilename
    mimeType?: string
    contentType?: string // alias for mimeType
    sizeBytes?: number
    size?: number // alias for sizeBytes
    type?: string
    signature?: string
    contentHash?: string
    hash?: string // alias for contentHash
    attachedToType?: string
    attachedToId?: string
    isPublic?: boolean
    isNSFW?: boolean
  }) {
    const {
      ownerId,
      originalFilename: origFilename,
      filename,
      mimeType: mime,
      contentType,
      sizeBytes: sizeBytesParam,
      size,
      type: typeParam,
      signature: signatureParam,
      contentHash: contentHashParam,
      hash,
      attachedToType,
      attachedToId,
      isPublic = true,
      isNSFW = false
    } = payload

    // Support both frontend conventions
    const originalFilename = origFilename || filename || 'file'
    const mimeType = mime || contentType || 'application/octet-stream'
    const sizeBytes = sizeBytesParam || size || 0
    const contentHash = contentHashParam || hash || ''

    // Determine type from MIME type if not provided
    let type = typeParam
    if (!type || type === 'file') {
      if (mimeType.startsWith('image/')) type = 'image'
      else if (mimeType.startsWith('video/')) type = 'video'
      else if (mimeType.startsWith('audio/')) type = 'audio'
      else if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) type = 'document'
      else type = 'other'
    }

    // For now, use a placeholder signature until we implement proper signing
    const signature = signatureParam || 'unsigned'

    if (!ownerId) throw new HttpException('ownerId required', HttpStatus.BAD_REQUEST)

    // create a safe minio key: ownerId/timestamp-rand-original
    const safeName = originalFilename ? originalFilename.replace(/[^a-zA-Z0-9._-]/g, '-') : 'file'
    const minioKey = `${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`

    console.log('[createUploadUrl] Creating attachment with:', {
      ownerId,
      originalFilename,
      mimeType,
      minioKey
    })

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
      console.log('[createUploadUrl] Attachment saved:', saved._id)

      // Ensure bucket exists (no-op if exists)
      await this.minio.ensureBucket()

      // Get a presigned PUT url (short expiry)
      const url = await this.minio.presignedPutObject(minioKey)
      console.log('[createUploadUrl] Presigned URL generated for key:', minioKey)

      // Generate a long-lived presigned GET URL for viewing (7 days)
      const downloadUrl = await this.minio.presignedGetObject(minioKey, 7 * 24 * 60 * 60) // 7 days

      return { attachment: saved, uploadUrl: url, minioKey, downloadUrl }
    } catch (err) {
      console.error('[createUploadUrl] Error:', err)
      throw new HttpException(err.message || 'Could not create upload url', HttpStatus.INTERNAL_SERVER_ERROR)
    }
  }

  async confirmUpload(key: string, ownerId: string, opts: { filename?: string; contentType?: string } = {}) {
    console.log('[confirmUpload] Confirming upload for key:', key)

    // verify object exists in MinIO
    try {
      const head = await this.minio.headObject(key)
      const size = (head as any).ContentLength ?? null
      const contentType = (head as any).ContentType ?? opts.contentType

      console.log('[confirmUpload] Object found in MinIO:', {
        key,
        size,
        contentType
      })

      // find DB record by minioKey
      const doc = await this.model.findOne({ minioKey: key }).exec()
      if (!doc) {
        console.log('[confirmUpload] No existing record, creating new one')
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
        const saved = await created.save()
        console.log('[confirmUpload] New attachment created:', saved._id)
        return saved
      }

      console.log('[confirmUpload] Updating existing record:', doc._id)
      doc.confirmed = true
      doc.confirmedAt = new Date()
      if (opts.filename) doc.originalFilename = opts.filename
      if (contentType) doc.mimeType = contentType
      if (size) doc.sizeBytes = size
      const saved = await doc.save()
      console.log('[confirmUpload] Attachment confirmed:', saved._id)
      return saved
    } catch (err) {
      console.error('[confirmUpload] Error:', err)
      throw new HttpException(`Object not found in MinIO or confirmation failed: ${err.message}`, HttpStatus.NOT_FOUND)
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
