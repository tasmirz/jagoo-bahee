import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CommentsController } from './comments.controller'
import { CommentsService } from './comments.service'
import { Comment, CommentSchema } from './schemas/comment.schema'
import { ModerationModule } from 'src/moderation/moderation.module'
import { SubredditsModule } from 'src/subreddits/subreddits.module'
import { PostsModule } from 'src/posts/posts.module'
import { AttachmentsModule } from 'src/attachments/attachments.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { RedisModule } from 'src/redis/redis.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Comment.name, schema: CommentSchema }]),
    ModerationModule,
    SubredditsModule,
    AttachmentsModule,
    NotificationsModule,
    RedisModule,
    PostsModule
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService]
})
export class CommentsModule {}
