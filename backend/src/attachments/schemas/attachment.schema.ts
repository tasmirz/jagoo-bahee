import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: true })
export class Attachment extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId

  @Prop({ type: String, required: true, enum: ['image', 'video', 'audio', 'document', 'other'] })
  type: string

  @Prop({ type: String, required: true })
  minioKey: string // Unique key in MinIO bucket

  @Prop({ type: String, required: true })
  originalFilename: string

  @Prop({ type: String, required: true })
  mimeType: string

  @Prop({ type: Number, required: true })
  sizeBytes: number

  @Prop({ type: String })
  thumbnailKey?: string // For images/videos

  @Prop({ type: Number })
  width?: number

  @Prop({ type: Number })
  height?: number

  @Prop({ type: Number })
  duration?: number // For video/audio in seconds

  /**
   * Cryptographic signature of the file content
   * Signed by user's private key
   * Format: base64 encoded signature
   */
  @Prop({ type: String, required: true })
  signature: string

  /**
   * Hash of the file content (SHA-256)
   * For integrity verification
   */
  @Prop({ type: String, required: true })
  contentHash: string

  /**
   * Reference to the content this attachment belongs to
   */
  @Prop({ type: String, enum: ['post', 'comment', 'profile', 'subreddit', 'message'] })
  attachedToType?: string

  @Prop({ type: Types.ObjectId })
  attachedToId?: Types.ObjectId

  @Prop({ type: Boolean, default: true })
  isPublic: boolean

  @Prop({ type: Boolean, default: false })
  isNSFW: boolean

  /** Whether the upload has been verified by the server (HeadObject) */
  @Prop({ type: Boolean, default: false })
  confirmed: boolean

  @Prop({ type: Date })
  confirmedAt?: Date

  @Prop({ type: Date })
  createdAt: Date

  @Prop({ type: Date })
  updatedAt: Date
}

export const AttachmentSchema = SchemaFactory.createForClass(Attachment)
AttachmentSchema.index({ ownerId: 1, createdAt: -1 })
AttachmentSchema.index({ minioKey: 1 }, { unique: true })
AttachmentSchema.index({ attachedToType: 1, attachedToId: 1 })
AttachmentSchema.index({ contentHash: 1 })
