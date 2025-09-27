import { Document, Schema as MongooseSchema, Types } from 'mongoose'
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Notification extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId

  @Prop({
    type: String,
    required: true,
    enum: [
      'comment_reply',
      'post_reply',
      'mention',
      'upvote_milestone',
      'award',
      'follow',
      'mod_action',
      'system',
    ],
  })
  type: string

  @Prop({ type: Types.ObjectId, ref: 'User' })
  actorId?: Types.ObjectId

  @Prop({ type: Types.ObjectId })
  targetId?: Types.ObjectId

  @Prop({ type: String, enum: ['post', 'comment', 'user', 'subreddit'] })
  targetType?: string

  @Prop({ type: String, required: true })
  message: string

  @Prop({ type: Boolean, default: false })
  isRead: boolean

  @Prop({ type: Date })
  readAt?: Date

  @Prop({ type: Date })
  createdAt: Date
}

export const NotificationSchema = SchemaFactory.createForClass(Notification)
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 })
NotificationSchema.index({ actorId: 1 })
