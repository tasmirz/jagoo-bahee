import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { User } from './schemas/user.schema'
import { UserFollow } from './schemas/user-follow.schema'
import { SavedContent } from './schemas/saved-content.schema'
import { UserBlock } from './schemas/user-block.schema'
import { FeedPreferences } from './schemas/feed-preferences.schema'

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(UserFollow.name) private userFollowModel: Model<UserFollow>,
    @InjectModel(SavedContent.name) private savedContentModel: Model<SavedContent>,
    @InjectModel(UserBlock.name) private userBlockModel: Model<UserBlock>,
    @InjectModel(FeedPreferences.name) private feedPreferencesModel: Model<FeedPreferences>
  ) {}

  async findById(id: string | Types.ObjectId): Promise<User | null> {
    return this.userModel.findById(id).exec()
  }

  async findByAuthId(authId: string | Types.ObjectId): Promise<User | null> {
    return this.userModel.findOne({ authId }).exec()
  }

  async createForAuth(authId: Types.ObjectId, username: string): Promise<User> {
    const user = await this.userModel.create({ authId, username })
    return user
  }

  /**
   * Ensure there is a User document for the given authId. If none exists,
   * attempt to create one with a unique username. The function will retry
   * on duplicate-key errors up to maxAttempts.
   */
  async ensureUserForAuth(authId: Types.ObjectId, preferredUsername?: string): Promise<User> {
    // Return existing if present
    const existing = await this.findByAuthId(authId)
    if (existing) return existing

    const base = preferredUsername ?? `user_${String(authId).slice(-8)}`
    const maxAttempts = 6
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = attempt === 0 ? base : `${base}_${Math.floor(Math.random() * 90000) + 10000}`
      try {
        const created = await this.userModel.create({ authId, username: candidate })
        return created
      } catch (err: any) {
        // Duplicate key error code from MongoDB is 11000
        if (err && err.code === 11000) {
          // username conflict — retry
          continue
        }
        // any other error, rethrow
        throw err
      }
    }

    throw new Error('Could not generate a unique username after multiple attempts')
  }

  async updateProfile(id: string | Types.ObjectId, patch: Partial<User>): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(id, patch, { new: true }).exec()
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  // -- Follow / Unfollow --
  async followUser(followerId: Types.ObjectId, followingId: Types.ObjectId) {
    if (String(followerId) === String(followingId)) throw new Error('Cannot follow yourself')
    try {
      const doc = await this.userFollowModel.create({ followerId, followingId })
      return doc
    } catch (err: any) {
      if (err && err.code === 11000) return null // already following
      throw err
    }
  }

  async unfollowUser(followerId: Types.ObjectId, followingId: Types.ObjectId) {
    return this.userFollowModel.findOneAndDelete({ followerId, followingId }).exec()
  }

  // -- Saved Content --
  async saveContent(userId: Types.ObjectId, targetId: Types.ObjectId, targetType: string, category?: string) {
    try {
      const doc = await this.savedContentModel.create({ userId, targetId, targetType, category })
      return doc
    } catch (err: any) {
      if (err && err.code === 11000) return null // already saved
      throw err
    }
  }

  async unsaveContent(userId: Types.ObjectId, targetId: Types.ObjectId, targetType: string) {
    return this.savedContentModel.findOneAndDelete({ userId, targetId, targetType }).exec()
  }

  // -- Blocking --
  async blockUser(blockerId: Types.ObjectId, blockedId: Types.ObjectId, reason?: string) {
    if (String(blockerId) === String(blockedId)) throw new Error('Cannot block yourself')
    try {
      const doc = await this.userBlockModel.create({ blockerId, blockedId, reason })
      return doc
    } catch (err: any) {
      if (err && err.code === 11000) return null // already blocked
      throw err
    }
  }

  async unblockUser(blockerId: Types.ObjectId, blockedId: Types.ObjectId) {
    return this.userBlockModel.findOneAndDelete({ blockerId, blockedId }).exec()
  }

  // -- Feed Preferences --
  async getFeedPreferences(userId: Types.ObjectId) {
    return this.feedPreferencesModel.findOne({ userId }).exec()
  }

  async upsertFeedPreferences(userId: Types.ObjectId, patch: Partial<FeedPreferences>) {
    const doc = await this.feedPreferencesModel.findOneAndUpdate({ userId }, patch, { upsert: true, new: true }).exec()
    return doc
  }
}
