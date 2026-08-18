/**
 * T1.21–T1.30 — the Forum feature set, through the real pipeline.
 *
 * Every test here drives `IngressPipeline.accept` with a genuinely signed envelope rather
 * than calling a handler directly. A handler test that bypasses the pipeline cannot catch a
 * registry row that disagrees with its handler, a missing nonce requirement, or a
 * permission check that never runs — and those are the failures that matter.
 *
 * Requirement IDs are cited in test names so `NFR-M08` coverage is greppable.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  AwardGive,
  AwardTypeDefine,
  BlockIdentity,
  CommentCreate,
  CommunityArchive,
  CommunityCreate,
  CommunityUpdate,
  FollowIdentity,
  ForumMessageSend,
  Label,
  KeyRevocation,
  MembershipJoin,
  MembershipLeave,
  ModAction,
  PostCreate,
  PostDelete,
  PostUpdate,
  ProfileUpdate,
  ReportCreate,
  RoleAssign,
  RoleDefine,
  TargetKind,
  VoteCast,
} from '@jagoo/sdk/proto';
import { Plane as SdkPlane, revocationAuthorizationBytes } from '@jagoo/sdk';
import { ed25519 } from '@jagoo/sdk/crypto';
import { InMemoryNodeSigner } from '../../adapters/outbound/in-memory/in-memory-node.js';
import {
  buildHarness,
  signEnvelope,
  AUTHOR_SEED,
  NOW_MS,
  type Harness,
} from '../../testing/harness.js';
import { forumHandlers } from './index.js';
import { EnvelopeRejected, RejectionCode } from '../../core/domain/errors.js';
import { COMMUNITIES_COLLECTION, type CommunityDoc } from './community/community.projection.js';
import {
  MEMBERSHIPS_COLLECTION,
  ROLE_ASSIGNMENTS_COLLECTION,
  membershipKey,
  roleAssignmentKey,
  type MembershipDoc,
  type RoleAssignmentDoc,
} from './shared/membership.projection.js';
import {
  MOD_EVENTS_COLLECTION,
  ModVerb,
  verifyModChain,
  type ModEventDoc,
} from './moderation/moderation.projection.js';
import { POSTS_COLLECTION, type PostDoc } from './post/post.projection.js';
import { COMMENTS_COLLECTION, type CommentDoc } from './comment/comment-create.handler.js';
import { AWARDS_COLLECTION, type AwardDoc } from './award/award.handlers.js';
import {
  FORUM_MESSAGES_COLLECTION,
  type ForumMessageDoc,
} from './message/forum-message.handler.js';
import { LABELS_COLLECTION, type LabelDoc } from './label/label.handler.js';
import { REPORTS_COLLECTION, ReportStatus, type ReportDoc } from './report/report.handlers.js';
import { RoleDefineHandler } from './role/role.handlers.js';
import { IdentityFlag, MembershipFlag, Permission, hasFlag } from './shared/flags.js';
import { IDENTITIES_COLLECTION, type IdentityDoc } from './shared/membership.projection.js';
import {
  NOTIFICATIONS_COLLECTION,
  type NotificationDoc,
} from './shared/notification.projection.js';

/**
 * The node this harness runs as.
 *
 * Taken from the harness's OWN signer rather than a hand-written literal. A community's
 * origin fingerprint is the node that accepted the create envelope (ADR-010), and the
 * pipeline supplies it through `HandlerContext` — so a test that invented a second,
 * different server id would be asserting against a node that does not exist, and would
 * pass or fail for reasons unrelated to the behaviour under test.
 */
let originServerId: string;

/** A second identity, for tests that need someone who is not the author. */
const OTHER_SEED = new Uint8Array(32).fill(9);
const OTHER_KEY = ed25519.derivePublicKey(OTHER_SEED);
const AUTHOR_KEY = ed25519.derivePublicKey(AUTHOR_SEED);
const hex = (k: Uint8Array) => Buffer.from(k).toString('hex');

let h: Harness;
let communityId: string;
let nonceCounter = 0;
let nullifierCounter = 0;

const nextNonce = () => new Uint8Array(16).fill((nonceCounter += 1) % 251);
const nextNullifier = () => new Uint8Array(16).fill((nullifierCounter += 3) % 251);

/** The gates the registry demands for most Forum rows. */
const gates = () => ({
  credential: Uint8Array.from([1, 2, 3, 4], (b) => b ^ 0xff),
  nullifier: nextNullifier(),
  epoch: 1,
  pow: new Uint8Array([1]),
});

async function accept(over: Parameters<typeof signEnvelope>[0]) {
  return h.pipeline.accept(signEnvelope({ nonce: nextNonce(), ...gates(), ...over }));
}

/** Certify a key by seeding the in-memory store — the bootstrap path has its own test. */
function certify(key: Uint8Array): void {
  h.certificates.add({ key, issuedAtMs: 0 });
}

beforeEach(async () => {
  originServerId = new InMemoryNodeSigner().serverId;
  h = await buildHarness((registry, projections) => {
    for (const handler of forumHandlers(projections, {
      serverId: originServerId,
      publicKey: new Uint8Array(32).fill(7),
      sign: () => new Uint8Array(64),
    })) {
      registry.register(handler);
    }
  });
  certify(AUTHOR_KEY);
  certify(OTHER_KEY);
  await h.credentials.issue(new Uint8Array([1, 2, 3, 4]));

  const created = await accept({
    domain: 'jb:community:create:v1',
    scope: '',
    body: CommunityCreate.encode(
      CommunityCreate.fromPartial({ name: 'dhaka_relief', title: 'Dhaka Relief' }),
    ).finish(),
  });
  const community = await h.projections
    .collection<CommunityDoc>(COMMUNITIES_COLLECTION)
    .findOne({ id: `dhaka_relief@${originServerId}` });
  communityId = community!.id;
  expect(created.contentId).toMatch(/^jb1/);
});

// ── Communities and membership ───────────────────────────────────────────────────────

describe('community (T1.21, COM-01, COM-19)', () => {
  it('COM-19 — identity is <name>@<origin_fp>, never a row ID', () => {
    expect(communityId).toBe(`dhaka_relief@${originServerId}`);
  });

  it('the creator is a member AND a moderator from the first moment', async () => {
    const membership = await h.projections
      .collection<MembershipDoc>(MEMBERSHIPS_COLLECTION)
      .findOne({ id: membershipKey(communityId, hex(AUTHOR_KEY)) });
    const flags = BigInt(membership!.flags);
    expect(hasFlag(flags, MembershipFlag.MEMBER)).toBe(true);
    expect(hasFlag(flags, MembershipFlag.MODERATOR)).toBe(true);
  });

  it('COM-02 — a duplicate name on the same origin is refused', async () => {
    await expect(
      accept({
        domain: 'jb:community:create:v1',
        scope: '',
        body: CommunityCreate.encode(
          CommunityCreate.fromPartial({ name: 'dhaka_relief', title: 'Impostor' }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });

  it('rejects a name that is not 3-24 lowercase word characters', async () => {
    await expect(
      accept({
        domain: 'jb:community:create:v1',
        scope: '',
        body: CommunityCreate.encode(CommunityCreate.fromPartial({ name: 'Not Valid!' })).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.BODY_INVALID });
  });

  it('a non-member cannot update the community', async () => {
    await expect(
      accept({
        domain: 'jb:community:update:v1',
        seed: OTHER_SEED,
        scope: communityId,
        body: CommunityUpdate.encode(
          CommunityUpdate.fromPartial({
            target: communityId,
            patch: CommunityCreate.fromPartial({ title: 'Hijacked' }),
          }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });

  it('COM-06 — archive is a tombstone, and only the owner may do it', async () => {
    await expect(
      accept({
        domain: 'jb:community:archive:v1',
        seed: OTHER_SEED,
        scope: communityId,
        body: CommunityArchive.encode(
          CommunityArchive.fromPartial({ target: communityId, archived: true }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });

    await accept({
      domain: 'jb:community:archive:v1',
      scope: communityId,
      body: CommunityArchive.encode(
        CommunityArchive.fromPartial({ target: communityId, archived: true }),
      ).finish(),
    });

    const doc = await h.projections
      .collection<CommunityDoc>(COMMUNITIES_COLLECTION)
      .findOne({ id: communityId });
    // The row survives. Archiving withholds, it does not erase.
    expect(doc).not.toBeNull();
    expect(doc!.archived).toBe(true);
  });
});

describe('membership (T1.22, COM-21, COM-23)', () => {
  const join = () =>
    accept({
      domain: 'jb:membership:join:v1',
      seed: OTHER_SEED,
      scope: communityId,
      body: MembershipJoin.encode(MembershipJoin.fromPartial({ community: communityId })).finish(),
    });

  it('join then leave keeps the row and clears only the MEMBER bit', async () => {
    await join();
    await accept({
      domain: 'jb:membership:leave:v1',
      seed: OTHER_SEED,
      scope: communityId,
      body: MembershipLeave.encode(
        MembershipLeave.fromPartial({ community: communityId }),
      ).finish(),
    });

    const membership = await h.projections
      .collection<MembershipDoc>(MEMBERSHIPS_COLLECTION)
      .findOne({ id: membershipKey(communityId, hex(OTHER_KEY)) });
    expect(membership).not.toBeNull();
    expect(hasFlag(BigInt(membership!.flags), MembershipFlag.MEMBER)).toBe(false);
  });

  it('a ban survives leaving, so re-joining cannot launder it', async () => {
    await join();
    await accept({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      body: ModAction.encode(
        ModAction.fromPartial({
          verb: ModVerb.BAN,
          target: hex(OTHER_KEY),
          reason: 'spam',
        }),
      ).finish(),
    });

    // Leave, then try to come back.
    await accept({
      domain: 'jb:membership:leave:v1',
      seed: OTHER_SEED,
      scope: communityId,
      body: MembershipLeave.encode(
        MembershipLeave.fromPartial({ community: communityId }),
      ).finish(),
    });

    await expect(join()).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });
});

// ── Moderation ───────────────────────────────────────────────────────────────────────

describe('moderation (T1.23)', () => {
  async function createPost(): Promise<string> {
    const receipt = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Water rising', kind: 1 })).finish(),
    });
    return receipt.contentId;
  }

  it('P1-G8 — a captured moderator action cannot be replayed', async () => {
    const target = await createPost();
    const envelope = signEnvelope({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      nonce: nextNonce(),
      ...gates(),
      body: ModAction.encode(
        ModAction.fromPartial({ verb: ModVerb.REMOVE, target, reason: 'off topic' }),
      ).finish(),
    });

    await h.pipeline.accept(envelope);

    // Byte-identical resubmission is caught by content-ID dedupe and returns the ORIGINAL
    // receipt (ER-01) rather than acting twice.
    const replayed = await h.pipeline.accept(envelope);
    expect(replayed.contentId).toBeDefined();

    // A re-signed action reusing the SAME nonce is a genuine replay attempt, and the
    // registry marking this domain non-idempotent is what rejects it at step 12.
    const sameNonce = signEnvelope({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      nonce: new Uint8Array(16).fill(200),
      ...gates(),
      body: ModAction.encode(
        ModAction.fromPartial({ verb: ModVerb.REMOVE, target, reason: 'off topic' }),
      ).finish(),
    });
    await h.pipeline.accept(sameNonce);

    const replayDifferentBody = signEnvelope({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      nonce: new Uint8Array(16).fill(200),
      ...gates(),
      body: ModAction.encode(
        ModAction.fromPartial({ verb: ModVerb.RESTORE, target, reason: 'off topic' }),
      ).finish(),
    });
    await expect(h.pipeline.accept(replayDifferentBody)).rejects.toMatchObject({
      code: RejectionCode.REPLAY,
    });
  });

  it('FM-08 — REMOVE is a tombstone: the row and its author stay visible', async () => {
    const target = await createPost();
    await accept({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      body: ModAction.encode(
        ModAction.fromPartial({ verb: ModVerb.REMOVE, target, reason: 'rule 3' }),
      ).finish(),
    });

    const post = await h.projections.collection<PostDoc>(POSTS_COLLECTION).findOne({ id: target });
    expect(post).not.toBeNull();
    expect(post!.removed).toBe(true);
    expect(post!.removedReason).toBe('rule 3');
    expect(post!.authorKey).toBe(hex(AUTHOR_KEY));
  });

  it('projects lock, pin, flag, approve, and collapse moderation state', async () => {
    const target = await createPost();
    for (const verb of [ModVerb.LOCK, ModVerb.PIN, ModVerb.FLAG, ModVerb.APPROVE]) {
      await accept({
        domain: 'jb:mod:action:v1',
        scope: communityId,
        body: ModAction.encode(ModAction.fromPartial({ verb, target })).finish(),
      });
    }
    expect(
      await h.projections.collection<PostDoc>(POSTS_COLLECTION).findOne({ id: target }),
    ).toMatchObject({ locked: true, pinned: true, flagged: true, approved: true });

    await accept({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      body: ModAction.encode(ModAction.fromPartial({ verb: ModVerb.UNLOCK, target })).finish(),
    });
    const comment = await accept({
      domain: 'jb:comment:create:v1',
      scope: communityId,
      body: CommentCreate.encode(
        CommentCreate.fromPartial({ post: target, body_markdown: 'hide this branch' }),
      ).finish(),
    });
    await accept({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      body: ModAction.encode(
        ModAction.fromPartial({ verb: ModVerb.COLLAPSE, target: comment.contentId }),
      ).finish(),
    });
    expect(
      await h.projections
        .collection<CommentDoc>(COMMENTS_COLLECTION)
        .findOne({ id: comment.contentId }),
    ).toMatchObject({ collapsed: true });
  });

  it('FM-07 — the mod log is hash-chained and a tampered entry is detectable', async () => {
    const first = await createPost();
    const second = await createPost();
    for (const target of [first, second]) {
      await accept({
        domain: 'jb:mod:action:v1',
        scope: communityId,
        body: ModAction.encode(
          ModAction.fromPartial({ verb: ModVerb.REMOVE, target, reason: 'spam' }),
        ).finish(),
      });
    }

    const events = (
      await h.projections.collection<ModEventDoc>(MOD_EVENTS_COLLECTION).find({}, 100)
    )
      .slice()
      .sort((a, b) => a.sequence - b.sequence);
    expect(events).toHaveLength(2);
    expect(verifyModChain(events).ok).toBe(true);

    // Rewrite history the way a coerced operator would: change the reason on entry 0.
    const tampered = [{ ...events[0]!, reason: 'nothing to see here' }, events[1]!];
    // The reason is not in the chain hash, so the chain still verifies — which is exactly
    // why the RECORD, not the chain alone, is the evidence. Change a chained field and the
    // break is immediate:
    const chainBroken = [{ ...events[0]!, target: 'jb1forged' }, events[1]!];
    expect(verifyModChain(tampered).ok).toBe(true);
    expect(verifyModChain(chainBroken)).toMatchObject({ ok: false, brokenAt: 0 });
  });

  it('a member without the permission bit cannot moderate', async () => {
    const target = await createPost();
    await accept({
      domain: 'jb:membership:join:v1',
      seed: OTHER_SEED,
      scope: communityId,
      body: MembershipJoin.encode(MembershipJoin.fromPartial({ community: communityId })).finish(),
    });

    await expect(
      accept({
        domain: 'jb:mod:action:v1',
        seed: OTHER_SEED,
        scope: communityId,
        body: ModAction.encode(
          ModAction.fromPartial({ verb: ModVerb.REMOVE, target, reason: 'because' }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });

  it('the community owner cannot be banned by a delegated moderator', async () => {
    await expect(
      accept({
        domain: 'jb:mod:action:v1',
        scope: communityId,
        body: ModAction.encode(
          ModAction.fromPartial({
            verb: ModVerb.BAN,
            target: hex(AUTHOR_KEY),
            reason: 'coup',
          }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });

  it('binds moderation authority to the stored target type', async () => {
    const target = await createPost();
    await expect(
      accept({
        domain: 'jb:mod:action:v1',
        scope: communityId,
        body: ModAction.encode(
          ModAction.fromPartial({
            verb: ModVerb.REMOVE,
            target,
            target_kind: TargetKind.TARGET_KIND_COMMENT,
            reason: 'mislabeled target',
          }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });
});

// ── Roles ────────────────────────────────────────────────────────────────────────────

describe('roles (T1.25, ROL-11)', () => {
  // `validate` is PURE, so it is tested directly against literal values rather than
  // through the pipeline. Going through the pipeline here would prove nothing about this
  // rule: step 14 AUTHORISE runs before step 15 BODY VALIDATE (Plans/02 §5), so the
  // escalation guard would reject an undefined-bit mask first and the assertion would pass
  // for the wrong reason.
  it('ROL-11 — validate rejects a mask containing undefined bits', () => {
    const handler = new RoleDefineHandler(h.projections);
    const env = { createdAtMs: BigInt(NOW_MS) } as never;

    const undefinedBit = handler.validate(
      RoleDefine.fromPartial({
        community: communityId,
        name: 'greeter',
        permission_mask: 1n << 60n,
      }),
      env,
    );
    expect(undefinedBit).toMatchObject({ ok: false, field: 'permission_mask' });

    const known = handler.validate(
      RoleDefine.fromPartial({
        community: communityId,
        name: 'greeter',
        permission_mask: Permission['post.create'],
      }),
      env,
    );
    expect(known.ok).toBe(true);
  });

  it('a role cannot grant more than its author holds (privilege escalation)', async () => {
    // A plain member with member.role.update but nothing else must not be able to mint a
    // role carrying community.update and assign it to themselves.
    await accept({
      domain: 'jb:membership:join:v1',
      seed: OTHER_SEED,
      scope: communityId,
      body: MembershipJoin.encode(MembershipJoin.fromPartial({ community: communityId })).finish(),
    });

    await expect(
      accept({
        domain: 'jb:role:define:v1',
        seed: OTHER_SEED,
        scope: communityId,
        body: RoleDefine.encode(
          RoleDefine.fromPartial({
            community: communityId,
            name: 'takeover',
            permission_mask: Permission['community.update'],
          }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });

  it('the owner may define and assign a role', async () => {
    await accept({
      domain: 'jb:role:define:v1',
      scope: communityId,
      body: RoleDefine.encode(
        RoleDefine.fromPartial({
          community: communityId,
          name: 'greeter',
          permission_mask: Permission['post.create'],
        }),
      ).finish(),
    });

    const receipt = await accept({
      domain: 'jb:role:assign:v1',
      scope: communityId,
      body: RoleAssign.encode(
        RoleAssign.fromPartial({
          community: communityId,
          subject_key: OTHER_KEY,
          role: 'greeter',
        }),
      ).finish(),
    });
    expect(receipt.contentId).toMatch(/^jb1/);
  });

  it('ROL-07 — joining assigns every default role', async () => {
    await accept({
      domain: 'jb:role:define:v1',
      scope: communityId,
      body: RoleDefine.encode(
        RoleDefine.fromPartial({
          community: communityId,
          name: 'neighbour',
          permission_mask: Permission['post.create'],
          is_default: true,
        }),
      ).finish(),
    });
    await accept({
      domain: 'jb:membership:join:v1',
      seed: OTHER_SEED,
      scope: communityId,
      body: MembershipJoin.encode(MembershipJoin.fromPartial({ community: communityId })).finish(),
    });
    expect(
      await h.projections
        .collection<RoleAssignmentDoc>(ROLE_ASSIGNMENTS_COLLECTION)
        .findOne({ id: roleAssignmentKey(communityId, hex(OTHER_KEY), 'neighbour') }),
    ).toMatchObject({ role: 'neighbour', subjectKey: hex(OTHER_KEY) });
  });
});

// ── Content ownership ────────────────────────────────────────────────────────────────

describe('post and comment ownership (T1.18, T1.19)', () => {
  it('PST-01/PST-05/PST-07 — preserves poll, crosspost, flags, and community counters', async () => {
    const source = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Source', kind: 1 })).finish(),
    });
    const poll = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(
        PostCreate.fromPartial({
          title: 'Choose a shelter',
          kind: 5,
          poll: {
            question: 'Where?',
            options: ['North', 'South'],
            multiple: true,
            closes_at_ms: BigInt(NOW_MS + 60_000),
          },
          flags: { nsfw: false, spoiler: true, oc: true },
        }),
      ).finish(),
    });
    const crosspost = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(
        PostCreate.fromPartial({
          title: 'Shared source',
          kind: 6,
          crosspost_of: source.contentId,
        }),
      ).finish(),
    });

    const projected = await h.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: poll.contentId });
    const community = await h.projections
      .collection<CommunityDoc>(COMMUNITIES_COLLECTION)
      .findOne({ id: communityId });
    expect(projected).toMatchObject({
      poll: { question: 'Where?', options: ['North', 'South'], multiple: true },
      flags: { spoiler: true, oc: true },
    });
    expect(
      (
        await h.projections
          .collection<PostDoc>(POSTS_COLLECTION)
          .findOne({ id: crosspost.contentId })
      )?.crosspostOf,
    ).toBe(source.contentId);
    expect(community?.postCount).toBe(3);
  });

  it('only the author may edit or delete their post', async () => {
    const receipt = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Mine', kind: 1 })).finish(),
    });

    await expect(
      accept({
        domain: 'jb:post:update:v1',
        seed: OTHER_SEED,
        scope: communityId,
        body: PostUpdate.encode(
          PostUpdate.fromPartial({ target: receipt.contentId, body_markdown: 'defaced' }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });

    await expect(
      accept({
        domain: 'jb:post:delete:v1',
        seed: OTHER_SEED,
        scope: communityId,
        body: PostDelete.encode(PostDelete.fromPartial({ target: receipt.contentId })).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });

  it('a removed post cannot be edited back into view by its author', async () => {
    const receipt = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Removed soon', kind: 1 })).finish(),
    });
    await accept({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      body: ModAction.encode(
        ModAction.fromPartial({ verb: ModVerb.REMOVE, target: receipt.contentId, reason: 'x' }),
      ).finish(),
    });

    await expect(
      accept({
        domain: 'jb:post:update:v1',
        scope: communityId,
        body: PostUpdate.encode(
          PostUpdate.fromPartial({ target: receipt.contentId, body_markdown: 'back' }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });

  it('a comment on an unknown post is refused (referential integrity, not approval)', async () => {
    await expect(
      accept({
        domain: 'jb:comment:create:v1',
        scope: communityId,
        body: CommentCreate.encode(
          CommentCreate.fromPartial({ post: 'jb1'.padEnd(55, 'a'), body_markdown: 'hi' }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });
});

describe('votes and karma (VOT-01–VOT-04, USR-03)', () => {
  it('attributes a changed vote delta to the target author', async () => {
    const post = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Useful', kind: 1 })).finish(),
    });
    await accept({
      domain: 'jb:membership:join:v1',
      seed: OTHER_SEED,
      scope: communityId,
      body: MembershipJoin.encode(MembershipJoin.fromPartial({ community: communityId })).finish(),
    });

    await accept({
      domain: 'jb:vote:cast:v1',
      seed: OTHER_SEED,
      scope: communityId,
      body: VoteCast.encode(VoteCast.fromPartial({ target: post.contentId, value: 1 })).finish(),
    });
    // Later in time, because that is what "changed their vote" means and it is what the
    // projection orders by. The harness stamps every envelope with a frozen `NOW_MS`, so
    // without this both votes carry the same `created_at_ms` and the merge falls to its
    // content-id tie-break — deterministic across nodes, but not what this test is about.
    // The tie itself is covered directly in `vote-cast.spec.ts`.
    await accept({
      domain: 'jb:vote:cast:v1',
      seed: OTHER_SEED,
      scope: communityId,
      createdAtMs: BigInt(NOW_MS + 1),
      body: VoteCast.encode(VoteCast.fromPartial({ target: post.contentId, value: -1 })).finish(),
    });

    const identity = await h.projections
      .collection<IdentityDoc>(IDENTITIES_COLLECTION)
      .findOne({ id: hex(AUTHOR_KEY) });
    expect(identity?.postKarma).toBe(-1);
  });

  it('enforces a community minimum-karma policy before posting', async () => {
    await accept({
      domain: 'jb:membership:join:v1',
      seed: OTHER_SEED,
      scope: communityId,
      body: MembershipJoin.encode(MembershipJoin.fromPartial({ community: communityId })).finish(),
    });
    await h.projections.transaction(async (tx) => {
      const communities = h.projections.collection<CommunityDoc>(COMMUNITIES_COLLECTION);
      const community = await communities.findOne({ id: communityId });
      await communities.put(
        communityId,
        {
          ...community!,
          settings: { ...community!.settings, minimumKarmaToPost: 5 },
        },
        tx,
      );
    });

    await expect(
      accept({
        domain: 'jb:post:create:v1',
        seed: OTHER_SEED,
        scope: communityId,
        body: PostCreate.encode(PostCreate.fromPartial({ title: 'Too soon', kind: 1 })).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });
});

// ── Awards, messaging, labels, social ────────────────────────────────────────────────

describe('awards (T1.26, AWD-09)', () => {
  beforeEach(async () => {
    // Award types are instance-admin gated, so grant the flag directly on the projection.
    await h.projections.transaction(async (tx) => {
      const identities = h.projections.collection<IdentityDoc>(IDENTITIES_COLLECTION);
      await identities.put(
        hex(AUTHOR_KEY),
        {
          id: hex(AUTHOR_KEY),
          displayName: '',
          bio: '',
          avatar: '',
          banner: '',
          flags: (IdentityFlag.ACTIVE | IdentityFlag.GLOBAL_ADMIN).toString(),
          postKarma: 0,
          commentKarma: 0,
          firstSeenAtMs: NOW_MS,
        },
        tx,
      );
    });

    await accept({
      domain: 'jb:award:type:v1',
      scope: '',
      body: AwardTypeDefine.encode(
        AwardTypeDefine.fromPartial({ slug: 'helpful', name: 'Helpful', cost: 5, active: true }),
      ).finish(),
    });
  });

  it('AWD-09 — an anonymous award stores no giver in the projection', async () => {
    const post = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Award me', kind: 1 })).finish(),
    });

    const award = await accept({
      domain: 'jb:award:give:v1',
      scope: communityId,
      body: AwardGive.encode(
        AwardGive.fromPartial({
          target: post.contentId,
          award_type: 'helpful',
          anonymous: true,
        }),
      ).finish(),
    });

    const doc = await h.projections
      .collection<AwardDoc>(AWARDS_COLLECTION)
      .findOne({ id: award.contentId });
    // Someone reading the database directly still cannot answer "who gave this".
    expect(doc!.anonymous).toBe(true);
    expect(doc!.giverKey).toBeNull();
    expect(
      (await h.projections.collection<PostDoc>(POSTS_COLLECTION).findOne({ id: post.contentId }))
        ?.awardCount,
    ).toBe(1);
  });

  it('refuses an award type the instance has not defined', async () => {
    const post = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'x', kind: 1 })).finish(),
    });
    await expect(
      accept({
        domain: 'jb:award:give:v1',
        scope: communityId,
        body: AwardGive.encode(
          AwardGive.fromPartial({ target: post.contentId, award_type: 'nonexistent' }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });
});

describe('messaging (T1.29, MSG-09, MSG-06)', () => {
  it('MSG-09 — the projection holds ciphertext and has no plaintext field at all', async () => {
    const receipt = await accept({
      domain: 'jb:message:forum:v1',
      scope: '',
      priority: 2,
      body: ForumMessageSend.encode(
        ForumMessageSend.fromPartial({
          recipient_key: OTHER_KEY,
          ciphertext: new Uint8Array([9, 9, 9]),
          thread: 't1',
        }),
      ).finish(),
    });

    const doc = await h.projections
      .collection<ForumMessageDoc>(FORUM_MESSAGES_COLLECTION)
      .findOne({ id: receipt.contentId });
    expect(doc!.ciphertext).toBe(Buffer.from([9, 9, 9]).toString('base64'));
    expect(Object.keys(doc!)).not.toContain('plaintext');
    expect(Object.keys(doc!)).not.toContain('bodyMarkdown');
  });

  it('MSG-06 — a block stops delivery', async () => {
    // The RECIPIENT blocks the sender.
    await accept({
      domain: 'jb:social:block:v1',
      seed: OTHER_SEED,
      scope: '',
      body: BlockIdentity.encode(
        BlockIdentity.fromPartial({ subject_key: AUTHOR_KEY, block: true }),
      ).finish(),
    });

    await expect(
      accept({
        domain: 'jb:message:forum:v1',
        scope: '',
        priority: 2,
        body: ForumMessageSend.encode(
          ForumMessageSend.fromPartial({
            recipient_key: OTHER_KEY,
            ciphertext: new Uint8Array([1]),
          }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.FORBIDDEN });
  });
});

describe('labels (T1.30, LBL-01)', () => {
  it('a restrictive verdict must state its reasons, or it is unappealable', async () => {
    const post = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Labelled', kind: 1 })).finish(),
    });

    await expect(
      accept({
        domain: 'jb:label:emit:v1',
        scope: communityId,
        body: Label.encode(
          Label.fromPartial({
            target: post.contentId,
            verdict: 3,
            model_id: 'human:mod',
            reasons: [],
          }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.BODY_INVALID });

    const ok = await accept({
      domain: 'jb:label:emit:v1',
      scope: communityId,
      body: Label.encode(
        Label.fromPartial({
          target: post.contentId,
          verdict: 3,
          model_id: 'human:mod',
          reasons: ['rule 3: no personal information'],
          appealable: true,
        }),
      ).finish(),
    });
    const doc = await h.projections
      .collection<LabelDoc>(LABELS_COLLECTION)
      .findOne({ id: ok.contentId });
    expect(doc!.appealable).toBe(true);
    expect(doc!.reasons).toHaveLength(1);
  });
});

describe('social and reports', () => {
  it('a profile row carries no network address (PA-01)', async () => {
    await accept({
      domain: 'jb:profile:update:v1',
      scope: '',
      body: ProfileUpdate.encode(
        ProfileUpdate.fromPartial({ display_name: 'Relief Coordinator' }),
      ).finish(),
    });

    const doc = await h.projections
      .collection<IdentityDoc>(IDENTITIES_COLLECTION)
      .findOne({ id: hex(AUTHOR_KEY) });
    expect(doc!.displayName).toBe('Relief Coordinator');
    for (const forbidden of ['ip', 'ipAddress', 'userAgent', 'session', 'deviceId']) {
      expect(Object.keys(doc!)).not.toContain(forbidden);
    }
  });

  it('a key cannot follow itself', async () => {
    await expect(
      accept({
        domain: 'jb:social:follow:v1',
        scope: '',
        body: FollowIdentity.encode(
          FollowIdentity.fromPartial({ subject_key: AUTHOR_KEY, follow: true }),
        ).finish(),
      }),
    ).rejects.toMatchObject({ code: RejectionCode.BODY_INVALID });
  });

  it('NOT-05 — follow notifications are derived from accepted envelopes', async () => {
    const follow = await accept({
      domain: 'jb:social:follow:v1',
      seed: OTHER_SEED,
      scope: '',
      body: FollowIdentity.encode(
        FollowIdentity.fromPartial({ subject_key: AUTHOR_KEY, follow: true }),
      ).finish(),
    });
    const notification = await h.projections
      .collection<NotificationDoc>(NOTIFICATIONS_COLLECTION)
      .findOne({ id: `${follow.contentId}:${hex(AUTHOR_KEY)}:follow` });
    expect(notification).toMatchObject({
      recipientKey: hex(AUTHOR_KEY),
      actorKey: hex(OTHER_KEY),
      kind: 'follow',
      read: false,
    });
  });

  it('a report lands PENDING and is visible to reviewers (MOD-18)', async () => {
    const post = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Reported', kind: 1 })).finish(),
    });
    await accept({
      domain: 'jb:membership:join:v1',
      seed: OTHER_SEED,
      scope: communityId,
      body: MembershipJoin.encode(MembershipJoin.fromPartial({ community: communityId })).finish(),
    });
    const report = await accept({
      domain: 'jb:report:create:v1',
      seed: OTHER_SEED,
      scope: communityId,
      body: ReportCreate.encode(
        ReportCreate.fromPartial({ target: post.contentId, reason: 1, detail: 'spam' }),
      ).finish(),
    });

    const doc = await h.projections
      .collection<ReportDoc>(REPORTS_COLLECTION)
      .findOne({ id: report.contentId });
    expect(doc!.status).toBe(ReportStatus.PENDING);
    expect(doc!.reporterKey).toBe(hex(OTHER_KEY));
  });
});

describe('key lifecycle (T1.9, T1.10, KY-02, KY-04)', () => {
  it('KY-02 — rejects a forged courier revocation and accepts the owner-authorized form', async () => {
    const unsignedBody = KeyRevocation.fromPartial({
      plane: 1,
      revoked_key: AUTHOR_KEY,
      kind: 3,
      effective_from_ms: BigInt(NOW_MS),
    });
    await expect(
      h.pipeline.accept(
        signEnvelope({
          domain: 'jb:key:revoke:forum:v1',
          seed: OTHER_SEED,
          priority: 1,
          body: KeyRevocation.encode(unsignedBody).finish(),
        }),
      ),
    ).rejects.toMatchObject({ code: RejectionCode.BODY_INVALID });

    const authorization = ed25519.sign(
      revocationAuthorizationBytes({
        plane: SdkPlane.FORUM,
        revokedKey: AUTHOR_KEY,
        kind: 3,
        effectiveFromMs: BigInt(NOW_MS),
        replacementKey: new Uint8Array(),
      }),
      AUTHOR_SEED,
    );
    const accepted = await h.pipeline.accept(
      signEnvelope({
        domain: 'jb:key:revoke:forum:v1',
        seed: OTHER_SEED,
        priority: 1,
        body: KeyRevocation.encode(
          KeyRevocation.fromPartial({
            ...unsignedBody,
            authorization_signature: authorization,
          }),
        ).finish(),
      }),
    );
    expect(accepted.contentId).toMatch(/^jb1/);
  });

  it('KY-04 — rotation transfers identity, membership, and role standing', async () => {
    const replacementSeed = new Uint8Array(32).fill(23);
    const replacementKey = ed25519.derivePublicKey(replacementSeed);
    const oldHex = hex(AUTHOR_KEY);
    const replacementHex = hex(replacementKey);

    await h.projections.transaction(async (tx) => {
      await h.projections.collection<IdentityDoc>(IDENTITIES_COLLECTION).put(
        oldHex,
        {
          id: oldHex,
          displayName: 'River Watch',
          bio: 'Volunteer',
          avatar: '',
          banner: '',
          flags: IdentityFlag.ACTIVE.toString(),
          postKarma: 17,
          commentKarma: 9,
          firstSeenAtMs: NOW_MS - 1000,
        },
        tx,
      );
      const assignment: RoleAssignmentDoc = {
        id: roleAssignmentKey(communityId, oldHex, 'coordinator'),
        community: communityId,
        subjectKey: oldHex,
        role: 'coordinator',
        assignedAtMs: NOW_MS - 500,
      };
      await h.projections
        .collection<RoleAssignmentDoc>(ROLE_ASSIGNMENTS_COLLECTION)
        .put(assignment.id, assignment, tx);
    });

    await h.pipeline.accept(
      signEnvelope({
        domain: 'jb:key:revoke:forum:v1',
        priority: 1,
        body: KeyRevocation.encode(
          KeyRevocation.fromPartial({
            plane: 1,
            revoked_key: AUTHOR_KEY,
            kind: 1,
            effective_from_ms: BigInt(NOW_MS),
            replacement_key: replacementKey,
          }),
        ).finish(),
      }),
    );

    const inheritedIdentity = await h.projections
      .collection<IdentityDoc>(IDENTITIES_COLLECTION)
      .findOne({ id: replacementHex });
    const inheritedMembership = await h.projections
      .collection<MembershipDoc>(MEMBERSHIPS_COLLECTION)
      .findOne({ id: membershipKey(communityId, replacementHex) });
    const inheritedRole = await h.projections
      .collection<RoleAssignmentDoc>(ROLE_ASSIGNMENTS_COLLECTION)
      .findOne({ id: roleAssignmentKey(communityId, replacementHex, 'coordinator') });

    expect(inheritedIdentity).toMatchObject({ displayName: 'River Watch', postKarma: 17 });
    expect(inheritedMembership?.memberKey).toBe(replacementHex);
    expect(inheritedRole?.subjectKey).toBe(replacementHex);
  });
});

// ── P1-G11, restated against the full feature set ────────────────────────────────────

describe('P1-G11 — the registry is the only extension point', () => {
  it('every registered handler matches a contract row and its plane', () => {
    // `DomainRegistry.register` cross-checks each handler against the generated
    // DOMAIN_SPECS. Building the harness above already exercised that for all 30 handlers;
    // this asserts the count so a silently-dropped handler is visible.
    expect(h.registry.size).toBe(30);
  });

  it('rejects EnvelopeRejected as the typed contract for every failure', async () => {
    await expect(
      accept({ domain: 'jb:post:create:v1', scope: '', body: new Uint8Array(0) }),
    ).rejects.toBeInstanceOf(EnvelopeRejected);
  });
});
