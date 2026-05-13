import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpException,
  HttpStatus,
  forwardRef
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
import { ServerAcknowledgementsService } from 'src/moderation/server-acknowledgements.service'
import { AuditReceiptsService } from 'src/moderation/audit-receipts.service'
import { UsersService } from 'src/users/users.service'
import { createHash } from 'crypto'

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
    @Inject(forwardRef(() => PostsService)) private readonly postsService: PostsService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
    private readonly acks: ServerAcknowledgementsService,
    private readonly receipts: AuditReceiptsService,
    private readonly usersService: UsersService
  ) {}

  private readonly cacheTtlSeconds = Number(process.env.CACHE_TTL_SECONDS || 60)

  private async invalidateCommentCache(comment?: any) {
    if (comment?._id) await this.redis.delKeys(`jb:comments:one:${String(comment._id)}`)
    if (comment?.postId) await this.redis.delPattern(`jb:comments:post:${String(comment.postId)}:*`)
    if (comment?.parentId) await this.redis.delKeys(`jb:comments:one:${String(comment.parentId)}`)
  }

  private async findDocById(id: string) {
    const doc = await this.model.findById(id)
    if (!doc) throw new NotFoundException('Comment not found')
    return doc
  }

  private toId(id: string | Types.ObjectId) {
    return typeof id === 'string' ? new Types.ObjectId(id) : id
  }

  private buildPath(postId: string, parent?: Comment | null) {
    if (!parent) return `${postId}`
    return `${postId}/${parent._id}`
  }

  private assertContentHash(canonical: string, provided?: string) {
    const digest = createHash('sha256').update(canonical).digest()
    const hex = digest.toString('hex')
    const base64 = digest.toString('base64')
    if (!provided || (provided !== hex && provided !== base64)) {
      throw new BadRequestException('contentHash does not match canonical payload')
    }
  }

  private async assertCanWriteInSubreddit(userId: string, subredditId: string, action: 'comment' | 'reply') {
    const member = await (this as any).model.db.collection('subredditmembers').findOne({
      subredditId: new Types.ObjectId(String(subredditId)),
      userId: new Types.ObjectId(String(userId))
    })
    const flags = BigInt(member?.statusFlags ?? 0)
    if ((flags & BigInt(4)) !== BigInt(0)) throw new ForbiddenException(`Banned users cannot ${action}`)
    if ((flags & BigInt(2)) !== BigInt(0)) throw new ForbiddenException(`Muted users cannot ${action}`)
  }

  private assertCommentSubreddit(doc: Comment, subredditId: string) {
    if (String((doc as any).subredditId) !== String(subredditId)) {
      throw new ForbiddenException('Comment does not belong to the supplied subreddit')
    }
  }

  private async assertModeratorSignature(
    action: string,
    subredditId: string,
    commentId: string,
    moderatorId: string,
    moderatorSignature?: string,
    reason = ''
  ) {
    if (!moderatorSignature) throw new BadRequestException('Missing moderator signature')
    const pub = await getAuthPublicKeyById((this as any).model.db, String(moderatorId))
    if (!pub) throw new BadRequestException('Moderator public key not found')
    const payload = `${action}|${String(subredditId)}|${String(commentId)}|${reason || ''}`
    if (!verifySignature(pub, payload, moderatorSignature)) throw new BadRequestException('Invalid moderator signature')
  }

  async create(data: Partial<Comment>) {
    // Basic validation
    if (!data.postId) throw new BadRequestException('postId required')
    if (!data.authorId) throw new BadRequestException('authorId required')
    if (!data.userSignature) throw new BadRequestException('userSignature required')
    if (!data.contentHash) throw new BadRequestException('contentHash required')
    if (!data.content || String(data.content).trim().length === 0) throw new BadRequestException('content required')
    const post = await this.postsService.findById(String(data.postId))
    data.subredditId = data.subredditId || (post as any).subredditId
    await this.assertCanWriteInSubreddit(String(data.authorId), String(data.subredditId), data.parentId ? 'reply' : 'comment')
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
      postId: data.postId,
      parentId: data.parentId || null,
      attachmentIds,
      authorId: data.authorId
    }
    const canonical = JSON.stringify(payloadObj)
    this.assertContentHash(canonical, String(data.contentHash))
    const pub = await getAuthPublicKeyById((this as any).model.db, String(data.authorId))
    if (!pub) throw new BadRequestException('author public key not found')
    let ok = verifySignature(pub, canonical, String(data.userSignature))
    if (!ok) {
      try {
        const sigStr = String(data.userSignature || '')
        const b64 = sigStr.replace(/-/g, '+').replace(/_/g, '/')
        const pad = b64.length % 4
        const padded = pad ? b64 + '='.repeat(4 - pad) : b64
        ok = verifySignature(pub, canonical, padded)
        if (!ok) {
          const maybeHex = Buffer.from(sigStr, 'hex')
          ok = verifySignature(pub, canonical, maybeHex)
        }
      } catch (e) {}
    }
    if (!ok) {
      if (process.env.NODE_ENV !== 'production') {
        throw new BadRequestException({
          message: 'user signature verification failed',
          debug: { canonical }
        })
      }
      throw new BadRequestException('user signature verification failed')
    }

    // depth and path
    const parent = data.parentId ? await this.model.findById(data.parentId) : null
    const depth = parent ? (parent.depth || 0) + 1 : 0
    const maxDepth = Number(process.env.COMMENT_MAX_DEPTH || 10)
    if (depth > maxDepth) throw new BadRequestException('Max comment depth exceeded')
    const path = this.buildPath(String(data.postId), parent)

    // Create comment and update counters
    const doc = await this.model.create([{ ...data, depth, path, statusFlags: BigInt(COMMENT_FLAGS.ACTIVE) }])
    const created = Array.isArray(doc) ? doc[0] : doc
    // update parent replyCount
    if (parent) await this.model.updateOne({ _id: parent._id }, { $inc: { replyCount: 1 } })
    // update post comment count
    await this.postsService.incCommentCount(String(data.postId), 1)

    // server acknowledgement
    try {
      const payload = `${String((created as any)._id)}|created|${String(data.contentHash)}`
      const serverSig = signServerMessage(payload)
      await this.acks.create({
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
          const user = await this.usersService.findByUsername(username)
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

    await this.invalidateCommentCache(created)
    const receipt = await this.receipts.create({
      action: 'comment.created',
      subjectType: 'comment',
      subjectId: (created as any)._id,
      actorPublicKey: Buffer.from(pub).toString('base64'),
      actorSignature: String(data.userSignature),
      canonicalPayload: canonical
    })
    return { data: created, receipt }
  }

  async findById(id: string) {
    const doc = await this.redis.rememberJson<any>(`jb:comments:one:${id}`, this.cacheTtlSeconds, () =>
      this.model.findById(id).lean().exec() as any
    )
    if (!doc) throw new NotFoundException('Comment not found')
    return doc
  }

  async permissionsFor(id: string, user: any) {
    const comment = await this.model.findById(id).lean().exec()
    if (!comment) throw new NotFoundException('Comment not found')
    const actorId = String(user?.id || '')
    const abac = BigInt(user?.abac ?? 0)
    const isGlobalModerator = (abac & (BigInt(1) << BigInt(4))) !== BigInt(0)
    const isGlobalAdmin = (abac & (BigInt(1) << BigInt(5))) !== BigInt(0)
    const membership = await (this as any).model.db.collection('subredditmembers').findOne({
      subredditId: new Types.ObjectId(String((comment as any).subredditId)),
      userId: new Types.ObjectId(actorId)
    })
    const flags = BigInt(membership?.statusFlags ?? 0)
    const isBanned = (flags & BigInt(4)) !== BigInt(0)
    const isMuted = (flags & BigInt(2)) !== BigInt(0)
    const isModerator = (flags & BigInt(8)) !== BigInt(0)
    const isOwner = String((comment as any).authorId) === actorId
    const canModerate = isGlobalAdmin || isGlobalModerator || isModerator
    return {
      commentId: id,
      postId: String((comment as any).postId),
      subredditId: String((comment as any).subredditId),
      isOwner,
      isModerator: canModerate,
      isBanned,
      isMuted,
      canEdit: isOwner && !isBanned,
      canDelete: (isOwner && !isBanned) || canModerate,
      canVote: !!actorId && !isBanned,
      canReply: !!actorId && !isBanned && !isMuted,
      canModerate,
      canRestore: canModerate
    }
  }

  async findByPost(postId: string, limit = 100, skip = 0) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200)
    const safeSkip = Math.max(Number(skip) || 0, 0)
    const key = `jb:comments:post:${postId}:${safeLimit}:${safeSkip}`
    return this.redis.rememberJson(key, this.cacheTtlSeconds, () =>
      this.model
        .find({ postId: new Types.ObjectId(postId) })
        .sort({ createdAt: 1 })
        .limit(safeLimit)
        .skip(safeSkip)
        .populate('authorId', 'username')
        .lean()
        .exec()
    )
  }

  async updateByAuthor(id: string, authorId: string, update: Partial<Comment>) {
    const doc = await this.findDocById(id)
    if (String(doc.authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    if (update.content !== undefined) {
      const payloadObj = {
        content: String(update.content),
        postId: String(doc.postId),
        parentId: doc.parentId ? String(doc.parentId) : null,
        attachmentIds: ((doc as any).attachmentIds || []).map(String),
        authorId: String(doc.authorId)
      }
      const canonical = JSON.stringify(payloadObj)
      this.assertContentHash(canonical, String((update as any).contentHash || ''))
      const pub = await getAuthPublicKeyById((this as any).model.db, String(authorId))
      if (!pub) throw new BadRequestException('author public key not found')
      if (!verifySignature(pub, canonical, String((update as any).userSignature || ''))) throw new BadRequestException('Invalid edit signature')
      ;(doc as any).contentHash = (update as any).contentHash
      ;(doc as any).userSignature = (update as any).userSignature
    }
    const { contentHash: _contentHash, userSignature: _userSignature, authorId: _authorId, ...safeUpdate } = update as any
    Object.assign(doc, safeUpdate, {
      editedAt: new Date(),
      statusFlags: BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.EDITED)
    })
    await doc.save()
    await this.invalidateCommentCache(doc)
    return doc
  }

  async removeByAuthor(id: string, authorId: string, deletionSignature?: string) {
    const doc = await this.findDocById(id)
    if (String(doc.authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    if (!deletionSignature) throw new BadRequestException('Missing deletion signature')
    const payload = `DELETE|${String(doc._id)}|user_delete`
    const pub = await getAuthPublicKeyById((this as any).model.db, String(authorId))
    if (!pub) throw new BadRequestException('author public key not found')
    if (!verifySignature(pub, payload, deletionSignature)) throw new BadRequestException('Invalid deletion signature')
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~COMMENT_FLAGS.ACTIVE) | BigInt(COMMENT_FLAGS.REMOVED)
    await doc.save()
    try {
      const ackPayload = `${String(doc._id)}|deleted|${doc.contentHash}`
      const serverSig = signServerMessage(ackPayload)
      await this.acks.create({
        contentType: 'comment',
        contentId: doc._id as any,
        authorId: doc.authorId as any,
        action: 'deleted',
        contentHash: doc.contentHash,
        userSignature: '',
        serverSignature: serverSig,
        metadata: { serverKeyId },
        createdAt: new Date()
      })
    } catch (e) {}
    await this.invalidateCommentCache(doc)
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
    await this.invalidateCommentCache(doc)
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
    await this.invalidateCommentCache(doc)
    return doc
  }

  // Moderation actions
  async modApprove(commentId: string, subredditId: string, moderatorId: string, moderatorSignature?: string) {
    const doc = await this.findDocById(commentId)
    this.assertCommentSubreddit(doc, subredditId)
    await this.assertModeratorSignature('comment.approve', subredditId, commentId, moderatorId, moderatorSignature)
    doc.statusFlags =
      BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.APPROVED) & ~BigInt(COMMENT_FLAGS.FLAGGED | COMMENT_FLAGS.REMOVED)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'comment.approve',
      targetType: 'comment',
      targetId: commentId,
      moderatorSignature
    })
    await this.invalidateCommentCache(doc)
    return doc
  }

  async modRemove(commentId: string, subredditId: string, moderatorId: string, reason?: string, moderatorSignature?: string) {
    const doc = await this.findDocById(commentId)
    this.assertCommentSubreddit(doc, subredditId)
    await this.assertModeratorSignature('comment.remove', subredditId, commentId, moderatorId, moderatorSignature, reason)
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
      reason,
      moderatorSignature
    })
    await this.invalidateCommentCache(doc)
    return doc
  }

  async modRestore(commentId: string, subredditId: string, moderatorId: string, reason?: string, moderatorSignature?: string) {
    const doc = await this.findDocById(commentId)
    this.assertCommentSubreddit(doc, subredditId)
    await this.assertModeratorSignature('comment.restore', subredditId, commentId, moderatorId, moderatorSignature, reason)
    doc.statusFlags = (BigInt(Number(doc.statusFlags)) & ~BigInt(COMMENT_FLAGS.REMOVED)) | BigInt(COMMENT_FLAGS.ACTIVE)
    doc.removalReason = undefined
    doc.removedBy = undefined
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'comment.restore',
      targetType: 'comment',
      targetId: commentId,
      reason,
      moderatorSignature
    })
    await this.invalidateCommentCache(doc)
    return doc
  }

  async modCollapse(commentId: string, subredditId: string, moderatorId: string, moderatorSignature?: string) {
    const doc = await this.findDocById(commentId)
    this.assertCommentSubreddit(doc, subredditId)
    await this.assertModeratorSignature('comment.collapse', subredditId, commentId, moderatorId, moderatorSignature)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.COLLAPSED)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'comment.collapse',
      targetType: 'comment',
      targetId: commentId,
      moderatorSignature
    })
    await this.invalidateCommentCache(doc)
    return doc
  }

  async modUncollapse(commentId: string, subredditId: string, moderatorId: string, moderatorSignature?: string) {
    const doc = await this.findDocById(commentId)
    this.assertCommentSubreddit(doc, subredditId)
    await this.assertModeratorSignature('comment.uncollapse', subredditId, commentId, moderatorId, moderatorSignature)
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~COMMENT_FLAGS.COLLAPSED)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'comment.uncollapse',
      targetType: 'comment',
      targetId: commentId,
      moderatorSignature
    })
    await this.invalidateCommentCache(doc)
    return doc
  }

  async modFlag(commentId: string, subredditId: string, moderatorId: string, moderatorSignature?: string) {
    const doc = await this.findDocById(commentId)
    this.assertCommentSubreddit(doc, subredditId)
    await this.assertModeratorSignature('comment.flag', subredditId, commentId, moderatorId, moderatorSignature)
    doc.statusFlags = BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.FLAGGED)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'comment.flag',
      targetType: 'comment',
      targetId: commentId,
      moderatorSignature
    })
    await this.invalidateCommentCache(doc)
    return doc
  }

  async modUnflag(commentId: string, subredditId: string, moderatorId: string, moderatorSignature?: string) {
    const doc = await this.findDocById(commentId)
    this.assertCommentSubreddit(doc, subredditId)
    await this.assertModeratorSignature('comment.unflag', subredditId, commentId, moderatorId, moderatorSignature)
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~COMMENT_FLAGS.FLAGGED)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'comment.unflag',
      targetType: 'comment',
      targetId: commentId,
      moderatorSignature
    })
    await this.invalidateCommentCache(doc)
    return doc
  }
}
