import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ServerAcknowledgement extends Document {
  @Prop({ type: String, required: true, enum: ['post', 'comment'] })
  contentType: string

  @Prop({ type: Types.ObjectId, required: true })
  contentId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId: Types.ObjectId

  @Prop({ type: String, required: true, enum: ['created', 'updated', 'deleted', 'flagged'] })
  action: string

  @Prop({ type: String, required: true })
  contentHash: string

  @Prop({ type: String, required: true })
  userSignature: string

  @Prop({ type: String, required: true })
  serverSignature: string

  @Prop({ type: Object })
  metadata?: Record<string, any>

  @Prop({ type: Date })
  createdAt: Date
}

export const ServerAcknowledgementSchema = SchemaFactory.createForClass(ServerAcknowledgement)
ServerAcknowledgementSchema.index({ contentType: 1, contentId: 1 })
ServerAcknowledgementSchema.index({ authorId: 1, createdAt: -1 })
