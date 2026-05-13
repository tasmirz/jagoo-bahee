import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ModerationEvent extends Document {
  @Prop({ type: String, required: true, unique: true })
  eventId: string

  @Prop({ type: Number, required: true, default: 1 })
  eventVersion: number

  @Prop({ type: Types.ObjectId, ref: 'Subreddit', required: true })
  subredditId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'Auth' })
  actorAuthId?: Types.ObjectId

  @Prop({ type: String, default: '' })
  actorPublicKey: string

  @Prop({ type: String, required: true })
  action: string

  @Prop({ type: String, required: true })
  targetType: string

  @Prop({ type: Types.ObjectId })
  targetId?: Types.ObjectId

  @Prop({ type: String })
  reason?: string

  @Prop({ type: String, required: true })
  previousStateHash: string

  @Prop({ type: String, required: true })
  newStateHash: string

  @Prop({ type: String, required: true })
  moderatorSignature: string

  @Prop({ type: String, required: true })
  serverSignature: string

  @Prop({ type: String, default: '' })
  previousEventHash: string

  @Prop({ type: String, required: true })
  eventHash: string

  @Prop({ type: Date })
  createdAt: Date
}

export const ModerationEventSchema = SchemaFactory.createForClass(ModerationEvent)
ModerationEventSchema.index({ subredditId: 1, createdAt: -1 })
ModerationEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 })
ModerationEventSchema.index({ previousEventHash: 1 })
