import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { MongooseModule } from '@nestjs/mongoose'
import { SharedModule } from 'src/common/shared.module'
import { UsersModule } from 'src/users/users.module'
import { Auth, AuthSchema } from './schemas/auth.schema'
import { jwtConfig } from 'src/config/jwt.config'
import { User, UserSchema } from 'src/users/schemas/user.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Auth.name, schema: AuthSchema },
      { name: User.name, schema: UserSchema }
    ]),
    SharedModule,
    UsersModule
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService]
})
export class AuthModule {}
