import { Module } from '@nestjs/common'
import { AuthService } from './auth.service'
import { AuthController } from './auth.controller'
import { JwtModule } from '@nestjs/jwt'
import { MongooseModule } from '@nestjs/mongoose'
import { Auth, AuthSchema } from './schemas/auth.schema'
import { jwtConfig } from 'src/config/jwt.config'

@Module({
  imports: [JwtModule.register(jwtConfig as any), MongooseModule.forFeature([{ name: Auth.name, schema: AuthSchema }])],
  controllers: [AuthController],
  providers: [AuthService]
})
export class AuthModule {}
