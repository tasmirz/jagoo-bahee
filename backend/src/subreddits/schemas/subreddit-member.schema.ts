import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

/**
 * Member status flags (bitmap)
 * Only for restrictive states - permissions handled by Role/UserRole
 */
export enum MemberStatus {
  BANNED = 1 << 0, // 1 - User is banned
  MUTED = 1 << 1 // 2 - User is muted
  // All other permissions (moderator, creator, etc.) handled by Role/UserRole system
}

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class SubredditMember extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Subreddit', required: true })
  subredditId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId

  /**
   * Member status bitmap (restrictive flags only)
   * Bit 0: isBanned (1)
   * Bit 1: isMuted (2)
   *
   * Note: Permissions like moderator, creator, etc. are managed through
   * the Role and UserRole system for better granularity.
   */
  @Prop({ type: BigInt, default: BigInt(0) })
  statusFlags: bigint

  @Prop({ type: Date })
  mutedUntil?: Date

  @Prop({ type: Date })
  bannedUntil?: Date

  @Prop({ type: String })
  banReason?: string

  @Prop({ type: Date })
  createdAt: Date
}

export const SubredditMemberSchema = SchemaFactory.createForClass(SubredditMember)
SubredditMemberSchema.index({ subredditId: 1, userId: 1 }, { unique: true })
SubredditMemberSchema.index({ userId: 1 })
