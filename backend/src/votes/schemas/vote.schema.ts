import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: true })
export class Vote extends Document {
  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId

  @Prop({ type: Types.ObjectId, required: true })
  targetId: Types.ObjectId

  @Prop({ type: String, required: true, enum: ['post', 'comment'] })
  targetType: string

  @Prop({ type: Number, required: true })
  value: number // 1 or -1
}

export const VoteSchema = SchemaFactory.createForClass(Vote)
VoteSchema.index({ userId: 1, targetId: 1, targetType: 1 }, { unique: true })
