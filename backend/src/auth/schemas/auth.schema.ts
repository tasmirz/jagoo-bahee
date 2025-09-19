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
  /**
   * 64-bit bitmap for user status flags
   * Bit 0: isActive
   * Bit 1: isBanned
   * Bit 2: isShadowBanned
   * Bit 3: isVerified
   * Bit 4: isModerator (global)
   * Bit 5: isAdmin (global)
   * Bit 6: isVerified
   * Bits 7-15: Reserved for future use
   * Bits 16-31: Custom flags
   * Bits 32-63: Reserved
   */
  @Prop({ type: Number, default: 0 })
  abac: BigInt

  @Prop({ type: Date, default: Date.now })
  createdAt: Date
}

export const AuthSchema = SchemaFactory.createForClass(Auth)
