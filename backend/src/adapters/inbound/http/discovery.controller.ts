import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { NodeSigner } from '../../../core/ports/node-signer.port.js';
import {
  AuxiliaryServiceKind,
  ServiceDirectory,
  type AuxiliaryService,
} from '../../../core/ports/service-directory.port.js';

@Controller()
export class DiscoveryController {
  constructor(
    @Inject(ServiceDirectory) private readonly directory: ServiceDirectory,
    @Inject(NodeSigner) private readonly signer: NodeSigner,
  ) {}

  @Get('health')
  async health(@Req() request: FastifyRequest): Promise<Record<string, unknown>> {
    const [auditLogs, mcaptcha] = await Promise.all([
      this.directory.services(AuxiliaryServiceKind.AUDIT_LOG),
      this.directory.services(AuxiliaryServiceKind.MCAPTCHA),
    ]);
    const forwardedProtocol = request.headers['x-forwarded-proto'];
    const protocol =
      typeof forwardedProtocol === 'string'
        ? forwardedProtocol.split(',')[0]!.trim()
        : request.protocol;
    const requestedAddress = new URL(`${protocol}://${request.headers.host ?? 'localhost'}`).origin;
    const advertise = (service: AuxiliaryService): AuxiliaryService => {
      if (service.host !== '127.0.0.1' && service.host !== 'localhost') return service;
      const address = new URL(service.address);
      address.hostname = request.hostname;
      return { ...service, address: address.toString().replace(/\/$/, ''), host: request.hostname };
    };
    return {
      status: 'ok',
      node: {
        serverId: this.signer.serverId,
        serverKey: Buffer.from(this.signer.publicKey).toString('base64'),
        displayName: process.env.NODE_NAME ?? 'Jagoo Bahee node',
        requestedAddress,
        localAddresses: this.directory.localAddresses(),
      },
      services: {
        auditLogs: auditLogs.map(advertise),
        mcaptcha: mcaptcha.map(advertise),
      },
      endpoints: {
        federations: '/federations',
        verify: '/verify',
        status: '/status',
      },
    };
  }

  @Get('federations')
  async federations(): Promise<Record<string, unknown>> {
    const items = await this.directory.services(AuxiliaryServiceKind.FEDERATION);
    return {
      serverId: this.signer.serverId,
      items,
      connected: items.filter((item) => item.available).length,
    };
  }
}
