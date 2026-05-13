import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

@Schema({ timestamps: true })
export class AwardType extends Document {
  @Prop({ type: String, required: true, unique: true })
  name: string

  @Prop({ type: String, required: true })
  iconUrl: string

  @Prop({ type: Number, required: true })
  cost: number

  @Prop({ type: String })
  description?: string

  @Prop({ type: Boolean, default: true })
  isActive: boolean

  @Prop({ type: Date })
  createdAt: Date

  @Prop({ type: Date })
  updatedAt: Date
}

export const AwardTypeSchema = SchemaFactory.createForClass(AwardType)
