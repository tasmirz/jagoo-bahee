/**
 * T1.39 / P1-G11 — adding a domain requires ZERO changes to ingress, projector dispatch or
 * signing code, plus the post → comment → vote flow the P1 demo depends on.
 *
 * ── How P1-G11 is actually proved here ──────────────────────────────────────────────
 * Not by inspection, and not by a comment. `jb:membership:join:v1` has never appeared
 * anywhere in `core/`: no import, no case, no mention. The test registers a handler for it
 * and pushes a signed envelope through the *unmodified* pipeline. If the core needed to
 * know about a domain to dispatch it, this could not pass.
 *
 * The negative half — no `switch (domain)` may exist in `core/` — is lint-enforced (AR-05)
 * and probed by `import-boundary.spec.ts`. Together they are the Open/Closed guarantee.
 */

import { describe, expect, it } from 'vitest';
import { PostCreate, CommentCreate, VoteCast, MembershipJoin } from '@jagoo/sdk/proto';
import { Plane } from '../../core/domain/envelope.js';
import { allowed, valid, type DomainHandler, type Tx } from '../../core/domain/domain-handler.js';
import type { ParsedEnvelope } from '../../core/domain/envelope.js';
import { buildHarness, signEnvelope, NOW_MS } from '../../testing/harness.js';
import { PostCreateHandler } from './post/post-create.handler.js';
import { POSTS_COLLECTION, type PostDoc } from './post/post.projection.js';
import {
  CommentCreateHandler,
  COMMENTS_COLLECTION,
  type CommentDoc,
} from './comment/comment-create.handler.js';
import { VoteCastHandler } from './vote/vote-cast.handler.js';

const CREDENTIAL_SEED = new Uint8Array([1, 2, 3, 4]);
const VALID_CREDENTIAL = Uint8Array.from(CREDENTIAL_SEED, (b) => b ^ 0xff);

/** A fresh nullifier per envelope: the registry gives post/comment a per-epoch quota. */
let nullifierCounter = 0;
const nextNullifier = (): Uint8Array => new Uint8Array(16).fill((nullifierCounter += 1) % 251);

async function forumHarness() {
  const h = await buildHarness((registry, projections) => {
    registry.register(new PostCreateHandler(projections));
    registry.register(new CommentCreateHandler(projections));
    registry.register(new VoteCastHandler(projections));
  });
  await h.credentials.issue(CREDENTIAL_SEED);
  return h;
}

const gated = (over: Record<string, unknown>) => ({
  credential: VALID_CREDENTIAL,
  nullifier: nextNullifier(),
  epoch: 1,
  ...over,
});

describe('post → comment → vote', () => {
  it('threads comments by content ID and aggregates score', async () => {
    const h = await forumHarness();

    const post = await h.pipeline.accept(
      signEnvelope(
        gated({
          domain: 'jb:post:create:v1',
          body: PostCreate.encode(
            PostCreate.fromPartial({ title: 'Shelter open in Mirpur', kind: 1 }),
          ).finish(),
        }),
      ),
    );

    const comment = await h.pipeline.accept(
      signEnvelope(
        gated({
          domain: 'jb:comment:create:v1',
          body: CommentCreate.encode(
            CommentCreate.fromPartial({ post: post.contentId, body_markdown: 'How many beds?' }),
          ).finish(),
        }),
      ),
    );

    const reply = await h.pipeline.accept(
      signEnvelope(
        gated({
          domain: 'jb:comment:create:v1',
          body: CommentCreate.encode(
            CommentCreate.fromPartial({
              post: post.contentId,
              parent_comment: comment.contentId,
              body_markdown: 'About forty.',
            }),
          ).finish(),
        }),
      ),
    );

    const comments = h.projections.collection<CommentDoc>(COMMENTS_COLLECTION);
    expect((await comments.findOne({ id: comment.contentId }))!.depth).toBe(0);
    expect((await comments.findOne({ id: reply.contentId }))!.depth).toBe(1);
    expect((await comments.findOne({ id: comment.contentId }))!.replyCount).toBe(1);

    const posts = h.projections.collection<PostDoc>(POSTS_COLLECTION);
    expect((await posts.findOne({ id: post.contentId }))!.commentCount).toBe(2);

    // `jb:vote:cast:v1` is non-idempotent, so each vote needs a distinct nonce.
    await h.pipeline.accept(
      signEnvelope(
        gated({
          domain: 'jb:vote:cast:v1',
          nonce: new Uint8Array(16).fill(31),
          body: VoteCast.encode(
            VoteCast.fromPartial({ target: post.contentId, value: 1 }),
          ).finish(),
        }),
      ),
    );
    expect((await posts.findOne({ id: post.contentId }))!.score).toBe(1);

    // Re-voting REPLACES. Without that, the same vote over two transports counts twice.
    await h.pipeline.accept(
      signEnvelope(
        gated({
          domain: 'jb:vote:cast:v1',
          nonce: new Uint8Array(16).fill(32),
          body: VoteCast.encode(
            VoteCast.fromPartial({ target: post.contentId, value: -1 }),
          ).finish(),
        }),
      ),
    );
    expect((await posts.findOne({ id: post.contentId }))!.score).toBe(-1);
  });

  it('a comment on an unknown post is rejected, not silently orphaned', async () => {
    const h = await forumHarness();
    await expect(
      h.pipeline.accept(
        signEnvelope(
          gated({
            domain: 'jb:comment:create:v1',
            body: CommentCreate.encode(
              CommentCreate.fromPartial({ post: `jb1${'a'.repeat(52)}`, body_markdown: 'hello' }),
            ).finish(),
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('P1-G11 — a new domain needs zero core changes', () => {
  it('dispatches jb:membership:join:v1, which the core has never heard of', async () => {
    const projected: string[] = [];

    // Written here, in the feature layer, with nothing added to core/ for it.
    class MembershipJoinHandler implements DomainHandler<MembershipJoin> {
      readonly domain = 'jb:membership:join:v1';
      readonly plane = Plane.FORUM;
      decode(body: Uint8Array) {
        return MembershipJoin.decode(body);
      }
      validate() {
        return valid;
      }
      async authorize() {
        return allowed;
      }
      async project(body: MembershipJoin, _env: ParsedEnvelope, _tx: Tx) {
        projected.push(body.community);
      }
    }

    const h = await buildHarness((registry) => registry.register(new MembershipJoinHandler()));
    await h.credentials.issue(CREDENTIAL_SEED);

    // The anti-abuse gates come from the domain's registry row, which the core reads rather
    // than knowing about — so a brand-new domain is gated correctly with no core change.
    const receipt = await h.pipeline.accept(
      signEnvelope(
        gated({
          domain: 'jb:membership:join:v1',
          scope: 'dhaka-relief@jbs1a4f7m2k',
          nonce: new Uint8Array(16).fill(77),
          body: MembershipJoin.encode(
            MembershipJoin.fromPartial({ community: 'dhaka-relief@jbs1a4f7m2k' }),
          ).finish(),
        }),
      ),
    );

    expect(receipt.contentId).toMatch(/^jb1/);
    expect(projected).toEqual(['dhaka-relief@jbs1a4f7m2k']);
    expect(receipt.acceptedAtMs).toBe(NOW_MS);
  });

  it('refuses a handler for a domain the generated registry does not define (RG-01)', async () => {
    // The registry is the only place a domain is defined. A handler cannot invent one, or
    // two nodes would disagree about what is dispatchable.
    class RogueHandler implements DomainHandler<unknown> {
      readonly domain = 'jb:rogue:invented:v1';
      readonly plane = Plane.FORUM;
      decode() {
        return null;
      }
      validate() {
        return valid;
      }
      async authorize() {
        return allowed;
      }
      async project() {}
    }

    const h = await buildHarness();
    expect(() => h.registry.register(new RogueHandler())).toThrow(/not in the generated registry/);
  });

  it('refuses a handler whose plane disagrees with the registry (SEP-02)', async () => {
    class WrongPlaneHandler implements DomainHandler<unknown> {
      readonly domain = 'jb:post:create:v1';
      readonly plane = Plane.SIGNAL; // the registry says FORUM
      decode() {
        return null;
      }
      validate() {
        return valid;
      }
      async authorize() {
        return allowed;
      }
      async project() {}
    }

    const h = await buildHarness();
    expect(() => h.registry.register(new WrongPlaneHandler())).toThrow(/registry says FORUM/);
  });
});
