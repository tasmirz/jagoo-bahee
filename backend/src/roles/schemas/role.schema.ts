import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: true })
export class Role extends Document {
  @Prop({ type: String, required: true })
  name: string

  @Prop({ type: Types.ObjectId, ref: 'Subreddit' })
  subredditId?: Types.ObjectId

  @Prop({ type: [String], default: [] })
  permissions: string[]

  @Prop({ type: Boolean, default: false })
  isSystemRole: boolean

  @Prop({ type: Date })
  createdAt: Date

  @Prop({ type: Date })
  updatedAt: Date
}

export const RoleSchema = SchemaFactory.createForClass(Role)
RoleSchema.index({ name: 1, subredditId: 1 }, { unique: true })
