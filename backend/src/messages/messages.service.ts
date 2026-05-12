import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Message } from './schemas/message.schema'
import { CreateMessageDto } from './dto/create-message.dto'
import { UpdateMessageDto } from './dto/update-message.dto'
import { QueryMessagesDto } from './dto/query-messages.dto'
import { verifySignature, getAuthPublicKeyById } from 'src/common/signature.util'
import { createHash } from 'crypto'
import { UserBlock } from 'src/users/schemas/user-block.schema'

@Injectable()
export class MessagesService {
  constructor(
    @InjectModel(Message.name)
    private readonly messageModel: Model<Message>,
    @InjectModel(UserBlock.name)
    private readonly userBlockModel: Model<UserBlock>,
  ) {}

  private async assertCanMessage(senderId: string, recipientId: string) {
    const senderObjectId = new Types.ObjectId(senderId)
    const recipientObjectId = new Types.ObjectId(recipientId)
    const blocked = await this.userBlockModel.exists({
      $or: [
        { blockerId: recipientObjectId, blockedId: senderObjectId },
        { blockerId: senderObjectId, blockedId: recipientObjectId }
      ]
    })
    if (blocked) throw new ForbiddenException('Messaging is blocked between these users')
  }

  async send(senderId: string, dto: CreateMessageDto) {
    await this.assertCanMessage(senderId, dto.recipientId)
    const canonical = JSON.stringify({
      senderId: String(senderId),
      recipientId: String(dto.recipientId),
      subject: dto.subject || '',
      content: dto.content,
      attachmentIds: dto.attachmentIds ?? [],
      parentMessageId: dto.parentMessageId || null
    })
    const hash = createHash('sha256').update(canonical).digest('hex')
    if (dto.contentHash !== hash) throw new ForbiddenException('Invalid message content hash')

    const pub = await getAuthPublicKeyById((this as any).messageModel.db, String(senderId))
    if (!pub) throw new ForbiddenException('Sender public key not found')
    const ok = verifySignature(pub, canonical, dto.senderSignature)
    if (!ok) throw new ForbiddenException('Invalid message signature')

    const doc = await this.messageModel.create({
      senderId: new Types.ObjectId(senderId),
      recipientId: new Types.ObjectId(dto.recipientId),
      subject: dto.subject,
      content: dto.content,
      contentHash: dto.contentHash,
      attachmentIds: (dto.attachmentIds ?? []).map((id) => new Types.ObjectId(id)),
      parentMessageId: dto.parentMessageId ? new Types.ObjectId(dto.parentMessageId) : undefined,
      senderSignature: dto.senderSignature,
    })
    return doc
  }

  async reply(
    senderId: string,
    dto: { parentMessageId: string; subject?: string; content: string; contentHash?: string; senderSignature: string }
  ) {
    // basic thread existence
    const parent = await this.messageModel.findById(dto.parentMessageId).lean()
    if (!parent) throw new NotFoundException('Parent message not found')
    const isParticipant =
      parent.senderId.toString() === senderId || parent.recipientId.toString() === senderId
    if (!isParticipant) throw new ForbiddenException('Cannot reply to a conversation you are not part of')

    const recipientId = parent.senderId.toString() === senderId ? parent.recipientId : parent.senderId
    await this.assertCanMessage(senderId, String(recipientId))
    const canonical = JSON.stringify({
      senderId: String(senderId),
      recipientId: String(recipientId),
      subject: dto.subject || '',
      content: dto.content,
      attachmentIds: [],
      parentMessageId: String(dto.parentMessageId)
    })
    const hash = createHash('sha256').update(canonical).digest('hex')
    if (dto.contentHash && dto.contentHash !== hash) {
      throw new ForbiddenException('Invalid message content hash')
    }
    const pub = await getAuthPublicKeyById((this as any).messageModel.db, String(senderId))
    if (!pub) throw new ForbiddenException('Sender public key not found')
    const ok = verifySignature(pub, canonical, dto.senderSignature)
    if (!ok) throw new ForbiddenException('Invalid message signature')

    const doc = await this.messageModel.create({
      senderId: new Types.ObjectId(senderId),
      recipientId: new Types.ObjectId(recipientId),
      subject: dto.subject,
      content: dto.content,
      contentHash: hash,
      parentMessageId: new Types.ObjectId(dto.parentMessageId),
      senderSignature: dto.senderSignature,
    })
    return doc
  }

  async list(userId: string, query: QueryMessagesDto) {
    const filter: any = {
      $or: [{ senderId: new Types.ObjectId(userId) }, { recipientId: new Types.ObjectId(userId) }],
    }
    if (typeof query.isRead === 'boolean') filter.isRead = query.isRead
    if (typeof query.isDeleted === 'boolean') filter.isDeleted = query.isDeleted

    const limit = query.limit && query.limit > 0 && query.limit <= 100 ? query.limit : 20
    const page = query.page && query.page > 0 ? query.page : 1

    const [items, total] = await Promise.all([
      this.messageModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.messageModel.countDocuments(filter),
    ])

    return { items, total, page, limit }
  }

  async markRead(userId: string, ids: string[] | 'all') {
    const filter: any = { recipientId: new Types.ObjectId(userId), isRead: false }
    if (Array.isArray(ids)) {
      filter._id = { $in: ids.map((id) => new Types.ObjectId(id)) }
    }
    const res = await this.messageModel.updateMany(filter, { $set: { isRead: true, readAt: new Date() } })
    return { matched: (res as any).matchedCount, modified: (res as any).modifiedCount }
  }

  async delete(userId: string, id: string) {
    const msg = await this.messageModel.findById(id)
    if (!msg) throw new NotFoundException('Message not found')
    if (msg.senderId.toString() !== userId && msg.recipientId.toString() !== userId) {
      throw new ForbiddenException('Not allowed')
    }
    msg.isDeleted = true
    await msg.save()
    return { success: true }
  }
}
