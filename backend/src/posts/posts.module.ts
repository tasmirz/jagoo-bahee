import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { PostsController } from './posts.controller'
import { PostsService } from './posts.service'
import { Post, PostSchema } from './schemas/post.schema'
import { ModerationModule } from 'src/moderation/moderation.module'
import { SharedModule } from 'src/common/shared.module'
import { SubredditsModule } from 'src/subreddits/subreddits.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Post.name, schema: PostSchema }]),
    ModerationModule,
    SharedModule,
    SubredditsModule
  ],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService]
})
export class PostsModule {}
