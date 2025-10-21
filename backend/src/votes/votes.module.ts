import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { Vote, VoteSchema } from './schemas/vote.schema'
import { VotesService } from './votes.service'
import { VotesController } from './votes.controller'
import { PostsModule } from 'src/posts/posts.module'
import { CommentsModule } from 'src/comments/comments.module'
import { UsersModule } from 'src/users/users.module'
import { SubredditsModule } from 'src/subreddits/subreddits.module'
import { RedisModule } from 'src/redis/redis.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Vote.name, schema: VoteSchema }]),
    PostsModule,
    CommentsModule,
    UsersModule,
    SubredditsModule,
    RedisModule
  ],
  providers: [VotesService],
  controllers: [VotesController],
  exports: [VotesService]
})
export class VotesModule {}
