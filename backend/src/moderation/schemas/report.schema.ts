import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: true })
export class Report extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  reporterId: Types.ObjectId

  @Prop({ type: Types.ObjectId, required: true })
  targetId: Types.ObjectId

  @Prop({ type: String, required: true, enum: ['post', 'comment', 'user'] })
  targetType: string

  @Prop({ type: Types.ObjectId, ref: 'Subreddit', required: true })
  subredditId: Types.ObjectId

  @Prop({
    type: String,
    required: true,
    enum: ['spam', 'harassment', 'hate_speech', 'misinformation', 'nsfw', 'violence', 'other']
  })
  reason: string

  @Prop({ type: String, maxlength: 500 })
  description?: string

  @Prop({ type: String, required: true, enum: ['pending', 'reviewed', 'resolved', 'dismissed'], default: 'pending' })
  status: string

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId

  @Prop({ type: Date })
  reviewedAt?: Date

  @Prop({ type: String, enum: ['removed', 'warned', 'banned', 'none'] })
  actionTaken?: string

  @Prop({ type: Date })
  createdAt: Date

  @Prop({ type: Date })
  updatedAt: Date
}

export const ReportSchema = SchemaFactory.createForClass(Report)
ReportSchema.index({ subredditId: 1, status: 1 })
ReportSchema.index({ targetId: 1, targetType: 1 })
