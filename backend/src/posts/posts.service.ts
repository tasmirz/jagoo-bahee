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
import { AuthService } from '../auth/auth.service'
import { ServerAcknowledgementsService } from 'src/moderation/server-acknowledgements.service'

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
    private readonly subreddits: SubredditsService,
    private readonly authService: AuthService,
    private readonly acks: ServerAcknowledgementsService
  ) {}

  private toId(id: string | Types.ObjectId) {
    return typeof id === 'string' ? new Types.ObjectId(id) : id
  }

  private convertBigIntToString(doc: any): any {
    if (!doc) return doc
    const obj = doc.toObject ? doc.toObject() : doc
    if (obj.statusFlags !== undefined && obj.statusFlags !== null) {
      obj.statusFlags = String(obj.statusFlags)
    }
    return obj
  }

  async create(data: Partial<Post>) {
    // Basic validation
    if (!data.title || typeof data.title !== 'string') throw new BadRequestException('title required')
    if (!data.subredditId) throw new BadRequestException('subredditId required')
    if (!data.authorId) throw new BadRequestException('authorId required')
    if (!data.userSignature) throw new BadRequestException('userSignature required')
    if (!data.contentHash) throw new BadRequestException('contentHash required')

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

    // Verify user signature: canonical JSON ordering
    const payloadObj = {
      title: data.title,
      content: data.content || '',
      type: data.type,
      subredditId: String(data.subredditId),
      authorId: String(data.authorId)
    }
    const canonical = JSON.stringify(payloadObj)
    const pub = await getAuthPublicKeyById((this as any).model.db, String(data.authorId))
    if (!pub) throw new BadRequestException('author public key not found')
    const ok = verifySignature(pub, canonical, String(data.userSignature))
    if (!ok) throw new BadRequestException('user signature verification failed')

    // Create the post
    const doc = await this.model.create({ ...data, statusFlags: BigInt(POST_FLAGS.ACTIVE) })
    var serverSig = ''
    // Create server acknowledgement record - use HMAC with JWT secret as makeshift server signature
    try {
      const docId = (doc as any)._id
      const payload = `${String(docId)}|created|${doc.contentHash}`
      serverSig = signServerMessage(payload)
      try {
        await this.acks.create({
          contentType: 'post',
          contentId: doc._id as any,
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

    return this.convertBigIntToString(doc)
  }

  async findById(id: string) {
    const doc = await this.model.findById(id).populate('authorId', 'username').populate({ path: 'subredditId', select: 'name' })
    if (!doc) throw new NotFoundException('Post not found')
    return this.convertBigIntToString(doc)
  }

  async updateByAuthor(id: string, authorId: string, update: Partial<Post>) {
    const docRaw = await this.model.findById(id)
    if (!docRaw) throw new NotFoundException('Post not found')
    if (String(docRaw.authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    Object.assign(docRaw, update, { editedAt: new Date() })
    await docRaw.save()
    return this.convertBigIntToString(docRaw)
  }

  async removeByAuthor(id: string, authorId: string, deletionSignature?: string) {
    const docRaw = await this.model.findById(id)
    if (!docRaw) throw new NotFoundException('Post not found')
    if (String(docRaw.authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    // if author provided a deletion signature, verify it against stored public key
    if (deletionSignature) {
      const payload = `DELETE|${String(docRaw._id)}|user_delete`
      const pub = await getAuthPublicKeyById((this as any).model.db, String(authorId))
      if (!pub) throw new BadRequestException('author public key not found')
      const ok = verifySignature(pub, payload, deletionSignature)
      if (!ok) throw new BadRequestException('Invalid deletion signature')
    }
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) & ~POST_FLAGS.ACTIVE) | BigInt(POST_FLAGS.REMOVED)
    await docRaw.save()
    // create server acknowledgement
    try {
      const docId = (docRaw as any)._id
      const payload = `${String(docId)}|deleted|${docRaw.contentHash}`
      const serverSig = signServerMessage(payload)
      await this.acks.create({
        contentType: 'post',
        contentId: docId as any,
        authorId: docRaw.authorId as any,
        action: 'deleted',
        contentHash: docRaw.contentHash,
        userSignature: '',
        serverSignature: serverSig,
        metadata: { serverKeyId },
        createdAt: new Date()
      })
    } catch (e) {}
    return this.convertBigIntToString(docRaw)
  }

  /** Return stored verification info for a post (contentHash, userSignature, server acknowledgements) */
  async getVerification(id: string) {
    const doc = await this.findById(id)
    const acks = await this.acks.findByContent('post', doc._id)
    return { contentHash: doc.contentHash, userSignature: doc.userSignature, serverAcknowledgements: acks }
  }

  /** Return audit trail (versions + acknowledgements) */
  async getAuditTrail(id: string) {
    const doc = await this.findById(id)
    // post versions (if versioning implemented) - fall back to server acknowledgements and mod logs
    const acks = await this.acks.findByContent('post', doc._id)
    const logs = await this.modLog.listForSubreddit(String(doc.subredditId), 100)
    return { post: doc, serverAcknowledgements: acks, modLogs: logs }
  }

  /** List posts with optional filter/pagination. Populates subreddit name for convenience. */
  async findAll(filter: any = {}, limit = 50, skip = 0) {
    console.log('findAll filter before resolution:', filter)
    const finalFilter = { ...filter }
    if (
      finalFilter.subredditId &&
      typeof finalFilter.subredditId === 'string' &&
      !Types.ObjectId.isValid(finalFilter.subredditId)
    ) {
      const sr = await this.subreddits.findOne(finalFilter.subredditId)
      if (sr) {
        finalFilter.subredditId = sr._id
      }
    }
    console.log('findAll filter after resolution:', finalFilter)

    const docs = await this.model
      .find(finalFilter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .populate({ path: 'subredditId', select: 'name' })
      .lean()
      .exec()

    console.log('findAll results:', docs)

    // attach convenient subredditName and subreddit object to match frontend expectations
    return docs.map((d: any) => {
      const subreddit = d.subredditId || null
      const result = { ...d, subredditName: subreddit ? subreddit.name : undefined, subreddit }
      // Convert BigInt to string
      if (result.statusFlags !== undefined && result.statusFlags !== null) {
        result.statusFlags = String(result.statusFlags)
      }
      return result
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
    return this.convertBigIntToString(doc)
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
    return this.convertBigIntToString(doc)
  }

  async incCommentCount(id: string, delta = 1) {
    const doc = await this.model.findByIdAndUpdate(
      id,
      { $inc: { commentCount: delta }, $set: { lastCommentAt: new Date() } },
      { new: true }
    )
    if (!doc) throw new NotFoundException('Post not found')
    return this.convertBigIntToString(doc)
  }

  // Moderation actions
  async modApprove(postId: string, subredditId: string, moderatorId: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    docRaw.statusFlags =
      BigInt(Number(docRaw.statusFlags) | POST_FLAGS.APPROVED) & ~BigInt(POST_FLAGS.FLAGGED | POST_FLAGS.REMOVED)
    await docRaw.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.approve',
      targetType: 'post',
      targetId: postId
    })
    return this.convertBigIntToString(docRaw)
  }

  async modRemove(
    postId: string,
    subredditId: string,
    moderatorId: string,
    reason?: string,
    moderatorSignature?: string
  ) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    // require moderator signature to be provided
    const maybeSig = moderatorSignature
    if (!maybeSig) throw new BadRequestException('Missing moderator signature')
    const payload = `remove_post|${String(subredditId)}|${String(postId)}|${reason || ''}`
    const pub = await getAuthPublicKeyById((this as any).model.db, String(moderatorId))
    if (!pub) throw new BadRequestException('Moderator public key not found')
    const ok = verifySignature(pub, payload, maybeSig)
    if (!ok) throw new BadRequestException('Invalid moderator signature')
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) | POST_FLAGS.REMOVED) & ~BigInt(POST_FLAGS.APPROVED)
    docRaw.removalReason = reason
    docRaw.removedBy = this.toId(moderatorId)
    await docRaw.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.remove',
      targetType: 'post',
      targetId: postId,
      reason,
      moderatorSignature: maybeSig
    } as any)
    return this.convertBigIntToString(docRaw)
  }

  async modLock(postId: string, subredditId: string, moderatorId: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) | POST_FLAGS.LOCKED)
    await docRaw.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.lock', targetType: 'post', targetId: postId })
    return this.convertBigIntToString(docRaw)
  }

  async modUnlock(postId: string, subredditId: string, moderatorId: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) & ~POST_FLAGS.LOCKED)
    await docRaw.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.unlock',
      targetType: 'post',
      targetId: postId
    })
    return this.convertBigIntToString(docRaw)
  }

  async modPin(postId: string, subredditId: string, moderatorId: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) | POST_FLAGS.PINNED)
    await docRaw.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.pin', targetType: 'post', targetId: postId })
    return this.convertBigIntToString(docRaw)
  }

  async modUnpin(postId: string, subredditId: string, moderatorId: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) & ~POST_FLAGS.PINNED)
    await docRaw.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.unpin',
      targetType: 'post',
      targetId: postId
    })
    return this.convertBigIntToString(docRaw)
  }

  async modFlag(postId: string, subredditId: string, moderatorId: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) | POST_FLAGS.FLAGGED)
    await docRaw.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.flag', targetType: 'post', targetId: postId })
    return this.convertBigIntToString(docRaw)
  }

  async modUnflag(postId: string, subredditId: string, moderatorId: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) & ~POST_FLAGS.FLAGGED)
    await docRaw.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.unflag',
      targetType: 'post',
      targetId: postId
    })
    return this.convertBigIntToString(docRaw)
  }
}
