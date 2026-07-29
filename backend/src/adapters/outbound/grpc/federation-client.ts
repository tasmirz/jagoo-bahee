/**
 * `FederationSender` over gRPC — the OUTBOUND adapter (T2.1, T2.11, ADR-007).
 *
 * ── FD-11 / FG-07: every call here is one this node initiated ───────────────────────
 * `Deliver` is client-streaming and `StreamActivities` is caller-initiated server
 * streaming, so a node behind CGNAT pushes its content and receives its peers' content
 * over connections it opened itself. No inbound port, no port forwarding, no UPnP. That is
 * not a fallback mode — it is the default for a home or community node (FD-12), and it is
 * why this file, not the server, is the minimum viable federation participant.
 *
 * ── The channel is per peer and is reused ──────────────────────────────────────────
 * A long-lived HTTP/2 connection is the point: `Plans/05` §1 chose gRPC for federation
 * precisely because links between servers are few, long-lived and operator-controlled.
 * Dialling per call would pay a handshake for every envelope and defeat the choice.
 */

import { createChannel, createClient, type Channel } from 'nice-grpc';
import { ChannelCredentials } from '@grpc/grpc-js';
import {
  AnnounceRequest,
  BackfillRequest,
  DirectoryExchange,
  StreamRequest,
  TreeHeadExchange,
  TrustLevel,
  type PeerEndpoint as WireEndpoint,
} from '@jagoo/sdk/proto';
import { announceRequestSigningBytes } from '@jagoo/sdk';
import { serverId as serverIdOf } from '@jagoo/sdk/core';
import type { Plane } from '../../../core/domain/envelope.js';
import { SCOPE_PREFERENCE } from '../../../core/ports/network.port.js';
import {
  FederationSender,
  PeerTrust,
  type AnnounceOutcome,
  type DeliverOutcome,
  type PathSelector,
  type PeerEndpoint,
  type PeerRecord,
  type PeerSthReport,
  type StreamFilter,
} from '../../../core/ports/network.port.js';
import {
  registerUplinkResolver,
  uplinkChannelOptions,
  uplinkTarget,
} from '../transport/uplink-resolver.js';
import type { NodeSigner } from '../../../core/ports/node-signer.port.js';
import type { Clock, RandomSource } from '../../../core/ports/system.port.js';
import type { SignedTreeHead } from '../../../core/ports/transparency.port.js';
import { FederationWireDefinition } from '../../inbound/grpc/raw-envelope-codec.js';
import type { FederationRpcClient } from '../../inbound/grpc/federation.contract.js';
import { signCallMetadata } from '../../inbound/grpc/peer-auth.js';
import { fromWireErrorCode } from '../../inbound/grpc/error-map.js';
import { WIRE_BY_SCOPE, type NodeIdentity } from '../../../core/app/federation-inbox.js';

const WIRE_TO_TRUST: Readonly<Record<number, PeerTrust>> = {
  [TrustLevel.TRUST_LEVEL_UNSPECIFIED]: PeerTrust.UNSPECIFIED,
  [TrustLevel.TRUST_LEVEL_BLOCKED]: PeerTrust.BLOCKED,
  [TrustLevel.TRUST_LEVEL_PROBATION]: PeerTrust.PROBATION,
  [TrustLevel.TRUST_LEVEL_NORMAL]: PeerTrust.NORMAL,
  [TrustLevel.TRUST_LEVEL_TRUSTED]: PeerTrust.TRUSTED,
};

interface DialedPeer {
  readonly client: FederationRpcClient;
  readonly endpoint: PeerEndpoint;
  /** Wraps one RPC so its outcome reaches `PathSelector.recordOutcome` (TP-02, TP-12). */
  readonly observe: <T>(call: () => Promise<T>) => Promise<T>;
}

const SCOPE_BY_WIRE: Readonly<Record<number, PeerEndpoint['scope']>> = {
  1: 'GLOBAL',
  2: 'NATIONAL',
  3: 'ISP_LOCAL',
  4: 'LAN',
  5: 'MESH',
  6: 'RETICULUM',
};

export interface FederationClientDeps {
  readonly signer: NodeSigner;
  readonly clock: Clock;
  readonly random: RandomSource;
  readonly identity: () => NodeIdentity;
  /** Injected so tests can dial an in-process server without TLS. */
  readonly credentials?: ChannelCredentials;
  /**
   * P3 — the uplink-aware path selector (T3.3, T3.4, TP-08).
   *
   * Optional, and its absence is the P2 behaviour: dial the narrowest endpoint the peer
   * advertises, let the OS pick the interface. Present, it also decides WHICH uplink carries
   * the connection and binds the socket to that uplink's source address, and it is told
   * whether the dial worked so TP-12's backoff and TP-02's per-scope metric are fed by what
   * actually happened rather than by what was attempted.
   */
  readonly paths?: PathSelector;
}

export class GrpcFederationSender extends FederationSender {
  private readonly channels = new Map<string, Channel>();

  constructor(private readonly deps: FederationClientDeps) {
    super();
    if (deps.paths) registerUplinkResolver();
  }

  async announce(peer: PeerRecord): Promise<AnnounceOutcome> {
    const dialed = await this.dial(peer);
    const client = dialed.client;
    const identity = this.deps.identity();
    const nowMs = this.deps.clock.nowMs();
    const nonce = this.deps.random.bytes(16);

    const fields = {
      serverKey: identity.publicKey,
      displayName: identity.displayName,
      software: identity.software,
      version: identity.version,
      endpoints: identity.endpoints.map(toSignableEndpoint),
      communities: identity.communities,
      channels: identity.channels,
      planes: identity.planes as readonly number[],
      acceptedClasses: identity.acceptedClasses as readonly number[],
      currentSth: undefined,
      timestampMs: BigInt(nowMs),
      nonce,
    };

    const response = await dialed.observe(() => client.announce(
      AnnounceRequest.fromPartial({
        server_key: identity.publicKey,
        display_name: identity.displayName,
        software: identity.software,
        version: identity.version,
        endpoints: identity.endpoints.map(toWireEndpoint),
        communities: [...identity.communities],
        channels: [...identity.channels],
        planes: [...identity.planes] as unknown as number[],
        accepted_classes: [...identity.acceptedClasses] as unknown as number[],
        timestamp_ms: BigInt(nowMs),
        nonce,
        signature: this.deps.signer.sign(announceRequestSigningBytes(fields)),
      }),
      { metadata: this.callMetadata('Announce') },
    ));

    return {
      peerKey: response.server_key,
      assigned: WIRE_TO_TRUST[response.assigned] ?? PeerTrust.UNSPECIFIED,
      endpoints: response.endpoints.map(fromWireEndpoint),
      sth: response.current_sth ? fromWireSth(response.current_sth) : null,
      quota: response.granted_quota
        ? {
            envelopesPerMin: response.granted_quota.envelopes_per_min,
            bytesPerMin: Number(response.granted_quota.bytes_per_min),
            maxConcurrentStreams: response.granted_quota.max_concurrent_streams,
            allowedClasses: response.granted_quota.allowed_classes as never,
          }
        : null,
      // FD-05: the asserter is contextual — `ServerVouch` carries no asserter field, so it
      // is whoever signed this response. Attributing to `response.server_key` is what makes
      // the signature checkable; taking the asserter from the payload would let a peer
      // forge opinions in someone else's name.
      vouches: response.vouches.map((vouch) => ({
        asserterKey: response.server_key,
        peerKey: vouch.peer_key,
        level: WIRE_TO_TRUST[vouch.level] ?? PeerTrust.UNSPECIFIED,
        note: vouch.note,
        assertedAtMs: Number(vouch.asserted_at_ms),
        signature: vouch.signature,
      })),
    };
  }

  /**
   * FG-10 — one call, one plane.
   *
   * The plane is a required parameter rather than something inferred from the batch,
   * because inferring it would make "the batch happened to be homogeneous" and "the batch
   * is guaranteed homogeneous" indistinguishable at the call site.
   */
  async deliver(
    peer: PeerRecord,
    _plane: Plane,
    envelopes: readonly Uint8Array[],
  ): Promise<DeliverOutcome> {
    const dialed = await this.dial(peer);
    const metadata = this.callMetadata('Deliver');
    const ack = await dialed.observe(() => dialed.client.deliver(
      (async function* () {
        for (const raw of envelopes) yield raw;
      })(),
      { metadata },
    ));
    return {
      accepted: ack.accepted,
      rejected: ack.rejected.map((rejection) => ({
        contentId: rejection.content_id,
        code: fromWireErrorCode(rejection.code),
        detail: rejection.detail,
      })),
      backpressureHintMs: ack.backpressure_hint_ms,
      ourLogSize: Number(ack.our_log_size),
    };
  }

  async *streamActivities(
    peer: PeerRecord,
    filter: StreamFilter,
    signal: AbortSignal,
  ): AsyncIterable<Uint8Array> {
    const { client } = await this.dial(peer);
    for await (const raw of client.streamActivities(
      StreamRequest.fromPartial({
        communities: [...(filter.communities ?? [])],
        channels: [...(filter.channels ?? [])],
        planes: [...(filter.planes ?? [])] as unknown as number[],
        classes: [...(filter.classes ?? [])] as unknown as number[],
        since_index: BigInt(filter.sinceIndex ?? 0),
      }),
      { metadata: this.callMetadata('StreamActivities'), signal },
    )) {
      yield raw;
    }
  }

  async *backfill(
    peer: PeerRecord,
    filter: StreamFilter & { fromIndex: number; toIndex?: number; max?: number },
  ): AsyncIterable<Uint8Array> {
    const { client } = await this.dial(peer);
    for await (const raw of client.backfill(
      BackfillRequest.fromPartial({
        communities: [...(filter.communities ?? [])],
        channels: [...(filter.channels ?? [])],
        planes: [...(filter.planes ?? [])] as unknown as number[],
        from_index: BigInt(filter.fromIndex),
        to_index: BigInt(filter.toIndex ?? 0),
        max: filter.max ?? 0,
      }),
      { metadata: this.callMetadata('Backfill') },
    )) {
      yield raw;
    }
  }

  async exchangeTreeHeads(peer: PeerRecord): Promise<PeerSthReport> {
    const { client } = await this.dial(peer);
    const identity = this.deps.identity();
    const response = await client.exchangeTreeHeads(
      TreeHeadExchange.fromPartial({
        server_key: identity.publicKey,
        observed: [],
        signature: new Uint8Array(0),
      }),
      { metadata: this.callMetadata('ExchangeTreeHeads') },
    );
    return {
      peerKey: response.server_key,
      sth: response.sth ? fromWireSth(response.sth) : null,
      observed: response.observed.map((observation) => ({
        peerKey: observation.peer_key,
        sth: observation.sth ? fromWireSth(observation.sth) : null,
        observedAtMs: Number(observation.observed_at_ms),
      })),
    };
  }

  async exchangeDirectory(peer: PeerRecord): Promise<readonly PeerRecord[]> {
    const { client } = await this.dial(peer);
    const response = await client.exchangeDirectory(
      DirectoryExchange.fromPartial({
        peers: [],
        generated_at_ms: BigInt(this.deps.clock.nowMs()),
        signature: new Uint8Array(0),
      }),
      { metadata: this.callMetadata('ExchangeDirectory') },
    );
    return response.peers.map((record) => ({
      // FD-02 — the identity IS the key. An empty id here was silently upserted under `_id:
      // ''`, so every peer a directory named collapsed into one junk record whose key and
      // endpoints came from different nodes. That record then poisoned FD-10's observation
      // relay and produced a FALSE FORK BLOCK against an honest peer.
      serverId: record.server_key.length > 0 ? serverIdOf(record.server_key) : '',
      publicKey: record.server_key,
      displayName: record.display_name,
      endpoints: record.endpoints.map(fromWireEndpoint),
      trust: WIRE_TO_TRUST[record.trust] ?? PeerTrust.UNSPECIFIED,
      planes: record.planes as never,
      communities: record.communities,
      channels: record.channels,
      isBridge: record.is_bridge,
      bridgedAsns: record.bridged_asns,
      lastSeenMs: Number(record.last_seen_ms),
    }));
  }

  private callMetadata(method: string) {
    return signCallMetadata(
      method,
      this.deps.signer.publicKey,
      (message) => this.deps.signer.sign(message),
      this.deps.clock.nowMs(),
      this.deps.random.bytes(16),
    );
  }

  /**
   * G-04 + TP-08 — dial the NARROWEST scope this peer advertises that we can use, bound to
   * the uplink that reaches it.
   *
   * Not an optimisation. Preferring `LAN` over `ISP_LOCAL` over `NATIONAL` over `GLOBAL`
   * during NORMAL operation is what keeps the resilience path warm: a path only exercised
   * during a blackout is untested code that will fail during a blackout.
   *
   * The returned `observe` wrapper is how TP-02 and TP-12 get their input. It is a wrapper
   * rather than a `try` at each call site because there are six RPCs and the one that forgets
   * to report is the one whose endpoint never backs off.
   */
  private async dial(peer: PeerRecord): Promise<DialedPeer> {
    const selected = await this.deps.paths?.select(peer);
    const endpoint = selected?.endpoint ?? this.narrowestEndpoint(peer);
    if (!endpoint) throw new Error(`peer ${peer.serverId} advertises no dialable endpoint`);
    const hostPort = endpoint.address.replace(/^grpcs?:\/\//, '');

    // Keyed by (source address, destination) — two uplinks to one peer are two connections,
    // and sharing a channel between them would silently collapse the multi-homing TG-01
    // exists to prove.
    const sourceIp = selected?.sourceIp ?? '';
    const key = `${sourceIp}|${hostPort}`;

    let channel = this.channels.get(key);
    if (!channel) {
      const credentials = this.deps.credentials ?? ChannelCredentials.createInsecure();
      channel = sourceIp
        ? createChannel(uplinkTarget(sourceIp, hostPort), credentials, uplinkChannelOptions(hostPort))
        : createChannel(hostPort, credentials);
      this.channels.set(key, channel);
    }

    // See `federation.contract.ts`: nice-grpc's derived request/response types are
    // unusable because ts-proto's `Exact<>` generic is resolved through `Parameters<>`.
    // `FederationRpcClient` states the same contract in the generated message types.
    const client = createClient(
      FederationWireDefinition,
      channel,
    ) as unknown as FederationRpcClient;

    const observe = async <T>(call: () => Promise<T>): Promise<T> => {
      const startedAt = this.deps.clock.nowMs();
      try {
        const result = await call();
        await this.deps.paths?.recordOutcome(
          peer,
          endpoint,
          true,
          Math.max(0, this.deps.clock.nowMs() - startedAt),
        );
        return result;
      } catch (error) {
        await this.deps.paths?.recordOutcome(peer, endpoint, false);
        throw error;
      }
    };

    return { client, endpoint, observe };
  }

  private narrowestEndpoint(peer: PeerRecord): PeerEndpoint | null {
    for (const scope of SCOPE_PREFERENCE) {
      const endpoint = peer.endpoints.find(
        (candidate) => candidate.scope === scope && candidate.address.startsWith('grpc'),
      );
      if (endpoint) return endpoint;
    }
    return peer.endpoints.find((candidate) => candidate.address.startsWith('grpc')) ?? null;
  }

  close(): void {
    for (const channel of this.channels.values()) channel.close();
    this.channels.clear();
  }
}

function toSignableEndpoint(endpoint: PeerEndpoint) {
  return {
    uri: endpoint.address,
    scope: WIRE_BY_SCOPE[endpoint.scope] ?? 0,
    asn: endpoint.asn ?? 0,
    ispName: endpoint.isp ?? '',
    region: endpoint.region ?? '',
    inboundCapable: endpoint.inboundCapable ?? false,
    lastOkAtMs: BigInt(endpoint.lastOkAtMs ?? 0),
    rttMs: endpoint.rttMs ?? 0,
    consecutiveFailures: endpoint.consecutiveFailures ?? 0,
  };
}

function toWireEndpoint(endpoint: PeerEndpoint) {
  return {
    uri: endpoint.address,
    scope: WIRE_BY_SCOPE[endpoint.scope] ?? 0,
    asn: endpoint.asn ?? 0,
    isp_name: endpoint.isp ?? '',
    region: endpoint.region ?? '',
    inbound_capable: endpoint.inboundCapable ?? false,
    last_ok_at_ms: BigInt(endpoint.lastOkAtMs ?? 0),
    rtt_ms: endpoint.rttMs ?? 0,
    consecutive_failures: endpoint.consecutiveFailures ?? 0,
  };
}

/**
 * Proto3 has no absent scalar, so `asn: 0` on the wire means "not stated" — and AS 0 is
 * reserved and never routable, so it can never be a real answer either. Storing the zero as
 * though it were an ASN made every announced endpoint claim membership of AS 0, which
 * matches no uplink; `selectPath`'s same-ASN preference (TP-11) then had nothing to prefer
 * and fell through to the priority number for every peer. On the multi-homed bridge that put
 * every ISP_LOCAL peer on one uplink, left the other side of the pair with no TRUSTED peer,
 * and made BR-01 unsatisfiable. Absent must stay absent.
 */
function fromWireEndpoint(endpoint: WireEndpoint): PeerEndpoint {
  return {
    address: endpoint.uri,
    scope: SCOPE_BY_WIRE[endpoint.scope] ?? 'GLOBAL',
    ...(endpoint.asn > 0 ? { asn: endpoint.asn } : {}),
    isp: endpoint.isp_name,
    region: endpoint.region,
    inboundCapable: endpoint.inbound_capable,
    lastOkAtMs: Number(endpoint.last_ok_at_ms),
    rttMs: endpoint.rtt_ms,
    consecutiveFailures: endpoint.consecutive_failures,
  };
}

function fromWireSth(sth: {
  server_key: Uint8Array;
  tree_size: bigint;
  root_hash: Uint8Array;
  timestamp_ms: bigint;
  signature: Uint8Array;
}): SignedTreeHead {
  return {
    serverKey: sth.server_key,
    treeSize: Number(sth.tree_size),
    rootHash: sth.root_hash,
    timestampMs: Number(sth.timestamp_ms),
    signature: sth.signature,
  };
}
