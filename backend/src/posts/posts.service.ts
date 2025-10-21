import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Post } from './schemas/post.schema'
import { ModLogService } from 'src/moderation/mod-log.service'
import { AttachmentsService } from 'src/attachments/attachments.service'
import { SubredditsService } from 'src/subreddits/subreddits.service'
import { verifySignature, getAuthPublicKeyById } from 'src/common/signature.util'
import { createHmac } from 'crypto'
import { jwtConfig } from 'src/config/jwt.config'
import { signServerMessage, serverKeyId } from 'src/common/server-sign.util'

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
    private readonly modLog: ModLogService,
    private readonly attachments: AttachmentsService,
    private readonly subreddits: SubredditsService
  ) {}

  private toId(id: string | Types.ObjectId) {
    return typeof id === 'string' ? new Types.ObjectId(id) : id
  }

  async create(data: Partial<Post>) {
    // Basic validation
    if (!data.title || typeof data.title !== 'string') throw new BadRequestException('title required')
    if (!data.subredditId) throw new BadRequestException('subredditId required')
    if (!data.authorId) throw new BadRequestException('authorId required')
    if (!data.userSignature) throw new BadRequestException('userSignature required')
    if (!data.contentHash) throw new BadRequestException('contentHash required')

    // Enforce subreddit rules (types allowed, rate limits etc.)
    try {
      const sr = await this.subreddits.findOne(String(data.subredditId))
      if (!sr) throw new BadRequestException('subreddit not found')
      // Check post type allowed
      const typ = String(data.type)
      const sro: any = sr as any
      if (typ === 'text' && sro.allowTextPosts === false) throw new BadRequestException('Text posts not allowed')
      if (typ === 'link' && sro.allowLinkPosts === false) throw new BadRequestException('Link posts not allowed')
      if ((typ === 'image' || typ === 'video') && sro.allowImagePosts === false && sro.allowVideoPosts === false) {
        throw new BadRequestException('Media posts not allowed')
      }
    } catch (e) {
      // bubble up
      if (e instanceof BadRequestException) throw e
    }

    // If attachments are provided, ensure they exist and are confirmed and owned by author
    const attachmentIds = Array.isArray(data.attachmentIds) ? data.attachmentIds : []
    for (const aId of attachmentIds) {
      const att = await this.attachments.findOne(String(aId))
      if (!att) throw new BadRequestException(`attachment ${aId} not found`)
      if (!att.confirmed) throw new BadRequestException(`attachment ${aId} not uploaded/confirmed`)
      if (String(att.ownerId) !== String(data.authorId))
        throw new BadRequestException(`attachment ${aId} not owned by author`)
    }

    // Verify user signature: canonical payload is title|content|url|attachmentIds(sorted)
    const attachmentsSorted = (attachmentIds || []).slice().sort().join(',')
    const canonical = `${String(data.title)}|${data.content ?? ''}|${data.url ?? ''}|${attachmentsSorted}`
    const pub = await getAuthPublicKeyById((this as any).model.db, String(data.authorId))
    if (!pub) throw new BadRequestException('author public key not found')
    const ok = verifySignature(pub, canonical, data.userSignature)
    if (!ok) throw new BadRequestException('user signature verification failed')

    // Create the post
    const doc = await this.model.create({ ...data, statusFlags: BigInt(POST_FLAGS.ACTIVE) })

    // Create server acknowledgement record - use HMAC with JWT secret as makeshift server signature
    try {
      const docId = (doc as any)._id
      const payload = `${String(docId)}|created|${doc.contentHash}`
      const serverSig = signServerMessage(payload)
      try {
        const coll = (this as any).model.db.collection('serveracknowledgements')
        await coll.insertOne({
          contentType: 'post',
          contentId: doc._id,
          authorId: new Types.ObjectId(data.authorId),
          action: 'created',
          contentHash: doc.contentHash,
          userSignature: doc.userSignature,
          serverSignature: serverSig,
          metadata: { serverKeyId },
          createdAt: new Date()
        })
      } catch (e) {
        // ignore ack failures
      }
    } catch (e) {
      // ignore
    }

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

  async removeByAuthor(id: string, authorId: string, deletionSignature?: string) {
    const doc = await this.findById(id)
    if (String(doc.authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    // if author provided a deletion signature, verify it against stored public key
    if (deletionSignature) {
      const payload = `DELETE|${String(doc._id)}|user_delete`
      const pub = await getAuthPublicKeyById((this as any).model.db, String(authorId))
      if (!pub) throw new BadRequestException('author public key not found')
      const ok = verifySignature(pub, payload, deletionSignature)
      if (!ok) throw new BadRequestException('Invalid deletion signature')
    }
    doc.statusFlags = BigInt(Number(doc.statusFlags) & ~POST_FLAGS.ACTIVE) | BigInt(POST_FLAGS.REMOVED)
    await doc.save()
    // create server acknowledgement
    try {
      const docId = (doc as any)._id
      const payload = `${String(docId)}|deleted|${doc.contentHash}`
      const serverSig = signServerMessage(payload)
      const coll = (this as any).model.db.collection('serveracknowledgements')
      await coll.insertOne({
        contentType: 'post',
        contentId: docId,
        authorId: doc.authorId,
        action: 'deleted',
        contentHash: doc.contentHash,
        userSignature: '',
        serverSignature: serverSig,
        metadata: { serverKeyId },
        createdAt: new Date()
      })
    } catch (e) {}
    return doc
  }

  /** Return stored verification info for a post (contentHash, userSignature, server acknowledgements) */
  async getVerification(id: string) {
    const doc = await this.findById(id)
    const acks = await (this as any).model.db
      .collection('serveracknowledgements')
      .find({ contentType: 'post', contentId: doc._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray()
    return { contentHash: doc.contentHash, userSignature: doc.userSignature, serverAcknowledgements: acks }
  }

  /** Return audit trail (versions + acknowledgements) */
  async getAuditTrail(id: string) {
    const doc = await this.findById(id)
    // post versions (if versioning implemented) - fall back to server acknowledgements and mod logs
    const acks = await (this as any).model.db
      .collection('serveracknowledgements')
      .find({ contentType: 'post', contentId: doc._id })
      .sort({ createdAt: -1 })
      .toArray()
    const logs = await (this as any).model.db
      .collection('modlogs')
      .find({ targetType: 'post', targetId: id })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray()
    return { post: doc, serverAcknowledgements: acks, modLogs: logs }
  }

  /** List posts with optional filter/pagination. Populates subreddit name for convenience. */
  async findAll(filter: any = {}, limit = 50, skip = 0) {
    const docs = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .populate({ path: 'subredditId', select: 'name' })
      .lean()
      .exec()

    // attach convenient subredditName and subreddit object to match frontend expectations
    return docs.map((d: any) => {
      const subreddit = d.subredditId || null
      return { ...d, subredditName: subreddit ? subreddit.name : undefined, subreddit }
    })
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
    // delta 0 could be implemented as pulling previous vote - omitted here
    const doc = await this.model.findByIdAndUpdate(id, { $inc: inc }, { new: true })
    if (!doc) throw new NotFoundException('Post not found')
    return doc
  }

  /** Apply vote change from prevValue to newValue (each in -1|0|1) */
  async applyVoteChange(id: string, prevValue: -1 | 0 | 1, newValue: -1 | 0 | 1) {
    const inc: any = {}
    // handle removing previous vote
    if (prevValue === 1) {
      inc.upvoteCount = -1
      inc.score = -1
    } else if (prevValue === -1) {
      inc.downvoteCount = -1
      inc.score = 1
    }
    // handle adding new vote
    if (newValue === 1) {
      inc.upvoteCount = (inc.upvoteCount || 0) + 1
      inc.score = (inc.score || 0) + 1
    } else if (newValue === -1) {
      inc.downvoteCount = (inc.downvoteCount || 0) + 1
      inc.score = (inc.score || 0) - 1
    }

    const doc = await this.model.findByIdAndUpdate(id, { $inc: inc }, { new: true })
    if (!doc) throw new NotFoundException('Post not found')
    return doc
  }

  async incCommentCount(id: string, delta = 1) {
    const doc = await this.model.findByIdAndUpdate(
      id,
      { $inc: { commentCount: delta }, $set: { lastCommentAt: new Date() } },
      { new: true }
    )
    if (!doc) throw new NotFoundException('Post not found')
    return doc
  }

  // Moderation actions
  async modApprove(postId: string, subredditId: string, moderatorId: string) {
    const doc = await this.findById(postId)
    doc.statusFlags =
      BigInt(Number(doc.statusFlags) | POST_FLAGS.APPROVED) & ~BigInt(POST_FLAGS.FLAGGED | POST_FLAGS.REMOVED)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.approve',
      targetType: 'post',
      targetId: postId
    })
    return doc
  }

  async modRemove(
    postId: string,
    subredditId: string,
    moderatorId: string,
    reason?: string,
    moderatorSignature?: string
  ) {
    const doc = await this.findById(postId)
    // require moderator signature to be provided
    const maybeSig = moderatorSignature
    if (!maybeSig) throw new BadRequestException('Missing moderator signature')
    const payload = `remove_post|${String(subredditId)}|${String(postId)}|${reason || ''}`
    const pub = await getAuthPublicKeyById((this as any).model.db, String(moderatorId))
    if (!pub) throw new BadRequestException('Moderator public key not found')
    const ok = verifySignature(pub, payload, maybeSig)
    if (!ok) throw new BadRequestException('Invalid moderator signature')
    doc.statusFlags = BigInt(Number(doc.statusFlags) | POST_FLAGS.REMOVED) & ~BigInt(POST_FLAGS.APPROVED)
    doc.removalReason = reason
    doc.removedBy = this.toId(moderatorId)
    await doc.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.remove',
      targetType: 'post',
      targetId: postId,
      reason,
      moderatorSignature: maybeSig
    } as any)
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
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.unlock',
      targetType: 'post',
      targetId: postId
    })
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
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.unpin',
      targetType: 'post',
      targetId: postId
    })
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
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.unflag',
      targetType: 'post',
      targetId: postId
    })
    return doc
  }
}
