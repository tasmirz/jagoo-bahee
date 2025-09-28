import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Award extends Document {
  @Prop({ type: Types.ObjectId, ref: 'AwardType', required: true })
  awardTypeId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  giverId: Types.ObjectId

  @Prop({ type: Types.ObjectId, required: true })
  targetId: Types.ObjectId

  @Prop({ type: String, required: true, enum: ['post', 'comment'] })
  targetType: string

  @Prop({ type: Boolean, default: false })
  isAnonymous: boolean

  @Prop({ type: String, maxlength: 200 })
  message?: string

  @Prop({ type: Date })
  createdAt: Date
}

export const AwardSchema = SchemaFactory.createForClass(Award)
AwardSchema.index({ targetId: 1, targetType: 1 })
AwardSchema.index({ giverId: 1, createdAt: -1 })
