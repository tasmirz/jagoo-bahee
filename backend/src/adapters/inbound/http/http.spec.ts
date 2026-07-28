/**
 * T1.7 / T1.31 — the HTTP surface, against a real Nest app on the Fastify adapter.
 *
 * Exercises the actual composition root, so this fails if a port is left unbound — the
 * failure mode a unit test with hand-wired dependencies cannot catch.
 */

import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AttachmentClaim,
  Envelope,
  PostCreate,
  CommentCreate,
  ProfileUpdate,
  VoteCast,
} from '@jagoo/sdk/proto';
import { AppModule } from '../../../composition/app.module.js';
import { CredentialIssuer } from '../../../core/ports/anti-abuse.port.js';
import {
  AUTHOR_KEY,
  AUTHOR_SEED,
  certifyEnvelope,
  signEnvelope,
} from '../../../testing/harness.js';
import { verifyInclusion, hashLeaf } from '../../../core/domain/merkle.js';
import { ed25519 } from '@jagoo/sdk/crypto';
import { authSigningBytes } from '../../outbound/redis/session-auth.js';

let app: NestFastifyApplication;
let accessToken = '';
let refreshToken = '';
let refreshCookieHeader = '';

const CREDENTIAL_SEED = new Uint8Array([1, 2, 3, 4]);
const VALID_CREDENTIAL = Uint8Array.from(CREDENTIAL_SEED, (b) => b ^ 0xff);

let nullifierCounter = 100;
const nextNullifier = (): Uint8Array => new Uint8Array(16).fill((nullifierCounter += 1) % 251);

/** The real clock is bound in the composition root, so timestamps must be real too. */
const now = () => BigInt(Date.now());

function submit(envelope: Uint8Array) {
  return app.inject({
    method: 'POST',
    url: '/v1/envelopes',
    payload: { envelope: Buffer.from(envelope).toString('base64') },
  });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  // Step 13 needs an issued credential.
  await app.get(CredentialIssuer).issue(CREDENTIAL_SEED);

  // Step 10 needs a certificate — published as a real envelope through the real pipeline,
  // which is also the ADR-004 bootstrap path. If this 200s, certification genuinely works;
  // seeding a store would have proved only that the store has a setter.
  const certified = await submit(certifyEnvelope({ createdAtMs: now() }));
  expect(certified.statusCode, `certificate publish failed: ${certified.body}`).toBe(200);
  const profiled = await submit(
    signEnvelope({
      domain: 'jb:profile:update:v1',
      credential: VALID_CREDENTIAL,
      nullifier: nextNullifier(),
      epoch: 1,
      createdAtMs: now(),
      body: ProfileUpdate.encode(
        ProfileUpdate.fromPartial({ display_name: 'Test coordinator' }),
      ).finish(),
    }),
  );
  expect(profiled.statusCode, profiled.body).toBe(200);

  const challenged = await app.inject({
    method: 'GET',
    url: `/v1/auth/challenge?public_key=${encodeURIComponent(
      Buffer.from(AUTHOR_KEY).toString('base64'),
    )}`,
  });
  const challenge = challenged.json();
  const challengeBytes = new Uint8Array(Buffer.from(challenge.challenge, 'base64'));
  const authenticated = await app.inject({
    method: 'POST',
    url: '/v1/auth',
    payload: {
      public_key: Buffer.from(AUTHOR_KEY).toString('base64'),
      challenge: challenge.challenge,
      claim: challenge.claim,
      signature: Buffer.from(
        ed25519.sign(authSigningBytes(AUTHOR_KEY, challengeBytes, 'login'), AUTHOR_SEED),
      ).toString('base64'),
    },
  });
  expect(authenticated.statusCode, authenticated.body).toBe(201);
  accessToken = authenticated.json().accessToken;
  refreshToken = authenticated.json().refreshToken;
  refreshCookieHeader = String(authenticated.headers['set-cookie']);
});

afterAll(async () => {
  await app?.close();
});

describe('POST /v1/envelopes — the only write route (WE-01)', () => {
  it('accepts a signed post and returns a receipt with an STH', async () => {
    const res = await submit(
      signEnvelope({
        domain: 'jb:post:create:v1',
        credential: VALID_CREDENTIAL,
        nullifier: nextNullifier(),
        epoch: 1,
        createdAtMs: now(),
        body: PostCreate.encode(
          PostCreate.fromPartial({ title: 'Shelter open at Mirpur 10', kind: 1 }),
        ).finish(),
      }),
    );

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.content_id).toMatch(/^jb1[a-z2-7]{52}$/);
    expect(body.server_id).toMatch(/^jbs1/);
    expect(body.sth.tree_size).toBeGreaterThanOrEqual(1);
  });

  it('a duplicate returns 200 with the ORIGINAL receipt, not an error (ER-01)', async () => {
    const raw = signEnvelope({
      domain: 'jb:post:create:v1',
      credential: VALID_CREDENTIAL,
      nullifier: nextNullifier(),
      epoch: 1,
      createdAtMs: now(),
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Duplicate me', kind: 1 })).finish(),
    });

    const first = await submit(raw);
    const second = await submit(raw);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().log_index).toBe(first.json().log_index);
  });

  it('maps a forged signature to 403 with a typed code', async () => {
    const res = await submit(
      signEnvelope({
        domain: 'jb:post:create:v1',
        credential: VALID_CREDENTIAL,
        nullifier: nextNullifier(),
        epoch: 1,
        createdAtMs: now(),
        forgeSignature: true,
        body: PostCreate.encode(PostCreate.fromPartial({ title: 'Forged', kind: 1 })).finish(),
      }),
    );

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('BAD_SIGNATURE');
  });

  it('maps an over-length title to 400 BODY_INVALID naming the field', async () => {
    const res = await submit(
      signEnvelope({
        domain: 'jb:post:create:v1',
        credential: VALID_CREDENTIAL,
        nullifier: nextNullifier(),
        epoch: 1,
        createdAtMs: now(),
        body: PostCreate.encode(
          PostCreate.fromPartial({ title: 'x'.repeat(400), kind: 1 }),
        ).finish(),
      }),
    );

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'BODY_INVALID', field: 'title' });
  });

  it('rejects a malformed payload without touching the pipeline', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/envelopes',
      payload: { envelope: 'not-base64-envelope' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('there is no other write route — POST /v1/posts does not exist', async () => {
    // WE-02: a feature adding its own write route is a review rejection, because it would
    // be a second door that skips the 19 steps.
    const res = await app.inject({ method: 'POST', url: '/v1/posts', payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('P1-G7 rejects a refresh token presented as bearer auth on the write route', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/envelopes',
      headers: { authorization: `Bearer ${refreshToken}` },
      payload: {
        envelope: Buffer.from(certifyEnvelope({ createdAtMs: now() })).toString('base64'),
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('AUTH-09 keeps the refresh token in an HttpOnly, SameSite cookie', () => {
    expect(refreshCookieHeader).toContain('jb_refresh=');
    expect(refreshCookieHeader).toContain('HttpOnly');
    expect(refreshCookieHeader).toContain('SameSite=Strict');
  });

  it('WE-03 accepts a homogeneous batch and rejects mixed planes before ingestion', async () => {
    const forum = signEnvelope({
      domain: 'jb:post:create:v1',
      credential: VALID_CREDENTIAL,
      nullifier: nextNullifier(),
      epoch: 1,
      createdAtMs: now(),
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Batch one', kind: 1 })).finish(),
    });
    const secondForum = signEnvelope({
      domain: 'jb:post:create:v1',
      credential: VALID_CREDENTIAL,
      nullifier: nextNullifier(),
      epoch: 1,
      createdAtMs: now(),
      body: PostCreate.encode(PostCreate.fromPartial({ title: 'Batch two', kind: 1 })).finish(),
    });
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/envelopes',
      payload: {
        envelopes: [forum, secondForum].map((raw) => Buffer.from(raw).toString('base64')),
      },
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
    expect(accepted.json().receipts).toHaveLength(2);

    const decoded = Envelope.decode(secondForum);
    const signalShaped = Envelope.encode({ ...decoded, plane: 2 }).finish();
    const rejected = await app.inject({
      method: 'POST',
      url: '/v1/envelopes',
      payload: {
        envelopes: [forum, signalShaped].map((raw) => Buffer.from(raw).toString('base64')),
      },
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().code).toBe('PLANE_MISMATCH');
  });
});

describe('read API (T1.31)', () => {
  it('lists posts newest-first with provenance and a cursor', async () => {
    for (const title of ['Alpha', 'Bravo', 'Charlie']) {
      await submit(
        signEnvelope({
          domain: 'jb:post:create:v1',
          credential: VALID_CREDENTIAL,
          nullifier: nextNullifier(),
          epoch: 1,
          createdAtMs: now(),
          body: PostCreate.encode(PostCreate.fromPartial({ title, kind: 1 })).finish(),
        }),
      );
    }

    const res = await app.inject({ method: 'GET', url: '/v1/posts?limit=2' });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.items).toHaveLength(2);
    // The client verifies rather than trusting the server's rendering.
    expect(body.items[0].provenance.content_id).toMatch(/^jb1/);
    expect(body.items[0].provenance.author_key).toBe(Buffer.from(AUTHOR_KEY).toString('hex'));
    expect(body.next_cursor).toBeTruthy();
  });

  it('the cursor advances without repeating an item', async () => {
    const first = await app.inject({ method: 'GET', url: '/v1/posts?limit=2' });
    const cursor = first.json().next_cursor as string;

    const second = await app.inject({
      method: 'GET',
      url: `/v1/posts?limit=2&cursor=${encodeURIComponent(cursor)}`,
    });

    const firstIds = first.json().items.map((i: { content_id: string }) => i.content_id);
    const secondIds = second.json().items.map((i: { content_id: string }) => i.content_id);
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
  });

  it('serves an STH and an inclusion proof that verifies OFFLINE', async () => {
    const submitted = await submit(
      signEnvelope({
        domain: 'jb:post:create:v1',
        credential: VALID_CREDENTIAL,
        nullifier: nextNullifier(),
        epoch: 1,
        createdAtMs: now(),
        body: PostCreate.encode(PostCreate.fromPartial({ title: 'Auditable', kind: 1 })).finish(),
      }),
    );
    const contentId = submitted.json().content_id as string;

    const sthRes = await app.inject({ method: 'GET', url: '/v1/log/sth' });
    const proofRes = await app.inject({
      method: 'GET',
      url: `/v1/log/proof?content_id=${contentId}`,
    });

    const sth = sthRes.json();
    const proof = proofRes.json();

    // Exactly what the client does in the audit view: recompute, with no trust in the
    // server's claim that the content is there.
    const ok = verifyInclusion(
      hashLeaf(new TextEncoder().encode(contentId)),
      proof.leaf_index,
      proof.tree_size,
      proof.path.map((p: string) => new Uint8Array(Buffer.from(p, 'base64'))),
      new Uint8Array(Buffer.from(sth.root_hash, 'base64')),
    );
    expect(ok).toBe(true);
  });

  it('threads comments and reflects votes in the read model', async () => {
    const post = await submit(
      signEnvelope({
        domain: 'jb:post:create:v1',
        credential: VALID_CREDENTIAL,
        nullifier: nextNullifier(),
        epoch: 1,
        createdAtMs: now(),
        body: PostCreate.encode(PostCreate.fromPartial({ title: 'Threaded', kind: 1 })).finish(),
      }),
    );
    const postId = post.json().content_id as string;

    await submit(
      signEnvelope({
        domain: 'jb:comment:create:v1',
        credential: VALID_CREDENTIAL,
        nullifier: nextNullifier(),
        epoch: 1,
        createdAtMs: now(),
        body: CommentCreate.encode(
          CommentCreate.fromPartial({ post: postId, body_markdown: 'How many beds?' }),
        ).finish(),
      }),
    );

    await submit(
      signEnvelope({
        domain: 'jb:vote:cast:v1',
        credential: VALID_CREDENTIAL,
        nullifier: nextNullifier(),
        epoch: 1,
        createdAtMs: now(),
        nonce: new Uint8Array(16).fill(200),
        body: VoteCast.encode(VoteCast.fromPartial({ target: postId, value: 1 })).finish(),
      }),
    );

    const comments = await app.inject({ method: 'GET', url: `/v1/comments?post=${postId}` });
    expect(comments.json().items).toHaveLength(1);
    expect(comments.json().items[0].body_markdown).toBe('How many beds?');

    const posts = await app.inject({ method: 'GET', url: '/v1/posts?limit=100' });
    const found = posts.json().items.find((p: { content_id: string }) => p.content_id === postId);
    expect(found.score).toBe(1);
    expect(found.comment_count).toBe(1);
  });

  it('serves the Forum read table with complete offline provenance', async () => {
    const feed = await app.inject({ method: 'GET', url: '/v1/feed?limit=1' });
    expect(feed.statusCode).toBe(200);
    const provenance = feed.json().items[0].provenance;
    expect(provenance).toMatchObject({ plane: 'FORUM', keyAlg: 'ED25519' });
    expect(provenance.canonicalBytes).toBeTruthy();
    expect(provenance.signature).toBeTruthy();
    expect(provenance.receipt.leafIndex).toBeTypeOf('number');

    const authenticatedRoutes = [
      '/v1/me/profile',
      '/v1/me/communities',
      '/v1/me/preferences',
      '/v1/me/saved',
      '/v1/me/notifications',
      '/v1/me/messages',
    ];
    for (const url of authenticatedRoutes) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      expect(response.statusCode, `${url}: ${response.body}`).not.toBe(404);
    }

    const publicRoutes = [
      '/v1/communities',
      '/v1/communities/name-available/unused',
      '/v1/awards/types',
      '/v1/search?q=shelter',
      '/v1/labels/jb1missing',
      '/v1/server/identity',
      '/v1/log/consistency?from=0&to=1',
    ];
    for (const url of publicRoutes) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, `${url}: ${response.body}`).not.toBe(404);
    }
  });

  it('presigns and confirms an attachment whose hash, MIME, and size match', async () => {
    const digest = Buffer.alloc(32, 9).toString('base64');
    const ticket = await app.inject({
      method: 'POST',
      url: '/v1/attachments/upload-url',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { mime: 'image/jpeg', size: 123, sha256: digest },
    });
    expect(ticket.statusCode).toBe(201);
    const confirmed = await app.inject({
      method: 'POST',
      url: '/v1/attachments/confirm',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { key: ticket.json().key, mime: 'image/jpeg', size: 123, sha256: digest },
    });
    expect(confirmed.statusCode).toBe(201);
    expect(confirmed.json()).toMatchObject({ confirmed: true, size: 123 });

    const claim = await submit(
      signEnvelope({
        domain: 'jb:attachment:claim:v1',
        credential: VALID_CREDENTIAL,
        createdAtMs: now(),
        body: AttachmentClaim.encode(
          AttachmentClaim.fromPartial({
            storage_key: ticket.json().key,
            content_sha256: new Uint8Array(Buffer.from(digest, 'base64')),
            mime: 'image/jpeg',
            size_bytes: 123n,
            alt_text: 'Flooded road',
          }),
        ).finish(),
      }),
    );
    expect(claim.statusCode, claim.body).toBe(200);

    const substituted = await submit(
      signEnvelope({
        domain: 'jb:attachment:claim:v1',
        credential: VALID_CREDENTIAL,
        createdAtMs: now(),
        body: AttachmentClaim.encode(
          AttachmentClaim.fromPartial({
            storage_key: ticket.json().key,
            content_sha256: new Uint8Array(32).fill(8),
            mime: 'image/jpeg',
            size_bytes: 123n,
          }),
        ).finish(),
      }),
    );
    expect(substituted.statusCode).toBe(403);
  });
});
