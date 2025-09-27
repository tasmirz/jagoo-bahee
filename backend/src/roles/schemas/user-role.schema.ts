import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class UserRole extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Subreddit' })
  subredditId?: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Role', required: true })
  roleId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  assignedBy: Types.ObjectId

  @Prop({ type: Date })
  expiresAt?: Date

  @Prop({ type: Date })
  createdAt: Date
}

export const UserRoleSchema = SchemaFactory.createForClass(UserRole)
UserRoleSchema.index({ userId: 1, subredditId: 1, roleId: 1 }, { unique: true })
