import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Comment } from './schemas/comment.schema'
import { ModLogService } from 'src/moderation/mod-log.service'

const COMMENT_FLAGS = {
  ACTIVE: 1 << 0,
  EDITED: 1 << 1,
  REMOVED: 1 << 2,
  COLLAPSED: 1 << 3,
  FLAGGED: 1 << 4,
  APPROVED: 1 << 5
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private readonly model: Model<Comment>,
    private readonly modLog: ModLogService
  ) {}

  private toId(id: string | Types.ObjectId) {
    return typeof id === 'string' ? new Types.ObjectId(id) : id
  }

  private buildPath(postId: string, parent?: Comment | null) {
    if (!parent) return `${postId}`
    return `${postId}/${parent.id}`
  }

  async create(data: Partial<Comment>) {
    const parent = data.parentId ? await this.model.findById(data.parentId) : null
    const depth = parent ? (parent.depth || 0) + 1 : 0
    const path = this.buildPath(String(data.postId), parent)
    const doc = await this.model.create({ ...data, depth, path, statusFlags: BigInt(COMMENT_FLAGS.ACTIVE) })
    if (parent) await this.model.updateOne({ _id: parent._id }, { $inc: { replyCount: 1 } })
    return doc
  }

  async findById(id: string) {
    const doc = await this.model.findById(id)
    if (!doc) throw new NotFoundException('Comment not found')
    return doc
  }

  async updateByAuthor(id: string, authorId: string, update: Partial<Comment>) {
    const doc = await this.findById(id)
    if (String(doc.authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    Object.assign(doc, update, { editedAt: new Date(), statusFlags: BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.EDITED) })
    await doc.save()
    return doc
  }

  async removeByAuthor(id: string, authorId: string) {
    const doc = await this.findById(id)
    if (String(doc.authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~COMMENT_FLAGS.ACTIVE) | BigInt(COMMENT_FLAGS.REMOVED)
    await doc.save()
    return doc
  }

  async vote(id: string, delta: -1 | 0 | 1) {
    const inc: any = { }
    if (delta === 1) { inc.upvoteCount = 1; inc.score = 1 }
    else if (delta === -1) { inc.downvoteCount = 1; inc.score = -1 }
    const doc = await this.model.findByIdAndUpdate(id, { $inc: inc }, { new: true })
    if (!doc) throw new NotFoundException('Comment not found')
    return doc
  }

  // Moderation actions
  async modApprove(commentId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(commentId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.APPROVED) & ~BigInt(COMMENT_FLAGS.FLAGGED | COMMENT_FLAGS.REMOVED)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'comment.approve', targetType: 'comment', targetId: commentId })
    return doc
  }

  async modRemove(commentId: string, subredditId: string, moderatorId: string, reason?: string) {
    const doc = await this.findById(commentId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.REMOVED) & ~BigInt(COMMENT_FLAGS.APPROVED)
    doc.removalReason = reason
    doc.removedBy = this.toId(moderatorId)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'comment.remove', targetType: 'comment', targetId: commentId, reason })
    return doc
  }

  async modCollapse(commentId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(commentId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.COLLAPSED)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'comment.collapse', targetType: 'comment', targetId: commentId })
    return doc
  }

  async modUncollapse(commentId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(commentId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~COMMENT_FLAGS.COLLAPSED)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'comment.uncollapse', targetType: 'comment', targetId: commentId })
    return doc
  }

  async modFlag(commentId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(commentId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.FLAGGED)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'comment.flag', targetType: 'comment', targetId: commentId })
    return doc
  }

  async modUnflag(commentId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(commentId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~COMMENT_FLAGS.FLAGGED)
    await doc.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'comment.unflag', targetType: 'comment', targetId: commentId })
    return doc
  }
}
