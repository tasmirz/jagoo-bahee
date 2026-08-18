/**
 * The inbound half of federation — everything a peer can ask this node to do.
 *
 * ── This file COMPOSES; it does not implement ───────────────────────────────────────
 * Same discipline as `ingress.ts`. Trust arithmetic is in `core/domain/federation/trust.ts`,
 * handshake checking is in `announce.ts`, quota transitions are in `quota.ts`, filter
 * matching is in `stream-filter.ts`. This class orders those decisions and calls ports. It
 * is framework-free and speaks no gRPC: the adapter under `adapters/inbound/grpc/` decodes
 * frames and translates verdicts, and nothing else.
 *
 * ── FD-03 is the invariant this file exists to keep ─────────────────────────────────
 * Every inbound envelope re-runs the full 19-step pipeline. Peer trust is consulted BEFORE
 * the pipeline, to decide whether we are willing to spend the work at all, and never
 * inside it to decide whether the envelope is valid. A `TRUSTED` peer's forged envelope is
 * rejected exactly as a stranger's is (FG-06).
 *
 * ── FD-04: inbound envelopes are PROJECTED, not archived ────────────────────────────
 * v1's `receive()` inserted into a `federationactivities` collection that nothing ever
 * read. Because acceptance here runs the real pipeline, projection is not a separate step
 * that could be forgotten — it is step 16, inside the same transaction as the witness
 * append.
 */

import { identityId, serverId as serverIdOf } from '@jagoo/sdk/core';
import { serverVouchSigningBytes, type AnnounceRequestFields } from '@jagoo/sdk';
import type { ParsedEnvelope, Plane, Priority } from '../domain/envelope.js';
import { EnvelopeRejected, RejectionCode, isRejection } from '../domain/errors.js';
import { parseEnvelope } from '../domain/pipeline/parse.js';
import { checkAnnounce } from '../domain/federation/announce.js';
import {
  allowedClasses,
  atLeast,
  demoteOne,
  evaluateTrust,
  quotaFor,
  QUOTA_BREACH_LIMIT,
  TRUST_LEVEL_WIRE,
} from '../domain/federation/trust.js';
import {
  bytesPerMinuteFor,
  classPermitted,
  costOf,
  envelopesPerMinuteFor,
} from '../domain/federation/quota.js';
import {
  assertStreamPlane,
  matchesStreamFilter,
  type StreamCandidate,
} from '../domain/federation/stream-filter.js';
import { backpressureHintMs } from '../domain/federation/backoff.js';
import {
  PeerTrust,
  type FederationDirection,
  type DeliverOutcome,
  type FederationLedger,
  type PeerDirectory,
  type PeerEndpoint,
  type PeerQuota,
  type PeerQuotaLimiter,
  type PeerRecord,
  type PeerVouch,
  type StreamFilter,
} from '../ports/network.port.js';
import { PeerLogStatus, type SignedTreeHead, type WitnessLog } from '../ports/transparency.port.js';
import { AlertSeverity, type OperatorAlerts } from '../ports/alerts.port.js';
import type { SignatureVerifier } from '../ports/identity.port.js';
import type { EnvelopeReader } from '../ports/storage.port.js';
import type { Clock } from '../ports/system.port.js';
import type { Observability } from '../ports/observability.port.js';
import type { IngressPipeline } from './ingress.js';

/** How this node describes itself in a handshake. */
export interface NodeIdentity {
  readonly serverId: string;
  readonly publicKey: Uint8Array;
  readonly displayName: string;
  readonly software: string;
  readonly version: string;
  readonly endpoints: readonly PeerEndpoint[];
  readonly planes: readonly Plane[];
  readonly acceptedClasses: readonly Priority[];
  readonly communities: readonly string[];
  readonly channels: readonly string[];
}

export interface FederationInboxDeps {
  readonly pipeline: IngressPipeline;
  readonly peers: PeerDirectory;
  readonly ledger: FederationLedger;
  readonly reader: EnvelopeReader;
  readonly witness: WitnessLog;
  readonly quotas: PeerQuotaLimiter;
  readonly verifier: SignatureVerifier;
  readonly clock: Clock;
  readonly identity: () => NodeIdentity;
  readonly alerts?: OperatorAlerts;
  readonly observability?: Observability;
  /** Operator overrides, keyed by server ID. An explicit decision beats every derived rule. */
  readonly adminTrust?: (serverId: string) => PeerTrust | undefined;
}

export interface AnnounceAdmission {
  readonly peer: PeerRecord;
  readonly assigned: PeerTrust;
  readonly quota: PeerQuota;
  readonly reason: string;
}

export class FederationInbox {
  constructor(private readonly deps: FederationInboxDeps) {}

  // ── T2.2 / T2.3 — Announce and TOFU admission (FG-01) ──────────────────────────────

  /**
   * Admit or refuse a handshake.
   *
   * A refusal throws, because a peer that sent an unverifiable handshake must not be
   * given a trust level, an endpoint record, or any state at all — storing a record for a
   * key nobody proved possession of is how an attacker squats on a peer identity.
   */
  async announce(
    fields: AnnounceRequestFields,
    signature: Uint8Array,
  ): Promise<AnnounceAdmission> {
    const nowMs = this.deps.clock.nowMs();
    const verdict = checkAnnounce({
      fields,
      signature,
      nowMs,
      verify: (key, message, sig) => this.deps.verifier.verify(1, key, message, sig),
    });
    if (!verdict.ok) {
      throw new EnvelopeRejected(RejectionCode.BAD_SIGNATURE, verdict.reason);
    }

    const peerId = serverIdOf(fields.serverKey);
    const existing = await this.deps.peers.get(peerId);

    const evaluation = evaluateTrust({
      current: existing?.trust ?? null,
      adminLevel: this.deps.adminTrust?.(peerId),
      vouches: existing?.vouches ?? [],
      asserterTrust: (key) => this.asserterTrustSync(key),
      firstSeenMs: existing?.firstSeenMs ?? nowMs,
      nowMs,
      quotaBreaches: existing?.quotaBreaches ?? 0,
      blockedReason: existing?.blockedReason,
    });

    const record: PeerRecord = {
      serverId: peerId,
      publicKey: fields.serverKey,
      displayName: fields.displayName,
      software: fields.software,
      version: fields.version,
      endpoints: fields.endpoints.map(toEndpoint),
      trust: evaluation.level,
      planes: fields.planes as readonly Plane[],
      acceptedClasses: fields.acceptedClasses as readonly Priority[],
      communities: fields.communities,
      channels: fields.channels,
      vouches: existing?.vouches ?? [],
      firstSeenMs: existing?.firstSeenMs ?? nowMs,
      lastSeenMs: nowMs,
      quotaBreaches: existing?.quotaBreaches ?? 0,
      ...(existing?.blockedReason ? { blockedReason: existing.blockedReason } : {}),
    };
    await this.deps.peers.upsert(record);

    if (fields.currentSth) {
      await this.observePeerSth(record, {
        serverKey: fields.currentSth.serverKey,
        treeSize: Number(fields.currentSth.treeSize),
        rootHash: fields.currentSth.rootHash,
        timestampMs: Number(fields.currentSth.timestampMs),
        signature: fields.currentSth.signature,
      });
    }

    return {
      peer: record,
      assigned: evaluation.level,
      quota: quotaFor(evaluation.level),
      reason: evaluation.reason,
    };
  }

  /**
   * A vouch is only as strong as our own opinion of whoever made it.
   *
   * Resolved from the peer records we already hold. An asserter we have never seen counts
   * for nothing, which is what stops a stranger minting three fresh keys and vouching
   * itself to `TRUSTED`.
   */
  private asserterTrustSync(asserterKey: Uint8Array): PeerTrust {
    return this.asserterTrustCache.get(identityId(asserterKey)) ?? PeerTrust.UNSPECIFIED;
  }

  private readonly asserterTrustCache = new Map<string, PeerTrust>();

  /** Refresh the local view of who we trust, used when weighing vouches. */
  async refreshAsserterTrust(): Promise<void> {
    this.asserterTrustCache.clear();
    for (const peer of await this.deps.peers.all()) {
      this.asserterTrustCache.set(identityId(peer.publicKey), peer.trust);
    }
  }

  /**
   * T2.3 — attach a signed vouch and re-derive the peer's level.
   *
   * The signature is checked HERE rather than at the call site, because every ingress path
   * — handshake gossip, directory exchange, an operator action — converges on this method,
   * and a vouch is an input to `evaluateTrust`. An unverified vouch is an unauthenticated
   * vote on another node's reach: accepting one would let any peer promote or block any
   * other simply by asserting it in someone else's name.
   *
   * Returns `null` for an unknown peer, so a peer cannot conjure directory rows by
   * vouching for keys we have never met.
   */
  async recordVouch(vouch: PeerVouch): Promise<PeerRecord | null> {
    const peerId = serverIdOf(vouch.peerKey);
    const peer = await this.deps.peers.get(peerId);
    if (!peer) return null;

    const signed = this.deps.verifier.verify(
      1, // ED25519
      vouch.asserterKey,
      serverVouchSigningBytes({
        peerKey: vouch.peerKey,
        level: TRUST_LEVEL_WIRE[vouch.level],
        note: vouch.note,
        assertedAtMs: BigInt(vouch.assertedAtMs),
      }),
      vouch.signature,
    );
    if (!signed) return null;

    const kept = (peer.vouches ?? []).filter(
      (existing) => !sameKey(existing.asserterKey, vouch.asserterKey),
    );
    const vouches = [...kept, vouch];
    await this.refreshAsserterTrust();

    const evaluation = evaluateTrust({
      current: peer.trust,
      adminLevel: this.deps.adminTrust?.(peerId),
      vouches,
      asserterTrust: (key) => this.asserterTrustSync(key),
      firstSeenMs: peer.firstSeenMs ?? peer.lastSeenMs,
      nowMs: this.deps.clock.nowMs(),
      quotaBreaches: peer.quotaBreaches ?? 0,
      blockedReason: peer.blockedReason,
    });

    const updated: PeerRecord = { ...peer, vouches, trust: evaluation.level };
    await this.deps.peers.upsert(updated);
    return updated;
  }

  // ── T2.4 / T2.6 — Deliver, quota, and inbound projection (FG-05, FG-06, FG-09) ─────

  /**
   * Accept a batch a peer pushed at us.
   *
   * Per-envelope rejections are REPORTED, not thrown: one malformed frame in a stream of
   * a thousand must not discard the other 999, and telling the peer exactly which content
   * ID failed and why is what lets it stop resending it. A rejection here is data.
   */
  async deliver(
    peerId: string,
    frames: readonly Uint8Array[],
    streamPlane?: Plane,
  ): Promise<DeliverOutcome> {
    const peer = await this.requirePeer(peerId);
    const quota = quotaFor(peer.trust);
    const accepted: string[] = [];
    const rejected: { contentId: string; code: string; detail: string }[] = [];
    let worstOverBy = 0;
    let breached = false;

    for (const raw of frames) {
      let envelope: ParsedEnvelope;
      try {
        envelope = parseEnvelope(raw).envelope;
      } catch (error) {
        rejected.push({
          contentId: '',
          code: isRejection(error) ? error.code : RejectionCode.MALFORMED,
          detail: 'frame is not a canonical envelope',
        });
        continue;
      }

      // FG-10 — the plane guard runs before anything else touches the envelope.
      if (streamPlane !== undefined) {
        try {
          assertStreamPlane(streamPlane, envelope.plane);
        } catch (error) {
          rejected.push(this.rejectionOf(envelope.contentId, error));
          continue;
        }
      }

      // FG-09 — reach first: a class this peer may never send is a permanent answer, and
      // spending pipeline work on it would be exactly the amplification VP-01 forbids.
      if (!classPermitted(peer.trust, envelope.priority)) {
        rejected.push({
          contentId: envelope.contentId,
          code: RejectionCode.FORBIDDEN,
          detail: `trust level ${peer.trust} does not carry priority class ${envelope.priority}`,
        });
        breached = true;
        continue;
      }

      // FD-15 — both grants, one decision. `raw.length` is the size as it arrived on the
      // wire, not a re-encoded estimate: the peer is charged for the bytes it actually sent.
      const verdict = await this.deps.quotas.consume({
        peerId,
        priority: envelope.priority,
        cost: costOf(envelope.priority),
        perMinute: envelopesPerMinuteFor(quota, envelope.priority),
        bytes: raw.length,
        bytesPerMinute: bytesPerMinuteFor(quota, envelope.priority),
        nowMs: this.deps.clock.nowMs(),
      });
      if (!verdict.allowed) {
        // FD-15 — a hint, never a closed connection. A dropped connection costs both sides
        // a handshake and returns the peer to the same over-quota state.
        worstOverBy = Math.max(worstOverBy, verdict.overBy);
        breached = true;
        rejected.push({
          contentId: envelope.contentId,
          code: RejectionCode.RATE_LIMITED,
          detail: 'peer quota exhausted for this priority class',
        });
        continue;
      }

      try {
        await this.deps.pipeline.accept(raw, { transportId: 'grpc', peerId, originServerId: peerId });
        accepted.push(envelope.contentId);
        this.deps.observability?.ingressAccepted(envelope.domain);
      } catch (error) {
        const rejection = this.rejectionOf(envelope.contentId, error);
        rejected.push(rejection);
        this.deps.observability?.ingressRejected(envelope.domain, rejection.code);
      }
    }

    if (breached) await this.noteQuotaBreach(peer);

    return {
      accepted,
      rejected,
      backpressureHintMs: backpressureHintMs(worstOverBy, quota.envelopesPerMin),
      ourLogSize: (await this.deps.witness.currentSth()).treeSize,
    };
  }

  /** FD-16 — repeated breach demotes one level and tells the operator. */
  private async noteQuotaBreach(peer: PeerRecord): Promise<void> {
    const breaches = (peer.quotaBreaches ?? 0) + 1;
    if (breaches < QUOTA_BREACH_LIMIT) {
      await this.deps.peers.upsert({ ...peer, quotaBreaches: breaches });
      return;
    }
    const demoted = demoteOne(peer.trust);
    await this.deps.peers.upsert({ ...peer, quotaBreaches: 0, trust: demoted });
    await this.deps.alerts?.raise({
      severity: AlertSeverity.WARNING,
      code: 'peer.demoted',
      subject: peer.serverId,
      detail: `demoted to ${demoted} after ${breaches} quota breaches`,
      raisedAtMs: this.deps.clock.nowMs(),
    });
  }

  private rejectionOf(
    contentId: string,
    error: unknown,
  ): { contentId: string; code: string; detail: string } {
    if (isRejection(error)) {
      return { contentId, code: error.code, detail: error.message };
    }
    // ER-02 — an unexpected internal failure must not describe itself to a peer.
    return { contentId, code: RejectionCode.MALFORMED, detail: 'envelope was not accepted' };
  }

  // ── T2.5 / T2.9 — StreamActivities and Backfill ────────────────────────────────────

  /**
   * The envelopes a peer's filter selects, oldest first.
   *
   * Yields the STORED RAW BYTES. Re-encoding from the parsed form would produce a
   * canonically-correct envelope that is nonetheless not the one the author signed if this
   * node's encoder ever drifted — and the receiving node would then reject a signature we
   * had silently invalidated. The bytes we were given are the bytes we pass on.
   */
  async *select(
    filter: StreamFilter,
    limit: number,
    toIndex?: number,
  ): AsyncIterable<{ raw: Uint8Array; logIndex: number; contentId: string }> {
    const from = filter.sinceIndex ?? 0;
    const end = toIndex ?? Number.MAX_SAFE_INTEGER;
    let sent = 0;
    for await (const stored of this.deps.reader.range(from, end)) {
      if (sent >= limit) return;
      const candidate: StreamCandidate = {
        plane: stored.envelope.plane,
        priority: stored.envelope.priority,
        scope: stored.envelope.scope,
        logIndex: stored.logIndex,
      };
      if (!matchesStreamFilter(candidate, filter)) continue;
      sent += 1;
      yield { raw: stored.raw, logIndex: stored.logIndex, contentId: stored.envelope.contentId };
    }
  }

  // ── T2.12 — STH gossip and fork detection (FG-08) ─────────────────────────────────

  /**
   * Record what a peer says its log looks like, and block it if that contradicts what it
   * said before.
   *
   * FD-09: an inconsistent tree head means the peer rewrote history. That is not a
   * transient error to retry away — it is the single strongest signal a node is being
   * tampered with, so it demotes to `BLOCKED` pending review and surfaces to the operator
   * rather than being swallowed. The block records its reason, and `evaluateTrust` refuses
   * to let vouches lift it.
   */
  async observePeerSth(peer: PeerRecord, sth: SignedTreeHead): Promise<PeerLogStatus> {
    // ── The tree head must belong to the peer it is attributed to ────────────────────
    //
    // FD-10 relays observations: node C learns from A what A saw for B. That relay is the
    // point — it catches a peer showing different logs to different partners — and it is
    // also an attack surface, because the observation arrives labelled by the RELAYER.
    // Without this check, any peer could get any other peer BLOCKED by relaying a tree head
    // under the wrong `peer_key`: the recipient would compare a third party's log against
    // this peer's history, find a mismatch, and block an innocent node. Demotion to BLOCKED
    // is unrecoverable without an operator (`evaluateTrust` will not let vouches lift it),
    // so a false positive here is a denial-of-service with a long tail.
    //
    // A mismatch is not a fork; it is an unusable observation, and it is discarded.
    //
    // ── An UNATTRIBUTED head is the same problem, not an exemption ──────────────────
    // This used to read `sth.serverKey.length > 0 && !sameKey(...)`, so a head carrying no
    // key at all skipped the check and was accepted as this peer's own. Proto3 has no absent
    // message field once the message is present, so "no tree head" and "an all-zero tree
    // head" arrive identically: `serverKey` empty, `treeSize` 0, `rootHash` empty. Compared
    // against a peer that had honestly attested three leaves, that reads as `3 → 0` — a
    // regression, a CRITICAL `peer.forked` alert, and a BLOCK that `evaluateTrust` will not
    // let vouches lift.
    //
    // The container gate hit it on two healthy nodes inside seconds of boot. The rule L-22
    // states has no exception for the unlabelled case: any check that can BLOCK must first
    // verify the claim belongs to the peer it names, and a claim that names nobody has not
    // been verified. It is discarded, and the peer keeps its trust.
    if (sth.serverKey.length === 0 || !sameKey(sth.serverKey, peer.publicKey)) {
      return PeerLogStatus.UNKNOWN;
    }

    // ── One source of truth for what this peer last attested ─────────────────────────
    //
    // The ledger, which is durable. This comparison used to run twice — here, and again
    // inside `WitnessLog.verifyPeerSth`, which kept its own per-process `Map`. The two
    // disagreed after any restart, and the in-process copy was the one whose verdict was
    // honoured. Fork detection that forgets everything when the node restarts is not fork
    // detection, so `verifyPeerSth` is gone and this is the only comparison left.
    const previous = await this.deps.ledger.lastPeerSth(peer.serverId);

    // ── An OLDER observation is stale, not a fork ────────────────────────────────────
    //
    // Four paths feed this method and they race: the outbound announce handshake
    // (`FederationSync.connect`), the inbound one (`FederationService.announce`), the
    // `currentSth` carried on a peer record, and `gossip`. Each fetches a head at a
    // different instant, and nothing orders their arrival. So the sequence "gossip records
    // size 8; a reconnect then delivers the size-6 head it captured moments earlier" is
    // routine, and it is NOT evidence of anything — the peer never rewrote its log, we
    // simply read it twice and processed the reads out of order.
    //
    // Treating that as a fork is a false positive with the worst possible blast radius:
    // BLOCKED is unrecoverable without an operator, `evaluateTrust` will not let vouches
    // lift it, and a bridge whose peers are blocked stops bridging entirely. The container
    // gate hit exactly this — TG-06 forces an uplink out of service and back, the
    // reconnect replayed a stale head, and both island-A peers were blocked with
    // "tree shrank from 8 to 6" while nothing whatsoever was wrong with either log.
    //
    // `timestampMs` is signed as part of the head (Plans/05 §6), so it is the peer's own
    // ordering claim and not something a relayer can forge independently of the signature.
    // A stale head is discarded WITHOUT being recorded — recording it would roll the
    // ledger backwards and make the next honest observation look like the regression this
    // one was not.
    //
    // A genuine rollback attack is unaffected: it must present a head that is newer AND
    // smaller, which still trips `regressed` below.
    if (previous !== null && sth.timestampMs < previous.timestampMs) {
      return PeerLogStatus.UNKNOWN;
    }

    const regressed = previous !== null && sth.treeSize < previous.treeSize;
    const rewritten =
      previous !== null &&
      sth.treeSize === previous.treeSize &&
      !sameKey(sth.rootHash, previous.rootHash);

    if (regressed || rewritten) {
      const detail = regressed
        ? `tree shrank from ${previous?.treeSize} to ${sth.treeSize}`
        : 'presented a different root for a tree size it already attested';
      await this.deps.peers.upsert({
        ...peer,
        trust: PeerTrust.BLOCKED,
        blockedReason: `log fork detected: ${detail}`,
      });
      await this.deps.alerts?.raise({
        severity: AlertSeverity.CRITICAL,
        code: 'peer.forked',
        subject: peer.serverId,
        detail,
        raisedAtMs: this.deps.clock.nowMs(),
      });
      return PeerLogStatus.FORKED;
    }

    await this.deps.ledger.recordPeerSth(peer.serverId, sth);

    // Same size, same root: they told us the same thing twice, and it holds.
    if (previous !== null && sth.treeSize === previous.treeSize) return PeerLogStatus.CONSISTENT;

    // A grown tree needs a consistency proof before it can be called consistent. Nothing
    // here supplies one yet, so the honest answer is "not checked" — never "fine".
    return PeerLogStatus.UNKNOWN;
  }

  // ── Shared ────────────────────────────────────────────────────────────────────────

  async requirePeer(peerId: string): Promise<PeerRecord> {
    const peer = await this.deps.peers.get(peerId);
    if (!peer) {
      throw new EnvelopeRejected(RejectionCode.FORBIDDEN, 'peer has not completed a handshake');
    }
    if (!atLeast(peer.trust, PeerTrust.PROBATION)) {
      throw new EnvelopeRejected(RejectionCode.FORBIDDEN, 'peer is blocked');
    }
    return peer;
  }

  /** The classes a peer may currently push — echoed back in `AnnounceResponse.granted_quota`. */
  classesFor(level: PeerTrust): readonly Priority[] {
    return allowedClasses(level);
  }

  async ledgerDirections(contentId: string): Promise<readonly FederationDirection[]> {
    const entries = await this.deps.ledger.entriesFor(contentId);
    return entries.map((entry) => entry.direction);
  }
}

function toEndpoint(endpoint: {
  uri: string;
  scope: number;
  asn: number;
  ispName: string;
  region: string;
  inboundCapable: boolean;
  lastOkAtMs: bigint;
  rttMs: number;
  consecutiveFailures: number;
}): PeerEndpoint {
  return {
    address: endpoint.uri,
    scope: SCOPE_BY_WIRE[endpoint.scope] ?? 'GLOBAL',
    ...(endpoint.asn ? { asn: endpoint.asn } : {}),
    ...(endpoint.ispName ? { isp: endpoint.ispName } : {}),
    ...(endpoint.region ? { region: endpoint.region } : {}),
    inboundCapable: endpoint.inboundCapable,
    lastOkAtMs: Number(endpoint.lastOkAtMs),
    rttMs: endpoint.rttMs,
    consecutiveFailures: endpoint.consecutiveFailures,
  };
}

/**
 * The wire enum values from `transport.proto`, mapped once.
 *
 * A lookup table rather than a switch: the scope is DATA that travels through the system,
 * and a switch here would be the first step towards branching on it (TP-01, NFR-M03).
 */
const SCOPE_BY_WIRE: Readonly<Record<number, PeerEndpoint['scope']>> = {
  1: 'GLOBAL',
  2: 'NATIONAL',
  3: 'ISP_LOCAL',
  4: 'LAN',
  5: 'MESH',
  6: 'RETICULUM',
};

export const WIRE_BY_SCOPE: Readonly<Record<string, number>> = {
  GLOBAL: 1,
  NATIONAL: 2,
  ISP_LOCAL: 3,
  LAN: 4,
  MESH: 5,
  RETICULUM: 6,
};

function sameKey(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
