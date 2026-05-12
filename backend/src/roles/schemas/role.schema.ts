import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

/**
 * Permission bits for roles
 * Use bitmap for efficient permission checking
 */
export enum RolePermission {
  // Content Management (0-9)
  POSTS_VIEW = 1 << 0, // 1 - View posts
  POSTS_CREATE = 1 << 1, // 2 - Create posts
  POSTS_EDIT_OWN = 1 << 2, // 4 - Edit own posts
  POSTS_EDIT_ALL = 1 << 3, // 8 - Edit all posts
  POSTS_DELETE_OWN = 1 << 4, // 16 - Delete own posts
  POSTS_DELETE_ALL = 1 << 5, // 32 - Delete all posts
  POSTS_PIN = 1 << 6, // 64 - Pin posts
  POSTS_LOCK = 1 << 7, // 128 - Lock posts
  POSTS_APPROVE = 1 << 8, // 256 - Approve posts
  POSTS_REMOVE = 1 << 9, // 512 - Remove posts

  // Comments (10-14)
  COMMENTS_VIEW = 1 << 10, // 1024 - View comments
  COMMENTS_CREATE = 1 << 11, // 2048 - Create comments
  COMMENTS_EDIT_OWN = 1 << 12, // 4096 - Edit own comments
  COMMENTS_EDIT_ALL = 1 << 13, // 8192 - Edit all comments
  COMMENTS_DELETE_ALL = 1 << 14, // 16384 - Delete all comments

  // Moderation (15-19)
  MOD_VIEW_REPORTS = 1 << 15, // 32768 - View reports
  MOD_HANDLE_REPORTS = 1 << 16, // 65536 - Handle reports
  MOD_VIEW_LOGS = 1 << 17, // 131072 - View mod logs
  MOD_BAN_USERS = 1 << 18, // 262144 - Ban users
  MOD_MUTE_USERS = 1 << 19, // 524288 - Mute users

  // Members (20-22)
  MEMBERS_VIEW = 1 << 20, // 1048576 - View members
  MEMBERS_KICK = 1 << 21, // 2097152 - Kick members
  MEMBERS_INVITE = 1 << 22, // 4194304 - Invite members

  // Settings (23-27)
  SETTINGS_VIEW = 1 << 23, // 8388608 - View settings
  SETTINGS_EDIT = 1 << 24, // 16777216 - Edit settings
  SETTINGS_ROLES = 1 << 25, // 33554432 - Manage roles
  SETTINGS_MODERATORS = 1 << 26, // 67108864 - Manage moderators
  SETTINGS_DELETE = 1 << 27, // 134217728 - Delete subreddit

  // Special (28-30)
  ALL_PERMISSIONS = 1 << 28 // 268435456 - All permissions (owner)
}

@Schema({ timestamps: true })
export class Role extends Document {
  @Prop({ type: String, required: true })
  name: string

  @Prop({ type: Types.ObjectId, ref: 'Subreddit' })
  subredditId?: Types.ObjectId

  @Prop({ type: BigInt, default: BigInt(0) })
  permissions: bigint

  @Prop({ type: Boolean, default: false })
  isSystemRole: boolean

  @Prop({ type: Date })
  createdAt: Date

  @Prop({ type: Date })
  updatedAt: Date
}

export const RoleSchema = SchemaFactory.createForClass(Role)
RoleSchema.index({ name: 1, subredditId: 1 }, { unique: true })
