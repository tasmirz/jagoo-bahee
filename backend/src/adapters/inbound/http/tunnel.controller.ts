/**
 * The exit node's half of the reverse tunnel (T3.17, TP-16).
 *
 * Three routes: the tunnelled node long-polls `/v1/tunnel/poll`, answers on
 * `/v1/tunnel/respond`, and clients reach it at `/v1/via/<serverId>/<path>`.
 *
 * ── Only a TRUSTED peer may register a tunnel ──────────────────────────────────────
 * TP-16 says "through a `TRUSTED` reachable peer", and the trust runs BOTH ways: the
 * tunnelled node is trusting the exit node with every byte of its clients' traffic, and the
 * exit node is lending its address and its bandwidth. Accepting a tunnel from a stranger
 * would let anyone claim reachability through this node — and, because the exit node's
 * address is what clients see, would let them borrow its reputation too.
 *
 * ── The claim is signed, not asserted ──────────────────────────────────────────────
 * A bare `serverId` header would let any caller poll any node's tunnel and receive its
 * clients' requests. The same signed, method-bound, 60-second claim the gRPC calls carry is
 * required here, verified by the same code — reused rather than reimplemented, because two
 * implementations of one authentication rule is how the weaker one becomes the one that runs.
 */

import {
  All,
  Body,
  Controller,
  Get,
  HttpException,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Metadata } from 'nice-grpc';
import {
  ReverseTunnelExchange,
  type TunnelResponse,
} from '../../../core/app/reverse-tunnel.js';
import { PeerDirectory, PeerTrust } from '../../../core/ports/network.port.js';
import { Clock } from '../../../core/ports/system.port.js';
import { verifyCallMetadata } from '../grpc/peer-auth.js';

/** Headers a tunnelled request must not carry through — they describe the WRONG hop. */
const HOP_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

@Controller('v1')
export class TunnelController {
  constructor(
    @Inject(ReverseTunnelExchange) private readonly exchange: ReverseTunnelExchange,
    @Inject(PeerDirectory) private readonly peers: PeerDirectory,
    @Inject(Clock) private readonly clock: Clock,
  ) {}

  @Get('tunnel/poll')
  async poll(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    const serverId = await this.authenticate(request, 'TunnelPoll');
    const job = await this.exchange.poll(serverId);
    if (!job) {
      // 204, not an empty 200: "nothing happened, ask again" and "here is nothing" are
      // different answers, and the client's retry logic depends on telling them apart.
      reply.status(204);
      return null;
    }
    return job;
  }

  @Post('tunnel/respond')
  async respond(
    @Req() request: FastifyRequest,
    @Body() body: TunnelResponse,
  ): Promise<Record<string, unknown>> {
    const serverId = await this.authenticate(request, 'TunnelRespond');
    return { delivered: this.exchange.respond(serverId, body) };
  }

  /**
   * A client's request, carried to a node this node can reach and the client cannot.
   *
   * The tunnelled node's own routes answer it, so a tunnelled client gets byte-identical
   * responses to a direct one — including signatures and inclusion proofs, which the exit
   * node cannot forge because it cannot sign as the tunnelled node.
   */
  @All('via/:serverId/*')
  async via(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    const params = request.params as Record<string, string>;
    const serverId = params['serverId'] ?? '';
    const rest = params['*'] ?? '';
    const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (HOP_HEADERS.has(key.toLowerCase())) continue;
      if (typeof value === 'string') headers[key] = value;
    }

    const rawBody = request.body;
    const response = await this.exchange.exchange(serverId, {
      method: request.method,
      path: `/${rest}${query}`,
      headers,
      ...(rawBody === undefined || rawBody === null
        ? {}
        : { body: Buffer.from(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody), 'utf8').toString('base64') }),
    });

    reply.status(response.status);
    for (const [key, value] of Object.entries(response.headers)) {
      if (HOP_HEADERS.has(key.toLowerCase())) continue;
      reply.header(key, value);
    }
    // `X-Jagoo-Via` is deliberate: a client MUST be able to tell it is on a tunnel, because
    // the exit node can see and drop its traffic. Hiding the hop would be the dishonest
    // version of this feature.
    reply.header('x-jagoo-via', serverId);
    return response.body ? reply.send(Buffer.from(response.body, 'base64')) : null;
  }

  private async authenticate(request: FastifyRequest, method: string): Promise<string> {
    const metadata = new Metadata();
    for (const header of ['jb-peer-key', 'jb-peer-ts', 'jb-peer-nonce', 'jb-peer-auth']) {
      const value = request.headers[header];
      if (typeof value === 'string') metadata.set(header, value);
    }
    const identity = verifyCallMetadata(method, metadata, this.clock.nowMs());
    if (!identity) {
      throw new HttpException({ detail: 'a signed peer claim is required' }, 401);
    }
    const peer = await this.peers.get(identity.serverId);
    if (!peer || peer.trust !== PeerTrust.TRUSTED) {
      // TP-16 — TRUSTED, not merely known. Lending this node's address is an operator
      // decision, and TOFU deliberately does not confer it.
      throw new HttpException({ detail: 'only a TRUSTED peer may open a reverse tunnel' }, 403);
    }
    return identity.serverId;
  }
}
