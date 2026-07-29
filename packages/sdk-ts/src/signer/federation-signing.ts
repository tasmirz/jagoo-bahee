/**
 * Signing bytes for the federation handshake and gossip payloads (P2 / Plans/05 §2).
 *
 * ── These are NOT envelopes, and that is deliberate ─────────────────────────────────
 * `AnnounceRequest`, `AnnounceResponse`, `ServerVouch`, `TreeHeadExchange` and
 * `DirectoryExchange` each carry their own `signature` field and are exchanged over gRPC
 * between servers. They are statements a NODE makes about itself and its peers, not
 * user-authored content, so they never enter the registry, never occupy a `domain` row,
 * and never travel through `POST /v1/envelopes`. Routing them through the envelope
 * pipeline would give a node operator a way to forge user content, which is precisely the
 * conflation `NodeSigner` exists to prevent.
 *
 * ── Why a framed byte string rather than protobuf canonical form ────────────────────
 * The canonical encoder in `core/canonical.ts` implements exactly one accepted form for
 * ONE structure — the envelope — and its whole value is that there is no second one. These
 * five payloads are decoded by ts-proto on arrival and are not re-encoded (ADR-008 §1
 * forbids re-encoding only for `Envelope`, but the same reasoning applies: the signature
 * must cover a form the verifier can reconstruct from the decoded message without
 * depending on how the sender happened to serialise it). `frameParts` gives that: every
 * field is length-prefixed, so `("a", "bc")` and `("ab", "c")` can never produce identical
 * bytes, and a repeated field is itself framed as one part so a list boundary cannot be
 * moved without changing the bytes.
 *
 * ── No floats, ever ────────────────────────────────────────────────────────────────
 * Same rule as the envelope. Every numeric field here is rendered as its decimal integer
 * string; `bigint` is used wherever the wire type is 64-bit, because `timestamp_ms` and
 * `tree_size` are signed over and a double loses precision above 2^53.
 */

import { encodeUtf8Nfc, frameParts } from '../core/wire.js';

const ascii = new TextEncoder();

/** Field-separated integer rendering. Never a float — see the header note. */
const int = (value: bigint | number | boolean): Uint8Array =>
  ascii.encode(typeof value === 'boolean' ? (value ? '1' : '0') : String(value));

const list = (items: readonly Uint8Array[]): Uint8Array => frameParts(items);

/** The peer's own tree head as it appears inside a signed handshake payload. */
export interface FederationTreeHead {
  readonly serverKey: Uint8Array;
  readonly treeSize: bigint;
  readonly rootHash: Uint8Array;
  readonly timestampMs: bigint;
  readonly signature: Uint8Array;
}

/**
 * A scoped endpoint (`Plans/06` §3).
 *
 * All nine fields are covered by the signature, including the mutable observation fields.
 * Omitting them would let anything between two peers rewrite `inbound_capable` or an ASN
 * without breaking the signature — and an ASN is what a P3 bridge routes on.
 */
export interface FederationEndpoint {
  readonly uri: string;
  readonly scope: number;
  readonly asn: number;
  readonly ispName: string;
  readonly region: string;
  readonly inboundCapable: boolean;
  readonly lastOkAtMs: bigint;
  readonly rttMs: number;
  readonly consecutiveFailures: number;
}

export interface FederationPeerRecord {
  readonly serverKey: Uint8Array;
  readonly displayName: string;
  readonly endpoints: readonly FederationEndpoint[];
  readonly trust: number;
  readonly vouchedBy: readonly Uint8Array[];
  readonly communities: readonly string[];
  readonly channels: readonly string[];
  readonly planes: readonly number[];
  readonly isBridge: boolean;
  readonly bridgedAsns: readonly number[];
  readonly lastSeenMs: bigint;
}

export interface AnnounceRequestFields {
  readonly serverKey: Uint8Array;
  readonly displayName: string;
  readonly software: string;
  readonly version: string;
  readonly endpoints: readonly FederationEndpoint[];
  readonly communities: readonly string[];
  readonly channels: readonly string[];
  readonly planes: readonly number[];
  readonly acceptedClasses: readonly number[];
  readonly currentSth?: FederationTreeHead | undefined;
  readonly timestampMs: bigint;
  readonly nonce: Uint8Array;
}

export interface AnnounceResponseFields {
  readonly serverKey: Uint8Array;
  readonly assigned: number;
  readonly endpoints: readonly FederationEndpoint[];
  readonly vouches: readonly ServerVouchFields[];
  readonly grantedQuota?: QuotaFields | undefined;
  readonly currentSth?: FederationTreeHead | undefined;
}

export interface QuotaFields {
  readonly envelopesPerMin: number;
  readonly bytesPerMin: bigint;
  readonly maxConcurrentStreams: number;
  readonly allowedClasses: readonly number[];
}

export interface ServerVouchFields {
  readonly peerKey: Uint8Array;
  readonly level: number;
  readonly note: string;
  readonly assertedAtMs: bigint;
}

export interface PeerObservationFields {
  readonly peerKey: Uint8Array;
  readonly sth?: FederationTreeHead | undefined;
  readonly observedAtMs: bigint;
}

export interface TreeHeadExchangeFields {
  readonly serverKey: Uint8Array;
  readonly sth?: FederationTreeHead | undefined;
  readonly observed: readonly PeerObservationFields[];
}

export interface DirectoryExchangeFields {
  readonly peers: readonly FederationPeerRecord[];
  readonly generatedAtMs: bigint;
}

/**
 * An absent optional message frames as one empty part, a present one as its own frame.
 * Distinguishing the two matters: "no tree head" and "a tree head of size 0" are different
 * claims, and a peer must not be able to slide from one to the other.
 */
function optionalSth(sth: FederationTreeHead | undefined): Uint8Array {
  if (!sth) return list([ascii.encode('absent')]);
  return list([
    ascii.encode('present'),
    sth.serverKey,
    int(sth.treeSize),
    sth.rootHash,
    int(sth.timestampMs),
    sth.signature,
  ]);
}

function endpointBytes(endpoint: FederationEndpoint): Uint8Array {
  return list([
    encodeUtf8Nfc(endpoint.uri),
    int(endpoint.scope),
    int(endpoint.asn),
    encodeUtf8Nfc(endpoint.ispName),
    encodeUtf8Nfc(endpoint.region),
    int(endpoint.inboundCapable),
    int(endpoint.lastOkAtMs),
    int(endpoint.rttMs),
    int(endpoint.consecutiveFailures),
  ]);
}

function vouchBody(vouch: ServerVouchFields): Uint8Array {
  return list([vouch.peerKey, int(vouch.level), encodeUtf8Nfc(vouch.note), int(vouch.assertedAtMs)]);
}

function peerRecordBytes(peer: FederationPeerRecord): Uint8Array {
  return list([
    peer.serverKey,
    encodeUtf8Nfc(peer.displayName),
    list(peer.endpoints.map(endpointBytes)),
    int(peer.trust),
    list([...peer.vouchedBy]),
    list(peer.communities.map(encodeUtf8Nfc)),
    list(peer.channels.map(encodeUtf8Nfc)),
    list(peer.planes.map(int)),
    int(peer.isBridge),
    list(peer.bridgedAsns.map(int)),
    int(peer.lastSeenMs),
  ]);
}

/** `AnnounceRequest.signature` covers fields 1..12 (`Plans/05` §2). */
export function announceRequestSigningBytes(fields: AnnounceRequestFields): Uint8Array {
  return frameParts([
    ascii.encode('jb-fed-announce-v1'),
    fields.serverKey,
    encodeUtf8Nfc(fields.displayName),
    encodeUtf8Nfc(fields.software),
    encodeUtf8Nfc(fields.version),
    list(fields.endpoints.map(endpointBytes)),
    list(fields.communities.map(encodeUtf8Nfc)),
    list(fields.channels.map(encodeUtf8Nfc)),
    list(fields.planes.map(int)),
    list(fields.acceptedClasses.map(int)),
    optionalSth(fields.currentSth),
    int(fields.timestampMs),
    fields.nonce,
  ]);
}

/** `AnnounceResponse.signature` covers fields 1..6. */
export function announceResponseSigningBytes(fields: AnnounceResponseFields): Uint8Array {
  const quota = fields.grantedQuota;
  return frameParts([
    ascii.encode('jb-fed-announce-ack-v1'),
    fields.serverKey,
    int(fields.assigned),
    list(fields.endpoints.map(endpointBytes)),
    list(fields.vouches.map(vouchBody)),
    quota
      ? list([
          ascii.encode('present'),
          int(quota.envelopesPerMin),
          int(quota.bytesPerMin),
          int(quota.maxConcurrentStreams),
          list(quota.allowedClasses.map(int)),
        ])
      : list([ascii.encode('absent')]),
    optionalSth(fields.currentSth),
  ]);
}

/**
 * `ServerVouch.signature` covers fields 1..4.
 *
 * Signed by the VOUCHING node's key, which is why the vouching key is not part of the
 * message: a vouch is only meaningful once you know whose it is, and that comes from the
 * peer record the vouch was attached to. A vouch that travels without its asserter is not
 * a weaker vouch, it is not a vouch.
 */
export function serverVouchSigningBytes(fields: ServerVouchFields): Uint8Array {
  return frameParts([ascii.encode('jb-fed-vouch-v1'), vouchBody(fields)]);
}

/** `TreeHeadExchange.signature` covers fields 1..3. */
export function treeHeadExchangeSigningBytes(fields: TreeHeadExchangeFields): Uint8Array {
  return frameParts([
    ascii.encode('jb-fed-sth-gossip-v1'),
    fields.serverKey,
    optionalSth(fields.sth),
    list(
      fields.observed.map((observation) =>
        list([observation.peerKey, optionalSth(observation.sth), int(observation.observedAtMs)]),
      ),
    ),
  ]);
}

/**
 * Per-call peer authentication.
 *
 * `Deliver`, `StreamActivities` and `Backfill` carry no peer identity in the frozen proto —
 * they are streams of `Envelope`, and adding a peer field would be a contract change. But
 * the node MUST know which peer it is talking to: FD-05 attributes the direction ledger to
 * a peer, FD-14 excludes that peer from fanout, and FG-09 applies that peer's quota. A
 * self-declared header would be worthless, so the caller signs a short, method-bound,
 * time-bound statement and sends it as gRPC metadata — outside the proto, which is where
 * transport-level authentication belongs anyway.
 *
 * Binding the METHOD matters: without it a token captured from a cheap `Backfill` call
 * would authorise an expensive `Deliver` stream. Binding the TIMESTAMP bounds replay to the
 * receiver's acceptance window.
 */
export function federationCallAuthBytes(
  method: string,
  timestampMs: bigint,
  nonce: Uint8Array,
): Uint8Array {
  return frameParts([
    ascii.encode('jb-fed-call-v1'),
    encodeUtf8Nfc(method),
    int(timestampMs),
    nonce,
  ]);
}

/** `DirectoryExchange.signature` covers fields 1..2. */
export function directoryExchangeSigningBytes(fields: DirectoryExchangeFields): Uint8Array {
  return frameParts([
    ascii.encode('jb-fed-directory-v1'),
    list(fields.peers.map(peerRecordBytes)),
    int(fields.generatedAtMs),
  ]);
}
