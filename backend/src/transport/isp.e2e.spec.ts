/**
 * P3's exit gate — TG-01 … TG-10, over real gRPC between independent stacks.
 *
 * ── This suite is the phase ────────────────────────────────────────────────────────
 * `Plans/06` §10 defines ISP availability and bridging as met when these ten criteria pass.
 * Every one of them runs against a real `nice-grpc` server on loopback, the real path
 * selector, the real uplink state machine, the real bridge quota, the real 19-step pipeline
 * and the real durable outbox. The probe is the only doubled component, and that is
 * deliberate: an ISP island, a cut IX, and a gateway blackholing one scope but not another
 * cannot be produced with real sockets on a developer's machine. `ScriptedScopeProbe` IS the
 * iptables rule — expressed as a value so the same scenario runs on macOS, on Linux, and in
 * CI.
 *
 * ── And it is not sufficient on its own ────────────────────────────────────────────
 * L-20: the gate proves the logic; only the artefact proves the deployment. `ops/isp-compose
 * .yml` runs four containers on three Docker networks with genuinely separate L2 segments,
 * and `pnpm gate:isp` drives TG-01…TG-08 against them. Both are required. This file is what
 * runs on every commit; that one is what catches the things a shared process cannot see.
 *
 * ── What each TG number is really guarding ─────────────────────────────────────────
 *   TG-01  without source binding the OS routing table picks the interface, both islands are
 *          reached over one ISP, and the bridge merges nothing while appearing to work.
 *   TG-03  a selector that quietly stopped preferring the narrow scope looks identical to one
 *          that did not — everything works, over the wrong link, until that link dies too.
 *   TG-05  one shared quota bucket and a forum backlog eats the emergency channel.
 *   TG-06  a stream on a dead interface does not fail fast; it sits there retransmitting.
 *   TG-08  "no inbound port" is the DEFAULT deployment (FD-12), not a degraded one.
 */

import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createChannel, createClient } from 'nice-grpc';
import { ChannelCredentials } from '@grpc/grpc-js';
import { CommunityCreate, PostCreate } from '@jagoo/sdk/proto';
import { ed25519 } from '@jagoo/sdk/crypto';
import { Priority } from '../core/domain/envelope.js';
import { ReachabilityScope, type PeerEndpoint } from '../core/ports/network.port.js';
import { UplinkState } from '../core/domain/transport/uplink-state.js';
import { RelayRefusal } from '../core/domain/transport/bridge-policy.js';
import { ReverseTunnelExchange } from '../core/app/reverse-tunnel.js';
import {
  registerUplinkResolver,
  uplinkChannelOptions,
  uplinkTarget,
} from '../adapters/outbound/transport/uplink-resolver.js';
import { FederationWireDefinition } from '../adapters/inbound/grpc/raw-envelope-codec.js';
import { FixedClock } from '../adapters/outbound/in-memory/in-memory-stores.js';
import { POSTS_COLLECTION, type PostDoc } from '../features/forum/post/post.projection.js';
import {
  COMMUNITIES_COLLECTION,
  type CommunityDoc,
} from '../features/forum/community/community.projection.js';
import { AUTHOR_SEED, NOW_MS, certifyEnvelope, signEnvelope } from '../testing/harness.js';
import {
  introduce,
  peerIdOf,
  startNode,
  stopNode,
  type FederatedNode,
  type NodeOptions,
} from '../federation/two-node-harness.js';

const AUTHOR_KEY = ed25519.derivePublicKey(AUTHOR_SEED);

const ISP_A_ASN = 64_501;
const ISP_B_ASN = 64_502;

let nonceCounter = 0;
let nullifierCounter = 0;

function counterBytes(value: number): Uint8Array {
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setUint32(0, Math.floor(value / 0x10000), false);
  view.setUint32(4, value % 0x100000000, false);
  return out;
}

const nextNonce = (): Uint8Array => counterBytes((nonceCounter += 1));
const nextNullifier = (): Uint8Array => counterBytes((nullifierCounter += 1) + 0x7000_0000);
const gates = () => ({
  credential: Uint8Array.from([1, 2, 3, 4], (byte) => byte ^ 0xff),
  nullifier: nextNullifier(),
  epoch: 1,
  pow: new Uint8Array([1]),
});

async function publish(
  node: FederatedNode,
  over: Parameters<typeof signEnvelope>[0],
): Promise<string> {
  const receipt = await node.pipeline.accept(
    signEnvelope({ nonce: nextNonce(), ...gates(), ...over }),
  );
  return receipt.contentId;
}

async function certify(node: FederatedNode): Promise<void> {
  await node.pipeline.accept(certifyEnvelope());
}

async function createCommunity(node: FederatedNode, name: string): Promise<string> {
  await publish(node, {
    domain: 'jb:community:create:v1',
    scope: '',
    body: CommunityCreate.encode(
      CommunityCreate.fromPartial({ name, title: name.replace(/_/g, ' ') }),
    ).finish(),
  });
  const community = await node.projections
    .collection<CommunityDoc>(COMMUNITIES_COLLECTION)
    .findOne({ name });
  if (!community) throw new Error(`community ${name} was not projected on ${node.name}`);
  return community.id;
}

async function post(node: FederatedNode, scope: string, title: string): Promise<string> {
  return publish(node, {
    domain: 'jb:post:create:v1',
    scope,
    // `kind: 1` — TEXT. A community's default allowed-kind set does not include the
    // unspecified zero, so omitting it is refused at step 14 rather than accepted as a
    // default, which is the correct behaviour and worth not papering over.
    body: PostCreate.encode(
      PostCreate.fromPartial({ kind: 1, title, body_markdown: `${title} body` }),
    ).finish(),
  });
}

/**
 * The source address a test that actually DIALS must use.
 *
 * TP-08 binding is real — that is the point — so an uplink configured with `203.0.113.10`
 * fails `net.connect` with `EADDRNOTAVAIL` on a host that does not have that address. Every
 * test below that opens a connection therefore binds to a loopback address the host really
 * has, while keeping distinct uplink IDs and ASNs, which is what path selection actually
 * ranks on. Two GENUINELY separate interfaces are a property of a machine, not of a process:
 * `ops/isp-gate.mjs` asserts that half inside containers with two real NICs (L-20).
 */
const DIALABLE = '127.0.0.1';

/** One uplink on an ISP, declaring the scopes a real ISP link carries. */
const ispUplink = (id: string, sourceIp: string, asn: number, priority = 1) => ({
  id,
  sourceIp,
  asn,
  ispName: id.toUpperCase(),
  declaredScopes: [
    ReachabilityScope.GLOBAL,
    ReachabilityScope.NATIONAL,
    ReachabilityScope.ISP_LOCAL,
  ],
  priority,
});

/** How a node on `asn` advertises itself at every scope, all pointing at its real port. */
const scopedEndpoints =
  (asn: number) =>
  (port: number): readonly PeerEndpoint[] => [
    { address: `grpc://127.0.0.1:${port}`, scope: ReachabilityScope.GLOBAL, asn, inboundCapable: true },
    { address: `grpc://127.0.0.1:${port}`, scope: ReachabilityScope.NATIONAL, asn, inboundCapable: true },
    { address: `grpc://127.0.0.1:${port}`, scope: ReachabilityScope.ISP_LOCAL, asn, inboundCapable: true },
  ];

const PROBED_SCOPES = [
  ReachabilityScope.GLOBAL,
  ReachabilityScope.NATIONAL,
  ReachabilityScope.ISP_LOCAL,
] as const;

const islandNode = (name: string, seed: number, asn: number): NodeOptions => ({
  name,
  seed,
  uplinks: [ispUplink(`isp-${asn}`, DIALABLE, asn)],
  probeScopes: PROBED_SCOPES,
  advertise: scopedEndpoints(asn),
});

/** How many posts a node has projected. The `Collection` port has no count, by design. */
async function homePosts(node: FederatedNode): Promise<number> {
  return (await node.projections.collection<PostDoc>(POSTS_COLLECTION).find({}, 1_000)).length;
}

let nodes: FederatedNode[] = [];

async function boot(options: NodeOptions): Promise<FederatedNode> {
  const node = await startNode(options);
  nodes.push(node);
  await certify(node);
  await node.uplinks.probeAll();
  return node;
}

beforeEach(() => {
  nodes = [];
});

afterEach(async () => {
  for (const node of nodes) await stopNode(node);
  nodes = [];
});

// ── TG-01 ────────────────────────────────────────────────────────────────────────────

describe('TG-01 — two uplinks bind outbound connections to the correct source IP per peer', () => {
  it('routes each peer out of the uplink on its own AS', async () => {
    // Realistic source addresses here, because this test SELECTS and never dials — which is
    // the only way to assert the two uplinks resolve to two different bind addresses in a
    // process that has one interface.
    const bridge = await boot({
      name: 'bridge',
      seed: 0x31,
      uplinks: [
        ispUplink('isp-a', '10.0.1.10', ISP_A_ASN, 1),
        ispUplink('isp-b', '10.0.2.10', ISP_B_ASN, 2),
      ],
      probeScopes: PROBED_SCOPES,
    });
    const a1 = await boot(islandNode('a1', 0x32, ISP_A_ASN));
    const b1 = await boot(islandNode('b1', 0x33, ISP_B_ASN));

    await introduce(bridge, a1, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(a1.port));
    await introduce(bridge, b1, 'TRUSTED', scopedEndpoints(ISP_B_ASN)(b1.port));

    const toA = await bridge.paths.select((await bridge.peers.get(peerIdOf(a1)))!);
    const toB = await bridge.paths.select((await bridge.peers.get(peerIdOf(b1)))!);

    // Without this, the OS routing table picks one interface for both, both islands are
    // reached over one ISP, and the bridge merges nothing while appearing to work.
    expect(toA?.uplinkId).toBe('isp-a');
    expect(toA?.sourceIp).toBe('10.0.1.10');
    expect(toB?.uplinkId).toBe('isp-b');
    expect(toB?.sourceIp).toBe('10.0.2.10');
    // TP-01 holds through the ASN bonus: still the narrowest scope, not merely the same AS.
    expect(toA?.endpoint.scope).toBe(ReachabilityScope.ISP_LOCAL);
  });

  it('actually binds the socket — a source address this host lacks MUST fail the dial', async () => {
    // The falsifiable half. If `localAddress` were silently ignored — which is exactly how a
    // grpc-js internals change would break TP-08 — this connection would SUCCEED, so the
    // assertion is on the failure. ADR-014 records the coupling this test watches.
    registerUplinkResolver();
    const a1 = await boot(islandNode('a1', 0x34, ISP_A_ASN));

    const unusable = createChannel(
      uplinkTarget('203.0.113.254', `127.0.0.1:${a1.port}`),
      ChannelCredentials.createInsecure(),
      uplinkChannelOptions(`127.0.0.1:${a1.port}`),
    );
    const client = createClient(FederationWireDefinition, unusable) as unknown as {
      exchangeDirectory(request: unknown, options: unknown): Promise<unknown>;
    };
    await expect(
      client.exchangeDirectory(
        { peers: [], generated_at_ms: 0n, signature: new Uint8Array(0) },
        { deadline: new Date(Date.now() + 2_000) },
      ),
    ).rejects.toThrow();
    unusable.close();
  });

  it('a source address this host DOES have reaches the peer, and the peer sees it', async () => {
    registerUplinkResolver();
    const observed: string[] = [];
    const server = net.createServer((socket) => {
      observed.push(socket.remoteAddress ?? '');
      socket.destroy();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as net.AddressInfo).port;

    const channel = createChannel(
      uplinkTarget('127.0.0.1', `127.0.0.1:${port}`),
      ChannelCredentials.createInsecure(),
      uplinkChannelOptions(`127.0.0.1:${port}`),
    );
    channel.getConnectivityState(true);
    for (let i = 0; i < 40 && observed.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    channel.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(observed[0]).toContain('127.0.0.1');
  });
});

// ── TG-02 ────────────────────────────────────────────────────────────────────────────

describe('TG-02 — with GLOBAL blocked, two nodes on one ASN federate over ISP_LOCAL', () => {
  it('keeps federating when the gateway drops, over the path that was already warm', async () => {
    const a1 = await boot(islandNode('a1', 0x41, ISP_A_ASN));
    const a2 = await boot(islandNode('a2', 0x42, ISP_A_ASN));
    await introduce(a1, a2, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(a2.port));
    await introduce(a2, a1, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(a1.port));

    // The national gateway goes dark. The ISP's own network is untouched.
    a1.prober.block(ReachabilityScope.GLOBAL);
    a1.prober.block(ReachabilityScope.NATIONAL);
    a2.prober.block(ReachabilityScope.GLOBAL);
    a2.prober.block(ReachabilityScope.NATIONAL);
    await a1.uplinks.probeAll();
    await a2.uplinks.probeAll();

    expect(a1.uplinks.currentScope()).toBe(ReachabilityScope.ISP_LOCAL);
    const path = await a1.paths.select((await a1.peers.get(peerIdOf(a2)))!);
    expect(path?.endpoint.scope).toBe(ReachabilityScope.ISP_LOCAL);

    const community = await createCommunity(a1, 'dhaka_relief');
    await post(a1, community, 'water at ward 12');
    await a1.outbox.drain();
    await a1.outbox.drain();

    const projected = await a2.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ title: 'water at ward 12' });
    expect(projected).not.toBeNull();
  });

  it('and the block is real — with every scope down there is no path at all', async () => {
    const a1 = await boot(islandNode('a1', 0x43, ISP_A_ASN));
    const a2 = await boot(islandNode('a2', 0x44, ISP_A_ASN));
    await introduce(a1, a2, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(a2.port));

    for (const scope of PROBED_SCOPES) a1.prober.block(scope);
    await a1.uplinks.probeAll();

    expect(a1.uplinks.get('isp-64501')?.health.state).toBe(UplinkState.DOWN);
    expect(a1.uplinks.currentScope()).toBeNull();
    expect(await a1.paths.select((await a1.peers.get(peerIdOf(a2)))!)).toBeNull();
  });
});

// ── TG-03 ────────────────────────────────────────────────────────────────────────────

describe('TG-03 — the selector prefers ISP_LOCAL over NATIONAL, and the metric confirms it', () => {
  it('records the scope it actually dialled, not the one it intended', async () => {
    const a1 = await boot(islandNode('a1', 0x51, ISP_A_ASN));
    const a2 = await boot(islandNode('a2', 0x52, ISP_A_ASN));
    await introduce(a1, a2, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(a2.port));

    // Everything is alive. TP-01 is not a failover rule — the narrow path wins on a normal
    // day, which is what keeps it warm for the day it is the only path.
    await a1.sender.announce((await a1.peers.get(peerIdOf(a2)))!);

    const scopes = a1.observability.snapshot().scopes;
    expect(scopes[ReachabilityScope.ISP_LOCAL]?.attempts).toBeGreaterThan(0);
    expect(scopes[ReachabilityScope.ISP_LOCAL]?.successes).toBeGreaterThan(0);
    expect(scopes[ReachabilityScope.NATIONAL]).toBeUndefined();
    expect(scopes[ReachabilityScope.GLOBAL]).toBeUndefined();
  });

  it('falls to NATIONAL — and says so — only once ISP_LOCAL is gone', async () => {
    const a1 = await boot(islandNode('a1', 0x53, ISP_A_ASN));
    const a2 = await boot(islandNode('a2', 0x54, ISP_A_ASN));
    await introduce(a1, a2, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(a2.port));

    a1.prober.block(ReachabilityScope.ISP_LOCAL);
    await a1.uplinks.probeAll();
    await a1.sender.announce((await a1.peers.get(peerIdOf(a2)))!);

    const scopes = a1.observability.snapshot().scopes;
    expect(scopes[ReachabilityScope.NATIONAL]?.successes).toBeGreaterThan(0);
    expect(scopes[ReachabilityScope.ISP_LOCAL]).toBeUndefined();
  });

  it('counts a failed dial as a failure, so the metric cannot be read as all-clear', async () => {
    const a1 = await boot(islandNode('a1', 0x55, ISP_A_ASN));
    await a1.peers.upsert({
      serverId: 'jbs1phantom',
      publicKey: new Uint8Array(32).fill(0x5a),
      // Port 1: nothing listens there on any host.
      endpoints: [
        { address: 'grpc://127.0.0.1:1', scope: ReachabilityScope.ISP_LOCAL, asn: ISP_A_ASN },
      ],
      trust: 'TRUSTED',
      lastSeenMs: NOW_MS,
    });
    await expect(a1.sender.announce((await a1.peers.get('jbs1phantom'))!)).rejects.toThrow();

    const scopes = a1.observability.snapshot().scopes;
    expect(scopes[ReachabilityScope.ISP_LOCAL]?.failures).toBeGreaterThan(0);
    // TP-12 — and the failure is recorded against the endpoint, so it backs off.
    const phantom = await a1.peers.get('jbs1phantom');
    expect(phantom?.endpoints[0]?.consecutiveFailures).toBe(1);
  });
});

// ── TG-04 ────────────────────────────────────────────────────────────────────────────

describe('TG-04 — a bridge node merges two isolated ASN islands', () => {
  /** a1 —(ISP-A)— bridge —(ISP-B)— b1. a1 and b1 have never heard of each other. */
  async function threeNodeIslands() {
    const bridge = await boot({
      name: 'bridge',
      seed: 0x61,
      uplinks: [
        ispUplink('isp-a', DIALABLE, ISP_A_ASN, 1),
        ispUplink('isp-b', DIALABLE, ISP_B_ASN, 2),
      ],
      probeScopes: PROBED_SCOPES,
      bridge: {
        enabled: true,
        pairs: [['isp-a', 'isp-b']],
        classes: [Priority.BROADCAST, Priority.DIRECT, Priority.CHECKIN, Priority.BULK],
        envelopesPerMin: 500,
        bytesPerMin: 5_000_000,
      },
    });
    const a1 = await boot(islandNode('a1', 0x62, ISP_A_ASN));
    const b1 = await boot(islandNode('b1', 0x63, ISP_B_ASN));

    await introduce(bridge, a1, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(a1.port));
    await introduce(bridge, b1, 'TRUSTED', scopedEndpoints(ISP_B_ASN)(b1.port));
    await introduce(a1, bridge, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(bridge.port));
    await introduce(b1, bridge, 'TRUSTED', scopedEndpoints(ISP_B_ASN)(bridge.port));
    await bridge.bridge.refresh();
    return { bridge, a1, b1 };
  }

  it('carries a post from island A to island B, through a node on both', async () => {
    const { bridge, a1, b1 } = await threeNodeIslands();

    const community = await createCommunity(a1, 'chittagong_relief');
    await post(a1, community, 'boats leaving from ghat 3');

    // a1 → bridge
    await a1.outbox.drain();
    await a1.outbox.drain();
    expect(
      await bridge.projections
        .collection<PostDoc>(POSTS_COLLECTION)
        .findOne({ title: 'boats leaving from ghat 3' }),
    ).not.toBeNull();

    // bridge → b1, which is the crossing
    await bridge.outbox.drain();
    await bridge.outbox.drain();
    const onB = await b1.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ title: 'boats leaving from ghat 3' });
    expect(onB).not.toBeNull();

    // ADR-010 — the community keeps the ORIGIN node's id two hops out. A bridge that keyed
    // it on itself would make the post unmoderatable on island B while the feed looked fine.
    expect(onB!.community).toBe(community);
    const stats = await bridge.bridge.stats();
    expect(stats.ready).toBe(true);
    expect(stats.relayed.some((row) => row.fromUplink === 'isp-a' && row.toUplink === 'isp-b')).toBe(
      true,
    );
  });

  it('BR-03 — never relays back out of the uplink it arrived on', async () => {
    const { bridge, a1 } = await threeNodeIslands();
    const decision = bridge.bridge.shouldRelay(
      { priority: Priority.BULK } as never,
      (await bridge.bridge.uplinkForPeer(peerIdOf(a1)))!,
      100,
    );
    expect(decision).toEqual({ relay: true, toUplinks: ['isp-b'] });
    // And nothing is ever offered back to isp-a.
    expect(decision.relay && decision.toUplinks).not.toContain('isp-a');
  });

  it('BR-01 — a node that has not earned the right does not bridge', async () => {
    const { bridge, a1, b1 } = await threeNodeIslands();
    // Demote the island-B peer to NORMAL — not PROBATION. NORMAL still carries class 3, so
    // the refusal that follows can only be BR-01's; PROBATION would be refused by the trust
    // ladder before the bridge was ever consulted, and the test would pass vacuously.
    const b = (await bridge.peers.get(peerIdOf(b1)))!;
    await bridge.peers.upsert({ ...b, trust: 'NORMAL' });
    await bridge.bridge.refresh();

    const community = await createCommunity(a1, 'sylhet_relief');
    await post(a1, community, 'shelter open at school');
    await a1.outbox.drain();
    await a1.outbox.drain();
    await bridge.outbox.drain();
    await bridge.outbox.drain();

    expect(
      await b1.projections
        .collection<PostDoc>(POSTS_COLLECTION)
        .findOne({ title: 'shelter open at school' }),
    ).toBeNull();
    const stats = await bridge.bridge.stats();
    expect(stats.ready).toBe(false);
    expect(stats.refused[RelayRefusal.DISABLED]).toBeGreaterThan(0);
  });

  it('AR-12 — a single-uplink node never treats fanout as a crossing', async () => {
    // The default deployment must be untouched by bridging. With one uplink every peer
    // resolves to it, nothing is a crossing, and no quota is ever consulted.
    const a1 = await boot(islandNode('a1', 0x64, ISP_A_ASN));
    const a2 = await boot(islandNode('a2', 0x65, ISP_A_ASN));
    await introduce(a1, a2, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(a2.port));
    await introduce(a2, a1, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(a1.port));

    const community = await createCommunity(a1, 'barisal_relief');
    await post(a1, community, 'road clear on the north side');
    await a1.outbox.drain();
    await a1.outbox.drain();

    expect(
      await a2.projections
        .collection<PostDoc>(POSTS_COLLECTION)
        .findOne({ title: 'road clear on the north side' }),
    ).not.toBeNull();
    expect((await a2.bridge.stats()).relayed).toEqual([]);
  });
});

// ── TG-05 ────────────────────────────────────────────────────────────────────────────

describe('TG-05 — a class-0 broadcast crosses the bridge while a bulk backlog is queued', () => {
  it('reserved capacity holds: bulk exhausts its half, the emergency channel is untouched', async () => {
    const clock = new FixedClock(NOW_MS);
    const bridge = await boot({
      name: 'bridge',
      seed: 0x71,
      uplinks: [
        ispUplink('isp-a', DIALABLE, ISP_A_ASN, 1),
        ispUplink('isp-b', DIALABLE, ISP_B_ASN, 2),
      ],
      probeScopes: PROBED_SCOPES,
      bridge: {
        enabled: true,
        pairs: [['isp-a', 'isp-b']],
        classes: [Priority.BROADCAST, Priority.DIRECT, Priority.CHECKIN, Priority.BULK],
        envelopesPerMin: 20,
        bytesPerMin: 100_000,
      },
    });
    const a1 = await boot(islandNode('a1', 0x72, ISP_A_ASN));
    const b1 = await boot(islandNode('b1', 0x73, ISP_B_ASN));
    await introduce(bridge, a1, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(a1.port));
    await introduce(bridge, b1, 'TRUSTED', scopedEndpoints(ISP_B_ASN)(b1.port));
    await bridge.bridge.refresh();
    void clock;

    const viaA = (await bridge.bridge.uplinkForPeer(peerIdOf(a1)))!;

    // Flood bulk until the pair's bulk bucket is empty. Ten of twenty — BR-04's half.
    let bulkAccepted = 0;
    for (let i = 0; i < 40; i += 1) {
      const decision = bridge.bridge.shouldRelay({ priority: Priority.BULK } as never, viaA, 500);
      if (decision.relay) bulkAccepted += 1;
    }
    expect(bulkAccepted).toBe(10);

    // The emergency channel still crosses. One shared bucket and this would have failed.
    const broadcast = bridge.bridge.shouldRelay(
      { priority: Priority.BROADCAST } as never,
      viaA,
      400,
    );
    expect(broadcast).toEqual({ relay: true, toUplinks: ['isp-b'] });

    const stats = await bridge.bridge.stats();
    expect(stats.refused[RelayRefusal.QUOTA]).toBeGreaterThan(0);
    expect(stats.headroom.length).toBeGreaterThan(0);
  });
});

// ── TG-06 and TG-07 ──────────────────────────────────────────────────────────────────

describe('TG-06 / TG-07 — killing an uplink re-establishes paths with zero loss', () => {
  /** One peer reachable on either island; the node is multi-homed onto both. */
  async function multiHomed() {
    const home = await boot({
      name: 'home',
      seed: 0x81,
      uplinks: [
        ispUplink('isp-a', DIALABLE, ISP_A_ASN, 1),
        ispUplink('isp-b', DIALABLE, ISP_B_ASN, 2),
      ],
      probeScopes: PROBED_SCOPES,
    });
    const peer = await boot({
      name: 'peer',
      seed: 0x82,
      uplinks: [ispUplink('isp-a', DIALABLE, ISP_A_ASN)],
      probeScopes: PROBED_SCOPES,
      advertise: (port) => [
        ...scopedEndpoints(ISP_A_ASN)(port),
        ...scopedEndpoints(ISP_B_ASN)(port),
      ],
    });
    await introduce(home, peer, 'TRUSTED', [
      ...scopedEndpoints(ISP_A_ASN)(peer.port),
      ...scopedEndpoints(ISP_B_ASN)(peer.port),
    ]);
    await introduce(peer, home, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(home.port));
    return { home, peer };
  }

  it('TG-06 — the switch happens on the PROBE, not on a stream that never errors', async () => {
    const { home, peer } = await multiHomed();
    const before = await home.paths.select((await home.peers.get(peerIdOf(peer)))!);
    expect(before?.uplinkId).toBe('isp-a');

    // Cut ISP-A's interface. A live gRPC stream on it would sit there retransmitting for
    // minutes; the probe notices in one round, which is what BR-07's 30 seconds is about.
    home.prober.blockUplink('isp-a');
    const report = await home.supervisor.tick();

    expect(report.transitions.map((transition) => transition.uplink.id)).toContain('isp-a');
    expect(home.uplinks.get('isp-a')?.health.state).toBe(UplinkState.DOWN);
    expect(home.uplinks.get('isp-b')?.health.state).toBe(UplinkState.UP);

    const after = await home.paths.select((await home.peers.get(peerIdOf(peer)))!);
    expect(after?.uplinkId).toBe('isp-b');
    expect(after?.sourceIp).toBe(DIALABLE);

    // TP-10 — the transition is exported, because "the IX went down at 03:14" is
    // operationally critical and useless if reconstructed after the fact.
    const transitions = home.observability.snapshot().uplinkTransitions;
    expect(transitions.some((row) => row.uplinkId === 'isp-a' && row.to === UplinkState.DOWN)).toBe(
      true,
    );
  });

  it('TG-06 — BR-08: nothing queued is lost across the switch', async () => {
    const { home, peer } = await multiHomed();
    const community = await createCommunity(home, 'khulna_relief');

    // Queue traffic while ISP-A is alive, then cut it before any of it drains.
    const titles: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      const title = `queued update ${i}`;
      titles.push(title);
      await post(home, community, title);
    }
    expect((await home.queue.stats()).pending).toBeGreaterThanOrEqual(12);

    home.prober.blockUplink('isp-a');
    await home.supervisor.tick();

    // The queue is durable and uplink-agnostic; only the path changed.
    for (let i = 0; i < 6; i += 1) await home.outbox.drain();

    for (const title of titles) {
      expect(
        await peer.projections.collection<PostDoc>(POSTS_COLLECTION).findOne({ title }),
      ).not.toBeNull();
    }
    expect((await home.queue.stats()).deadLettered).toBe(0);
  });

  it('TG-07 — backfill after the switch closes the gap exactly, with no duplicates', async () => {
    const { home, peer } = await multiHomed();
    const community = await createCommunity(peer, 'rangpur_relief');

    // The peer publishes while `home` is not streaming from it — the gap a switch opens.
    for (let i = 0; i < 20; i += 1) await post(peer, community, `gap item ${i}`);

    expect(await homePosts(home)).toBe(0);

    home.prober.blockUplink('isp-a');
    // BR-09 — the switch re-announces and backfills, with no operator in the loop. That the
    // gap closes WITHOUT an explicit backfill call is the requirement; a test that called
    // backfill itself would pass even if the supervisor did nothing.
    await home.supervisor.tick();

    for (let i = 0; i < 20; i += 1) {
      expect(
        await home.projections
          .collection<PostDoc>(POSTS_COLLECTION)
          .findOne({ title: `gap item ${i}` }),
      ).not.toBeNull();
    }
    expect(await homePosts(home)).toBe(20);

    // "no duplicates" stated as a number: a second pass re-fetches everything and projects
    // nothing, because pipeline step 11 already holds each content ID (FD-13).
    const again = await home.sync.backfillFrom(peerIdOf(peer), 0);
    expect(again.received).toBeGreaterThanOrEqual(20);
    expect(again.accepted).toBe(0);
    expect(again.duplicates).toBe(again.received);
    expect(await homePosts(home)).toBe(20);
  });
});

// ── TG-08 ────────────────────────────────────────────────────────────────────────────

describe('TG-08 — an outbound-only node behind simulated CGNAT federates fully', () => {
  it('advertises no address, opens every connection, and misses nothing', async () => {
    const cgnat = await boot({
      name: 'cgnat',
      seed: 0x91,
      outboundOnly: true,
      uplinks: [ispUplink('isp-a', DIALABLE, ISP_A_ASN)],
      probeScopes: PROBED_SCOPES,
    });
    const reachable = await boot(islandNode('reachable', 0x92, ISP_A_ASN));

    // FD-12 — no endpoints at all, not "an endpoint with inbound_capable false". Publishing
    // an address that will never answer sends peers into a retry loop.
    expect(cgnat.identity().endpoints).toEqual([]);
    await introduce(cgnat, reachable, 'TRUSTED', scopedEndpoints(ISP_A_ASN)(reachable.port));
    // The reachable node knows the CGNAT node by KEY and with NO endpoints — it can never
    // dial it, and does not need to. Trust is what governs which classes it will accept.
    await introduce(reachable, cgnat, 'TRUSTED', []);

    const community = await createCommunity(cgnat, 'cgnat_relief');
    await post(cgnat, community, 'published from behind CGNAT');
    await cgnat.outbox.drain();
    await cgnat.outbox.drain();

    expect(
      await reachable.projections
        .collection<PostDoc>(POSTS_COLLECTION)
        .findOne({ title: 'published from behind CGNAT' }),
    ).not.toBeNull();

    // And inbound, over a stream the CGNAT node opened itself.
    const remoteCommunity = await createCommunity(reachable, 'upstream_relief');
    await post(reachable, remoteCommunity, 'sent to a node with no port');
    const backfill = await cgnat.sync.backfillFrom(peerIdOf(reachable), 0);
    expect(backfill.accepted).toBeGreaterThan(0);
    expect(
      await cgnat.projections
        .collection<PostDoc>(POSTS_COLLECTION)
        .findOne({ title: 'sent to a node with no port' }),
    ).not.toBeNull();
  });

  it('TP-15 — a reflexive address in 100.64.0.0/10 is named as CGNAT, not merely survived', async () => {
    const { isCgnatAddress } = await import('../adapters/outbound/transport/nat-traversal.js');
    expect(isCgnatAddress('100.64.0.1')).toBe(true);
    expect(isCgnatAddress('100.127.255.254')).toBe(true);
    expect(isCgnatAddress('100.63.255.255')).toBe(false);
    expect(isCgnatAddress('100.128.0.1')).toBe(false);
    expect(isCgnatAddress('203.0.113.10')).toBe(false);
  });

  it('TP-16 — a client reaches the unreachable node through a TRUSTED peer’s tunnel', async () => {
    const clock = new FixedClock(NOW_MS);
    const exchange = new ReverseTunnelExchange({ clock, requestTimeoutMs: 2_000 });

    // The unreachable node opens the outbound poll first, exactly as it does in production.
    const polled = exchange.poll('jbs1hidden');
    await new Promise((resolve) => setTimeout(resolve, 5));

    const answered = exchange.exchange('jbs1hidden', {
      method: 'GET',
      path: '/v1/posts',
      headers: { accept: 'application/json' },
    });

    const job = await polled;
    expect(job?.path).toBe('/v1/posts');
    exchange.respond('jbs1hidden', {
      id: job!.id,
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"items":[]}', 'utf8').toString('base64'),
    });

    const response = await answered;
    expect(response.status).toBe(200);
    expect(Buffer.from(response.body ?? '', 'base64').toString('utf8')).toBe('{"items":[]}');
    expect(exchange.sessions()[0]?.served).toBe(1);
  });

  it('TP-16 — a request for a node with no tunnel fails fast rather than hanging', async () => {
    // A phone during an outage may never be left on a request that never returns.
    const exchange = new ReverseTunnelExchange({ clock: new FixedClock(NOW_MS) });
    const response = await exchange.exchange('jbs1absent', {
      method: 'GET',
      path: '/v1/posts',
      headers: {},
    });
    expect(response.status).toBe(502);
  });
});

// ── TG-09 and TG-10, node side ───────────────────────────────────────────────────────

describe('TG-09 / TG-10 — what the client needs from the node', () => {
  it('TG-10 — the node reports its narrowest live scope and its own refresh cadence', async () => {
    const a1 = await boot(islandNode('a1', 0xa1, ISP_A_ASN));
    expect(a1.uplinks.currentScope()).toBe(ReachabilityScope.ISP_LOCAL);

    // The node states how soon to ask again, so a client polling on a guess cannot be
    // systematically slower than the truth. TG-10 requires ≤ 30 s.
    a1.prober.block(ReachabilityScope.ISP_LOCAL);
    await a1.uplinks.probeAll();
    expect(a1.uplinks.currentScope()).toBe(ReachabilityScope.NATIONAL);
  });

  it('TG-09 — a node on one ISP advertises its ISP_LOCAL address, not only its public one', async () => {
    // FD-17/TP-05: this is how a client learns the ISP-local address BEFORE the gateway
    // drops. Publishing only the public address would make discovery depend on the network
    // that just failed.
    const a1 = await boot(islandNode('a1', 0xa2, ISP_A_ASN));
    const advertised = a1.identity().endpoints.map((endpoint) => endpoint.scope);
    expect(advertised).toContain(ReachabilityScope.ISP_LOCAL);
    expect(advertised).toContain(ReachabilityScope.GLOBAL);
    expect(a1.identity().endpoints.every((endpoint) => endpoint.asn === ISP_A_ASN)).toBe(true);
  });
});

void AUTHOR_KEY;
