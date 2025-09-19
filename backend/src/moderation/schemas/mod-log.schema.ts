import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ModLog extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Subreddit', required: true })
  subredditId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  moderatorId: Types.ObjectId

  @Prop({ type: String, required: true })
  action: string

  @Prop({ type: String, required: true, enum: ['post', 'comment', 'user', 'subreddit'] })
  targetType: string

  @Prop({ type: Types.ObjectId })
  targetId?: Types.ObjectId

  @Prop({ type: String })
  reason?: string

  @Prop({ type: Object })
  details?: Record<string, any>

  @Prop({ type: String, required: true })
  moderatorSignature: string

  @Prop({ type: Date })
  createdAt: Date
}

export const ModLogSchema = SchemaFactory.createForClass(ModLog)
ModLogSchema.index({ subredditId: 1, createdAt: -1 })
ModLogSchema.index({ moderatorId: 1, createdAt: -1 })
