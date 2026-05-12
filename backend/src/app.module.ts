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
import { RedisModule } from './redis/redis.module'
import { RedisThrottlerStorage } from './redis/redis-throttler.storage'
import { AdminModule } from './admin/admin.module'
import { RolesModule } from './roles/roles.module'

@Module({
  imports: [
    MongooseModule.forRoot(config.mongo.uri),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisThrottlerStorage],
      useFactory: (storage: RedisThrottlerStorage) => ({
        storage,
        setHeaders: true,
        throttlers: [
          {
            name: 'default',
            ttl: Number(process.env.RATE_LIMIT_TTL_MS || 60000),
            limit: Number(process.env.RATE_LIMIT_LIMIT || 100),
            blockDuration: Number(process.env.RATE_LIMIT_BLOCK_MS || 60000),
            getTracker: (req) => {
              const forwardedFor = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
              const ip = forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown'
              const userAgent = String(req.headers?.['user-agent'] || 'unknown').slice(0, 120)
              return `${ip}:${userAgent}`
            },
            generateKey: (context, tracker, throttlerName) => {
              const request = context.switchToHttp().getRequest()
              return `${throttlerName}:${request.method}:${request.route?.path || request.url}:${tracker}`
            }
          }
        ]
      })
    }),
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
    RedisModule,
    AdminModule,
    RolesModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule {}
