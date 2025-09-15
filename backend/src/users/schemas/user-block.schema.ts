import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class UserBlock extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  blockerId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  blockedId: Types.ObjectId

  @Prop({ type: String })
  reason?: string

  @Prop({ type: Date })
  createdAt: Date
}

export const UserBlockSchema = SchemaFactory.createForClass(UserBlock)
UserBlockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true })
