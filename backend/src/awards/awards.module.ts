import { Module, forwardRef } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AwardsService } from './awards.service'
import { AwardsController } from './awards.controller'
import { AwardType, AwardTypeSchema } from './schemas/award-type.schema'
import { Award, AwardSchema } from './schemas/award.schema'
import { UsersModule } from 'src/users/users.module'
import { NotificationsModule } from 'src/notifications/notifications.module'
import { PostsModule } from 'src/posts/posts.module'
import { CommentsModule } from 'src/comments/comments.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AwardType.name, schema: AwardTypeSchema },
      { name: Award.name, schema: AwardSchema }
    ]),
    UsersModule,
    NotificationsModule,
    forwardRef(() => PostsModule),
    forwardRef(() => CommentsModule)
  ],
  controllers: [AwardsController],
  providers: [AwardsService],
  exports: [AwardsService]
})
export class AwardsModule {}
