import { Injectable, HttpException, HttpStatus } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Subreddit } from './schemas/subreddit.schema'

@Injectable()
export class SubredditsService {
  constructor(@InjectModel(Subreddit.name) private readonly model: Model<Subreddit>) {}

  async create(data: Partial<Subreddit>): Promise<Subreddit> {
    try {
      const created = new this.model(data)
      return await created.save()
    } catch (err) {
      throw new HttpException(err.message || 'Could not create subreddit', HttpStatus.BAD_REQUEST)
    }
  }

  async findAll(filter: any = {}, limit = 50, skip = 0): Promise<Subreddit[]> {
    return this.model.find(filter).sort({ createdAt: -1 }).limit(limit).skip(skip).exec()
  }

  async findOne(idOrName: string): Promise<Subreddit | null> {
    if (Types.ObjectId.isValid(idOrName)) {
      return this.model.findById(idOrName).exec()
    }
    // allow lookup by name
    return this.model.findOne({ name: idOrName.toLowerCase() }).exec()
  }

  async update(id: string, update: Partial<Subreddit>): Promise<Subreddit | null> {
    if (!Types.ObjectId.isValid(id)) return null
    return this.model.findByIdAndUpdate(id, update, { new: true }).exec()
  }

  async remove(id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false
    const res = await this.model.findByIdAndDelete(id).exec()
    return !!res
  }
}
