import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { DiscoveryController } from './discovery.controller.js';
import type { NodeSigner } from '../../../core/ports/node-signer.port.js';
import {
  AuxiliaryServiceKind,
  ServiceDirectory,
  type AuxiliaryService,
} from '../../../core/ports/service-directory.port.js';

function service(partial: Partial<AuxiliaryService> & Pick<AuxiliaryService, 'kind'>): AuxiliaryService {
  const address = partial.address ?? 'http://127.0.0.1:3100';
  const url = new URL(address);
  return {
    id: `${partial.kind}-1`,
    address,
    host: url.hostname,
    port: Number(url.port),
    available: true,
    publicAddress: null,
    ...partial,
  };
}

class FakeDirectory extends ServiceDirectory {
  constructor(private readonly all: readonly AuxiliaryService[]) {
    super();
  }
  localAddresses(): readonly string[] {
    return ['http://192.168.1.20:3000'];
  }
  async services(kind?: AuxiliaryServiceKind): Promise<readonly AuxiliaryService[]> {
    return kind ? this.all.filter((item) => item.kind === kind) : this.all;
  }
}

const signer = {
  serverId: 'jbs1test',
  publicKey: new Uint8Array(32),
} as unknown as NodeSigner;

function request(host: string, hostname: string): FastifyRequest {
  return {
    headers: { host },
    hostname,
    protocol: 'http',
  } as unknown as FastifyRequest;
}

async function advertised(
  services: readonly AuxiliaryService[],
  host = 'bore.pub:12001',
  hostname = 'bore.pub',
) {
  const controller = new DiscoveryController(new FakeDirectory(services), signer);
  const body = (await controller.health(request(host, hostname))) as {
    services: Record<string, readonly AuxiliaryService[]>;
  };
  return body.services;
}

describe('discovery advertisement', () => {
  it('advertises the blob store alongside the audit log and mCaptcha', async () => {
    const services = await advertised([
      service({ kind: AuxiliaryServiceKind.AUDIT_LOG, address: 'http://127.0.0.1:3100' }),
      service({ kind: AuxiliaryServiceKind.MCAPTCHA, address: 'http://127.0.0.1:7000' }),
      service({ kind: AuxiliaryServiceKind.BLOB, address: 'http://127.0.0.1:9000' }),
    ]);
    expect(Object.keys(services).sort()).toEqual(['auditLogs', 'blobs', 'mcaptcha']);
    expect(services.blobs).toHaveLength(1);
  });

  // The rule in one assertion: the HOST becomes the one the client reached the node on, and the
  // service keeps its OWN port. Substituting the request's port would aim every service at the node.
  it('swaps the host and keeps the service port for a loopback address', async () => {
    const services = await advertised([
      service({ kind: AuxiliaryServiceKind.BLOB, address: 'http://127.0.0.1:9000' }),
    ]);
    expect(services.blobs![0]?.address).toBe('http://bore.pub:9000');
    expect(services.blobs![0]?.host).toBe('bore.pub');
  });

  // The regression that motivated widening the test beyond `127.0.0.1`: a node reached over a
  // tunnel used to pass its own LAN address straight through to a phone on another network.
  it('rewrites a private-LAN address, which the old exact-loopback test let through', async () => {
    const services = await advertised([
      service({ kind: AuxiliaryServiceKind.AUDIT_LOG, address: 'http://192.168.1.20:3100' }),
    ]);
    expect(services.auditLogs![0]?.address).toBe('http://bore.pub:3100');
  });

  it('leaves a public address exactly as configured', async () => {
    const services = await advertised([
      service({ kind: AuxiliaryServiceKind.MCAPTCHA, address: 'https://captcha.example.org:443' }),
    ]);
    expect(services.mcaptcha![0]?.address).toBe('https://captcha.example.org:443');
  });

  it('prefers the operator port map over both other branches', async () => {
    const services = await advertised([
      service({
        kind: AuxiliaryServiceKind.BLOB,
        address: 'http://minio:9000',
        publicAddress: 'http://bore.pub:12002',
      }),
    ]);
    expect(services.blobs![0]).toMatchObject({
      address: 'http://bore.pub:12002',
      host: 'bore.pub',
      port: 12002,
    });
  });

  // `request.hostname` excludes the port on Fastify 5 and included it on Fastify 4. If that ever
  // regresses, the swap silently produces `bore.pub:12001:9000` and every service becomes
  // unreachable — so assert the shape rather than trusting the framework version.
  it('never produces a double port when swapping the host', async () => {
    const services = await advertised([
      service({ kind: AuxiliaryServiceKind.BLOB, address: 'http://127.0.0.1:9000' }),
    ], 'bore.pub:12001', 'bore.pub:12001');
    expect(services.blobs![0]?.address).toBe('http://bore.pub:9000');
  });
});
