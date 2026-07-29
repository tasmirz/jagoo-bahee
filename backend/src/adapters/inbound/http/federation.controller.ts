/**
 * Federation discovery over plain HTTP (T2.14, `Plans/05` §7).
 *
 * ── FD-17: EVERY endpoint, with its scope — not just the public one ─────────────────
 * `/.well-known/jagoo-bahee` lists the GLOBAL address alongside the NATIONAL and
 * ISP_LOCAL ones. This is the mechanism by which a client on the same ISP learns the
 * ISP-local address BEFORE the gateway drops. Publishing only the public address would
 * mean discovery depends on the network that just failed (TP-05, THR-11) — and by then
 * there is nothing left to ask.
 *
 * ── Why these are REST and the federation RPCs are gRPC ─────────────────────────────
 * `Plans/05` §1: gRPC's HTTP/2 has a distinctive TLS and frame fingerprint and degrades
 * badly on lossy mobile links. Operators choose their peers so that risk does not apply
 * between servers; a client on a hostile network is exactly who these endpoints are for,
 * so they stay ordinary JSON over HTTPS.
 *
 * Nothing here is authenticated, and nothing here is sensitive. A node's peers, its tree
 * head, and its addresses are all public federation metadata. Blocked peers are omitted
 * rather than listed as blocked: a directory naming who this node blocked is a list of
 * targets for whoever wanted them blocked.
 */

import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { NodeSigner } from '../../../core/ports/node-signer.port.js';
import { WitnessLog } from '../../../core/ports/transparency.port.js';
import { OperatorAlerts } from '../../../core/ports/alerts.port.js';
import { PeerDirectory, PeerTrust } from '../../../core/ports/network.port.js';
import { FEDERATION_CONFIG, type FederationConfig } from '../../../composition/federation.config.js';

const SOFTWARE = 'jagoo-bahee';
const VERSION = '2.0.0';

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

@Controller()
export class FederationController {
  constructor(
    @Inject(PeerDirectory) private readonly peers: PeerDirectory,
    @Inject(WitnessLog) private readonly witness: WitnessLog,
    @Inject(NodeSigner) private readonly signer: NodeSigner,
    @Inject(OperatorAlerts) private readonly alerts: OperatorAlerts,
    @Inject(FEDERATION_CONFIG) private readonly config: FederationConfig,
  ) {}

  @Get('.well-known/jagoo-bahee')
  async wellKnown(@Req() request: FastifyRequest): Promise<Record<string, unknown>> {
    return {
      serverId: this.signer.serverId,
      serverKey: b64(this.signer.publicKey),
      displayName: this.config.displayName,
      software: SOFTWARE,
      version: VERSION,
      planes: this.config.planes,
      // FD-17 — all scopes, in narrowest-first preference order, so a client can try the
      // ISP-local address before the national one without knowing our topology.
      endpoints: this.advertisedEndpoints(request),
      capabilities: [
        'federation-grpc',
        'tofu',
        'sth-gossip',
        'directory-exchange',
        'outbound-only-peers',
        ...(this.config.outboundOnly ? ['outbound-only'] : []),
      ],
      acceptedClasses: this.config.acceptedClasses,
    };
  }

  @Get('.well-known/nodeinfo')
  nodeinfoDiscovery(@Req() request: FastifyRequest): Record<string, unknown> {
    return {
      links: [
        {
          rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
          href: `${originOf(request)}/nodeinfo/2.1`,
        },
      ],
    };
  }

  @Get('nodeinfo/2.1')
  async nodeinfo(): Promise<Record<string, unknown>> {
    const sth = await this.witness.currentSth();
    return {
      version: '2.1',
      software: { name: SOFTWARE, version: VERSION },
      protocols: ['jagoo-bahee'],
      services: { inbound: [], outbound: [] },
      // NFR: aggregate only. `localPosts` is the node's own log size, which is already
      // public in every receipt it issues; user counts are deliberately absent, because a
      // per-node population figure is a targeting signal under a shutdown.
      openRegistrations: this.config.openRegistrations,
      usage: { localPosts: sth.treeSize, users: {} },
      metadata: {
        planes: this.config.planes,
        federation: { outboundOnly: this.config.outboundOnly },
      },
    };
  }

  @Get('v1/federation/peers')
  async peerList(): Promise<Record<string, unknown>> {
    const peers = (await this.peers.all()).filter((peer) => peer.trust !== PeerTrust.BLOCKED);
    return {
      items: peers.map((peer) => ({
        serverId: peer.serverId,
        serverKey: b64(peer.publicKey),
        displayName: peer.displayName ?? '',
        trust: peer.trust,
        planes: peer.planes ?? [],
        endpoints: peer.endpoints.map((endpoint) => ({
          uri: endpoint.address,
          scope: endpoint.scope,
          asn: endpoint.asn ?? null,
          ispName: endpoint.isp ?? null,
          inboundCapable: endpoint.inboundCapable ?? false,
        })),
        vouchCount: (peer.vouches ?? []).length,
        lastSeenMs: peer.lastSeenMs,
      })),
      count: peers.length,
    };
  }

  @Get('v1/federation/sth')
  async treeHead(): Promise<Record<string, unknown>> {
    const sth = await this.witness.currentSth();
    return {
      serverId: this.signer.serverId,
      serverKey: b64(sth.serverKey),
      treeSize: sth.treeSize,
      rootHash: b64(sth.rootHash),
      timestampMs: sth.timestampMs,
      signature: b64(sth.signature),
    };
  }

  /**
   * TP-05 — the pre-positioning payload.
   *
   * A client caches this while the network still works and never evicts entries purely for
   * age (TP-06): a stale ISP-local address is infinitely more useful than no address.
   */
  @Get('v1/federation/directory')
  async directory(@Req() request: FastifyRequest): Promise<Record<string, unknown>> {
    const peers = (await this.peers.all()).filter((peer) => peer.trust !== PeerTrust.BLOCKED);
    return {
      generatedAtMs: Date.now(),
      self: {
        serverId: this.signer.serverId,
        serverKey: b64(this.signer.publicKey),
        endpoints: this.advertisedEndpoints(request),
      },
      peers: peers.map((peer) => ({
        serverId: peer.serverId,
        serverKey: b64(peer.publicKey),
        trust: peer.trust,
        endpoints: peer.endpoints.map((endpoint) => ({
          uri: endpoint.address,
          scope: endpoint.scope,
          asn: endpoint.asn ?? null,
          ispName: endpoint.isp ?? null,
        })),
      })),
    };
  }

  /** FD-09 / FD-16 findings. Public because censorship evidence is only useful if visible. */
  @Get('v1/federation/alerts')
  async alertList(): Promise<Record<string, unknown>> {
    return { items: await this.alerts.list(50) };
  }

  /**
   * FD-12 — an outbound-only node advertises NO endpoints.
   *
   * Not "advertises its address but sets inbound_capable false": it has no reachable
   * address, and publishing one would send peers into a retry loop against a port that
   * will never answer. It federates entirely through connections it initiates.
   */
  private advertisedEndpoints(request: FastifyRequest): readonly Record<string, unknown>[] {
    if (this.config.outboundOnly) return [];
    const declared = this.config.endpoints.map((endpoint) => ({
      uri: endpoint.address,
      scope: endpoint.scope,
      asn: endpoint.asn ?? null,
      ispName: endpoint.isp ?? null,
      inboundCapable: endpoint.inboundCapable ?? true,
    }));
    if (declared.length > 0) return declared;
    // Nothing configured: report the address this request actually arrived on, so a node
    // brought up with no endpoint configuration is still discoverable rather than invisible.
    return [{ uri: originOf(request), scope: 'GLOBAL', asn: null, ispName: null, inboundCapable: true }];
  }
}

function originOf(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-proto'];
  const protocol =
    typeof forwarded === 'string' ? (forwarded.split(',')[0] ?? '').trim() : request.protocol;
  return new URL(`${protocol || 'http'}://${request.headers.host ?? 'localhost'}`).origin;
}
