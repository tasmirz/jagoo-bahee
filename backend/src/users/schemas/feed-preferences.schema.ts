import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: true })
export class FeedPreferences extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId

  @Prop({ type: String, default: 'hot', enum: ['hot', 'new', 'top', 'controversial', 'rising'] })
  sortBy: string

  @Prop({ type: String, default: 'day', enum: ['hour', 'day', 'week', 'month', 'year', 'all'] })
  timeRange: string

  @Prop({ type: Boolean, default: false })
  showNSFW: boolean

  @Prop({ type: Boolean, default: false })
  autoplayVideos: boolean

  @Prop({ type: String, default: 'card', enum: ['card', 'classic', 'compact'] })
  defaultView: string

  @Prop({ type: [Types.ObjectId], ref: 'Subreddit', default: [] })
  mutedSubreddits: Types.ObjectId[]

  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  mutedUsers: Types.ObjectId[]

  @Prop({ type: Date })
  createdAt: Date

  @Prop({ type: Date })
  updatedAt: Date
}

export const FeedPreferencesSchema = SchemaFactory.createForClass(FeedPreferences)
FeedPreferencesSchema.index({ userId: 1 })
