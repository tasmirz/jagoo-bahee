import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common'
import { Request } from 'express'
import { AbuseRateLimiterService } from 'src/common/abuse-rate-limiter.service'
import { FederationActivity, FederationService } from './federation.service'

@Controller()
export class FederationController {
  constructor(
    private readonly federation: FederationService,
    private readonly abuseLimiter: AbuseRateLimiterService
  ) {}

  @Get('.well-known/jagoo-bahee')
  jagooWellKnown() {
    return this.federation.identity()
  }

  @Get('.well-known/nodeinfo')
  nodeInfoDiscovery() {
    const baseUrl = (process.env.PUBLIC_SERVER_URL || `http://localhost:${process.env.PORT || 6000}`).replace(/\/$/, '')
    return {
      links: [
        {
          rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
          href: `${baseUrl}/nodeinfo/2.1`
        }
      ]
    }
  }

  @Get('nodeinfo/2.1')
  nodeInfo() {
    return this.federation.nodeInfo()
  }

  @Get('federation/servers')
  servers() {
    return this.federation.listApprovedServers()
  }

  @Get('federation/outbox')
  outbox(@Query('limit') limit = '50'): Promise<any[]> {
    return this.federation.listOutbox(Number(limit))
  }

  @Post('federation/inbox')
  async inbox(@Req() req: Request, @Body() body: FederationActivity) {
    await this.abuseLimiter.hit(
      'federation-inbox',
      this.abuseLimiter.tracker(req, body?.actorServerId || 'unknown-remote'),
      Number(process.env.FEDERATION_INBOX_LIMIT || 300),
      Number(process.env.FEDERATION_INBOX_WINDOW_MS || 60 * 60 * 1000)
    )
    return this.federation.receive(body)
  }
}
