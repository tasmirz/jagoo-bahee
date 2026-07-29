/**
 * The `Federation` gRPC service — an INBOUND ADAPTER (T2.1, ADR-007).
 *
 * It decodes frames, authenticates the caller, calls the application service, and encodes
 * the answer. Every decision it appears to make is made somewhere else:
 *
 *   trust and admission   `core/domain/federation/trust.ts`, `announce.ts`
 *   quota and classes     `core/domain/federation/quota.ts`
 *   filtering             `core/domain/federation/stream-filter.ts`
 *   verification          the 19-step pipeline, unchanged, via `FederationInbox`
 *
 * That is why FG-01…FG-10 are provable without a socket, and why this file has no branch
 * on domain, plane-specific special case, or trust arithmetic in it.
 *
 * Not a Nest microservice. ADR-007 records why: `@nestjs/microservices` loads `.proto`
 * files at runtime through `@grpc/proto-loader`, which reintroduces a second source of
 * contract truth outside the AR-10 regenerate-and-diff gate, discards the generated codecs
 * (including `forceLong=bigint`, which `created_at_ms` depends on), and exposes streams as
 * RxJS observables where this adapter wants `for await`.
 */

import { ServerError, Status, type CallContext } from 'nice-grpc';
import type {
  AnnounceRequest,
  BackfillRequest,
  Plane as WirePlane,
  Priority as WirePriority,
  StreamRequest} from '@jagoo/sdk/proto';
import {
  AnnounceResponse,
  DeliverAck,
  DirectoryExchange,
  TreeHeadExchange,
  type TrustLevel,
  type PeerEndpoint as WireEndpoint,
} from '@jagoo/sdk/proto';
import {
  announceResponseSigningBytes,
  directoryExchangeSigningBytes,
  treeHeadExchangeSigningBytes,
} from '@jagoo/sdk';
import { Plane, type Priority } from '../../../core/domain/envelope.js';
import { EnvelopeRejected } from '../../../core/domain/errors.js';
import { soleRequestedPlane } from '../../../core/domain/federation/stream-filter.js';
import {
  WIRE_BY_SCOPE,
  type FederationInbox,
  type NodeIdentity,
} from '../../../core/app/federation-inbox.js';
import { TRUST_LEVEL_WIRE } from '../../../core/domain/federation/trust.js';
import {
  PeerTrust,
  type FederationLedger,
  type PeerDirectory,
  type PeerEndpoint,
  type PeerRecord,
  type PeerVouch,
  type StreamFilter,
} from '../../../core/ports/network.port.js';
import type { NodeSigner } from '../../../core/ports/node-signer.port.js';
import type { SignedTreeHead, WitnessLog } from '../../../core/ports/transparency.port.js';
import type { Clock } from '../../../core/ports/system.port.js';
import { grpcStatusFor, toWireErrorCode } from './error-map.js';
import { verifyCallMetadata } from './peer-auth.js';

/** How many envelopes one `StreamActivities` / `Backfill` response may carry per pass. */
const DEFAULT_STREAM_LIMIT = 500;
const MAX_BACKFILL = 5_000;

/**
 * FD-05 — how many of our own vouches one handshake may carry.
 *
 * Bounded because the receiver stores what it ingests: an unbounded list would let a peer
 * grow another node's directory for free by handshaking repeatedly. Vouches are operator
 * assertions and are few by nature, so this ceiling is generous rather than restrictive.
 */
const MAX_GOSSIPED_VOUCHES = 64;

export interface FederationServiceDeps {
  readonly inbox: FederationInbox;
  readonly peers: PeerDirectory;
  readonly ledger: FederationLedger;
  readonly witness: WitnessLog;
  readonly signer: NodeSigner;
  readonly clock: Clock;
  readonly identity: () => NodeIdentity;
  /** FD-12 — an outbound-only node advertises no endpoints even when asked directly. */
  readonly outboundOnly?: boolean;
}

/**
 * The wire integer for a trust level, as the generated enum type.
 *
 * Values come from `TRUST_LEVEL_WIRE` in the domain rather than being restated here: the
 * same integers are covered by `ServerVouch` signatures, so a second table that drifted by
 * one would invalidate every vouch silently instead of failing to compile.
 */
const TRUST_TO_WIRE = TRUST_LEVEL_WIRE as Readonly<Record<PeerTrust, TrustLevel>>;

export class FederationService {
  constructor(private readonly deps: FederationServiceDeps) {}

  // ── T2.2 — Announce (FG-01) ───────────────────────────────────────────────────────

  announce = async (request: AnnounceRequest): Promise<AnnounceResponse> => {
    let admission;
    try {
      admission = await this.deps.inbox.announce(
        {
          serverKey: request.server_key,
          displayName: request.display_name,
          software: request.software,
          version: request.version,
          endpoints: request.endpoints.map(fromWireEndpoint),
          communities: request.communities,
          channels: request.channels,
          planes: request.planes,
          acceptedClasses: request.accepted_classes,
          ...(request.current_sth
            ? {
                currentSth: {
                  serverKey: request.current_sth.server_key,
                  treeSize: request.current_sth.tree_size,
                  rootHash: request.current_sth.root_hash,
                  timestampMs: request.current_sth.timestamp_ms,
                  signature: request.current_sth.signature,
                },
              }
            : {}),
          timestampMs: request.timestamp_ms,
          nonce: request.nonce,
        },
        request.signature,
      );
    } catch (error) {
      throw this.toServerError(error);
    }

    const identity = this.deps.identity();
    const sth = await this.deps.witness.currentSth();
    const endpoints = this.deps.outboundOnly ? [] : identity.endpoints;
    const vouches = await this.ownVouches();

    const fields = {
      serverKey: identity.publicKey,
      assigned: TRUST_TO_WIRE[admission.assigned],
      endpoints: endpoints.map(toSignableEndpoint),
      vouches: vouches.map(toSignableVouch),
      grantedQuota: {
        envelopesPerMin: admission.quota.envelopesPerMin,
        bytesPerMin: BigInt(admission.quota.bytesPerMin),
        maxConcurrentStreams: admission.quota.maxConcurrentStreams,
        allowedClasses: admission.quota.allowedClasses as readonly number[],
      },
      currentSth: toSignableSth(sth),
    };

    return AnnounceResponse.fromPartial({
      server_key: identity.publicKey,
      assigned: TRUST_TO_WIRE[admission.assigned],
      endpoints: endpoints.map(toWireEndpoint),
      vouches: vouches.map(toWireVouch),
      granted_quota: {
        envelopes_per_min: admission.quota.envelopesPerMin,
        bytes_per_min: BigInt(admission.quota.bytesPerMin),
        max_concurrent_streams: admission.quota.maxConcurrentStreams,
        allowed_classes: [...admission.quota.allowedClasses] as WirePriority[],
      },
      current_sth: toWireSth(sth),
      signature: this.deps.signer.sign(announceResponseSigningBytes(fields)),
    });
  };

  /**
   * The vouches THIS node asserts, for the handshake to carry (FD-05).
   *
   * Only our own. Relaying a third party's vouch would be unattributable: `ServerVouch`
   * has no asserter field, so the asserter is contextual — it is whoever signed the
   * response. Passing someone else's signed vouch through would present it as ours, which
   * is both a lie and unverifiable by the recipient.
   */
  private async ownVouches(): Promise<readonly PeerVouch[]> {
    const ours = Buffer.from(this.deps.identity().publicKey);
    const collected: PeerVouch[] = [];
    for (const peer of await this.deps.peers.all()) {
      for (const vouch of peer.vouches ?? []) {
        if (!ours.equals(Buffer.from(vouch.asserterKey))) continue;
        collected.push(vouch);
        if (collected.length >= MAX_GOSSIPED_VOUCHES) return collected;
      }
    }
    return collected;
  }

  // ── T2.4 — Deliver (FG-05, FG-06, FG-09, FG-10) ───────────────────────────────────

  deliver = async (
    frames: AsyncIterable<Uint8Array>,
    context: CallContext,
  ): Promise<DeliverAck> => {
    const peer = this.requireCaller('Deliver', context);
    // A blocked or unknown peer must learn WHY, in the typed contract, not as an opaque
    // `UNKNOWN: Unknown server error occurred`. An untyped failure is indistinguishable
    // from a crash, so the peer's outbox retries it forever instead of reporting it.
    try {
      await this.deps.inbox.requirePeer(peer.serverId);
    } catch (error) {
      throw this.toServerError(error);
    }

    // FG-10 — one plane per stream. The plane of the FIRST frame fixes the stream's plane
    // and every later frame is checked against it, so a peer cannot start a Forum stream
    // and slip a Signal envelope into it halfway through.
    const collected: Uint8Array[] = [];
    for await (const frame of frames) collected.push(frame);

    const streamPlane = firstFramePlane(collected);
    const outcome = await this.deps.inbox.deliver(peer.serverId, collected, streamPlane);

    return DeliverAck.fromPartial({
      accepted: [...outcome.accepted],
      rejected: outcome.rejected.map((rejection) => ({
        content_id: rejection.contentId,
        code: toWireErrorCode(rejection.code),
        detail: rejection.detail,
      })),
      backpressure_hint_ms: outcome.backpressureHintMs,
      our_log_size: BigInt(outcome.ourLogSize),
    });
  };

  // ── T2.5 — StreamActivities (FG-02, FG-03) ────────────────────────────────────────

  streamActivities = async function* (
    this: FederationService,
    request: StreamRequest,
    context: CallContext,
  ): AsyncIterable<Uint8Array> {
    const peer = this.requireCaller('StreamActivities', context);
    try {
      await this.deps.inbox.requirePeer(peer.serverId);
    } catch (error) {
      throw this.toServerError(error);
    }

    const filter = toFilter(request);
    // FG-10 — a request that names more than one plane is refused rather than served with
    // a mixed stream. The caller opens one stream per plane; the type in
    // `soleRequestedPlane` makes forgetting that a compile error on our own client.
    if (request.planes.length > 1) {
      throw new ServerError(Status.INVALID_ARGUMENT, 'a stream carries exactly one plane');
    }
    if (soleRequestedPlane(filter) === null && request.planes.length === 0) {
      // An unrestricted request defaults to FORUM rather than to "everything". Defaulting
      // to everything is how a Signal envelope ends up in a Forum peer's stream.
      filter.planes = [Plane.FORUM];
    }

    for await (const item of this.deps.inbox.select(filter, DEFAULT_STREAM_LIMIT)) {
      yield item.raw;
    }
  };

  // ── T2.9 — Backfill (FG-04) ───────────────────────────────────────────────────────

  backfill = async function* (
    this: FederationService,
    request: BackfillRequest,
    context: CallContext,
  ): AsyncIterable<Uint8Array> {
    const peer = this.requireCaller('Backfill', context);
    try {
      await this.deps.inbox.requirePeer(peer.serverId);
    } catch (error) {
      throw this.toServerError(error);
    }

    if (request.planes.length > 1) {
      throw new ServerError(Status.INVALID_ARGUMENT, 'a stream carries exactly one plane');
    }

    const filter: StreamFilter = {
      communities: request.communities,
      channels: request.channels,
      planes: request.planes.length > 0 ? (request.planes as unknown as Plane[]) : [Plane.FORUM],
      sinceIndex: Number(request.from_index),
    };
    // `to_index: 0` means "to the end of my log" — the caller cannot know where that is,
    // because ID-01 keeps this node's log positions out of everything it federates.
    const toIndex = request.to_index > 0n ? Number(request.to_index) : undefined;
    const max = request.max > 0 ? Math.min(request.max, MAX_BACKFILL) : MAX_BACKFILL;

    for await (const item of this.deps.inbox.select(filter, max, toIndex)) {
      yield item.raw;
    }
  };

  // ── T2.12 — ExchangeTreeHeads (FG-08) ─────────────────────────────────────────────

  exchangeTreeHeads = async (request: TreeHeadExchange): Promise<TreeHeadExchange> => {
    const identity = this.deps.identity();

    if (request.sth && request.server_key.length > 0) {
      const claimed = await this.findPeer(request.server_key);
      if (claimed) {
        await this.deps.inbox.observePeerSth(claimed, {
          serverKey: request.sth.server_key,
          treeSize: Number(request.sth.tree_size),
          rootHash: request.sth.root_hash,
          timestampMs: Number(request.sth.timestamp_ms),
          signature: request.sth.signature,
        });
      }
    }

    // FD-10 — pass on what other peers told us, so a peer showing different logs to
    // different partners is caught by whoever compares two of those views.
    const observed: {
      peer: PeerRecord;
      sth: SignedTreeHead;
    }[] = [];
    for (const peer of await this.deps.peers.all()) {
      const sth = await this.deps.ledger.lastPeerSth(peer.serverId);
      if (sth) observed.push({ peer, sth });
    }

    const mine = await this.deps.witness.currentSth();
    const nowMs = this.deps.clock.nowMs();
    const fields = {
      serverKey: identity.publicKey,
      sth: toSignableSth(mine),
      observed: observed.map(({ peer, sth }) => ({
        peerKey: peer.publicKey,
        sth: toSignableSth(sth),
        observedAtMs: BigInt(nowMs),
      })),
    };

    return TreeHeadExchange.fromPartial({
      server_key: identity.publicKey,
      sth: toWireSth(mine),
      observed: observed.map(({ peer, sth }) => ({
        peer_key: peer.publicKey,
        sth: toWireSth(sth),
        observed_at_ms: BigInt(nowMs),
      })),
      signature: this.deps.signer.sign(treeHeadExchangeSigningBytes(fields)),
    });
  };

  // ── T2.13 — ExchangeDirectory ─────────────────────────────────────────────────────

  exchangeDirectory = async (_request: DirectoryExchange): Promise<DirectoryExchange> => {
    const nowMs = this.deps.clock.nowMs();
    // Blocked peers are omitted rather than published as blocked. A directory naming who
    // this node blocked is a list of targets for whoever wanted them blocked.
    const peers = (await this.deps.peers.all()).filter((peer) => peer.trust !== PeerTrust.BLOCKED);

    const signable = peers.map((peer) => ({
      serverKey: peer.publicKey,
      displayName: peer.displayName ?? '',
      endpoints: peer.endpoints.map(toSignableEndpoint),
      trust: TRUST_TO_WIRE[peer.trust],
      vouchedBy: (peer.vouches ?? []).map((vouch) => vouch.asserterKey),
      communities: peer.communities ?? [],
      channels: peer.channels ?? [],
      planes: (peer.planes ?? []) as readonly number[],
      isBridge: peer.isBridge ?? false,
      bridgedAsns: peer.bridgedAsns ?? [],
      lastSeenMs: BigInt(peer.lastSeenMs),
    }));

    return DirectoryExchange.fromPartial({
      peers: peers.map((peer) => ({
        server_key: peer.publicKey,
        display_name: peer.displayName ?? '',
        endpoints: peer.endpoints.map(toWireEndpoint),
        trust: TRUST_TO_WIRE[peer.trust],
        vouched_by: (peer.vouches ?? []).map((vouch) => vouch.asserterKey),
        communities: [...(peer.communities ?? [])],
        channels: [...(peer.channels ?? [])],
        planes: (peer.planes ?? []) as unknown as WirePlane[],
        is_bridge: peer.isBridge ?? false,
        bridged_asns: [...(peer.bridgedAsns ?? [])],
        last_seen_ms: BigInt(peer.lastSeenMs),
      })),
      generated_at_ms: BigInt(nowMs),
      signature: this.deps.signer.sign(
        directoryExchangeSigningBytes({ peers: signable, generatedAtMs: BigInt(nowMs) }),
      ),
    });
  };

  // ── Shared ────────────────────────────────────────────────────────────────────────

  private requireCaller(method: string, context: CallContext) {
    const identity = verifyCallMetadata(method, context.metadata, this.deps.clock.nowMs());
    if (!identity) {
      throw new ServerError(Status.UNAUTHENTICATED, 'call is not signed by a known peer key');
    }
    return identity;
  }

  private async findPeer(key: Uint8Array): Promise<PeerRecord | null> {
    for (const peer of await this.deps.peers.all()) {
      if (peer.publicKey.length === key.length && peer.publicKey.every((b, i) => b === key[i])) {
        return peer;
      }
    }
    return null;
  }

  private toServerError(error: unknown): ServerError {
    if (error instanceof EnvelopeRejected) {
      return new ServerError(grpcStatusFor(error.code), `${error.code}: ${error.message}`);
    }
    // ER-02 — never describe an internal failure to a peer.
    return new ServerError(Status.INTERNAL, 'request could not be processed');
  }
}

/**
 * The plane a `Deliver` stream is carrying, taken from its first parsable frame.
 *
 * Returns undefined for an empty or wholly unparsable batch, in which case there is no
 * plane to enforce and every frame will be rejected on its own merits anyway.
 */
function firstFramePlane(frames: readonly Uint8Array[]): Plane | undefined {
  for (const frame of frames) {
    const plane = peekPlane(frame);
    if (plane !== undefined) return plane;
  }
  return undefined;
}

/**
 * Read field 2 (`plane`) without a full parse.
 *
 * This is a ROUTING HINT that fixes which plane a `Deliver` stream is carrying. The
 * authoritative decode still happens inside the pipeline, over the untouched bytes, so a
 * frame this cannot read is not thereby accepted — it is merely not allowed to define the
 * stream's plane, and the guard then rejects it against whatever plane the stream already
 * has. Reading the field here rather than fully decoding keeps step 1 (SIZE) and step 2
 * (PARSE) as the first real work done on peer input, which is what VP-01 is for.
 */
function peekPlane(frame: Uint8Array): Plane | undefined {
  const cursor = { at: 0 };
  while (cursor.at < frame.length) {
    const tag = readVarint(frame, cursor);
    if (tag === null) return undefined;
    const field = tag >>> 3;
    const wire = tag & 0x07;
    if (field === 2 && wire === 0) {
      const value = readVarint(frame, cursor);
      if (value === null) return undefined;
      return value === Plane.SIGNAL ? Plane.SIGNAL : Plane.FORUM;
    }
    if (!skipField(frame, wire, cursor)) return undefined;
  }
  return undefined;
}

function readVarint(frame: Uint8Array, cursor: { at: number }): number | null {
  let value = 0;
  let shift = 0;
  while (cursor.at < frame.length) {
    const byte = frame[cursor.at++] as number;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7;
    if (shift > 28) return null;
  }
  return null;
}

function skipField(frame: Uint8Array, wire: number, cursor: { at: number }): boolean {
  if (wire === 0) return readVarint(frame, cursor) !== null;
  if (wire === 2) {
    const length = readVarint(frame, cursor);
    if (length === null) return false;
    cursor.at += length;
    return true;
  }
  if (wire === 5) {
    cursor.at += 4;
    return true;
  }
  if (wire === 1) {
    cursor.at += 8;
    return true;
  }
  return false;
}

function toFilter(request: StreamRequest): StreamFilter & { planes?: Plane[] } {
  return {
    communities: request.communities,
    channels: request.channels,
    planes: request.planes as unknown as Plane[],
    classes: request.classes as unknown as Priority[],
    sinceIndex: Number(request.since_index),
  };
}

// NOTE: this shape feeds `announceRequestSigningBytes`, so every field must be present in
// its wire form — a zero ASN is part of the bytes the peer signed and dropping it here would
// break verification. The directory-facing conversion, where a zero must become "absent", is
// `fromWireEndpoint` in `federation-client.ts`.
function fromWireEndpoint(endpoint: WireEndpoint) {
  return {
    uri: endpoint.uri,
    scope: endpoint.scope,
    asn: endpoint.asn,
    ispName: endpoint.isp_name,
    region: endpoint.region,
    inboundCapable: endpoint.inbound_capable,
    lastOkAtMs: endpoint.last_ok_at_ms,
    rttMs: endpoint.rtt_ms,
    consecutiveFailures: endpoint.consecutive_failures,
  };
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

function toSignableVouch(vouch: PeerVouch) {
  return {
    peerKey: vouch.peerKey,
    level: TRUST_LEVEL_WIRE[vouch.level],
    note: vouch.note,
    assertedAtMs: BigInt(vouch.assertedAtMs),
  };
}

function toWireVouch(vouch: PeerVouch) {
  return {
    peer_key: vouch.peerKey,
    level: TRUST_TO_WIRE[vouch.level],
    note: vouch.note,
    asserted_at_ms: BigInt(vouch.assertedAtMs),
    signature: vouch.signature,
  };
}

function toSignableSth(sth: SignedTreeHead) {
  return {
    serverKey: sth.serverKey,
    treeSize: BigInt(sth.treeSize),
    rootHash: sth.rootHash,
    timestampMs: BigInt(sth.timestampMs),
    signature: sth.signature,
  };
}

function toWireSth(sth: SignedTreeHead) {
  return {
    server_key: sth.serverKey,
    tree_size: BigInt(sth.treeSize),
    root_hash: sth.rootHash,
    timestamp_ms: BigInt(sth.timestampMs),
    signature: sth.signature,
  };
}
