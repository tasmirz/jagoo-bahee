import { Module, forwardRef } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { PostsController } from './posts.controller'
import { PostsService } from './posts.service'
import { Post, PostSchema } from './schemas/post.schema'
import { ModerationModule } from 'src/moderation/moderation.module'
import { SharedModule } from 'src/common/shared.module'
import { AttachmentsModule } from 'src/attachments/attachments.module'
import { SubredditsModule } from 'src/subreddits/subreddits.module'
import { AuthModule } from 'src/auth/auth.module'
import { CommentsModule } from 'src/comments/comments.module'
import { RedisModule } from 'src/redis/redis.module'
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
    ModerationModule,
    SharedModule,
    AttachmentsModule,
    SubredditsModule,
    AuthModule,
    RedisModule,
    forwardRef(() => CommentsModule)
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService]
})
export class PostsModule {}
