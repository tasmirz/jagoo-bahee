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

  async findByUsername(username: string): Promise<User | null> {
    return this.userModel.findOne({ username }).exec()
  }

  // With the new schema the User document _id will be the same as the Auth document _id.
  // findByAuthId is equivalent to findById on this model.
  async findByAuthId(authId: string | Types.ObjectId): Promise<User | null> {
    return this.userModel.findById(authId).exec()
  }

  async createForAuth(authId: Types.ObjectId, username: string): Promise<User> {
    // create user with explicit _id equal to authId
    const created = await this.userModel.create({ _id: authId, username } as any)
    return created
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

    const base = (preferredUsername || `user_${String(authId).slice(-8)}`).slice(0, 30)
    const maxAttempts = 10

    // Quick re-check in case another process created the user between calls
    const existingRetry = await this.findByAuthId(authId)
    if (existingRetry) return existingRetry

    const crypto = await import('crypto')
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const suffix = attempt === 0 ? '' : `_${crypto.randomInt(10000, 999999)}`
      const candidate = `${base}${suffix}`.slice(0, 50)
      try {
        // create with _id equal to authId
        console.log(`Attempting to create user for authId ${authId} with username candidate: ${candidate}`)
        const created = await this.userModel.create({ _id: authId, username: candidate } as any)
        return created
      } catch (err: any) {
        // Duplicate key error code from MongoDB is 11000
        if (err && err.code === 11000) {
          // Determine which field caused conflict if possible
          const keyValue = err.keyValue || {}
          if (keyValue._id) {
            // Another process created the user with this authId — return it
            const found = await this.findByAuthId(authId)
            if (found) return found
            // otherwise continue trying
            continue
          }
          if (keyValue.username) {
            // username conflict — try another candidate
            continue
          }
          // unknown 11000 source — retry a few times
          continue
        }
        // any other error, rethrow
        throw err
      }
    }

    // Final attempt: try upsert by _id to ensure the user record exists
    try {
      const up = await this.userModel
        .findOneAndUpdate({ _id: authId }, { $setOnInsert: { username: base } }, { upsert: true, new: true })
        .exec()
      if (up) return up
    } catch (e) {
      // fall through to error
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

  // Adjust user's karma atomically. type='post'|'comment'
  async adjustKarma(userId: string | Types.ObjectId, type: 'post' | 'comment', delta: number) {
    const field = type === 'post' ? { postKarma: delta } : { commentKarma: delta }
    const update: any = {}
    if (type === 'post') update.$inc = { postKarma: delta }
    else update.$inc = { commentKarma: delta }
    const doc = await this.userModel.findByIdAndUpdate(userId, update, { new: true }).exec()
    return doc
  }
}
