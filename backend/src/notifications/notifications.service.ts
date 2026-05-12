import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Notification } from './schemas/notification.schema'
import { CreateNotificationDto } from './dto/create-notification.dto'
import { UpdateNotificationDto } from './dto/update-notification.dto'
import { QueryNotificationsDto } from './dto/query-notifications.dto'

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
  ) {}

  async create(dto: CreateNotificationDto) {
    const doc = await this.notificationModel.create({ ...dto })
    return doc
  }

  async list(userId: string, query: QueryNotificationsDto) {
    const filter: any = { userId: new Types.ObjectId(userId) }
    if (query.type) filter.type = query.type
    if (typeof query.isRead === 'boolean') filter.isRead = query.isRead

    const limit = query.limit && query.limit > 0 && query.limit <= 100 ? query.limit : 20
    const page = query.page && query.page > 0 ? query.page : 1

    const [items, total] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments(filter),
    ])

    return { items, total, page, limit }
  }

  async markRead(userId: string, ids: string[] | 'all') {
    const filter: any = { userId: new Types.ObjectId(userId), isRead: false }
    if (Array.isArray(ids)) {
      filter._id = { $in: ids.map((id) => new Types.ObjectId(id)) }
    }
    const res = await this.notificationModel.updateMany(filter, { $set: { isRead: true, readAt: new Date() } })
    return { matched: (res as any).matchedCount, modified: (res as any).modifiedCount }
  }

  async markUnread(userId: string, ids: string[]) {
    const filter: any = {
      userId: new Types.ObjectId(userId),
      _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
    }
    const res = await this.notificationModel.updateMany(filter, { $set: { isRead: false }, $unset: { readAt: 1 } })
    return { matched: (res as any).matchedCount, modified: (res as any).modifiedCount }
  }

  async remove(userId: string, id: string) {
    await this.notificationModel.deleteOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) })
    return { success: true }
  }
}
