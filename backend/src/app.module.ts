import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { ScheduleModule } from '@nestjs/schedule'
import { MongooseModule } from '@nestjs/mongoose'
import config from './config'
import { UsersModule } from './users/users.module'
import { AttachmentsModule } from './attachments/attachments.module'
import { SubredditsModule } from './subreddits/subreddits.module'
import { PostsModule } from './posts/posts.module'
import { CommentsModule } from './comments/comments.module'
import { NotificationsModule } from './notifications/notifications.module'
import { MessagesModule } from './messages/messages.module'
import { AwardsModule } from './awards/awards.module'
import { VotesModule } from './votes/votes.module'
import { RolesModule } from './roles/roles.module'

@Module({
  imports: [
    MongooseModule.forRoot(config.mongo.uri),
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    AttachmentsModule,
    SubredditsModule,
    PostsModule,
    CommentsModule,
    VotesModule,
    NotificationsModule,
    AwardsModule,
    MessagesModule,
    RolesModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
