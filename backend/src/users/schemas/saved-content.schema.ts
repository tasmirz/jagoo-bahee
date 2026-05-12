import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class SavedContent extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId

  @Prop({
    type: Types.ObjectId,
    required: true,
    refPath: 'targetType'
  })
  targetId: Types.ObjectId

  @Prop({ type: String, required: true, enum: ['Post', 'Comment'] })
  targetType: string

  @Prop({ type: String })
  category?: string

  @Prop({ type: Date })
  createdAt: Date
}

export const SavedContentSchema = SchemaFactory.createForClass(SavedContent)
SavedContentSchema.index({ userId: 1, targetId: 1, targetType: 1 }, { unique: true })
SavedContentSchema.index({ userId: 1, category: 1, createdAt: -1 })
