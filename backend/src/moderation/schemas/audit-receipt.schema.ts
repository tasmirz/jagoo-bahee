import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditReceipt extends Document {
  @Prop({ type: Number, required: true, default: 1 })
  receiptVersion: number

  @Prop({ type: String, required: true })
  serverId: string

  @Prop({ type: String, required: true })
  serverBaseUrl: string

  @Prop({ type: String, required: true })
  keyId: string

  @Prop({ type: String, required: true })
  action: string

  @Prop({ type: String, required: true })
  subjectType: string

  @Prop({ type: Types.ObjectId, required: true })
  subjectId: Types.ObjectId

  @Prop({ type: String, required: true })
  contentType: string

  @Prop({ type: Types.ObjectId, required: true })
  contentId: Types.ObjectId

  @Prop({ type: String })
  actorPublicKey?: string

  @Prop({ type: String })
  userPublicKey?: string

  @Prop({ type: String, required: true })
  canonicalPayload: string

  @Prop({ type: String, required: true })
  payloadHash: string

  @Prop({ type: String })
  actorSignature?: string

  @Prop({ type: String })
  userSignature?: string

  @Prop({ type: String, required: true })
  serverKeyId: string

  @Prop({ type: String, required: true })
  serverSignature: string

  @Prop({ type: Boolean, default: false })
  legacy: boolean

  @Prop({ type: Date })
  createdAt: Date
}

export const AuditReceiptSchema = SchemaFactory.createForClass(AuditReceipt)
AuditReceiptSchema.index({ subjectType: 1, subjectId: 1, createdAt: -1 })
AuditReceiptSchema.index({ payloadHash: 1 })
