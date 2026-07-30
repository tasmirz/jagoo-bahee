import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { NodeSigner } from '../../../core/ports/node-signer.port.js';
import { hostWithoutPort, isClientUnreachableHost } from '../../../core/domain/service-map.js';
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
    const [auditLogs, mcaptcha, blobs] = await Promise.all([
      this.directory.services(AuxiliaryServiceKind.AUDIT_LOG),
      this.directory.services(AuxiliaryServiceKind.MCAPTCHA),
      this.directory.services(AuxiliaryServiceKind.BLOB),
    ]);
    const forwardedProtocol = request.headers['x-forwarded-proto'];
    const protocol =
      typeof forwardedProtocol === 'string'
        ? forwardedProtocol.split(',')[0]!.trim()
        : request.protocol;
    const requestedAddress = new URL(`${protocol}://${request.headers.host ?? 'localhost'}`).origin;

    /**
     * Advertisement is best-effort and layered, most authoritative first:
     *
     *   1. the operator's port map (`publicAddress`) — an explicit statement about the outside;
     *   2. the host this request arrived on, when the configured host is one the client cannot
     *      be assumed to reach;
     *   3. the configured address, unchanged.
     *
     * Step 2 keeps the ADVERTISED PORT and swaps only the host. That is the whole rule: a service
     * on the same machine as the node is reachable wherever the node is reachable, on its own
     * port. Substituting the request's port instead would point every service at the node itself.
     *
     * `request.hostname` excludes the port on Fastify 5 (`request.port` carries it separately).
     * On Fastify 4 it did not, and this same line would have produced `bore.pub:12001:3100`.
     */
    const clientHost = hostWithoutPort(request.hostname) || new URL(requestedAddress).hostname;
    const advertise = (service: AuxiliaryService): AuxiliaryService => {
      if (service.publicAddress) {
        const mapped = new URL(service.publicAddress);
        return {
          ...service,
          address: service.publicAddress,
          host: mapped.hostname,
          port: Number(mapped.port || (mapped.protocol === 'https:' ? 443 : 80)),
        };
      }
      if (!isClientUnreachableHost(service.host)) return service;
      const address = new URL(service.address);
      address.hostname = clientHost;
      return { ...service, address: address.toString().replace(/\/$/, ''), host: clientHost };
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
        blobs: blobs.map(advertise),
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
