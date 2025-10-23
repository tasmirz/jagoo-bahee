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
import { ObjectId } from 'mongoose'

const COMMENT_FLAGS = {
  ACTIVE: 1 << 0,
  EDITED: 1 << 1,
  REMOVED: 1 << 2,
  COLLAPSED: 1 << 3,
  FLAGGED: 1 << 4,
  APPROVED: 1 << 5
}

// Helper to serialize comment - convert BigInt to string for JSON
function serializeComment(comment: any) {
  const obj = comment.toObject ? comment.toObject() : comment
  const serialized = JSON.parse(JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v)))

  // Check if comment is deleted (REMOVED flag is set)
  const flags = Number(serialized.statusFlags || 0)
  const isRemoved = (flags & COMMENT_FLAGS.REMOVED) !== 0

  if (isRemoved) {
    serialized.isDeleted = true
    // Clear content for deleted comments
    serialized.content = '[deleted]'
  }

  return serialized
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private readonly model: Model<Comment>,
    private readonly modLog: ModLogService,
    private readonly attachments: AttachmentsService,
    @Inject(forwardRef(() => PostsService)) private readonly postsService: PostsService,
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

    // convert IDs to ObjectId
    data.postId = this.toId(String(data.postId))
    data.authorId = this.toId(String(data.authorId))
    if (data.parentId) data.parentId = this.toId(String(data.parentId))
    if (data.subredditId) data.subredditId = this.toId(String(data.subredditId))

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
    console.log('Verifying comment signature', {
      authorId: String(data.authorId),
      canonical,
      providedSignaturePreview: String(data.userSignature || '').slice(0, 40)
    })
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
      try {
        console.warn('Signature verification failed for comment creation', {
          authorId: String(data.authorId),
          canonical,
          providedSignaturePreview: String(data.userSignature || '').slice(0, 40),
          pubHex: pub.toString('hex')
        })
      } catch (e) {}
      if (process.env.NODE_ENV !== 'production') {
        throw new BadRequestException({
          message: 'user signature verification failed',
          debug: {
            canonical,
            providedSignaturePreview: String(data.userSignature || '').slice(0, 80),
            pubHex: pub.toString('hex')
          }
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
    console.log('Creating comment with data:', {
      postId: data.postId,
      subredditId: data.subredditId,
      authorId: data.authorId,
      parentId: data.parentId,
      content: String(data.content).slice(0, 50),
      depth,
      path
    })
    const doc = await this.model.create([{ ...data, depth, path, statusFlags: BigInt(COMMENT_FLAGS.ACTIVE) }])
    const created = Array.isArray(doc) ? doc[0] : doc
    console.log('Comment created successfully:', {
      _id: created._id,
      postId: created.postId,
      createdAt: created.createdAt
    })
    // update parent replyCount
    if (parent) await this.model.updateOne({ _id: parent._id }, { $inc: { replyCount: 1 } })
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

    return serializeComment(created)
  }

  async findById(id: string) {
    const doc = await this.model
      .findById(id)
      .populate({ path: 'authorId', select: 'username displayName avatar karma' })
      .exec()
    if (!doc) throw new NotFoundException('Comment not found')
    const result = doc.toObject ? doc.toObject() : doc
    // Add populated field as expected by frontend
    if (result.authorId) (result as any).author = result.authorId
    return serializeComment(result)
  }

  async findByPost(postId: string, limit = 100, skip = 0) {
    console.log('findByPost called with:', { postId, limit, skip })
    const postObjId = new Types.ObjectId(postId)

    // Get ALL comments for this post (no limit/skip for tree building)
    const allDocs = await this.model
      .find({ postId: postObjId })
      .populate({ path: 'authorId', select: 'username displayName avatar karma' })
      .exec()

    console.log('Found total documents:', allDocs.length)
    if (allDocs.length === 0) {
      console.log('No comments found for postId:', postId)
      return []
    }

    // Build a map of comments by ID
    const commentMap = new Map()
    allDocs.forEach((doc: any) => {
      const serialized = serializeComment({
        ...doc.toObject(),
        author: doc.authorId || undefined,
        replies: []
      })
      commentMap.set(String(doc._id), serialized)
    })

    // Build tree structure by linking children to parents
    const rootComments: any[] = []
    commentMap.forEach((comment: any) => {
      if (!comment.parentId) {
        // Root comment (depth 0)
        rootComments.push(comment)
      } else {
        // Child comment - add to parent's replies
        const parent = commentMap.get(String(comment.parentId))
        if (parent) {
          if (!parent.replies) parent.replies = []
          parent.replies.push(comment)
        }
      }
    })

    // Sort root comments by creation date
    rootComments.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

    // Apply limit/skip to root comments only
    return rootComments.slice(Number(skip), Number(skip) + Number(limit))
  }

  async updateByAuthor(id: string, authorId: string, update: Partial<Comment>) {
    const doc = await this.findById(id)

    // Extract the actual author ID (might be populated as an object)
    const docAuthorId =
      typeof doc.authorId === 'object' && doc.authorId !== null
        ? String((doc.authorId as any)._id)
        : String(doc.authorId)
    const reqAuthorId = String(authorId)

    console.log('[updateByAuthor] Ownership check:', {
      commentId: id,
      docAuthorId,
      reqAuthorId,
      match: docAuthorId === reqAuthorId,
      docAuthorIdType: typeof doc.authorId,
      reqAuthorIdType: typeof authorId
    })

    if (docAuthorId !== reqAuthorId) {
      throw new ForbiddenException('Not the author')
    }

    // Update the document directly in database (not the populated one)
    const result = await this.model.findByIdAndUpdate(
      id,
      {
        ...update,
        editedAt: new Date(),
        statusFlags: BigInt(Number(doc.statusFlags) | COMMENT_FLAGS.EDITED)
      },
      { new: true }
    )

    if (!result) throw new NotFoundException('Comment not found')
    return serializeComment(result)
  }

  async removeByAuthor(id: string, authorId: string) {
    const doc = await this.findById(id)

    // Extract the actual author ID (might be populated as an object)
    const docAuthorId =
      typeof doc.authorId === 'object' && doc.authorId !== null
        ? String((doc.authorId as any)._id)
        : String(doc.authorId)
    const reqAuthorId = String(authorId)

    console.log('[removeByAuthor] Ownership check:', {
      commentId: id,
      docAuthorId,
      reqAuthorId,
      match: docAuthorId === reqAuthorId,
      docAuthorIdType: typeof doc.authorId,
      reqAuthorIdType: typeof authorId
    })

    if (docAuthorId !== reqAuthorId) {
      throw new ForbiddenException('Not the author')
    }

    // Update the document directly in database
    const result = await this.model.findByIdAndUpdate(
      id,
      {
        statusFlags: BigInt(Number(doc.statusFlags) & ~COMMENT_FLAGS.ACTIVE) | BigInt(COMMENT_FLAGS.REMOVED)
      },
      { new: true }
    )

    if (!result) throw new NotFoundException('Comment not found')
    return serializeComment(result)
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
    return serializeComment(doc)
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
    return serializeComment(doc)
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
    return serializeComment(doc)
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
    return serializeComment(doc)
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
    return serializeComment(doc)
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
    return serializeComment(doc)
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
    return serializeComment(doc)
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
    return serializeComment(doc)
  }

  async findAll(limit = 100, skip = 0, searchQuery?: string) {
    // Add search filter if provided
    const filter: any = {}
    if (searchQuery && searchQuery.trim()) {
      const searchRegex = new RegExp(searchQuery.trim(), 'i') // case-insensitive
      filter.content = searchRegex
    }

    const docs = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .populate({ path: 'authorId', select: 'username displayName avatar karma' })
      .populate({ path: 'postId', select: '_id' })
      .lean()
      .exec()

    return docs.map((d: any) => ({
      ...d,
      author: d.authorId || undefined,
      statusFlags: d.statusFlags !== undefined && d.statusFlags !== null ? String(d.statusFlags) : d.statusFlags
    }))
  }
}
