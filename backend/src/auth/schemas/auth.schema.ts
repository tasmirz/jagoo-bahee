import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Auth extends Document {
  @Prop({ type: Buffer, required: true, unique: true })
  publicKey: Buffer

  @Prop({ type: String, required: false })
  mfaKey?: string

  /**
   * Holds account status, bans, shadowbans, and global rate-limits.
   * For time-based or fine-grained limits, link another collection.
   */
  @Prop({ type: Number, default: 0 })
  abac: BigInt

  @Prop({ type: Date, default: Date.now })
  createdAt: Date
}

export const AuthSchema = SchemaFactory.createForClass(Auth)
