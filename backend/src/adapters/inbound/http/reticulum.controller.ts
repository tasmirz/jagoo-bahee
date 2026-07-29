import { Controller, Get, Headers, HttpException, Inject } from '@nestjs/common';
import { identityId } from '@jagoo/sdk/core';
import {
  RETICULUM_TRANSPORT,
  type OptionalReticulumTransport,
} from '../../../composition/reticulum.config.js';
import { SessionAuth } from '../../../core/ports/auth.port.js';

function configuredAdminKeys(): Set<string> {
  return new Set(
    (process.env.ADMIN_KEYS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}

@Controller('v1/admin/reticulum')
export class ReticulumController {
  constructor(
    @Inject(RETICULUM_TRANSPORT)
    private readonly transport: OptionalReticulumTransport,
    @Inject(SessionAuth) private readonly auth: SessionAuth,
  ) {}

  private async authorize(authorization?: string): Promise<void> {
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new HttpException({ detail: 'administrator access token is required' }, 401);
    }
    try {
      const principal = await this.auth.verifyAccess(token);
      const admins = configuredAdminKeys();
      const hex = Buffer.from(principal.key).toString('hex').toLowerCase();
      if (!admins.has(hex) && !admins.has(identityId(principal.key).toLowerCase())) {
        throw new HttpException({ detail: 'administrator role is required' }, 403);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException({ detail: 'administrator access token is invalid' }, 401);
    }
  }

  @Get()
  async status(
    @Headers('authorization') authorization?: string,
  ): Promise<Record<string, unknown>> {
    await this.authorize(authorization);
    if (!this.transport) return { enabled: false, available: false };
    try {
      const status = await this.transport.status();
      return {
        enabled: true,
        available: true,
        queueDepth: status.queue_depth,
        interfaces: status.interfaces.map((item) => ({
          name: item.name,
          kind: item.kind,
          up: item.up,
          rssi: item.rssi,
          snr: item.snr,
          txBytes: item.tx_bytes.toString(),
          rxBytes: item.rx_bytes.toString(),
        })),
        paths: status.paths.map((item) => ({
          destinationHash: item.destination_hash,
          hops: item.hops,
          lastSeenMs: item.last_seen_ms.toString(),
        })),
      };
    } catch (error) {
      return {
        enabled: true,
        available: false,
        detail: error instanceof Error ? error.message : 'relay unavailable',
      };
    }
  }
}
