import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: true })
export class User extends Document {
  // NOTE: user _id will be the same as the Auth document _id. Do not store a separate authId field.

  @Prop({ type: String, required: true, unique: true, trim: true })
  username: string

  @Prop({ type: String, default: '' })
  displayName: string

  @Prop({ type: Types.ObjectId, ref: 'Attachment' })
  avatarId?: Types.ObjectId

  @Prop({ type: String, default: '' })
  avatarUrl: string

  @Prop({ type: Types.ObjectId, ref: 'Attachment' })
  bannerId?: Types.ObjectId

  @Prop({ type: String, default: '' })
  bio: string

  @Prop({ type: Number, default: 0 })
  postKarma: number

  @Prop({ type: Number, default: 0 })
  commentKarma: number

  // Computed karma getter
  get karma(): number {
    return (this.postKarma || 0) + (this.commentKarma || 0)
  }

  @Prop({ type: Date })
  bannedUntil?: Date

  @Prop({ type: String })
  banReason?: string

  @Prop({ type: Date })
  createdAt: Date

  @Prop({ type: Date })
  updatedAt: Date
}

export const UserSchema = SchemaFactory.createForClass(User)

// Add virtual for karma
UserSchema.virtual('karma').get(function (this: User) {
  return (this.postKarma || 0) + (this.commentKarma || 0)
})

// Ensure virtuals are included in JSON
UserSchema.set('toJSON', { virtuals: true })
UserSchema.set('toObject', { virtuals: true })

export default UserSchema
