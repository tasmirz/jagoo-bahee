import { Body, Controller, Get, Post, Req } from '@nestjs/common'
import { Request } from 'express'
import { ApiCreditsService } from './api-credits.service'
import { AbuseRateLimiterService } from './abuse-rate-limiter.service'

@Controller('api-credits')
export class ApiCreditsController {
  constructor(
    private readonly credits: ApiCreditsService,
    private readonly abuseLimiter: AbuseRateLimiterService
  ) {}

  @Get()
  status(@Req() req: Request) {
    return this.credits.getStatus(this.abuseLimiter.tracker(req))
  }

  @Post('challenge')
  challenge(@Req() req: Request) {
    return this.credits.issueChallenge(this.abuseLimiter.tracker(req))
  }

  @Post('redeem')
  redeem(@Req() req: Request, @Body() body: { challenge: string; nonce: number }) {
    return this.credits.redeemChallenge(this.abuseLimiter.tracker(req), body.challenge, Number(body.nonce))
  }
}
