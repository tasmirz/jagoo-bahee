import { Module, Global } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { jwtConfig } from 'src/config/jwt.config'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { AbuseRateLimiterService } from './abuse-rate-limiter.service'
import { RedisModule } from 'src/redis/redis.module'
import { ApiCreditsService } from './api-credits.service'
import { ApiCreditsController } from './api-credits.controller'

@Global()
@Module({
  imports: [JwtModule.register(jwtConfig as any), RedisModule],
  controllers: [ApiCreditsController],
  providers: [JwtAuthGuard, AbuseRateLimiterService, ApiCreditsService],
  exports: [JwtModule, JwtAuthGuard, AbuseRateLimiterService, ApiCreditsService]
})
export class SharedModule {}
