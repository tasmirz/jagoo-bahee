import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CommentsController } from './comments.controller'
import { CommentsService } from './comments.service'
import { Comment, CommentSchema } from './schemas/comment.schema'
import { ModerationModule } from 'src/moderation/moderation.module'
import { SubredditsModule } from 'src/subreddits/subreddits.module'

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Comment.name, schema: CommentSchema }]),
    ModerationModule,
    SubredditsModule
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService]
})
export class CommentsModule {}
