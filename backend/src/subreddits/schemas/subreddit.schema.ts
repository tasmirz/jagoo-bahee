import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: true })
export class Subreddit extends Document {
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true })
  name: string

  @Prop({ type: String, required: true })
  displayName: string

  @Prop({ type: String, default: '' })
  description: string

  @Prop({ type: String, default: '' })
  rules: string // Markdown

  @Prop({ type: Types.ObjectId, ref: 'Attachment' })
  iconAttachmentId?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Attachment' })
  bannerAttachmentId?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId

  @Prop({ type: Number, default: 0 })
  memberCount: number

  @Prop({ type: Boolean, default: false })
  isPrivate: boolean

  @Prop({ type: Boolean, default: false })
  isArchived: boolean

  @Prop({
    type: {
      primary: { type: String, default: '#053326' },
      accent: { type: String, default: '#053326' },
      background: { type: String, default: '#ffffff' },
      foreground: { type: String, default: '#000000' }
    },
    default: {}
  })
  theme: {
    primary: string
    accent: string
    background: string
    foreground: string
  }

  @Prop({
    type: {
      allowTextPosts: { type: Boolean, default: true },
      allowLinkPosts: { type: Boolean, default: true },
      allowImagePosts: { type: Boolean, default: true },
      allowVideoPosts: { type: Boolean, default: true },
      requirePostApproval: { type: Boolean, default: false },
      allowCrossposts: { type: Boolean, default: true },
      minimumKarmaToPost: { type: Number, default: 0 },
      minimumAccountAgeDays: { type: Number, default: 0 }
    },
    default: {}
  })
  settings: {
    allowTextPosts: boolean
    allowLinkPosts: boolean
    allowImagePosts: boolean
    allowVideoPosts: boolean
    requirePostApproval: boolean
    allowCrossposts: boolean
    minimumKarmaToPost: number
    minimumAccountAgeDays: number
  }

  @Prop({ type: Date })
  createdAt: Date

  @Prop({ type: Date })
  updatedAt: Date
}

export const SubredditSchema = SchemaFactory.createForClass(Subreddit)
SubredditSchema.index({ name: 1 })
SubredditSchema.index({ createdBy: 1 })
