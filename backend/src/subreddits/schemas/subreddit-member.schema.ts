import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

/**
 * Member status flags (bitmap).
 * These bits are persisted across federated instances, so do not renumber them.
 */
export enum MemberStatus {
  MEMBER = 1 << 0,
  MUTED = 1 << 1,
  BANNED = 1 << 2,
  MODERATOR = 1 << 3,
  CONTRIBUTOR = 1 << 4
}

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class SubredditMember extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Subreddit', required: true })
  subredditId: Types.ObjectId

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId

  /**
   * Member status bitmap
   * Bit 0: isMember
   * Bit 1: isMuted
   * Bit 2: isBanned
   * Bit 3: isModerator
   * Bit 4: isContributor
   */
  @Prop({ type: BigInt, default: BigInt(1) })
  statusFlags: bigint

  @Prop({ type: BigInt, default: BigInt(1) })
  roleFlags: bigint

  @Prop({ type: BigInt, default: BigInt(0) })
  permissionOverrides: bigint

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
