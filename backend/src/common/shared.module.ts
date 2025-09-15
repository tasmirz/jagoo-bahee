import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { jwtConfig } from 'src/config/jwt.config'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

@Module({
  imports: [JwtModule.register(jwtConfig as any)],
  providers: [JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard]
})
export class SharedModule {}
