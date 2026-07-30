/**
 * MOD-08, MOD-09, COM-05, COM-06, VIS-06 — the audit trail has to be legible, and settings
 * changes have to leave one.
 *
 * Two defects are pinned here:
 *
 *   1. A mod log row carried `target: "jb1…"` and nothing else. That satisfies MOD-09's
 *      wording and defeats its purpose: nobody auditing the log can tell what was removed
 *      without resolving every ID by hand, and a member action's target is a raw hex key.
 *   2. `CommunityUpdateHandler` overwrote the community row in place, so who enabled
 *      require-post-approval — a lever that changes what every future post does — was
 *      recoverable only by replaying the envelope log by hand.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  CommentCreate,
  CommunityArchive,
  CommunityCreate,
  CommunityUpdate,
  ModAction,
  PostCreate,
} from '@jagoo/sdk/proto';
import { AUTHOR_KEY, buildHarness, signEnvelope, type Harness } from '../../testing/harness.js';
import { InMemoryNodeSigner } from '../../adapters/outbound/in-memory/in-memory-node.js';
import { forumHandlers } from './index.js';
import { COMMUNITIES_COLLECTION, type CommunityDoc } from './community/community.projection.js';
import {
  COMMUNITY_AUDIT_COLLECTION,
  verifyCommunityAuditChain,
  type CommunityAuditDoc,
} from './community/community-audit.projection.js';
import {
  MOD_EVENTS_COLLECTION,
  ModVerb,
  verifyModChain,
  type ModEventDoc,
} from './moderation/moderation.projection.js';
import { SUMMARY_EXCERPT_CHARS } from './shared/target-summary.js';

let h: Harness;
let communityId: string;
let nonceCounter = 0;
let nullifierCounter = 0;

const nextNonce = () => new Uint8Array(16).fill((nonceCounter += 1) % 251);
const nextNullifier = () => new Uint8Array(16).fill((nullifierCounter += 3) % 251);

const gates = () => ({
  credential: Uint8Array.from([1, 2, 3, 4], (b) => b ^ 0xff),
  nullifier: nextNullifier(),
  epoch: 1,
  pow: new Uint8Array([1]),
});

async function accept(over: Parameters<typeof signEnvelope>[0]) {
  return h.pipeline.accept(signEnvelope({ nonce: nextNonce(), ...gates(), ...over }));
}

const auditRows = async (): Promise<readonly CommunityAuditDoc[]> =>
  (await h.projections.collection<CommunityAuditDoc>(COMMUNITY_AUDIT_COLLECTION).find({}, 100))
    .slice()
    .sort((a, b) => a.sequence - b.sequence);

const modRows = async (): Promise<readonly ModEventDoc[]> =>
  (await h.projections.collection<ModEventDoc>(MOD_EVENTS_COLLECTION).find({}, 100))
    .slice()
    .sort((a, b) => a.sequence - b.sequence);

beforeEach(async () => {
  const originServerId = new InMemoryNodeSigner().serverId;
  h = await buildHarness((registry, projections) => {
    for (const handler of forumHandlers(projections, {
      serverId: originServerId,
      publicKey: new Uint8Array(32).fill(7),
      sign: () => new Uint8Array(64),
    })) {
      registry.register(handler);
    }
  });
  h.certificates.add({ key: AUTHOR_KEY, issuedAtMs: 0 });
  await h.credentials.issue(new Uint8Array([1, 2, 3, 4]));

  await accept({
    domain: 'jb:community:create:v1',
    scope: '',
    body: CommunityCreate.encode(
      CommunityCreate.fromPartial({ name: 'dhaka_relief', title: 'Dhaka Relief' }),
    ).finish(),
  });
  communityId = `dhaka_relief@${originServerId}`;
});

describe('moderation log target summary (MOD-09)', () => {
  it('records what was removed, not only its content ID', async () => {
    const post = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(
        PostCreate.fromPartial({
          title: 'ত্রাণ কেন্দ্র খোলা আছে',
          kind: 1,
          body_markdown: 'মিরপুর ১০ নম্বরে ৪০টি বিছানা আছে।',
        }),
      ).finish(),
    });

    await accept({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      body: ModAction.encode(
        ModAction.fromPartial({
          verb: ModVerb.REMOVE,
          target: post.contentId,
          reason: 'off topic',
        }),
      ).finish(),
    });

    const [event] = (await modRows()).filter((row) => row.verb === ModVerb.REMOVE);
    expect(event?.targetSummary).toMatchObject({
      kind: 'post',
      target: post.contentId,
      title: 'ত্রাণ কেন্দ্র খোলা আছে',
      excerpt: 'মিরপুর ১০ নম্বরে ৪০টি বিছানা আছে।',
      authorKey: Buffer.from(AUTHOR_KEY).toString('hex'),
    });
  });

  it('snapshots the state the moderator acted on, before the verb is applied', async () => {
    const post = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Shelter open', kind: 1 })).finish(),
    });

    await accept({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      body: ModAction.encode(
        ModAction.fromPartial({ verb: ModVerb.REMOVE, target: post.contentId }),
      ).finish(),
    });

    // Not `removed: true`. The log records what was in front of the moderator when they
    // decided; recording the result of their own action tells a reader nothing.
    const [event] = (await modRows()).filter((row) => row.verb === ModVerb.REMOVE);
    expect(event?.targetSummary?.removed).toBe(false);
  });

  it('resolves a comment target, including the post it belongs to', async () => {
    const post = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Shelter open', kind: 1 })).finish(),
    });
    const comment = await accept({
      domain: 'jb:comment:create:v1',
      scope: communityId,
      body: CommentCreate.encode(
        CommentCreate.fromPartial({ post: post.contentId, body_markdown: 'How many beds?' }),
      ).finish(),
    });

    await accept({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      body: ModAction.encode(
        ModAction.fromPartial({ verb: ModVerb.COLLAPSE, target: comment.contentId }),
      ).finish(),
    });

    const [event] = (await modRows()).filter((row) => row.verb === ModVerb.COLLAPSE);
    expect(event?.targetSummary).toMatchObject({
      kind: 'comment',
      excerpt: 'How many beds?',
      parentPost: post.contentId,
    });
  });

  it('truncates a long body in code points, so Bangla is not cut to a third of English', async () => {
    const body = 'ক'.repeat(SUMMARY_EXCERPT_CHARS + 50);
    const post = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(
        PostCreate.fromPartial({ title: 'Long', kind: 1, body_markdown: body }),
      ).finish(),
    });

    await accept({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      body: ModAction.encode(
        ModAction.fromPartial({ verb: ModVerb.FLAG, target: post.contentId }),
      ).finish(),
    });

    const [event] = (await modRows()).filter((row) => row.verb === ModVerb.FLAG);
    expect([...(event?.targetSummary?.excerpt ?? '')]).toHaveLength(SUMMARY_EXCERPT_CHARS);
    expect(event?.targetSummary?.truncated).toBe(true);
  });

  it('leaves the hash chain intact — the summary is convenience, not a chained claim', async () => {
    const post = await accept({
      domain: 'jb:post:create:v1',
      scope: communityId,
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Shelter open', kind: 1 })).finish(),
    });
    await accept({
      domain: 'jb:mod:action:v1',
      scope: communityId,
      body: ModAction.encode(
        ModAction.fromPartial({ verb: ModVerb.REMOVE, target: post.contentId }),
      ).finish(),
    });

    expect(verifyModChain(await modRows())).toEqual({ ok: true });
  });
});

describe('community governance audit trail (COM-05, COM-06, VIS-06)', () => {
  it('seeds the chain at creation so the first update has a real baseline', async () => {
    const rows = await auditRows();
    expect(rows[0]).toMatchObject({ action: 'create', sequence: 0, previousHash: '' });
    expect(rows[0]?.changes).toEqual(
      expect.arrayContaining([{ field: 'title', before: '', after: 'Dhaka Relief' }]),
    );
  });

  it('names who turned on require-post-approval, and what it was before', async () => {
    await accept({
      domain: 'jb:community:update:v1',
      scope: communityId,
      body: CommunityUpdate.encode(
        CommunityUpdate.fromPartial({
          target: communityId,
          patch: CommunityCreate.fromPartial({
            title: 'Dhaka Relief',
            settings: { require_post_approval: true },
          }),
        }),
      ).finish(),
    });

    const update = (await auditRows()).find((row) => row.action === 'update');
    expect(update?.actorKey).toBe(Buffer.from(AUTHOR_KEY).toString('hex'));
    expect(update?.changes).toEqual(
      expect.arrayContaining([
        { field: 'settings.requirePostApproval', before: 'false', after: 'true' },
      ]),
    );
  });

  it('records only fields that actually changed', async () => {
    await accept({
      domain: 'jb:community:update:v1',
      scope: communityId,
      body: CommunityUpdate.encode(
        CommunityUpdate.fromPartial({
          target: communityId,
          patch: CommunityCreate.fromPartial({ title: 'Dhaka Relief Network' }),
        }),
      ).finish(),
    });

    const update = (await auditRows()).find((row) => row.action === 'update');
    expect(update?.changes).toEqual([
      { field: 'title', before: 'Dhaka Relief', after: 'Dhaka Relief Network' },
    ]);
  });

  it('records an archive — the closest thing to deletion leaves the loudest trace', async () => {
    await accept({
      domain: 'jb:community:archive:v1',
      scope: communityId,
      body: CommunityArchive.encode(
        CommunityArchive.fromPartial({ target: communityId, archived: true }),
      ).finish(),
    });

    const archive = (await auditRows()).find((row) => row.action === 'archive');
    expect(archive?.changes).toEqual([{ field: 'archived', before: 'false', after: 'true' }]);
  });

  it('chains entries so a dropped row is detectable', async () => {
    await accept({
      domain: 'jb:community:update:v1',
      scope: communityId,
      body: CommunityUpdate.encode(
        CommunityUpdate.fromPartial({
          target: communityId,
          patch: CommunityCreate.fromPartial({ title: 'Second' }),
        }),
      ).finish(),
    });
    await accept({
      domain: 'jb:community:archive:v1',
      scope: communityId,
      body: CommunityArchive.encode(
        CommunityArchive.fromPartial({ target: communityId, archived: true }),
      ).finish(),
    });

    const rows = await auditRows();
    expect(rows).toHaveLength(3);
    expect(verifyCommunityAuditChain(rows)).toEqual({ ok: true });

    // Excise the middle entry, exactly as an operator covering their tracks would.
    expect(verifyCommunityAuditChain([rows[0]!, rows[2]!])).toEqual({ ok: false, brokenAt: 1 });
  });

  it('detects an edited change list — the chain commits to the values, not just the order', async () => {
    await accept({
      domain: 'jb:community:update:v1',
      scope: communityId,
      body: CommunityUpdate.encode(
        CommunityUpdate.fromPartial({
          target: communityId,
          patch: CommunityCreate.fromPartial({
            title: 'Dhaka Relief',
            settings: { require_post_approval: true },
          }),
        }),
      ).finish(),
    });

    const rows = await auditRows();
    const tampered = rows.map((row) =>
      row.action === 'update'
        ? { ...row, changes: [{ field: 'settings.requirePostApproval', before: 'true', after: 'true' }] }
        : row,
    );
    expect(verifyCommunityAuditChain(tampered).ok).toBe(false);
  });

  it('does not touch the community row itself — settings stay where readers expect them', async () => {
    await accept({
      domain: 'jb:community:update:v1',
      scope: communityId,
      body: CommunityUpdate.encode(
        CommunityUpdate.fromPartial({
          target: communityId,
          patch: CommunityCreate.fromPartial({
            title: 'Dhaka Relief',
            settings: { require_post_approval: true },
          }),
        }),
      ).finish(),
    });

    const doc = await h.projections
      .collection<CommunityDoc>(COMMUNITIES_COLLECTION)
      .findOne({ id: communityId });
    expect(doc?.settings.requirePostApproval).toBe(true);
  });
});
