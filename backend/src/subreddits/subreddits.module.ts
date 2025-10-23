import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { SubredditsController } from './subreddits.controller'
import { SubredditsService } from './subreddits.service'
import { Subreddit, SubredditSchema } from './schemas/subreddit.schema'
import { SubredditMember, SubredditMemberSchema } from './schemas/subreddit-member.schema'
import { Role, RoleSchema } from 'src/roles/schemas/role.schema'
import { UserRole, UserRoleSchema } from 'src/roles/schemas/user-role.schema'
import { ModerationModule } from 'src/moderation/moderation.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { UsersModule } from 'src/users/users.module'
import { SubredditMembersController } from './subreddit-members.controller'
import { SubredditMembersService } from './subreddit-members.service'
import { SubredditRbacGuard } from './guards/subreddit-rbac.guard'
import { AttachmentsModule } from 'src/attachments/attachments.module'
import { SubredditSchedulerService } from './subreddit-scheduler.service'
import { SubredditPermissionsCacheService } from './subreddit-permissions-cache.service'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subreddit.name, schema: SubredditSchema },
      { name: SubredditMember.name, schema: SubredditMemberSchema },
      // add role and userRole so subreddits service can create them
      { name: Role.name, schema: RoleSchema },
      { name: UserRole.name, schema: UserRoleSchema }
    ]),
    ModerationModule,
    NotificationsModule,
    UsersModule,
    AttachmentsModule
  ],
  controllers: [SubredditsController, SubredditMembersController],
  providers: [
    SubredditsService,
    SubredditMembersService,
    SubredditRbacGuard,
    SubredditSchedulerService,
    SubredditPermissionsCacheService
  ],
  exports: [
    SubredditsService,
    SubredditMembersService,
    SubredditRbacGuard,
    SubredditSchedulerService,
    SubredditPermissionsCacheService
  ]
})
export class SubredditsModule {}
