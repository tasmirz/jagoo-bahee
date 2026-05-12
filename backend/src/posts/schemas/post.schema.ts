import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: true })
export class Post extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Subreddit', required: true })
  subredditId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId: Types.ObjectId

  @Prop({ type: String, required: true, maxlength: 300 })
  title: string

  @Prop({ type: String, required: true, enum: ['text', 'link', 'image', 'video', 'poll', 'crosspost'] })
  type: string

  @Prop({ type: String })
  content?: string

  @Prop({ type: String })
  url?: string

  @Prop({ type: [Types.ObjectId], ref: 'Attachment', default: [] })
  attachmentIds: Types.ObjectId[]

  @Prop({ type: Object })
  poll?: {
    question: string
    options: string[]
    multiple?: boolean
    closesAt?: Date
  }

  @Prop({ type: Types.ObjectId, ref: 'Post' })
  crosspostId?: Types.ObjectId

  @Prop({ type: String })
  flair?: string

  @Prop({ type: String, required: true })
  userSignature: string

  @Prop({ type: String, required: true })
  contentHash: string

  @Prop({ type: BigInt, default: BigInt(1) })
  statusFlags: bigint

  @Prop({ type: String })
  removalReason?: string

  @Prop({ type: Types.ObjectId, ref: 'User' })
  removedBy?: Types.ObjectId

  @Prop({ type: Date })
  editedAt?: Date

  @Prop({ type: Number, default: 0 })
  score: number

  @Prop({ type: Number, default: 0 })
  upvoteCount: number

  @Prop({ type: Number, default: 0 })
  downvoteCount: number

  @Prop({ type: Number, default: 0 })
  commentCount: number

  @Prop({ type: Number, default: 0 })
  viewCount: number

  @Prop({ type: Number, default: 0 })
  reportCount: number

  @Prop({ type: Date })
  createdAt: Date

  @Prop({ type: Date })
  updatedAt: Date
}

export const PostSchema = SchemaFactory.createForClass(Post)
PostSchema.index({ subredditId: 1, createdAt: -1 })
PostSchema.index({ authorId: 1, createdAt: -1 })
PostSchema.index({ score: -1 })
PostSchema.index({ contentHash: 1 })
