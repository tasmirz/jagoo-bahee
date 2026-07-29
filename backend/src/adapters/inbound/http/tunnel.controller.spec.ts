/**
 * The exit node's half of the reverse tunnel (T3.17, TP-16).
 *
 * ── What this exists to catch ──────────────────────────────────────────────────────
 * `/v1/tunnel/poll` hands a caller the requests other people's clients made to a tunnelled
 * node. If that route could be reached with a bare `serverId` header, anyone could poll any
 * node's tunnel and receive its clients' traffic. The controller therefore requires the same
 * signed, method-bound, 60-second claim the gRPC calls carry, and requires the peer to be
 * `TRUSTED` rather than merely known — TOFU deliberately does not confer this.
 *
 * The handoff records this controller as "typecheck only". Every one of those sentences is
 * now an assertion, and per L-11 the failing cases carry the weight: an unsigned claim, a
 * claim signed for a DIFFERENT method, an expired claim, a forged signature, and a peer at
 * `PROBATION` are each rejected, and only then is the happy path checked.
 */

import { describe, expect, it } from 'vitest';
import { serverId as serverIdOf } from '@jagoo/sdk/core';
import { ed25519 } from '@jagoo/sdk/crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { TunnelController } from './tunnel.controller.js';
import { signCallMetadata } from '../grpc/peer-auth.js';
import {
  PeerTrust,
  type PeerDirectory,
  type PeerRecord,
} from '../../../core/ports/network.port.js';
import type { Clock } from '../../../core/ports/system.port.js';
import type { ReverseTunnelExchange } from '../../../core/app/reverse-tunnel.js';

const PEER_SEED = new Uint8Array(32).fill(3);
const PEER_KEY = ed25519.derivePublicKey(PEER_SEED);
const PEER_ID = serverIdOf(PEER_KEY);
const NOW_MS = 1_700_000_000_000;

/** Build the four headers a signed peer claim rides in, exactly as the outbound side does. */
function claimHeaders(
  method: string,
  options: { readonly seed?: Uint8Array; readonly nowMs?: number } = {},
): Record<string, string> {
  const seed = options.seed ?? PEER_SEED;
  const metadata = signCallMetadata(
    method,
    ed25519.derivePublicKey(seed),
    (message) => ed25519.sign(message, seed),
    options.nowMs ?? NOW_MS,
    new Uint8Array(16).fill(9),
  );
  const headers: Record<string, string> = {};
  for (const key of ['jb-peer-key', 'jb-peer-ts', 'jb-peer-nonce', 'jb-peer-auth']) {
    const value = metadata.get(key);
    if (typeof value === 'string') headers[key] = value;
  }
  return headers;
}

function peer(trust: PeerTrust): PeerRecord {
  return { serverId: PEER_ID, publicKey: PEER_KEY, endpoints: [], trust, lastSeenMs: NOW_MS };
}

function request(headers: Record<string, string>): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

interface Reply {
  readonly reply: FastifyReply;
  readonly statuses: number[];
  readonly headers: Record<string, string>;
  readonly sent: unknown[];
}

function reply(): Reply {
  const statuses: number[] = [];
  const headers: Record<string, string> = {};
  const sent: unknown[] = [];
  const value = {
    status(code: number) {
      statuses.push(code);
      return value;
    },
    header(key: string, headerValue: string) {
      headers[key] = headerValue;
      return value;
    },
    send(body: unknown) {
      sent.push(body);
      return value;
    },
  };
  return { reply: value as unknown as FastifyReply, statuses, headers, sent };
}

interface Harness {
  readonly controller: TunnelController;
  readonly polled: string[];
  readonly responded: { serverId: string; body: unknown }[];
  readonly exchanged: { serverId: string; request: unknown }[];
}

function harness(
  options: {
    readonly trust?: PeerTrust | null;
    readonly job?: unknown;
    readonly nowMs?: number;
  } = {},
): Harness {
  const polled: string[] = [];
  const responded: { serverId: string; body: unknown }[] = [];
  const exchanged: { serverId: string; request: unknown }[] = [];

  const exchange = {
    async poll(serverId: string) {
      polled.push(serverId);
      return options.job ?? null;
    },
    respond(serverId: string, body: unknown) {
      responded.push({ serverId, body });
      return true;
    },
    async exchange(serverId: string, tunnelRequest: unknown) {
      exchanged.push({ serverId, request: tunnelRequest });
      return {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-length': '2', host: 'wrong' },
        body: Buffer.from('{}', 'utf8').toString('base64'),
      };
    },
  } as unknown as ReverseTunnelExchange;

  const peers = {
    async get(serverId: string) {
      if (options.trust === null || options.trust === undefined) return null;
      return serverId === PEER_ID ? peer(options.trust) : null;
    },
  } as unknown as PeerDirectory;

  const clock = { nowMs: () => options.nowMs ?? NOW_MS } as unknown as Clock;

  return {
    controller: new TunnelController(exchange, peers, clock),
    polled,
    responded,
    exchanged,
  };
}

describe('TP-16 — a tunnel claim is signed, not asserted', () => {
  it('401s with no peer headers at all', async () => {
    const { controller } = harness({ trust: PeerTrust.TRUSTED });
    await expect(controller.poll(request({}), reply().reply)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('401s on a claim signed for a DIFFERENT method — a poll token cannot answer', async () => {
    // The claim is method-bound on purpose: a captured `TunnelRespond` token must not let
    // its holder drain another node's inbound queue.
    const { controller } = harness({ trust: PeerTrust.TRUSTED });
    await expect(
      controller.poll(request(claimHeaders('TunnelRespond')), reply().reply),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('401s on a claim older than the 60-second window', async () => {
    const { controller } = harness({ trust: PeerTrust.TRUSTED, nowMs: NOW_MS + 61_000 });
    await expect(
      controller.poll(request(claimHeaders('TunnelPoll')), reply().reply),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('401s when the signature does not verify against the key it names', async () => {
    const headers = claimHeaders('TunnelPoll');
    headers['jb-peer-auth'] = Buffer.from(new Uint8Array(64).fill(0xab)).toString('base64');
    const { controller } = harness({ trust: PeerTrust.TRUSTED });
    await expect(controller.poll(request(headers), reply().reply)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('403s — not 401s — when a valid signature names a key this node has never heard of', async () => {
    // A stranger's claim VERIFIES; it just does not belong to a peer. That is a trust
    // failure, not an authentication failure, and the status says so.
    const { controller } = harness({ trust: null });
    await expect(
      controller.poll(request(claimHeaders('TunnelPoll')), reply().reply),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('TP-16 — TRUSTED, not merely known', () => {
  it.each([PeerTrust.PROBATION, PeerTrust.NORMAL, PeerTrust.BLOCKED])(
    '403s a peer at %s — TOFU does not confer the right to borrow this node’s address',
    async (trust) => {
      const { controller } = harness({ trust });
      await expect(
        controller.poll(request(claimHeaders('TunnelPoll')), reply().reply),
      ).rejects.toMatchObject({ status: 403 });
    },
  );

  it('admits a TRUSTED peer', async () => {
    const { controller, polled } = harness({ trust: PeerTrust.TRUSTED });
    await controller.poll(request(claimHeaders('TunnelPoll')), reply().reply);
    expect(polled).toEqual([PEER_ID]);
  });

  it('guards /v1/tunnel/respond with the same claim, bound to its own method', async () => {
    const { controller, responded } = harness({ trust: PeerTrust.TRUSTED });
    await expect(
      controller.respond(request(claimHeaders('TunnelPoll')), {} as never),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      controller.respond(request(claimHeaders('TunnelRespond')), { requestId: 'r1' } as never),
    ).resolves.toEqual({ delivered: true });
    expect(responded).toEqual([{ serverId: PEER_ID, body: { requestId: 'r1' } }]);
  });
});

describe('the long poll answers "nothing yet" distinguishably', () => {
  it('204s with a null body when no job is queued', async () => {
    const { controller } = harness({ trust: PeerTrust.TRUSTED });
    const answer = reply();
    const body = await controller.poll(request(claimHeaders('TunnelPoll')), answer.reply);
    // 204, not an empty 200: "nothing happened, ask again" and "here is nothing" are
    // different answers and the client's retry logic depends on telling them apart.
    expect(answer.statuses).toEqual([204]);
    expect(body).toBeNull();
  });

  it('returns the job itself when one is waiting, with no 204', async () => {
    const job = { requestId: 'r7', method: 'GET', path: '/v1/feed' };
    const { controller } = harness({ trust: PeerTrust.TRUSTED, job });
    const answer = reply();
    await expect(
      controller.poll(request(claimHeaders('TunnelPoll')), answer.reply),
    ).resolves.toBe(job);
    expect(answer.statuses).toEqual([]);
  });
});

describe('the proxy leg is honest about the hop', () => {
  function viaRequest(): FastifyRequest {
    return {
      method: 'GET',
      url: '/v1/via/jbs1abc/v1/feed?limit=5',
      params: { serverId: 'jbs1abc', '*': 'v1/feed' },
      headers: { accept: 'application/json', host: 'exit.example', 'content-length': '0' },
      body: undefined,
    } as unknown as FastifyRequest;
  }

  it('sets x-jagoo-via so a client can tell it is on a tunnel', async () => {
    // Hiding the hop would be the dishonest version of this feature: the exit node can see
    // and drop this traffic, and the client is entitled to know that.
    const { controller } = harness({ trust: PeerTrust.TRUSTED });
    const answer = reply();
    await controller.via(viaRequest(), answer.reply);
    expect(answer.headers['x-jagoo-via']).toBe('jbs1abc');
    expect(answer.statuses).toEqual([200]);
  });

  it('strips hop-by-hop headers in BOTH directions — they describe the wrong hop', async () => {
    const { controller, exchanged } = harness({ trust: PeerTrust.TRUSTED });
    const answer = reply();
    await controller.via(viaRequest(), answer.reply);
    const forwarded = (exchanged[0]?.request ?? {}) as { headers: Record<string, string> };
    expect(forwarded.headers).toEqual({ accept: 'application/json' });
    expect(answer.headers).not.toHaveProperty('content-length');
    expect(answer.headers).not.toHaveProperty('host');
    expect(answer.headers['content-type']).toBe('application/json');
  });

  it('carries the query string through, because a cursor lives there', async () => {
    const { controller, exchanged } = harness({ trust: PeerTrust.TRUSTED });
    await controller.via(viaRequest(), reply().reply);
    expect((exchanged[0]?.request as { path: string }).path).toBe('/v1/feed?limit=5');
  });
});
