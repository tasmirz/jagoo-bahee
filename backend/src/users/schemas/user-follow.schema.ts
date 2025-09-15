import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class UserFollow extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  followerId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  followingId: Types.ObjectId

  @Prop({ type: Date })
  createdAt: Date
}

export const UserFollowSchema = SchemaFactory.createForClass(UserFollow)
UserFollowSchema.index({ followerId: 1, followingId: 1 }, { unique: true })
