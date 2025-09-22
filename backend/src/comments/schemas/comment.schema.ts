import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: true })
export class Comment extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Post', required: true })
  postId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Subreddit', required: true })
  subredditId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Comment' })
  parentId?: Types.ObjectId

  @Prop({ type: String, required: true })
  content: string

  @Prop({ type: [Types.ObjectId], ref: 'Attachment', default: [] })
  attachmentIds: Types.ObjectId[]

  @Prop({ type: Number, default: 0 })
  depth: number

  @Prop({ type: String, required: true })
  path: string

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
  replyCount: number

  @Prop({ type: Number, default: 0 })
  reportCount: number

  @Prop({ type: Date })
  createdAt: Date

  @Prop({ type: Date })
  updatedAt: Date
}

export const CommentSchema = SchemaFactory.createForClass(Comment)
CommentSchema.index({ postId: 1, path: 1 })
CommentSchema.index({ authorId: 1, createdAt: -1 })
CommentSchema.index({ parentId: 1 })
CommentSchema.index({ contentHash: 1 })
