import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Post } from './schemas/post.schema'
import { ModLogService } from 'src/moderation/mod-log.service'
import { AttachmentsService } from 'src/attachments/attachments.service'
import { SubredditsService } from 'src/subreddits/subreddits.service'
import { verifySignature, getAuthPublicKeyById } from 'src/common/signature.util'
import { createHash } from 'crypto'
import { signServerMessage, serverKeyId } from 'src/common/server-sign.util'
import { AuthService } from '../auth/auth.service'
import { ServerAcknowledgementsService } from 'src/moderation/server-acknowledgements.service'
import { AuditReceiptsService } from 'src/moderation/audit-receipts.service'
import { RedisService } from 'src/redis/redis.service'

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
    private readonly acks: ServerAcknowledgementsService,
    private readonly receipts: AuditReceiptsService,
    private readonly redis: RedisService
  ) {}

  private readonly cacheTtlSeconds = Number(process.env.CACHE_TTL_SECONDS || 60)

  private async invalidatePostCache(post?: any) {
    await this.redis.delPattern('jb:posts:list:*')
    if (post?._id) {
      await this.redis.delKeys(`jb:posts:one:${String(post._id)}`)
      await this.redis.delPattern(`jb:comments:post:${String(post._id)}:*`)
    }
    if (post?.subredditId) {
      const subredditId = typeof post.subredditId === 'object' && post.subredditId._id ? post.subredditId._id : post.subredditId
      await this.redis.delPattern(`jb:posts:list:*${String(subredditId)}*`)
    }
  }

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

  private assertContentHash(canonical: string, provided?: string) {
    const digest = createHash('sha256').update(canonical).digest()
    const hex = digest.toString('hex')
    const base64 = digest.toString('base64')
    if (!provided || (provided !== hex && provided !== base64)) {
      throw new BadRequestException('contentHash does not match canonical payload')
    }
  }

  private assertPostSubreddit(doc: Post, subredditId: string) {
    if (String((doc as any).subredditId) !== String(subredditId)) {
      throw new ForbiddenException('Post does not belong to the supplied subreddit')
    }
  }

  private async assertModeratorSignature(
    action: string,
    subredditId: string,
    postId: string,
    moderatorId: string,
    moderatorSignature?: string,
    reason = ''
  ) {
    if (!moderatorSignature) throw new BadRequestException('Missing moderator signature')
    const pub = await getAuthPublicKeyById((this as any).model.db, String(moderatorId))
    if (!pub) throw new BadRequestException('Moderator public key not found')
    const payload = `${action}|${String(subredditId)}|${String(postId)}|${reason || ''}`
    if (!verifySignature(pub, payload, moderatorSignature)) throw new BadRequestException('Invalid moderator signature')
  }

  private buildCreateCanonical(data: Partial<Post>) {
    return JSON.stringify({
      title: data.title,
      content: data.content || '',
      type: data.type,
      subredditId: String(data.subredditId),
      authorId: String(data.authorId),
      url: (data as any).url || '',
      attachmentIds: Array.isArray((data as any).attachmentIds) ? (data as any).attachmentIds.map(String) : [],
      poll: (data as any).poll || null
    })
  }

  private buildLegacyCreateCanonical(data: Partial<Post>) {
    return JSON.stringify({
      title: data.title,
      content: data.content || '',
      type: data.type,
      subredditId: String(data.subredditId),
      authorId: String(data.authorId)
    })
  }

  private async assertCanWriteInSubreddit(userId: string, subredditId: string, action: 'post' | 'comment') {
    const member = await (this as any).model.db.collection('subredditmembers').findOne({
      subredditId: new Types.ObjectId(String(subredditId)),
      userId: new Types.ObjectId(String(userId))
    })
    const flags = BigInt(member?.statusFlags ?? 0)
    if ((flags & BigInt(4)) !== BigInt(0)) throw new ForbiddenException(`Banned users cannot ${action}`)
    if ((flags & BigInt(2)) !== BigInt(0)) throw new ForbiddenException(`Muted users cannot ${action}`)
  }

  private async attachAuthorPublicKeys<T extends any>(docs: T[]): Promise<T[]> {
    const ids = Array.from(
      new Set(
        docs
          .map((doc: any) => (typeof doc.authorId === 'object' && doc.authorId?._id ? String(doc.authorId._id) : String(doc.authorId || '')))
          .filter(Boolean)
      )
    )
    if (ids.length === 0) return docs
    const auths = await (this as any).model.db
      .collection('auths')
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .project({ publicKey: 1 })
      .toArray()
    const keyById = new Map(auths.map((auth: any) => [String(auth._id), Buffer.from(auth.publicKey?.buffer || auth.publicKey).toString('base64')]))
    return docs.map((doc: any) => {
      const authorId = typeof doc.authorId === 'object' && doc.authorId?._id ? String(doc.authorId._id) : String(doc.authorId || '')
      return { ...doc, authorPublicKey: keyById.get(authorId) }
    })
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
      await this.assertCanWriteInSubreddit(String(data.authorId), String(data.subredditId), 'post')
    } catch (e) {
      // bubble up
      if (e instanceof BadRequestException || e instanceof ForbiddenException) throw e
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
    const canonical = this.buildCreateCanonical(data)
    const legacyCanonical = this.buildLegacyCreateCanonical(data)
    try {
      this.assertContentHash(canonical, String(data.contentHash))
    } catch (error) {
      this.assertContentHash(legacyCanonical, String(data.contentHash))
    }
    const pub = await getAuthPublicKeyById((this as any).model.db, String(data.authorId))
    if (!pub) throw new BadRequestException('author public key not found')
    const ok = verifySignature(pub, canonical, String(data.userSignature)) || verifySignature(pub, legacyCanonical, String(data.userSignature))
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

    const result = this.convertBigIntToString(doc)
    const receipt = await this.receipts.create({
      action: 'post.created',
      subjectType: 'post',
      subjectId: (doc as any)._id,
      actorPublicKey: Buffer.from(pub).toString('base64'),
      actorSignature: String(data.userSignature),
      canonicalPayload: canonical
    })
    await this.invalidatePostCache(result)
    return { data: result, receipt }
  }

  async findById(id: string) {
    const key = `jb:posts:one:${id}`
    const doc = await this.redis.rememberJson<any>(key, this.cacheTtlSeconds, async () => {
      const found = await this.model
        .findById(id)
        .populate('authorId', 'username')
        .populate({ path: 'subredditId', select: 'name' })
        .lean()
        .exec()
      if (!found) return null
      const [withKey] = await this.attachAuthorPublicKeys([this.convertBigIntToString(found)])
      return withKey
    })
    if (!doc) throw new NotFoundException('Post not found')
    return doc
  }

  async permissionsFor(id: string, user: any) {
    const post = await this.model.findById(id).lean().exec()
    if (!post) throw new NotFoundException('Post not found')
    const actorId = String(user?.id || '')
    const abac = BigInt(user?.abac ?? 0)
    const isGlobalModerator = (abac & (BigInt(1) << BigInt(4))) !== BigInt(0)
    const isGlobalAdmin = (abac & (BigInt(1) << BigInt(5))) !== BigInt(0)
    const membership = await (this as any).model.db.collection('subredditmembers').findOne({
      subredditId: new Types.ObjectId(String((post as any).subredditId)),
      userId: new Types.ObjectId(actorId)
    })
    const flags = BigInt(membership?.statusFlags ?? 0)
    const isBanned = (flags & BigInt(4)) !== BigInt(0)
    const isMuted = (flags & BigInt(2)) !== BigInt(0)
    const isModerator = (flags & BigInt(8)) !== BigInt(0)
    const isOwner = String((post as any).authorId) === actorId
    const canModerate = isGlobalAdmin || isGlobalModerator || isModerator
    return {
      postId: id,
      subredditId: String((post as any).subredditId),
      isOwner,
      isModerator: canModerate,
      isBanned,
      isMuted,
      canEdit: isOwner && !isBanned,
      canDelete: (isOwner && !isBanned) || canModerate,
      canVote: !!actorId && !isBanned,
      canComment: !!actorId && !isBanned && !isMuted,
      canModerate,
      canRestore: canModerate
    }
  }

  async updateByAuthor(id: string, authorId: string, update: Partial<Post>) {
    const docRaw = await this.model.findById(id)
    if (!docRaw) throw new NotFoundException('Post not found')
    if (String(docRaw.authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    if (update.title !== undefined || update.content !== undefined || (update as any).url !== undefined || (update as any).attachmentIds !== undefined) {
      const canonical = JSON.stringify({
        title: update.title ?? docRaw.title,
        content: update.content ?? docRaw.content ?? '',
        type: docRaw.type,
        subredditId: String(docRaw.subredditId),
        authorId: String(docRaw.authorId),
        url: (update as any).url ?? (docRaw as any).url ?? '',
        attachmentIds: Array.isArray((update as any).attachmentIds) ? (update as any).attachmentIds.map(String) : ((docRaw as any).attachmentIds || []).map(String),
        flair: (update as any).flair ?? (docRaw as any).flair ?? ''
      })
      this.assertContentHash(canonical, String((update as any).contentHash || ''))
      const pub = await getAuthPublicKeyById((this as any).model.db, String(authorId))
      if (!pub) throw new BadRequestException('author public key not found')
      if (!verifySignature(pub, canonical, String((update as any).userSignature || ''))) throw new BadRequestException('Invalid edit signature')
      ;(docRaw as any).contentHash = (update as any).contentHash
      ;(docRaw as any).userSignature = (update as any).userSignature
    }
    const { contentHash: _contentHash, userSignature: _userSignature, authorId: _authorId, ...safeUpdate } = update as any
    Object.assign(docRaw, safeUpdate, { editedAt: new Date() })
    await docRaw.save()
    const result = this.convertBigIntToString(docRaw)
    await this.invalidatePostCache(result)
    return result
  }

  async removeByAuthor(id: string, authorId: string, deletionSignature?: string) {
    const docRaw = await this.model.findById(id)
    if (!docRaw) throw new NotFoundException('Post not found')
    if (String(docRaw.authorId) !== String(authorId)) throw new ForbiddenException('Not the author')
    if (!deletionSignature) throw new BadRequestException('Missing deletion signature')
    const payload = `DELETE|${String(docRaw._id)}|user_delete`
    const pub = await getAuthPublicKeyById((this as any).model.db, String(authorId))
    if (!pub) throw new BadRequestException('author public key not found')
    const ok = verifySignature(pub, payload, deletionSignature)
    if (!ok) throw new BadRequestException('Invalid deletion signature')
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
    const result = this.convertBigIntToString(docRaw)
    await this.invalidatePostCache(result)
    return result
  }

  /** Return stored verification info for a post (contentHash, userSignature, server acknowledgements) */
  async getVerification(id: string) {
    const doc = await this.findById(id)
    const acks = await this.acks.findByContent('post', doc._id)
    const receipts = await this.receipts.findBySubject('post', String(doc._id))
    return {
      proofVersion: 1,
      subjectType: 'post',
      subjectId: String(doc._id),
      contentHash: doc.contentHash,
      userSignature: doc.userSignature,
      serverAcknowledgements: acks,
      receipts,
      verificationState: receipts.length > 0 ? 'verifiable' : 'legacy_unverifiable'
    }
  }

  async verifyProof(proof: any) {
    if (!proof || proof.subjectType !== 'post' || !proof.contentHash || !proof.userSignature) {
      return { ok: false, reason: 'Invalid proof envelope' }
    }
    const doc = await this.model.findOne({ contentHash: String(proof.contentHash) }).lean().exec()
    if (!doc) return { ok: false, reason: 'No local post found for contentHash', contentHash: proof.contentHash }
    const acks = await this.acks.findByContent('post', (doc as any)._id)
    const matchingAck = acks.find((ack: any) => ack.userSignature === proof.userSignature && ack.contentHash === proof.contentHash)
    return {
      ok: !!matchingAck,
      reason: matchingAck ? 'Proof matches a local post acknowledgement' : 'Post exists, but acknowledgement/signature did not match',
      subjectType: 'post',
      subjectId: String((doc as any)._id),
      contentHash: proof.contentHash,
      localAcknowledgements: acks.length
    }
  }

  /** Return audit trail (versions + acknowledgements) */
  async getAuditTrail(id: string) {
    const doc = await this.findById(id)
    // post versions (if versioning implemented) - fall back to server acknowledgements and mod logs
    const acks = await this.acks.findByContent('post', doc._id)
    const receipts = await this.receipts.findBySubject('post', String(doc._id))
    const logs = await this.modLog.listForSubreddit(String(doc.subredditId), 100)
    return { post: doc, serverAcknowledgements: acks, receipts, verificationState: receipts.length > 0 ? 'verifiable' : 'legacy_unverifiable', modLogs: logs }
  }

  /** List posts with optional filter/pagination. Populates subreddit name for convenience. */
  async findAll(filter: any = {}, limit = 50, skip = 0, sort: 'hot' | 'new' | 'top' | 'controversial' = 'hot') {
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
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100)
    const safeSkip = Math.max(Number(skip) || 0, 0)
    const sortSpec =
      sort === 'new'
        ? { createdAt: -1 }
        : sort === 'top'
          ? { score: -1, createdAt: -1 }
          : sort === 'controversial'
            ? { upvoteCount: -1, downvoteCount: -1, commentCount: -1, createdAt: -1 }
            : { score: -1, commentCount: -1, createdAt: -1 }
    const key = `jb:posts:list:${this.redis.stableStringify(finalFilter)}:${safeLimit}:${safeSkip}:${sort}`
    return this.redis.rememberJson(key, this.cacheTtlSeconds, async () => {
      const docs = await this.model
        .find(finalFilter)
        .sort(sortSpec as any)
        .limit(safeLimit)
        .skip(safeSkip)
        .populate({ path: 'subredditId', select: 'name' })
        .lean()
        .exec()

      // attach convenient subredditName and subreddit object to match frontend expectations
      const mapped = docs.map((d: any) => {
        const subreddit = d.subredditId || null
        const result = { ...d, subredditName: subreddit ? subreddit.name : undefined, subreddit }
        if (result.statusFlags !== undefined && result.statusFlags !== null) {
          result.statusFlags = String(result.statusFlags)
        }
        return result
      })
      return this.attachAuthorPublicKeys(mapped)
    })
  }

  async suggest(q = '', limit = 8) {
    const safeLimit = Math.min(Math.max(Number(limit) || 8, 1), 12)
    const term = q.trim()
    const filter = term
      ? { $or: [{ title: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { content: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }] }
      : {}
    const key = `jb:posts:suggest:${term.toLowerCase()}:${safeLimit}`
    return this.redis.rememberJson(key, this.cacheTtlSeconds, async () =>
      this.model
        .find(filter)
        .sort({ score: -1, createdAt: -1 })
        .limit(safeLimit)
        .select('title score commentCount subredditId createdAt')
        .populate({ path: 'subredditId', select: 'name' })
        .lean()
        .exec() as any
    )
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
    const result = this.convertBigIntToString(doc)
    await this.invalidatePostCache(result)
    return result
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
    const result = this.convertBigIntToString(doc)
    await this.invalidatePostCache(result)
    return result
  }

  async incCommentCount(id: string, delta = 1) {
    const doc = await this.model.findByIdAndUpdate(
      id,
      { $inc: { commentCount: delta }, $set: { lastCommentAt: new Date() } },
      { new: true }
    )
    if (!doc) throw new NotFoundException('Post not found')
    const result = this.convertBigIntToString(doc)
    await this.invalidatePostCache(result)
    return result
  }

  // Moderation actions
  async modApprove(postId: string, subredditId: string, moderatorId: string, moderatorSignature?: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    this.assertPostSubreddit(docRaw, subredditId)
    await this.assertModeratorSignature('post.approve', subredditId, postId, moderatorId, moderatorSignature)
    docRaw.statusFlags =
      BigInt(Number(docRaw.statusFlags) | POST_FLAGS.APPROVED) & ~BigInt(POST_FLAGS.FLAGGED | POST_FLAGS.REMOVED)
    await docRaw.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.approve',
      targetType: 'post',
      targetId: postId,
      moderatorSignature
    })
    const result = this.convertBigIntToString(docRaw)
    await this.invalidatePostCache(result)
    return result
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
    this.assertPostSubreddit(docRaw, subredditId)
    const maybeSig = moderatorSignature
    await this.assertModeratorSignature('post.remove', subredditId, postId, moderatorId, maybeSig, reason)
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
    const result = this.convertBigIntToString(docRaw)
    await this.invalidatePostCache(result)
    return result
  }

  async modRestore(postId: string, subredditId: string, moderatorId: string, reason?: string, moderatorSignature?: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    this.assertPostSubreddit(docRaw, subredditId)
    await this.assertModeratorSignature('post.restore', subredditId, postId, moderatorId, moderatorSignature, reason)
    docRaw.statusFlags = (BigInt(Number(docRaw.statusFlags)) & ~BigInt(POST_FLAGS.REMOVED)) | BigInt(POST_FLAGS.ACTIVE)
    docRaw.removalReason = undefined
    docRaw.removedBy = undefined
    await docRaw.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.restore',
      targetType: 'post',
      targetId: postId,
      reason,
      moderatorSignature
    } as any)
    const result = this.convertBigIntToString(docRaw)
    await this.invalidatePostCache(result)
    return result
  }

  async modLock(postId: string, subredditId: string, moderatorId: string, moderatorSignature?: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    this.assertPostSubreddit(docRaw, subredditId)
    await this.assertModeratorSignature('post.lock', subredditId, postId, moderatorId, moderatorSignature)
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) | POST_FLAGS.LOCKED)
    await docRaw.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.lock', targetType: 'post', targetId: postId, moderatorSignature })
    const result = this.convertBigIntToString(docRaw)
    await this.invalidatePostCache(result)
    return result
  }

  async modUnlock(postId: string, subredditId: string, moderatorId: string, moderatorSignature?: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    this.assertPostSubreddit(docRaw, subredditId)
    await this.assertModeratorSignature('post.unlock', subredditId, postId, moderatorId, moderatorSignature)
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) & ~POST_FLAGS.LOCKED)
    await docRaw.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.unlock',
      targetType: 'post',
      targetId: postId,
      moderatorSignature
    })
    const result = this.convertBigIntToString(docRaw)
    await this.invalidatePostCache(result)
    return result
  }

  async modPin(postId: string, subredditId: string, moderatorId: string, moderatorSignature?: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    this.assertPostSubreddit(docRaw, subredditId)
    await this.assertModeratorSignature('post.pin', subredditId, postId, moderatorId, moderatorSignature)
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) | POST_FLAGS.PINNED)
    await docRaw.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.pin', targetType: 'post', targetId: postId, moderatorSignature })
    const result = this.convertBigIntToString(docRaw)
    await this.invalidatePostCache(result)
    return result
  }

  async modUnpin(postId: string, subredditId: string, moderatorId: string, moderatorSignature?: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    this.assertPostSubreddit(docRaw, subredditId)
    await this.assertModeratorSignature('post.unpin', subredditId, postId, moderatorId, moderatorSignature)
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) & ~POST_FLAGS.PINNED)
    await docRaw.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.unpin',
      targetType: 'post',
      targetId: postId,
      moderatorSignature
    })
    const result = this.convertBigIntToString(docRaw)
    await this.invalidatePostCache(result)
    return result
  }

  async modFlag(postId: string, subredditId: string, moderatorId: string, moderatorSignature?: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    this.assertPostSubreddit(docRaw, subredditId)
    await this.assertModeratorSignature('post.flag', subredditId, postId, moderatorId, moderatorSignature)
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) | POST_FLAGS.FLAGGED)
    await docRaw.save()
    await this.modLog.createLog({ subredditId, moderatorId, action: 'post.flag', targetType: 'post', targetId: postId, moderatorSignature })
    const result = this.convertBigIntToString(docRaw)
    await this.invalidatePostCache(result)
    return result
  }

  async modUnflag(postId: string, subredditId: string, moderatorId: string, moderatorSignature?: string) {
    const docRaw = await this.model.findById(postId)
    if (!docRaw) throw new NotFoundException('Post not found')
    this.assertPostSubreddit(docRaw, subredditId)
    await this.assertModeratorSignature('post.unflag', subredditId, postId, moderatorId, moderatorSignature)
    docRaw.statusFlags = BigInt(Number(docRaw.statusFlags) & ~POST_FLAGS.FLAGGED)
    await docRaw.save()
    await this.modLog.createLog({
      subredditId,
      moderatorId,
      action: 'post.unflag',
      targetType: 'post',
      targetId: postId,
      moderatorSignature
    })
    const result = this.convertBigIntToString(docRaw)
    await this.invalidatePostCache(result)
    return result
  }
}
