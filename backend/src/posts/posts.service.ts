import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Post } from './schemas/post.schema'
import { ModLogService } from 'src/moderation/mod-log.service'
import { AttachmentsService } from 'src/attachments/attachments.service'
import { SubredditsService } from 'src/subreddits/subreddits.service'
import { verifySignature, getAuthPublicKeyById } from 'src/common/signature.util'
import {
  signServerMessage,
  serverKeyId,
  createProofHash,
  signProofHash,
  getServerPublicKeyBase64,
  verifyProofHash,
  verifySignedProof
} from 'src/common/server-sign.util'
import { AuthService } from 'src/auth/auth.service'

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
    private readonly authService: AuthService
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
    if (!data.title || typeof data.title !== 'string') throw new BadRequestException('title required')
    if (!data.subredditId) throw new BadRequestException('subredditId required')
    if (!data.authorId) throw new BadRequestException('authorId required')
    if (!data.userSignature) throw new BadRequestException('userSignature required')
    if (!data.contentHash) throw new BadRequestException('contentHash required')

    const attachmentIds = Array.isArray((data as any).attachmentIds) ? (data as any).attachmentIds : []
    for (const aId of attachmentIds) {
      const att = await this.attachments.findOne(String(aId))
      if (!att) throw new BadRequestException(`attachment ${aId} not found`)
      if (!att.confirmed) throw new BadRequestException(`attachment ${aId} not uploaded/confirmed`)
      if (String(att.ownerId) !== String((data as any).authorId))
        throw new BadRequestException(`attachment ${aId} not owned by author`)
    }

    const doc = await this.model.create({ ...(data as any), statusFlags: BigInt(POST_FLAGS.ACTIVE) })
    let serverSig = ''
    let proofHash = ''
    let proofSignature = ''

    try {
      const docId = (doc as any)._id
      const userId = String((data as any).authorId)
      const postId = String(docId)

      // Create proof hash: SHA256(userId|postId|serverPublicKey)
      proofHash = createProofHash(userId, postId)

      // Sign the proof hash so user can verify it came from server
      proofSignature = signProofHash(proofHash)

      // Traditional server signature for backward compatibility
      const payload = `${postId}|created|${(doc as any).contentHash}`
      serverSig = signServerMessage(payload)

      try {
        const coll = (this as any).model.db.collection('serveracknowledgements')
        await coll.insertOne({
          contentType: 'post',
          contentId: doc._id,
          authorId: this.toId((data as any).authorId),
          action: 'created',
          contentHash: (doc as any).contentHash,
          userSignature: (doc as any).userSignature,
          serverSignature: serverSig,
          proofHash,
          proofSignature,
          metadata: { serverKeyId, serverPublicKey: getServerPublicKeyBase64() },
          createdAt: new Date()
        })
      } catch (e) {
        // ignore ack failures
      }
    } catch (e) {}

    return {
      contentType: 'post',
      contentId: doc._id,
      authorId: this.toId((data as any).authorId),
      action: 'created',
      contentHash: (doc as any).contentHash,
      userSignature: (doc as any).userSignature,
      serverSignature: serverSig,
      proofHash,
      proofSignature,
      serverPublicKey: getServerPublicKeyBase64(),
      metadata: { serverKeyId },
      createdAt: new Date()
    }
  }

  async findById(id: string) {
    const doc = await this.model
      .findById(id)
      .populate({ path: 'subredditId', select: 'name displayName icon' })
      .populate({ path: 'authorId', select: 'username displayName avatar karma' })
      .exec()
    if (!doc) throw new NotFoundException('Post not found')
    const result = this.convertBigIntToString(doc)
    // Add populated fields as expected by frontend
    if (result.subredditId) result.subreddit = result.subredditId
    if (result.authorId) result.author = result.authorId
    return result
  }

  async findAll(filter: any = {}, limit = 50, skip = 0, searchQuery?: string, sort = 'hot', time = 'day') {
    // Filter out deleted posts (REMOVED flag is set)
    // We need to check that ACTIVE flag is set OR REMOVED flag is NOT set
    // Using bitwise: if (statusFlags & REMOVED) !== 0, then it's deleted
    // We can't easily do bitwise in MongoDB query, so we'll filter after fetching

    // Add search filter if provided
    if (searchQuery && searchQuery.trim()) {
      const searchRegex = new RegExp(searchQuery.trim(), 'i') // case-insensitive
      filter.$or = [{ title: searchRegex }, { content: searchRegex }]
    }

    // Determine sort strategy
    let sortObj: any = { createdAt: -1 }

    if (sort === 'new') {
      sortObj = { createdAt: -1 }
    } else if (sort === 'hot') {
      // Hot algorithm: combine score and recency
      // We'll sort by a computed score, but since we can't easily compute in MongoDB query,
      // we'll fetch and sort in memory
      sortObj = { createdAt: -1 } // Default to new for now, will sort in memory
    } else if (sort === 'top') {
      sortObj = { score: -1, createdAt: -1 }
    } else if (sort === 'controversial') {
      // Controversial: posts with similar upvotes and downvotes
      // We'll need to calculate this in memory as well
      sortObj = { createdAt: -1 } // Default, will sort in memory
    }

    // Add time filter for top and controversial
    if ((sort === 'top' || sort === 'controversial') && time) {
      const now = new Date()
      let startDate: Date

      switch (time) {
        case 'hour':
          startDate = new Date(now.getTime() - 60 * 60 * 1000)
          break
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          break
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case 'year':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
          break
        case 'all':
        default:
          startDate = new Date(0) // Beginning of time
          break
      }

      filter.createdAt = { $gte: startDate }
    }

    const docs = await this.model
      .find(filter)
      .sort(sortObj)
      .limit(Number(limit) * 2) // Fetch more to account for deleted posts we'll filter out
      .skip(Number(skip))
      .populate({ path: 'subredditId', select: 'name displayName icon' })
      .populate({ path: 'authorId', select: 'username displayName avatar karma' })
      .lean()
      .exec()

    // Filter out deleted posts
    let activePosts = docs.filter((doc: any) => {
      const flags = Number(doc.statusFlags || 0)
      const isRemoved = (flags & POST_FLAGS.REMOVED) !== 0
      return !isRemoved
    })

    // Apply in-memory sorting for hot and controversial
    if (sort === 'hot') {
      activePosts = activePosts.sort((a: any, b: any) => {
        const aScore = a.score || 0
        const bScore = b.score || 0
        const aTime = new Date(a.createdAt).getTime()
        const bTime = new Date(b.createdAt).getTime()
        const now = Date.now()

        // Hot score: score / age (in hours)^1.5
        const aHot = aScore / Math.pow((now - aTime) / (1000 * 60 * 60) + 2, 1.5)
        const bHot = bScore / Math.pow((now - bTime) / (1000 * 60 * 60) + 2, 1.5)

        return bHot - aHot
      })
    } else if (sort === 'controversial') {
      activePosts = activePosts.sort((a: any, b: any) => {
        const aUp = a.upvoteCount || 0
        const aDown = a.downvoteCount || 0
        const bUp = b.upvoteCount || 0
        const bDown = b.downvoteCount || 0

        // Controversial: high engagement but close to 50/50 split
        const aTotal = aUp + aDown
        const bTotal = bUp + bDown

        if (aTotal === 0 && bTotal === 0) return 0
        if (aTotal === 0) return 1
        if (bTotal === 0) return -1

        // Calculate controversy score: total votes * (1 - abs(ratio - 0.5) * 2)
        // Higher when ratio is close to 0.5, and total votes is high
        const aRatio = aUp / aTotal
        const bRatio = bUp / bTotal
        const aControversy = aTotal * (1 - Math.abs(aRatio - 0.5) * 2)
        const bControversy = bTotal * (1 - Math.abs(bRatio - 0.5) * 2)

        return bControversy - aControversy
      })
    }

    activePosts = activePosts.slice(0, Number(limit)) // Apply original limit after filtering

    return activePosts.map((d: any) => ({
      ...d,
      subreddit: d.subredditId || undefined,
      author: d.authorId || undefined,
      statusFlags: d.statusFlags !== undefined && d.statusFlags !== null ? String(d.statusFlags) : d.statusFlags
    }))
  }

  async updateByAuthor(id: string, authorId: string, update: Partial<Post>) {
    const docRaw = await this.model.findById(id)
    if (!docRaw) throw new NotFoundException('Post not found')
    if (String((docRaw as any).authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    Object.assign(docRaw, update, { editedAt: new Date() })
    await docRaw.save()
    return this.convertBigIntToString(docRaw)
  }

  async removeByAuthor(id: string, authorId: string, deletionSignature?: string) {
    const docRaw = await this.model.findById(id)
    if (!docRaw) throw new NotFoundException('Post not found')
    if (String((docRaw as any).authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    if (deletionSignature) {
      const payload = `DELETE|${String(docRaw._id)}|user_delete`
      const pub = await getAuthPublicKeyById((this as any).model.db, String(authorId))
      if (!pub) throw new BadRequestException('author public key not found')
      const ok = verifySignature(pub, payload, deletionSignature)
      if (!ok) throw new BadRequestException('Invalid deletion signature')
    }
    ;(docRaw as any).statusFlags =
      BigInt(Number((docRaw as any).statusFlags) & ~POST_FLAGS.ACTIVE) | BigInt(POST_FLAGS.REMOVED)
    await docRaw.save()
    try {
      const docId = (docRaw as any)._id
      const payload = `${String(docId)}|deleted|${(docRaw as any).contentHash}`
      const serverSig = signServerMessage(payload)
      const coll = (this as any).model.db.collection('serveracknowledgements')
      await coll.insertOne({
        contentType: 'post',
        contentId: docId,
        authorId: (docRaw as any).authorId,
        action: 'deleted',
        contentHash: (docRaw as any).contentHash,
        userSignature: '',
        serverSignature: serverSig,
        metadata: { serverKeyId },
        createdAt: new Date()
      })
    } catch (e) {}
    return this.convertBigIntToString(docRaw)
  }

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

  async getAuditTrail(id: string) {
    const doc = await this.findById(id)
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
    if (!doc) throw new NotFoundException('Post not found')
    return this.convertBigIntToString(doc)
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

  // Moderation actions follow same patterns
  async modApprove(postId: string, subredditId: string, moderatorId: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    ;(docRaw as any).statusFlags =
      BigInt(Number((docRaw as any).statusFlags) | POST_FLAGS.APPROVED) &
      ~BigInt(POST_FLAGS.FLAGGED | POST_FLAGS.REMOVED)
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
    if (!moderatorSignature) throw new BadRequestException('Missing moderator signature')
    const payload = `remove_post|${String(subredditId)}|${String(postId)}|${reason || ''}`
    const pub = await getAuthPublicKeyById((this as any).model.db, String(moderatorId))
    if (!pub) throw new BadRequestException('Moderator public key not found')
    const ok = verifySignature(pub, payload, moderatorSignature)
    if (!ok) throw new BadRequestException('Invalid moderator signature')
    ;(docRaw as any).statusFlags =
      BigInt(Number((docRaw as any).statusFlags) | POST_FLAGS.REMOVED) & ~BigInt(POST_FLAGS.APPROVED)
    ;(docRaw as any).removalReason = reason
    ;(docRaw as any).removedBy = this.toId(moderatorId)
    await docRaw.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.remove',
      targetType: 'post',
      targetId: postId,
      reason,
      moderatorSignature
    } as any)
    return this.convertBigIntToString(docRaw)
  }

  async modLock(postId: string, subredditId: string, moderatorId: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    ;(docRaw as any).statusFlags = BigInt(Number((docRaw as any).statusFlags) | POST_FLAGS.LOCKED)
    await docRaw.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.lock', targetType: 'post', targetId: postId })
    return this.convertBigIntToString(docRaw)
  }

  async modUnlock(postId: string, subredditId: string, moderatorId: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    ;(docRaw as any).statusFlags = BigInt(Number((docRaw as any).statusFlags) & ~POST_FLAGS.LOCKED)
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
    ;(docRaw as any).statusFlags = BigInt(Number((docRaw as any).statusFlags) | POST_FLAGS.PINNED)
    await docRaw.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.pin', targetType: 'post', targetId: postId })
    return this.convertBigIntToString(docRaw)
  }

  async modUnpin(postId: string, subredditId: string, moderatorId: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    ;(docRaw as any).statusFlags = BigInt(Number((docRaw as any).statusFlags) & ~POST_FLAGS.PINNED)
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
    ;(docRaw as any).statusFlags = BigInt(Number((docRaw as any).statusFlags) | POST_FLAGS.FLAGGED)
    await docRaw.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.flag', targetType: 'post', targetId: postId })
    return this.convertBigIntToString(docRaw)
  }

  async modUnflag(postId: string, subredditId: string, moderatorId: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    ;(docRaw as any).statusFlags = BigInt(Number((docRaw as any).statusFlags) & ~POST_FLAGS.FLAGGED)
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

  /**
   * Verify a proof hash and return the status of the post.
   * This allows users to prove they had a post even if deleted.
   *
   * Steps:
   * 1. Verify the proof hash matches userId + postId + serverPublicKey
   * 2. Verify the proof signature was signed by the server
   * 3. Return the current status of the post (exists, deleted, removed, etc.)
   */
  async verifyProofAndGetStatus(userId: string, postId: string, proofHash: string, proofSignature: string) {
    // Step 1: Verify proof hash matches expected format
    const isValidHash = verifyProofHash(userId, postId, proofHash)
    if (!isValidHash) {
      return {
        valid: false,
        error: 'Invalid proof hash - does not match userId + postId + serverPublicKey',
        serverPublicKey: getServerPublicKeyBase64()
      }
    }

    // Step 2: Verify the signature was created by the server
    const isValidSignature = verifySignedProof(proofHash, proofSignature)
    if (!isValidSignature) {
      return {
        valid: false,
        error: 'Invalid proof signature - not signed by server',
        proofHashValid: true,
        serverPublicKey: getServerPublicKeyBase64()
      }
    }

    // Step 3: Get post status
    try {
      const post = await this.model.findById(postId).lean().exec()

      if (!post) {
        // Check if acknowledgement exists (proves post existed)
        const ack = await (this as any).model.db
          .collection('serveracknowledgements')
          .findOne({ contentType: 'post', contentId: new Types.ObjectId(postId) })

        if (ack) {
          return {
            valid: true,
            proofVerified: true,
            postStatus: 'existed_but_deleted',
            message: 'Post existed and was acknowledged by server, but has been permanently deleted',
            acknowledgement: {
              createdAt: ack.createdAt,
              action: ack.action,
              contentHash: ack.contentHash
            },
            serverPublicKey: getServerPublicKeyBase64()
          }
        }

        return {
          valid: true,
          proofVerified: true,
          postStatus: 'not_found',
          message: 'No record of this post found',
          serverPublicKey: getServerPublicKeyBase64()
        }
      }

      // Determine post status from flags
      const flags = Number(post.statusFlags || 0)
      const isRemoved = (flags & POST_FLAGS.REMOVED) !== 0
      const isActive = (flags & POST_FLAGS.ACTIVE) !== 0
      const isLocked = (flags & POST_FLAGS.LOCKED) !== 0
      const isArchived = (flags & POST_FLAGS.ARCHIVED) !== 0

      let status = 'active'
      if (isRemoved) status = 'removed'
      else if (!isActive) status = 'inactive'
      else if (isArchived) status = 'archived'
      else if (isLocked) status = 'locked'

      return {
        valid: true,
        proofVerified: true,
        postStatus: status,
        postExists: true,
        post: {
          _id: post._id,
          title: post.title,
          createdAt: post.createdAt,
          score: post.score,
          commentCount: post.commentCount,
          isRemoved,
          isActive,
          isLocked,
          isArchived
        },
        serverPublicKey: getServerPublicKeyBase64()
      }
    } catch (error) {
      return {
        valid: false,
        error: 'Error checking post status',
        proofVerified: true,
        serverPublicKey: getServerPublicKeyBase64()
      }
    }
  }
}
