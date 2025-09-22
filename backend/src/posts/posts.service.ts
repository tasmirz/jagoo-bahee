import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Post } from './schemas/post.schema'
import { ModLogService } from 'src/moderation/mod-log.service'

const POST_FLAGS = {
  ACTIVE: 1 << 0,
  FSPOILER: 1 << 1,
  SPOILER: 1 << 2,
  PINNED: 1 << 3,
  LOCKED: 1 << 4,
  ARCHIVED: 1 << 5,
  REMOVED: 1 << 6,
  FLAGGED: 1 << 7,
  APPROVED: 1 << 8,
  OC: 1 << 9
}

@Injectable()
export class PostsService {
  constructor(
    @InjectModel(Post.name) private readonly model: Model<Post>,
    private readonly modLog: ModLogService
  ) {}

  private toId(id: string | Types.ObjectId) {
    return typeof id === 'string' ? new Types.ObjectId(id) : id
  }

  async create(data: Partial<Post>) {
    const doc = await this.model.create({ ...data, statusFlags: BigInt(POST_FLAGS.ACTIVE) })
    return doc
  }

  async findById(id: string) {
    const doc = await this.model.findById(id)
    if (!doc) throw new NotFoundException('Post not found')
    return doc
  }

  async updateByAuthor(id: string, authorId: string, update: Partial<Post>) {
    const doc = await this.findById(id)
    if (String(doc.authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    Object.assign(doc, update, { editedAt: new Date() })
    await doc.save()
    return doc
  }

  async removeByAuthor(id: string, authorId: string) {
    const doc = await this.findById(id)
    if (String(doc.authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~POST_FLAGS.ACTIVE) | BigInt(POST_FLAGS.REMOVED)
    await doc.save()
    return doc
  }

  async vote(id: string, delta: -1 | 0 | 1) {
    const inc: any = { }
    if (delta === 1) { inc.upvoteCount = 1; inc.score = 1 }
    else if (delta === -1) { inc.downvoteCount = 1; inc.score = -1 }
    // delta 0 could be implemented as pulling previous vote - omitted here
    const doc = await this.model.findByIdAndUpdate(id, { $inc: inc }, { new: true })
    if (!doc) throw new NotFoundException('Post not found')
    return doc
  }

  // Moderation actions
  async modApprove(postId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(postId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | POST_FLAGS.APPROVED) & ~BigInt(POST_FLAGS.FLAGGED | POST_FLAGS.REMOVED)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.approve', targetType: 'post', targetId: postId })
    return doc
  }

  async modRemove(postId: string, subredditId: string, moderatorId: string, reason?: string) {
    const doc = await this.findById(postId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | POST_FLAGS.REMOVED) & ~BigInt(POST_FLAGS.APPROVED)
    doc.removalReason = reason
    doc.removedBy = this.toId(moderatorId)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.remove', targetType: 'post', targetId: postId, reason })
    return doc
  }

  async modLock(postId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(postId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | POST_FLAGS.LOCKED)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.lock', targetType: 'post', targetId: postId })
    return doc
  }

  async modUnlock(postId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(postId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~POST_FLAGS.LOCKED)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.unlock', targetType: 'post', targetId: postId })
    return doc
  }

  async modPin(postId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(postId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | POST_FLAGS.PINNED)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.pin', targetType: 'post', targetId: postId })
    return doc
  }

  async modUnpin(postId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(postId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~POST_FLAGS.PINNED)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.unpin', targetType: 'post', targetId: postId })
    return doc
  }

  async modFlag(postId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(postId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | POST_FLAGS.FLAGGED)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.flag', targetType: 'post', targetId: postId })
    return doc
  }

  async modUnflag(postId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(postId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~POST_FLAGS.FLAGGED)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.unflag', targetType: 'post', targetId: postId })
    return doc
  }
}
