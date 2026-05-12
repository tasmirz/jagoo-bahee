import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { MessagesService } from './messages.service'
import { MessagesController } from './messages.controller'
import { Message, MessageSchema } from './schemas/message.schema'
import { UserBlock, UserBlockSchema } from 'src/users/schemas/user-block.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: UserBlock.name, schema: UserBlockSchema }
    ])
  ],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
