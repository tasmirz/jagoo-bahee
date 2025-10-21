import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Comment } from './schemas/comment.schema'
import { ModLogService } from 'src/moderation/mod-log.service'
import { AttachmentsService } from 'src/attachments/attachments.service'
import { PostsService } from 'src/posts/posts.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { verifySignature, getAuthPublicKeyById } from 'src/common/signature.util'
import { signServerMessage, serverKeyId } from 'src/common/server-sign.util'
import { RedisService } from 'src/redis/redis.service'

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
    private readonly modLog: ModLogService,
    private readonly attachments: AttachmentsService,
    private readonly postsService: PostsService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService
  ) {}

  private toId(id: string | Types.ObjectId) {
    return typeof id === 'string' ? new Types.ObjectId(id) : id
  }

  private buildPath(postId: string, parent?: Comment | null) {
    if (!parent) return `${postId}`
    return `${postId}/${parent.id}`
  }

  async create(data: Partial<Comment>) {
    // Basic validation
    if (!data.postId) throw new BadRequestException('postId required')
    if (!data.authorId) throw new BadRequestException('authorId required')
    if (!data.userSignature) throw new BadRequestException('userSignature required')
    if (!data.contentHash) throw new BadRequestException('contentHash required')
    if (!data.content || String(data.content).trim().length === 0) throw new BadRequestException('content required')
    // rate limit: 1 comment per N seconds
    const userKey = `comment-rate:${String(data.authorId)}:${process.env.COMMENT_RATE_LIMIT_SECONDS || 10}`
    try {
      const cli = this.redis.getClient()
      const cnt = await cli.incr(userKey)
      if (cnt === 1) await cli.expire(userKey, Number(process.env.COMMENT_RATE_LIMIT_SECONDS || 10))
      const maxPerWindow = 1
      if (cnt > maxPerWindow) throw new HttpException('Comment rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS)
    } catch (e) {
      if (e instanceof HttpException) throw e
    }

    // attachments validation
    const attachmentIds = Array.isArray(data.attachmentIds) ? data.attachmentIds : []
    for (const aId of attachmentIds) {
      const att = await this.attachments.findOne(String(aId))
      if (!att) throw new BadRequestException(`attachment ${aId} not found`)
      if (!att.confirmed) throw new BadRequestException(`attachment ${aId} not uploaded/confirmed`)
      if (String(att.ownerId) !== String(data.authorId))
        throw new BadRequestException(`attachment ${aId} not owned by author`)
    }

    // Verify user signature: canonical JSON ordering
    const payloadObj = {
      content: String(data.content),
      postId: String(data.postId),
      parentId: data.parentId ? String(data.parentId) : null,
      attachmentIds: (attachmentIds || []).slice().sort(),
      timestamp: data.createdAt ? Number(new Date(data.createdAt)) : Date.now()
    }
    const canonical = JSON.stringify(payloadObj)
    const pub = await getAuthPublicKeyById((this as any).model.db, String(data.authorId))
    if (!pub) throw new BadRequestException('author public key not found')
    const ok = verifySignature(pub, canonical, String(data.userSignature))
    if (!ok) throw new BadRequestException('user signature verification failed')

    // depth and path
    const parent = data.parentId ? await this.model.findById(data.parentId) : null
    const depth = parent ? (parent.depth || 0) + 1 : 0
    const maxDepth = Number(process.env.COMMENT_MAX_DEPTH || 10)
    if (depth > maxDepth) throw new BadRequestException('Max comment depth exceeded')
    const path = this.buildPath(String(data.postId), parent)

    // Create comment in a transaction and update counters
    const session = await (this.model.db as any).startSession()
    session.startTransaction()
    try {
      const doc = await this.model.create([{ ...data, depth, path, statusFlags: BigInt(COMMENT_FLAGS.ACTIVE) }], {
        session
      })
      const created = Array.isArray(doc) ? doc[0] : doc
      // update parent replyCount
      if (parent) await this.model.updateOne({ _id: parent._id }, { $inc: { replyCount: 1 } }).session(session)
      // update post comment count
      await this.postsService.incCommentCount(String(data.postId), 1)

      // server acknowledgement
      try {
        const payload = `${String((created as any)._id)}|created|${String(data.contentHash)}`
        const serverSig = signServerMessage(payload)
        const coll = (this as any).model.db.collection('serveracknowledgements')
        await coll.insertOne({
          contentType: 'comment',
          contentId: (created as any)._id,
          authorId: new Types.ObjectId(data.authorId),
          action: 'created',
          contentHash: data.contentHash,
          userSignature: data.userSignature,
          serverSignature: serverSig,
          metadata: { serverKeyId },
          createdAt: new Date()
        })
      } catch (e) {
        // swallow ack errors
      }

      // notifications: reply and mentions
      try {
        if (parent) {
          // notify parent author
          await this.notifications.create({
            userId: String((parent as any).authorId),
            type: 'comment_reply',
            actorId: String(data.authorId),
            targetId: String((created as any)._id),
            targetType: 'comment',
            message: `u/${String(data.authorId)} replied to your comment`
          })
        }
        // mentions: simple regex for @username
        const mentionRe = /@([a-zA-Z0-9_\-]+)/g
        const mentions = new Set<string>()
        let m: RegExpExecArray | null
        while ((m = mentionRe.exec(String(data.content)))) {
          mentions.add(m[1])
        }
        for (const username of Array.from(mentions)) {
          try {
            const user = await (this as any).model.db.collection('users').findOne({ username })
            if (user)
              await this.notifications.create({
                userId: String(user._id),
                type: 'mention',
                actorId: String(data.authorId),
                targetId: String((created as any)._id),
                targetType: 'comment',
                message: `u/${String(data.authorId)} mentioned you`
              })
          } catch (e) {}
        }
      } catch (e) {}

      await session.commitTransaction()
      session.endSession()
      return created
    } catch (e) {
      await session.abortTransaction()
      session.endSession()
      throw e
    }
  }

  async findById(id: string) {
    const doc = await this.model.findById(id)
    if (!doc) throw new NotFoundException('Comment not found')
    return doc
  }

  async updateByAuthor(id: string, authorId: string, update: Partial<Comment>) {
    const doc = await this.findById(id)
    if (String(doc.authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    Object.assign(doc, update, {
      editedAt: new Date(),
      statusFlags: BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.EDITED)
    })
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
    const inc: any = {}
    if (delta === 1) {
      inc.upvoteCount = 1
      inc.score = 1
    } else if (delta === -1) {
      inc.downvoteCount = 1
      inc.score = -1
    }
    const doc = await this.model.findByIdAndUpdate(id, { $inc: inc }, { new: true })
    if (!doc) throw new NotFoundException('Comment not found')
    return doc
  }

  async applyVoteChange(id: string, prevValue: -1 | 0 | 1, newValue: -1 | 0 | 1) {
    const inc: any = {}
    if (prevValue === 1) {
      inc.upvoteCount = -1
      inc.score = -1
    } else if (prevValue === -1) {
      inc.downvoteCount = -1
      inc.score = 1
    }
    if (newValue === 1) {
      inc.upvoteCount = (inc.upvoteCount || 0) + 1
      inc.score = (inc.score || 0) + 1
    } else if (newValue === -1) {
      inc.downvoteCount = (inc.downvoteCount || 0) + 1
      inc.score = (inc.score || 0) - 1
    }
    const doc = await this.model.findByIdAndUpdate(id, { $inc: inc }, { new: true })
    if (!doc) throw new NotFoundException('Comment not found')
    return doc
  }

  // Moderation actions
  async modApprove(commentId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(commentId)
    doc.statusFlags =
      BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.APPROVED) & ~BigInt(COMMENT_FLAGS.FLAGGED | COMMENT_FLAGS.REMOVED)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'comment.approve',
      targetType: 'comment',
      targetId: commentId
    })
    return doc
  }

  async modRemove(commentId: string, subredditId: string, moderatorId: string, reason?: string) {
    const doc = await this.findById(commentId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.REMOVED) & ~BigInt(COMMENT_FLAGS.APPROVED)
    doc.removalReason = reason
    doc.removedBy = this.toId(moderatorId)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'comment.remove',
      targetType: 'comment',
      targetId: commentId,
      reason
    })
    return doc
  }

  async modCollapse(commentId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(commentId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.COLLAPSED)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'comment.collapse',
      targetType: 'comment',
      targetId: commentId
    })
    return doc
  }

  async modUncollapse(commentId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(commentId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~COMMENT_FLAGS.COLLAPSED)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'comment.uncollapse',
      targetType: 'comment',
      targetId: commentId
    })
    return doc
  }

  async modFlag(commentId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(commentId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.FLAGGED)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'comment.flag',
      targetType: 'comment',
      targetId: commentId
    })
    return doc
  }

  async modUnflag(commentId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(commentId)
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~COMMENT_FLAGS.FLAGGED)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'comment.unflag',
      targetType: 'comment',
      targetId: commentId
    })
    return doc
  }
}
