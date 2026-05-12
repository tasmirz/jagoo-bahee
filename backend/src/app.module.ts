import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
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

@Module({
  imports: [
    MongooseModule.forRoot(config.mongo.uri),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    UsersModule,
    AttachmentsModule,
    SubredditsModule,
    PostsModule,
    CommentsModule,
    VotesModule,
    NotificationsModule,
    AwardsModule,
    MessagesModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
  ]
})
export class AppModule {}
