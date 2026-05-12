import { Module, forwardRef } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { SharedModule } from 'src/common/shared.module'
import { UsersService } from './users.service'
import { UsersController } from './users.controller'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { AuthModule } from 'src/auth/auth.module'
import { User, UserSchema } from './schemas/user.schema'
import { UserFollow, UserFollowSchema } from './schemas/user-follow.schema'
import { SavedContent, SavedContentSchema } from './schemas/saved-content.schema'
import { UserBlock, UserBlockSchema } from './schemas/user-block.schema'
import { FeedPreferences, FeedPreferencesSchema } from './schemas/feed-preferences.schema'
import { jwtConfig } from 'src/config/jwt.config'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: UserFollow.name, schema: UserFollowSchema },
      { name: SavedContent.name, schema: SavedContentSchema },
      { name: UserBlock.name, schema: UserBlockSchema },
      { name: FeedPreferences.name, schema: FeedPreferencesSchema }
    ]),
    SharedModule,
    forwardRef(() => AuthModule)
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService]
})
export class UsersModule {}
