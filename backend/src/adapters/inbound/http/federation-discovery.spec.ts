/**
 * T2.14 — the federation discovery surface, against the real composition root.
 *
 * ── FD-17 is the requirement with teeth here ───────────────────────────────────────
 * `/.well-known/jagoo-bahee` MUST list ALL endpoints with their reachability scopes, not
 * just the public one. That is the mechanism by which a client on the same ISP learns the
 * ISP-local address BEFORE the gateway drops. A node that advertised only its GLOBAL
 * address would make discovery depend on the network that just failed — and by then there
 * is nothing left to ask (TP-05, THR-11).
 *
 * These run through `AppModule`, so an unbound port fails the test rather than surfacing
 * in production.
 */

import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../../composition/app.module.js';
import { PeerDirectory, PeerTrust } from '../../../core/ports/network.port.js';
import { OperatorAlerts, AlertSeverity } from '../../../core/ports/alerts.port.js';
import { Plane } from '../../../core/domain/envelope.js';

let app: NestFastifyApplication;

const ORIGINAL_ENDPOINTS = process.env.FEDERATION_ENDPOINTS;
const ORIGINAL_LISTEN = process.env.FEDERATION_GRPC_LISTEN;

beforeAll(async () => {
  // Three scopes, deliberately including two that are useless from the public internet.
  process.env.FEDERATION_ENDPOINTS = [
    'GLOBAL=grpc://node1.example.org:8444',
    'NATIONAL=grpc://203.0.113.10:8444',
    'ISP_LOCAL=grpc://10.20.30.40:8444',
  ].join(',');
  // An INBOUND-CAPABLE node, so it has endpoints to advertise. The outbound-only case —
  // where FD-12 says the node advertises nothing at all — is covered where the decision
  // is made, in `composition/federation.config.spec.ts`.
  // Port 0 lets the OS choose, so the suite never depends on a port being free.
  process.env.FEDERATION_GRPC_LISTEN = '127.0.0.1:0';

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const peers = app.get(PeerDirectory);
  await peers.upsert({
    serverId: 'jbs1visible',
    publicKey: new Uint8Array(32).fill(3),
    displayName: 'Chittagong Node',
    endpoints: [
      { address: 'grpc://198.51.100.20:8444', scope: 'NATIONAL', asn: 67890, isp: 'ISP-B' },
      { address: 'grpc://10.9.8.7:8444', scope: 'ISP_LOCAL', asn: 67890, isp: 'ISP-B' },
    ],
    trust: PeerTrust.NORMAL,
    planes: [Plane.FORUM],
    lastSeenMs: 1,
  });
  await peers.upsert({
    serverId: 'jbs1blocked',
    publicKey: new Uint8Array(32).fill(4),
    displayName: 'Blocked Node',
    endpoints: [],
    trust: PeerTrust.BLOCKED,
    blockedReason: 'log fork detected',
    lastSeenMs: 1,
  });

  await app.get(OperatorAlerts).raise({
    severity: AlertSeverity.CRITICAL,
    code: 'peer.forked',
    subject: 'jbs1blocked',
    detail: 'presented a different root for a tree size it already attested',
    raisedAtMs: 1,
  });
});

afterAll(async () => {
  await app.close();
  if (ORIGINAL_ENDPOINTS === undefined) delete process.env.FEDERATION_ENDPOINTS;
  else process.env.FEDERATION_ENDPOINTS = ORIGINAL_ENDPOINTS;
  if (ORIGINAL_LISTEN === undefined) delete process.env.FEDERATION_GRPC_LISTEN;
  else process.env.FEDERATION_GRPC_LISTEN = ORIGINAL_LISTEN;
});

const get = (url: string) => app.inject({ method: 'GET', url });

describe('/.well-known/jagoo-bahee (FD-17)', () => {
  it('lists EVERY endpoint with its scope, not just the public one', async () => {
    const response = await get('/.well-known/jagoo-bahee');
    expect(response.statusCode).toBe(200);
    const body = response.json();

    const scopes = (body.endpoints as { scope: string }[]).map((endpoint) => endpoint.scope);
    expect(scopes).toContain('GLOBAL');
    expect(scopes).toContain('NATIONAL');
    // The one that matters when the gateway is gone.
    expect(scopes).toContain('ISP_LOCAL');
  });

  it('publishes the node key, because identity is the key and never a URL (FD-02)', async () => {
    const body = (await get('/.well-known/jagoo-bahee')).json();
    expect(body.serverId).toMatch(/^jbs1/);
    expect(Buffer.from(body.serverKey as string, 'base64')).toHaveLength(32);
  });

  it('declares the capabilities a peer needs to know before dialling', async () => {
    const body = (await get('/.well-known/jagoo-bahee')).json();
    expect(body.capabilities).toContain('federation-grpc');
    expect(body.capabilities).toContain('tofu');
    expect(body.capabilities).toContain('sth-gossip');
    expect(body.planes).toContain(Plane.FORUM);
  });
});

describe('nodeinfo', () => {
  it('discovers the 2.1 document', async () => {
    const body = (await get('/.well-known/nodeinfo')).json();
    expect(body.links[0].rel).toContain('schema/2.1');
    expect(body.links[0].href).toMatch(/\/nodeinfo\/2\.1$/);
  });

  it('reports the log size and NO user population', async () => {
    const response = await get('/nodeinfo/2.1');
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.version).toBe('2.1');
    expect(typeof body.usage.localPosts).toBe('number');
    // A per-node population figure is a targeting signal under a shutdown. The log size is
    // already public in every receipt this node issues; how many people use it is not.
    expect(body.usage.users).toEqual({});
  });
});

describe('/v1/federation/*', () => {
  it('lists peers with trust and scoped endpoints, and omits blocked ones', async () => {
    const body = (await get('/v1/federation/peers')).json();
    const ids = (body.items as { serverId: string }[]).map((peer) => peer.serverId);
    expect(ids).toContain('jbs1visible');
    // A directory naming who this node blocked is a list of targets for whoever wanted
    // them blocked.
    expect(ids).not.toContain('jbs1blocked');

    const visible = (body.items as { serverId: string; endpoints: { scope: string }[] }[]).find(
      (peer) => peer.serverId === 'jbs1visible',
    );
    expect(visible!.endpoints.map((endpoint) => endpoint.scope)).toContain('ISP_LOCAL');
  });

  it('serves a signed tree head a client can verify offline', async () => {
    const body = (await get('/v1/federation/sth')).json();
    expect(typeof body.treeSize).toBe('number');
    expect(Buffer.from(body.rootHash as string, 'base64')).toHaveLength(32);
    expect(Buffer.from(body.signature as string, 'base64')).toHaveLength(64);
  });

  it('TP-05 — the directory carries this node AND its peers, with scopes, for pre-positioning', async () => {
    const body = (await get('/v1/federation/directory')).json();
    expect(body.self.serverId).toMatch(/^jbs1/);
    expect((body.self.endpoints as { scope: string }[]).map((e) => e.scope)).toContain('ISP_LOCAL');
    expect((body.peers as { serverId: string }[]).map((p) => p.serverId)).toContain('jbs1visible');
  });

  it('surfaces fork and demotion findings, because evidence is only useful if visible', async () => {
    const body = (await get('/v1/federation/alerts')).json();
    const codes = (body.items as { code: string }[]).map((alert) => alert.code);
    expect(codes).toContain('peer.forked');
  });
});
