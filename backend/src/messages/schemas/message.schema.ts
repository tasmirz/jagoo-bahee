import { Document, Types } from 'mongoose'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

@Schema({ timestamps: true })
export class Message extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recipientId: Types.ObjectId

  @Prop({ type: String, maxlength: 100 })
  subject?: string

  @Prop({ type: String, required: true })
  content: string // Markdown

  @Prop({ type: String, required: true })
  contentHash: string

  @Prop({ type: [Types.ObjectId], ref: 'Attachment', default: [] })
  attachmentIds: Types.ObjectId[]

  @Prop({ type: Types.ObjectId, ref: 'Message' })
  parentMessageId?: Types.ObjectId

  /**
   * Sender's signature of the message
   */
  @Prop({ type: String, required: true })
  senderSignature: string

  @Prop({ type: Boolean, default: false })
  isRead: boolean

  @Prop({ type: Date })
  readAt?: Date

  @Prop({ type: Boolean, default: false })
  isDeleted: boolean

  @Prop({ type: Date })
  createdAt: Date

  @Prop({ type: Date })
  updatedAt: Date
}

export const MessageSchema = SchemaFactory.createForClass(Message)
MessageSchema.index({ senderId: 1, createdAt: -1 })
MessageSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 })
MessageSchema.index({ parentMessageId: 1 })
