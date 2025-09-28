import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { AuthModule } from './auth/auth.module'
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

@Module({
  imports: [
    MongooseModule.forRoot(config.mongo.uri),
    AuthModule,
    UsersModule,
    AttachmentsModule,
    SubredditsModule,
    PostsModule,
    CommentsModule,
    NotificationsModule,
    AwardsModule,
    MessagesModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
