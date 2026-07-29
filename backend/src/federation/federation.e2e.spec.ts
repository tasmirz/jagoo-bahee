/**
 * P2's exit gate — FG-01 … FG-10, over real gRPC between two independent stacks.
 *
 * ── This suite is the phase ────────────────────────────────────────────────────────
 * `Plans/05` §8 defines federation as met when these ten criteria pass. Every one of them
 * runs against a real `nice-grpc` server on loopback, with real Ed25519 signatures, the
 * real 19-step pipeline, the real Merkle log and the real outbox. Storage is the only
 * thing doubled, and the doubles honour transactions and unique constraints (AR-03).
 *
 * ── What each test is really guarding ──────────────────────────────────────────────
 * Every FG number below corresponds to something v1 got wrong, not to a feature checklist:
 *
 *   FG-01  v1 required an admin to approve a peer, so relays could not appear during the
 *          shutdown that needed them.
 *   FG-02  v1's `receive()` archived into a collection nothing read. Federation was a
 *          message morgue.
 *   FG-05  v1's dedupe was `findOne` then `insertOne` with no unique index — a race that
 *          looked like a guard.
 *   FG-06  a peer's word was taken for content it relayed.
 *   FG-10  planes did not exist yet; the guard is written before the second plane ships,
 *          because a guard added afterwards is a guard added after the leak.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommentCreate, CommunityCreate, ModAction, PostCreate, VoteCast } from '@jagoo/sdk/proto';
import { ed25519 } from '@jagoo/sdk/crypto';
import { canonicalBytes, encodeSignedEnvelope, Plane as SdkPlane } from '@jagoo/sdk/core';
import type { CanonicalEnvelope } from '@jagoo/sdk/core';
import { Plane, Priority } from '../core/domain/envelope.js';
import { RejectionCode } from '../core/domain/errors.js';
import {
  DuplicateFederationEntryError,
  FederationDirection,
  PeerTrust,
} from '../core/ports/network.port.js';
import { PROBATION_PERIOD_MS, TRUST_LEVEL_WIRE } from '../core/domain/federation/trust.js';
import { serverVouchSigningBytes } from '@jagoo/sdk';
import { POSTS_COLLECTION, type PostDoc } from '../features/forum/post/post.projection.js';
import { COMMENTS_COLLECTION, type CommentDoc } from '../features/forum/comment/comment-create.handler.js';
import {
  MOD_EVENTS_COLLECTION,
  type ModEventDoc,
} from '../features/forum/moderation/moderation.projection.js';
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
} from './two-node-harness.js';

const AUTHOR_KEY = ed25519.derivePublicKey(AUTHOR_SEED);

let a: FederatedNode;
let b: FederatedNode;
let nonceCounter = 0;
let nullifierCounter = 0;

/**
 * Wide counters, not `fill(n % 251)`.
 *
 * FG-09's flood tests publish thousands of envelopes, and a byte-wide counter would wrap
 * and start colliding — which surfaces as pipeline step 12 REPLAY rejections that look
 * exactly like the quota rejections the test is asserting. A 48-bit counter cannot wrap
 * within any suite.
 */
function counterBytes(value: number): Uint8Array {
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setUint32(0, Math.floor(value / 0x10000), false);
  view.setUint32(4, value % 0x100000000, false);
  return out;
}

const nextNonce = (): Uint8Array => counterBytes((nonceCounter += 1));
const nextNullifier = (): Uint8Array => counterBytes((nullifierCounter += 1) + 0x5000_0000);

/** The anti-abuse gates most Forum registry rows demand. */
const gates = () => ({
  credential: Uint8Array.from([1, 2, 3, 4], (byte) => byte ^ 0xff),
  nullifier: nextNullifier(),
  epoch: 1,
  pow: new Uint8Array([1]),
});

/** Publish on a node exactly as a client would — the same encoder, the same key handling. */
async function publish(
  node: FederatedNode,
  over: Parameters<typeof signEnvelope>[0],
): Promise<string> {
  const receipt = await node.pipeline.accept(
    signEnvelope({ nonce: nextNonce(), ...gates(), ...over }),
  );
  return receipt.contentId;
}

/**
 * Certify the author on a node, through the REAL bootstrap path (ADR-004).
 *
 * Not by seeding a store. The certificate store reads projections, so a certified key is
 * one the identity feature genuinely projected after verifying the Ed25519 self-signature
 * and the ML-DSA attestation. Both nodes certify independently: FD-03 gives federation no
 * exemption from pipeline step 10, so an envelope from an author this node has never seen
 * certified is rejected on arrival no matter who relayed it.
 */
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

beforeEach(async () => {
  a = await startNode({ name: 'node-a', seed: 0x11 });
  b = await startNode({ name: 'node-b', seed: 0x22 });
  await certify(a);
  await certify(b);
});

afterEach(async () => {
  await stopNode(a);
  await stopNode(b);
});

// ── FG-01 ────────────────────────────────────────────────────────────────────────────

describe('FG-01 — Announce succeeds and the peer lands at PROBATION via TOFU', () => {
  it('admits a peer nobody vouched for, with no operator in the loop (FD-01)', async () => {
    await introduce(a, b);
    const outcome = await a.sender.announce((await a.peers.get(peerIdOf(b)))!);

    // B had never heard of A before this call. It is now a peer.
    const asKnownToB = await b.peers.get(peerIdOf(a));
    expect(asKnownToB).not.toBeNull();
    expect(asKnownToB!.trust).toBe(PeerTrust.PROBATION);
    expect(outcome.assigned).toBe(PeerTrust.PROBATION);
    expect(outcome.quota).not.toBeNull();
  });

  it('identifies the peer by its KEY, not its address (FD-02)', async () => {
    await introduce(a, b);
    await a.sender.announce((await a.peers.get(peerIdOf(b)))!);
    const known = await b.peers.get(peerIdOf(a));
    expect(Buffer.from(known!.publicKey)).toEqual(Buffer.from(a.signer.publicKey));
    expect(known!.serverId).toBe(peerIdOf(a));
  });

  it('refuses a handshake whose signature does not match its fields', async () => {
    await introduce(a, b);
    const peer = (await a.peers.get(peerIdOf(b)))!;
    // Sign as A, then claim to be someone else. TOFU is trust on first USE, not on first
    // assertion — otherwise anyone could occupy an existing peer's identity.
    await expect(
      b.inbox.announce(
        {
          serverKey: new Uint8Array(32).fill(0x99),
          displayName: 'impostor',
          software: 'x',
          version: '1',
          endpoints: [],
          communities: [],
          channels: [],
          planes: [1],
          acceptedClasses: [4],
          currentSth: undefined,
          timestampMs: BigInt(NOW_MS),
          nonce: new Uint8Array(16).fill(1),
        },
        new Uint8Array(64).fill(0xaa),
      ),
    ).rejects.toMatchObject({ code: RejectionCode.BAD_SIGNATURE });
    expect(await b.peers.get(peer.serverId)).toBeNull();
  });

  it('promotes to NORMAL after seven clean days, without an operator', async () => {
    await introduce(a, b);
    await a.sender.announce((await a.peers.get(peerIdOf(b)))!);

    // BOTH clocks. Advancing only the receiver would make A's handshake look stale and
    // the test would fail on the ±5 minute window rather than exercising promotion.
    a.clock.advance(PROBATION_PERIOD_MS);
    b.clock.advance(PROBATION_PERIOD_MS);
    await a.sender.announce((await a.peers.get(peerIdOf(b)))!);
    expect((await b.peers.get(peerIdOf(a)))!.trust).toBe(PeerTrust.NORMAL);
  });
});

// ── FG-02 / FG-03 ────────────────────────────────────────────────────────────────────

describe('FG-02 / FG-03 — content created on A is verified and PROJECTED on B', () => {
  beforeEach(async () => {
    await introduce(a, b, PeerTrust.NORMAL);
    await introduce(b, a, PeerTrust.NORMAL);
    // A handshake in each direction, so both sides hold a peer record and B will admit
    // A's BULK envelopes (FG-09 covers what happens when it will not).
    await a.sender.announce((await a.peers.get(peerIdOf(b)))!);
    await b.sender.announce((await b.peers.get(peerIdOf(a)))!);
    await a.peers.upsert({ ...(await a.peers.get(peerIdOf(b)))!, trust: PeerTrust.NORMAL });
    await b.peers.upsert({ ...(await b.peers.get(peerIdOf(a)))!, trust: PeerTrust.NORMAL });
  });

  it('FD-04 — a post is projected into B’s read model, not merely archived', async () => {
    const communityId = await createCommunity(a, 'dhaka_relief');
    const postId = await publish(a, {
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(
        PostCreate.fromPartial({
          kind: 1,
          title: 'Water at Mirpur 10',
          body_markdown: 'Tanker at 3pm.',
        }),
      ).finish(),
    });

    await a.outbox.drain();

    // The projection, not the envelope log — v1 passed the archival half and failed this.
    const projected = await b.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: postId });
    expect(projected).not.toBeNull();
    expect(projected!.title).toBe('Water at Mirpur 10');
    expect(await b.envelopes.has(postId)).toBe(true);
  });

  it('FG-03 — a vote, a comment, and a moderation action all project on B', async () => {
    const communityId = await createCommunity(a, 'dhaka_relief');
    const postId = await publish(a, {
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: 'Shelter list' })).finish(),
    });
    const commentId = await publish(a, {
      domain: 'jb:comment:create:v1',
      scope: communityId,
      body: CommentCreate.encode(
        CommentCreate.fromPartial({ post: postId, body_markdown: 'Adding Mohammadpur.' }),
      ).finish(),
    });
    await publish(a, {
      domain: 'jb:vote:cast:v1',
      scope: communityId,
      body: VoteCast.encode(
        VoteCast.fromPartial({ target: postId, target_kind: 1, value: 1 }),
      ).finish(),
    });
    await publish(a, {
      domain: 'jb:mod:action:v1',
      scope: communityId,
      body: ModAction.encode(
        ModAction.fromPartial({
          verb: 1,
          target: postId,
          target_kind: 1,
          reason: 'off topic',
        }),
      ).finish(),
    });

    // Several drains: the queue is bounded per pass, and a real node drains on a timer.
    for (let pass = 0; pass < 4; pass += 1) await a.outbox.drain();

    const comment = await b.projections
      .collection<CommentDoc>(COMMENTS_COLLECTION)
      .findOne({ id: commentId });
    const post = await b.projections.collection<PostDoc>(POSTS_COLLECTION).findOne({ id: postId });
    const modEvents = await b.projections
      .collection<ModEventDoc>(MOD_EVENTS_COLLECTION)
      .find({ target: postId }, 10);

    expect(comment).not.toBeNull();
    expect(post!.score).toBe(1);
    expect(modEvents.length).toBeGreaterThan(0);
  });

  it('FD-14 — B never queues the envelope back to A', async () => {
    const communityId = await createCommunity(a, 'dhaka_relief');
    await publish(a, {
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: 'One way only' })).finish(),
    });
    await a.outbox.drain();

    // Without the origin exclusion the two nodes ping-pong every envelope forever: A fans
    // out to B, B accepts and fans out to A, A dedupes at step 11 — but only after a full
    // network round trip, for every envelope, always.
    const queuedOnB = await b.queue.lease(b.clock.nowMs(), 100);
    expect(queuedOnB.filter((entry) => entry.peerId === peerIdOf(a))).toHaveLength(0);
  });
});

// ── FG-04 ────────────────────────────────────────────────────────────────────────────

describe('FG-04 — partition, 20 envelopes, reconnect: exactly 20, zero duplicates', () => {
  it('backfills the whole gap and nothing twice', async () => {
    await introduce(a, b, PeerTrust.NORMAL);
    await introduce(b, a, PeerTrust.NORMAL);
    await b.sender.announce((await b.peers.get(peerIdOf(a)))!);
    await b.peers.upsert({ ...(await b.peers.get(peerIdOf(a)))!, trust: PeerTrust.NORMAL });

    const communityId = await createCommunity(a, 'dhaka_relief');

    // The partition: B simply never drains and never streams while A publishes.
    const published: string[] = [];
    for (let index = 0; index < 20; index += 1) {
      published.push(
        await publish(a, {
          domain: 'jb:post:create:v1',
          scope: communityId,
          body: PostCreate.encode(
            PostCreate.fromPartial({ kind: 1, title: `Relief update ${index}` }),
          ).finish(),
        }),
      );
    }
    for (const contentId of published) {
      expect(await b.envelopes.has(contentId), `${contentId} crossed before reconnect`).toBe(false);
    }
    const beforeReconnect = b.envelopes.size;

    // Reconnect. `connect` handshakes (which records A's tree head), then backfills from
    // the durable cursor, then goes live.
    const report = await b.sync.connect(peerIdOf(a));
    expect(report).not.toBeNull();

    // EXACTLY 20 — every post crossed, and each exactly once.
    for (const contentId of published) {
      expect(await b.envelopes.has(contentId), `${contentId} did not cross`).toBe(true);
      const inboundRows = (await b.ledger.entriesFor(contentId)).filter(
        (row) => row.direction === 'in',
      );
      expect(inboundRows, `${contentId} was recorded twice`).toHaveLength(1);
    }
    expect(report!.backfill.rejected).toBe(0);

    // ZERO DUPLICATES, stated as the property that matters: B's log grew by exactly the
    // number of envelopes it did not already hold, and not by one more.
    //
    // The overlap the backfill DOES re-fetch (both nodes independently hold the author's
    // certificate — identical bytes, identical content ID) is reported as `duplicates` and
    // costs one dedupe at pipeline step 11. That is the conservative cursor behaving as
    // designed: undershooting re-fetches, overshooting loses content forever.
    const newlyHeld = published.length + 1; // the 20 posts and the community
    expect(b.envelopes.size - beforeReconnect).toBe(newlyHeld);
    expect(report!.backfill.accepted).toBe(newlyHeld);
    expect(report!.backfill.duplicates).toBe(report!.backfill.received - newlyHeld);

    // Running it again must be a no-op, not a second copy. This is the property a cursor
    // exists for, and the one a naive "fetch everything on reconnect" loses.
    const settled = b.envelopes.size;
    const second = await b.sync.backfillFrom(
      peerIdOf(a),
      await b.ledger.streamPosition(peerIdOf(a)),
    );
    expect(b.envelopes.size).toBe(settled);
    expect(second.accepted).toBe(0);
  });
});

// ── FG-05 ────────────────────────────────────────────────────────────────────────────

describe('FG-05 — a replayed envelope is rejected by the ledger, not by a racy read', () => {
  it('a repeated delivery projects the envelope exactly once', async () => {
    await introduce(a, b, PeerTrust.NORMAL);
    await introduce(b, a, PeerTrust.NORMAL);
    await a.sender.announce((await a.peers.get(peerIdOf(b)))!);
    await b.peers.upsert({ ...(await b.peers.get(peerIdOf(a)))!, trust: PeerTrust.NORMAL });

    const communityId = await createCommunity(a, 'dhaka_relief');
    const postId = await publish(a, {
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: 'Replay me' })).finish(),
    });
    const raw = (await a.envelopes.get(postId))!.raw;

    const before = b.envelopes.size;
    const first = await b.inbox.deliver(peerIdOf(a), [raw], Plane.FORUM);
    const second = await b.inbox.deliver(peerIdOf(a), [raw], Plane.FORUM);

    // Both are ACCEPTED — ER-01: a duplicate returns the ORIGINAL receipt rather than an
    // error, because the same envelope legitimately arrives over HTTP, federation and mesh.
    // Returning an error would make retry unsafe on the one path that retries most.
    expect(first.accepted).toContain(postId);
    expect(second.accepted).toContain(postId);

    const ledgerRows = await b.ledger.entriesFor(postId);
    expect(ledgerRows.filter((row) => row.direction === 'in')).toHaveLength(1);
    expect(b.envelopes.size).toBe(before + 1);
  });

  /**
   * The duplicate branch, entered ON PURPOSE.
   *
   * A repeated delivery short-circuits at pipeline step 11 and never reaches the ledger —
   * which is correct, and is exactly why that path cannot prove the constraint exists. v1
   * also "observed" that nothing crashed, while its catch was unreachable and its guard
   * was a race. So the constraint is exercised directly here, and the real unique index
   * plus genuine concurrency are asserted against Mongo in
   * `adapters/outbound/mongo/federation.integration.spec.ts`.
   */
  it('the ledger itself refuses a second (content_id, direction) row', async () => {
    const entry = {
      contentId: 'jb1duplicateprobe',
      direction: FederationDirection.IN,
      peerId: peerIdOf(a),
      recordedAtMs: NOW_MS,
    };
    await b.projections.transaction(async (tx) => b.ledger.record(entry, tx));

    await expect(
      b.projections.transaction(async (tx) => b.ledger.record(entry, tx)),
    ).rejects.toBeInstanceOf(DuplicateFederationEntryError);
    expect(b.ledger.duplicateHits).toBeGreaterThan(0);

    // The OUT row for the same content is a different key and must still be accepted —
    // otherwise a node could never record that it forwarded something it had received.
    await expect(
      b.projections.transaction(async (tx) =>
        b.ledger.record({ ...entry, direction: FederationDirection.OUT }, tx),
      ),
    ).resolves.toBeUndefined();
  });
});

// ── FG-06 ────────────────────────────────────────────────────────────────────────────

describe('FG-06 — a tampered envelope from a peer is rejected and not projected', () => {
  beforeEach(async () => {
    await introduce(b, a, PeerTrust.TRUSTED);
    await introduce(a, b, PeerTrust.TRUSTED);
    await a.sender.announce((await a.peers.get(peerIdOf(b)))!);
    await b.peers.upsert({ ...(await b.peers.get(peerIdOf(a)))!, trust: PeerTrust.TRUSTED });
  });

  it('rejects a forged signature even from a TRUSTED peer (FD-03)', async () => {
    const communityId = await createCommunity(b, 'dhaka_relief');
    const forged = signEnvelope({
      domain: 'jb:post:create:v1',
      scope: communityId,
      nonce: nextNonce(),
      ...gates(),
      body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: 'Forged' })).finish(),
      forgeSignature: true,
    });

    const before = b.envelopes.size;
    const outcome = await b.inbox.deliver(peerIdOf(a), [forged], Plane.FORUM);
    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected[0]?.code).toBe(RejectionCode.BAD_SIGNATURE);
    expect(b.envelopes.size).toBe(before);
  });

  it('rejects a body altered after signing', async () => {
    const communityId = await createCommunity(b, 'dhaka_relief');
    const genuine = signEnvelope({
      domain: 'jb:post:create:v1',
      scope: communityId,
      nonce: nextNonce(),
      ...gates(),
      body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: 'Genuine' })).finish(),
    });
    const tampered = Uint8Array.from(genuine);
    // Flip a byte in the middle. Whatever it lands on — a field, a length, the signature —
    // the result must not be accepted.
    const at = Math.floor(tampered.length / 2);
    tampered[at] = (tampered[at] as number) ^ 0xff;

    const outcome = await b.inbox.deliver(peerIdOf(a), [tampered], Plane.FORUM);
    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected).toHaveLength(1);
  });

  /**
   * ADR-008 §1, and the reason the gRPC layer never re-encodes.
   *
   * This is a protobuf-VALID encoding of a genuinely signed envelope, in a form the
   * canonical encoder would never emit. A ts-proto round trip in the adapter would
   * silently repair it and it would then validate — the v1 signature-confusion bug class,
   * arriving over the network from an untrusted peer, past the exact gate built to
   * foreclose it.
   */
  it('rejects a NON-CANONICAL encoding of a genuinely signed envelope', async () => {
    const communityId = await createCommunity(b, 'dhaka_relief');
    const base: CanonicalEnvelope = {
      version: 1,
      plane: SdkPlane.FORUM,
      domain: 'jb:post:create:v1',
      author_key: AUTHOR_KEY,
      key_alg: 1,
      parent: '',
      scope: communityId,
      created_at_ms: BigInt(NOW_MS),
      nonce: nextNonce(),
      priority: 4,
      body: PostCreate.encode(
        PostCreate.fromPartial({ kind: 1, title: 'Non-canonical' }),
      ).finish(),
      anti_abuse: gates(),
    };
    const canonical = encodeSignedEnvelope({
      ...base,
      signature: ed25519.sign(canonicalBytes(base), AUTHOR_SEED),
    });

    // Append a trailing unknown field (field 15, varint 0). Every protobuf library accepts
    // this and ignores it; the canonical form has exactly one accepted encoding and this is
    // not it.
    const nonCanonical = new Uint8Array(canonical.length + 2);
    nonCanonical.set(canonical);
    nonCanonical[canonical.length] = (15 << 3) | 0;
    nonCanonical[canonical.length + 1] = 0;

    const outcome = await b.inbox.deliver(peerIdOf(a), [nonCanonical], Plane.FORUM);
    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected[0]?.code).toBe(RejectionCode.MALFORMED);
  });
});

// ── FG-07 ────────────────────────────────────────────────────────────────────────────

describe('FG-07 — an outbound-only node federates fully in both directions', () => {
  it('advertises no endpoint yet still sends and receives (FD-11, FD-12)', async () => {
    const nat = await startNode({ name: 'nat-node', seed: 0x33, outboundOnly: true });
    try {
      await certify(nat);
      await introduce(nat, b, PeerTrust.NORMAL);

      // The handshake is outbound; B learns of a peer it can never dial.
      await nat.sender.announce((await nat.peers.get(peerIdOf(b)))!);
      const asKnownToB = await b.peers.get(peerIdOf(nat));
      expect(asKnownToB).not.toBeNull();
      expect(asKnownToB!.endpoints).toHaveLength(0);
      await b.peers.upsert({ ...asKnownToB!, trust: PeerTrust.NORMAL });

      // OUT: the NATed node pushes over a connection it opened.
      const communityId = await createCommunity(nat, 'dhaka_relief');
      const postId = await publish(nat, {
        domain: 'jb:post:create:v1',
        scope: communityId,
        body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: 'From behind CGNAT' })).finish(),
      });
      for (let pass = 0; pass < 3; pass += 1) await nat.outbox.drain();
      expect(await b.envelopes.has(postId)).toBe(true);

      // IN: and pulls over another connection it opened. B cannot initiate either.
      const fromB = await publish(b, {
        domain: 'jb:post:create:v1',
        scope: communityId,
        body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: 'Reply inbound' })).finish(),
      });
      await nat.sync.backfillFrom(peerIdOf(b), 0);
      expect(await nat.envelopes.has(fromB)).toBe(true);
    } finally {
      await stopNode(nat);
    }
  });
});

// ── FD-05 — web-of-trust vouches ─────────────────────────────────────────────────────

describe('FD-05 — vouches are asserted, gossiped in the handshake, and weighed on arrival', () => {
  /** Sign a vouch the way the admin route does, so the test exercises the real bytes. */
  const assertVouch = (
    asserter: FederatedNode,
    subject: Uint8Array,
    level: PeerTrust,
    note = 'verified out of band',
  ) => {
    const assertedAtMs = asserter.clock.nowMs();
    return {
      asserterKey: asserter.signer.publicKey,
      peerKey: subject,
      level,
      note,
      assertedAtMs,
      signature: asserter.signer.sign(
        serverVouchSigningBytes({
          peerKey: subject,
          level: TRUST_LEVEL_WIRE[level],
          note,
          assertedAtMs: BigInt(assertedAtMs),
        }),
      ),
    };
  };

  it('carries A’s own vouch to B, where it is stored against the right peer', async () => {
    // A vouches for C. B knows both A and C, and trusts A.
    const c = await startNode({ name: 'node-c', seed: 0x5c });
    try {
      await introduce(a, c);
      await introduce(b, c);
      await introduce(b, a, PeerTrust.TRUSTED);
      await a.inbox.recordVouch(assertVouch(a, c.signer.publicKey, PeerTrust.TRUSTED));

      await b.sync.handshake((await b.peers.get(peerIdOf(a)))!);

      const seen = (await b.peers.get(peerIdOf(c)))!.vouches ?? [];
      expect(seen).toHaveLength(1);
      // Attributed to whoever SIGNED the response, not to anything in the payload.
      expect(Buffer.from(seen[0]!.asserterKey)).toEqual(Buffer.from(a.signer.publicKey));
      expect(seen[0]!.level).toBe(PeerTrust.TRUSTED);
    } finally {
      await stopNode(c);
    }
  });

  /**
   * The whole reason accepting vouches from any peer is safe.
   *
   * `evaluateTrust` weighs each vouch by how much WE trust the asserter, so an untrusted
   * node's opinion is recorded and counts for nothing. Without this, a single PROBATION
   * peer could promote itself or anyone else simply by asserting it.
   */
  it('does not let a vouch from an untrusted asserter change anything', async () => {
    const c = await startNode({ name: 'node-c', seed: 0x5d });
    try {
      await introduce(a, c);
      await introduce(b, c);
      await introduce(b, a, PeerTrust.PROBATION); // B does NOT trust A
      await a.inbox.recordVouch(assertVouch(a, c.signer.publicKey, PeerTrust.TRUSTED));

      await b.sync.handshake((await b.peers.get(peerIdOf(a)))!);

      expect((await b.peers.get(peerIdOf(c)))!.trust).toBe(PeerTrust.PROBATION);
    } finally {
      await stopNode(c);
    }
  });

  it('refuses a vouch whose signature does not verify', async () => {
    const c = await startNode({ name: 'node-c', seed: 0x5e });
    try {
      await introduce(b, c);
      const forged = {
        ...assertVouch(b, c.signer.publicKey, PeerTrust.TRUSTED),
        // Claims A said it. A did not.
        asserterKey: a.signer.publicKey,
      };
      expect(await b.inbox.recordVouch(forged)).toBeNull();
      expect((await b.peers.get(peerIdOf(c)))!.vouches ?? []).toHaveLength(0);
    } finally {
      await stopNode(c);
    }
  });

  it('refuses a vouch about a peer it has never met, rather than inventing a record', async () => {
    const stranger = new Uint8Array(32).fill(0x7a);
    expect(await b.inbox.recordVouch(assertVouch(b, stranger, PeerTrust.TRUSTED))).toBeNull();
  });
});

// ── FG-08 ────────────────────────────────────────────────────────────────────────────

describe('FG-08 — a peer that rewrote its log is detected, demoted, and alerted', () => {
  it('blocks a peer whose tree head contradicts one it already gave us (FD-09)', async () => {
    await introduce(b, a, PeerTrust.TRUSTED);
    await b.sender.announce((await b.peers.get(peerIdOf(a)))!);
    await b.peers.upsert({ ...(await b.peers.get(peerIdOf(a)))!, trust: PeerTrust.TRUSTED });

    // A grows its log honestly and gossips.
    const communityId = await createCommunity(a, 'dhaka_relief');
    await publish(a, {
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: 'Honest' })).finish(),
    });
    await b.sync.gossip();
    const honest = await b.ledger.lastPeerSth(peerIdOf(a));
    expect(honest).not.toBeNull();

    // Now A presents a DIFFERENT root for a tree size it already attested. There is no
    // innocent explanation: it rewrote history.
    const forked = { ...honest!, rootHash: new Uint8Array(32).fill(0xee) };
    const peer = (await b.peers.get(peerIdOf(a)))!;
    await b.inbox.observePeerSth(peer, forked);

    const afterwards = await b.peers.get(peerIdOf(a));
    expect(afterwards!.trust).toBe(PeerTrust.BLOCKED);
    expect(afterwards!.blockedReason).toContain('fork');

    const alerts = await b.alerts.list(10);
    expect(alerts.some((alert) => alert.code === 'peer.forked')).toBe(true);
    expect(alerts[0]?.severity).toBe('CRITICAL');
  });

  /**
   * The FD-10 relay is an attack surface, and this is the regression for it.
   *
   * Observations arrive labelled by the RELAYER, not by their subject. Without checking
   * that a tree head's `server_key` matches the peer it is attributed to, any peer could
   * get any other peer BLOCKED simply by relaying a head under the wrong key — the
   * recipient would compare a third party's log against this peer's history, find a
   * mismatch, and block an innocent node. Demotion to BLOCKED needs an operator to lift, so
   * a false positive is a denial-of-service with a long tail.
   *
   * Found by running the two-node compose stack for real: a junk directory record paired
   * one node's key with another's endpoint, and the nodes blocked each other within a
   * minute.
   */
  it('discards a tree head attributed to the wrong peer instead of blocking on it', async () => {
    await introduce(b, a, PeerTrust.TRUSTED);
    await b.sender.announce((await b.peers.get(peerIdOf(a)))!);
    await b.peers.upsert({ ...(await b.peers.get(peerIdOf(a)))!, trust: PeerTrust.TRUSTED });

    const peer = (await b.peers.get(peerIdOf(a)))!;
    const status = await b.inbox.observePeerSth(peer, {
      // Someone ELSE's key — B's own, as the real bug produced.
      serverKey: b.signer.publicKey,
      treeSize: 99,
      rootHash: new Uint8Array(32).fill(0xcd),
      timestampMs: NOW_MS,
      signature: new Uint8Array(64),
    });

    expect(status).not.toBe('FORKED');
    expect((await b.peers.get(peerIdOf(a)))!.trust).toBe(PeerTrust.TRUSTED);
    expect((await b.alerts.list(10)).some((alert) => alert.code === 'peer.forked')).toBe(false);
  });

  it('a fork block cannot be vouched away — only an operator lifts it', async () => {
    await introduce(b, a, PeerTrust.TRUSTED);
    await b.sender.announce((await b.peers.get(peerIdOf(a)))!);
    const peer = (await b.peers.get(peerIdOf(a)))!;
    await b.inbox.observePeerSth(peer, {
      serverKey: a.signer.publicKey,
      treeSize: 0,
      rootHash: new Uint8Array(32).fill(1),
      timestampMs: NOW_MS,
      signature: new Uint8Array(64),
    });
    await b.ledger.recordPeerSth(peerIdOf(a), {
      serverKey: a.signer.publicKey,
      treeSize: 5,
      rootHash: new Uint8Array(32).fill(2),
      timestampMs: NOW_MS,
      signature: new Uint8Array(64),
    });
    await b.inbox.observePeerSth((await b.peers.get(peerIdOf(a)))!, {
      serverKey: a.signer.publicKey,
      treeSize: 5,
      rootHash: new Uint8Array(32).fill(3),
      timestampMs: NOW_MS,
      signature: new Uint8Array(64),
    });

    // Even a fresh handshake does not clear it.
    await a.sender.announce((await a.peers.get(peerIdOf(b))) ?? (await introduceAndGet(a, b)));
    expect((await b.peers.get(peerIdOf(a)))!.trust).toBe(PeerTrust.BLOCKED);
  });
});

async function introduceAndGet(from: FederatedNode, to: FederatedNode) {
  await introduce(from, to);
  return (await from.peers.get(peerIdOf(to)))!;
}

// ── T2.13 ────────────────────────────────────────────────────────────────────────────

describe('T2.13 — directory exchange learns peers without corrupting the directory', () => {
  it('names every learned peer by its key, and never stores the node itself', async () => {
    await introduce(a, b, PeerTrust.TRUSTED);
    await introduce(b, a, PeerTrust.TRUSTED);
    await a.sender.announce((await a.peers.get(peerIdOf(b)))!);
    await b.peers.upsert({ ...(await b.peers.get(peerIdOf(a)))!, trust: PeerTrust.TRUSTED });

    // B's directory now contains A. A exchanges directories with B and gets itself back.
    await a.sync.exchangeDirectories();

    const known = await a.peers.all();
    // Found by the compose run: an empty id collapsed every learned peer into one document
    // whose key and endpoints came from different nodes.
    expect(known.every((peer) => peer.serverId.startsWith('jbs1'))).toBe(true);
    // A node that stores itself as a peer dials itself and compares its own tree head
    // against its own history under a second identity.
    expect(known.map((peer) => peer.serverId)).not.toContain(peerIdOf(a));
  });
});

// ── FG-09 ────────────────────────────────────────────────────────────────────────────

describe('FG-09 — a PROBATION peer may push classes 0–2 but not class 3', () => {
  it('accepts a CHECKIN and refuses a BULK envelope from the same peer', async () => {
    await introduce(b, a, PeerTrust.PROBATION);
    await b.sender.announce((await b.peers.get(peerIdOf(a)))!);

    const communityId = await createCommunity(b, 'dhaka_relief');
    // Built on A, delivered to B, which knows A only at PROBATION.
    const bulk = signEnvelope({
      domain: 'jb:post:create:v1',
      scope: communityId,
      priority: Priority.BULK,
      nonce: nextNonce(),
      ...gates(),
      body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: 'Bulk from a stranger' })).finish(),
    });

    const outcome = await b.inbox.deliver(peerIdOf(a), [bulk], Plane.FORUM);
    expect(outcome.accepted).toHaveLength(0);
    expect(outcome.rejected[0]?.code).toBe(RejectionCode.FORBIDDEN);
    expect(outcome.rejected[0]?.detail).toContain('priority class');
  });

  it('FD-15 — over-quota returns a backpressure hint rather than dropping the peer', async () => {
    await introduce(b, a, PeerTrust.PROBATION);
    await b.sender.announce((await b.peers.get(peerIdOf(a)))!);
    const communityId = await createCommunity(b, 'dhaka_relief');

    // A PROBATION peer's CHECKIN allowance is 120/min. Push well past it in one batch.
    const frames: Uint8Array[] = [];
    for (let index = 0; index < 200; index += 1) {
      frames.push(
        signEnvelope({
          domain: 'jb:post:create:v1',
          scope: communityId,
          priority: Priority.CHECKIN,
          nonce: nextNonce(),
          ...gates(),
          body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: `flood ${index}` })).finish(),
        }),
      );
    }

    const outcome = await b.inbox.deliver(peerIdOf(a), frames, Plane.FORUM);
    expect(outcome.rejected.some((rejection) => rejection.code === RejectionCode.RATE_LIMITED)).toBe(
      true,
    );
    expect(outcome.backpressureHintMs).toBeGreaterThan(0);
  });

  it('FD-16 — repeated breach demotes the peer and alerts the operator', async () => {
    await introduce(b, a, PeerTrust.NORMAL);
    await b.sender.announce((await b.peers.get(peerIdOf(a)))!);
    await b.peers.upsert({ ...(await b.peers.get(peerIdOf(a)))!, trust: PeerTrust.NORMAL });
    const communityId = await createCommunity(b, 'dhaka_relief');

    // NORMAL grants 1200 envelopes/min, of which BULK may use at most half (BR-04). The
    // clock is fixed, so the bucket never refills: 620 is the smallest batch that reliably
    // breaches, and signing more than necessary makes the suite slow without making it
    // stronger.
    const overQuota = (): Uint8Array[] =>
      Array.from({ length: 620 }, (_, index) =>
        signEnvelope({
          domain: 'jb:post:create:v1',
          scope: communityId,
          priority: Priority.BULK,
          nonce: nextNonce(),
          ...gates(),
          body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: `f${index}` })).finish(),
        }),
      );

    for (let round = 0; round < 3; round += 1) {
      await b.inbox.deliver(peerIdOf(a), overQuota(), Plane.FORUM);
    }

    expect((await b.peers.get(peerIdOf(a)))!.trust).toBe(PeerTrust.PROBATION);
    expect((await b.alerts.list(10)).some((alert) => alert.code === 'peer.demoted')).toBe(true);
  });
});

// ── FG-10 ────────────────────────────────────────────────────────────────────────────

describe('FG-10 — Forum and Signal are never carried in the same stream frame sequence', () => {
  it('rejects a frame whose plane differs from the stream’s', async () => {
    await introduce(b, a, PeerTrust.NORMAL);
    await b.sender.announce((await b.peers.get(peerIdOf(a)))!);
    await b.peers.upsert({ ...(await b.peers.get(peerIdOf(a)))!, trust: PeerTrust.NORMAL });
    const communityId = await createCommunity(b, 'dhaka_relief');

    const forumFrame = signEnvelope({
      domain: 'jb:post:create:v1',
      scope: communityId,
      nonce: nextNonce(),
      ...gates(),
      body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: 'Forum' })).finish(),
    });
    // A Signal-plane frame. No Signal domain exists yet, so this is rejected either way —
    // the point is that it is rejected AS A PLANE MISMATCH, by the guard, before the
    // pipeline is asked, and that the guard exists before the second plane ships.
    const signalFrame = signEnvelope({
      domain: 'jb:post:create:v1',
      plane: SdkPlane.SIGNAL,
      scope: communityId,
      nonce: nextNonce(),
      ...gates(),
      body: PostCreate.encode(PostCreate.fromPartial({ kind: 1, title: 'Signal' })).finish(),
    });

    const outcome = await b.inbox.deliver(peerIdOf(a), [forumFrame, signalFrame], Plane.FORUM);
    expect(outcome.accepted).toHaveLength(1);
    expect(
      outcome.rejected.some((rejection) => rejection.code === RejectionCode.PLANE_MISMATCH),
    ).toBe(true);
  });

  it('tells a blocked peer WHY, in the typed contract, rather than failing opaquely', async () => {
    await introduce(a, b, PeerTrust.NORMAL);
    await a.sender.announce((await a.peers.get(peerIdOf(b)))!);
    // B blocks A. A does not know that yet, and will keep trying.
    await b.peers.upsert({
      ...(await b.peers.get(peerIdOf(a)))!,
      trust: PeerTrust.BLOCKED,
      blockedReason: 'operator decision',
    });

    // Found by the compose run: this surfaced as `UNKNOWN: Unknown server error occurred`,
    // which the sender's outbox is right to treat as transient — so it retried a permanent
    // refusal forever instead of reporting it.
    await expect(
      a.sender.deliver((await a.peers.get(peerIdOf(b)))!, Plane.FORUM, [
        signEnvelope({ nonce: nextNonce(), ...gates() }),
      ]),
    ).rejects.toThrow(/PERMISSION_DENIED|FORBIDDEN/);
  });

  it('refuses a StreamActivities request that names more than one plane', async () => {
    await introduce(a, b, PeerTrust.NORMAL);
    await a.sender.announce((await a.peers.get(peerIdOf(b)))!);
    const peer = (await a.peers.get(peerIdOf(b)))!;

    const frames: Uint8Array[] = [];
    await expect(
      (async () => {
        for await (const raw of a.sender.streamActivities(
          peer,
          { planes: [Plane.FORUM, Plane.SIGNAL] },
          new AbortController().signal,
        )) {
          frames.push(raw);
        }
      })(),
    ).rejects.toThrow();
    expect(frames).toHaveLength(0);
  });
});
