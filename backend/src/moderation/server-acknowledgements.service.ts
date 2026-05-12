import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ServerAcknowledgement } from './schemas/server-acknowledgement.schema';

@Injectable()
export class ServerAcknowledgementsService {
  constructor(
    @InjectModel(ServerAcknowledgement.name)
    private readonly model: Model<ServerAcknowledgement>,
  ) {}

  async create(data: Partial<ServerAcknowledgement>) {
    return this.model.create(data);
  }

  async findByContent(contentType: string, contentId: string | Types.ObjectId) {
    return this.model.find({ contentType, contentId }).sort({ createdAt: -1 }).exec();
  }
}
