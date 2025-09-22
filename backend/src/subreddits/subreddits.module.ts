import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { SubredditsController } from './subreddits.controller'
import { SubredditsService } from './subreddits.service'
import { Subreddit, SubredditSchema } from './schemas/subreddit.schema'
import { SubredditMember, SubredditMemberSchema } from './schemas/subreddit-member.schema'
import { ModerationModule } from 'src/moderation/moderation.module'
import { SubredditMembersController } from './subreddit-members.controller'
import { SubredditMembersService } from './subreddit-members.service'
import { SubredditRbacGuard } from './guards/subreddit-rbac.guard'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subreddit.name, schema: SubredditSchema },
      { name: SubredditMember.name, schema: SubredditMemberSchema }
    ]),
    ModerationModule
  ],
  controllers: [SubredditsController, SubredditMembersController],
  providers: [SubredditsService, SubredditMembersService, SubredditRbacGuard],
  exports: [SubredditsService, SubredditMembersService, SubredditRbacGuard]
})
export class SubredditsModule {}
