import { Module, Global } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { jwtConfig } from 'src/config/jwt.config'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { AbuseRateLimiterService } from './abuse-rate-limiter.service'
import { RedisModule } from 'src/redis/redis.module'

@Global()
@Module({
  imports: [JwtModule.register(jwtConfig as any), RedisModule],
  providers: [JwtAuthGuard, AbuseRateLimiterService],
  exports: [JwtModule, JwtAuthGuard, AbuseRateLimiterService]
})
export class SharedModule {}
