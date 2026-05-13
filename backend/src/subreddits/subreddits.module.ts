import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { SubredditsController } from './subreddits.controller'
import { SubredditsService } from './subreddits.service'
import { Subreddit, SubredditSchema } from './schemas/subreddit.schema'
import { SubredditMember, SubredditMemberSchema } from './schemas/subreddit-member.schema'
import { ModerationModule } from 'src/moderation/moderation.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { UsersModule } from 'src/users/users.module'
import { SubredditMembersController } from './subreddit-members.controller'
import { SubredditMembersService } from './subreddit-members.service'
import { SubredditRbacGuard } from './guards/subreddit-rbac.guard'
import { AttachmentsModule } from 'src/attachments/attachments.module'
import { SubredditSchedulerService } from './subreddit-scheduler.service'
import { AuthModule } from 'src/auth/auth.module'
import { RedisModule } from 'src/redis/redis.module'
import { SubredditPermissionsCacheService } from './subreddit-permissions-cache.service'
import { SubredditPermissionService } from './subreddit-permission.service'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subreddit.name, schema: SubredditSchema },
      { name: SubredditMember.name, schema: SubredditMemberSchema },
      // add role and userRole so subreddits service can create them
    ]),
    ModerationModule,
    NotificationsModule,
    UsersModule,
    AttachmentsModule,
    AuthModule,
    RedisModule
  ],
  controllers: [SubredditsController, SubredditMembersController],
  providers: [SubredditsService, SubredditMembersService, SubredditPermissionService, SubredditRbacGuard, SubredditSchedulerService, SubredditPermissionsCacheService],
  exports: [SubredditsService, SubredditMembersService, SubredditPermissionService, SubredditRbacGuard, SubredditSchedulerService, SubredditPermissionsCacheService]
})
export class SubredditsModule {}
