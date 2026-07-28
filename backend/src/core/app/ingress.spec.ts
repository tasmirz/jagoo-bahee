/**
 * T1.2 — the 19-step pipeline, end to end, with real Ed25519 and a real Merkle log.
 *
 * Every rejection path below is reachable, which is the definition-of-done bar for a
 * pipeline step. The two structural invariants — VP-01 (no writes before step 13) and
 * VP-02 (16/17 atomic) — get their own sections, because those are the ones whose failure
 * is silent rather than loud.
 */

import { describe, expect, it } from 'vitest';
import { PostCreate } from '@jagoo/sdk/proto';
import { Plane as SdkPlane } from '@jagoo/sdk/core';
import { verifyInclusion, hashLeaf } from '../domain/merkle.js';
import { EnvelopeRejected, RejectionCode } from '../domain/errors.js';
import { PostCreateHandler } from '../../features/forum/post/post-create.handler.js';
import { POSTS_COLLECTION, type PostDoc } from '../../features/forum/post/post.projection.js';
import { buildHarness, signEnvelope, AUTHOR_KEY, NOW_MS, type Harness } from '../../testing/harness.js';

const postBody = (over: Partial<PostCreate> = {}): Uint8Array =>
  PostCreate.encode(
    PostCreate.fromPartial({ title: 'Water is rising in Mirpur', kind: 1, ...over }),
  ).finish();

/** `jb:post:create:v1` requires a credential and a nullifier, per its registry row. */
async function harness(): Promise<Harness> {
  const h = await buildHarness((registry, projections) => {
    registry.register(new PostCreateHandler(projections));
  });
  await h.credentials.issue(new Uint8Array([1, 2, 3, 4]));
  return h;
}

const VALID_CREDENTIAL = Uint8Array.from([1, 2, 3, 4], (b) => b ^ 0xff);

function validEnvelope(over: Record<string, unknown> = {}): Uint8Array {
  return signEnvelope({
    body: postBody(),
    credential: VALID_CREDENTIAL,
    nullifier: new Uint8Array(16).fill(7),
    epoch: 1,
    ...over,
  });
}

async function expectRejection(fn: () => Promise<unknown>, code: RejectionCode) {
  try {
    await fn();
  } catch (e) {
    expect(e, `expected EnvelopeRejected, got ${String(e)}`).toBeInstanceOf(EnvelopeRejected);
    expect((e as EnvelopeRejected).code).toBe(code);
    return e as EnvelopeRejected;
  }
  throw new Error(`expected ${code}, but nothing was thrown`);
}

describe('happy path', () => {
  it('accepts a well-formed post and returns a signed receipt', async () => {
    const h = await harness();
    const receipt = await h.pipeline.accept(validEnvelope());

    expect(receipt.contentId).toMatch(/^jb1[a-z2-7]{52}$/);
    expect(receipt.logIndex).toBe(0);
    expect(receipt.serverId).toMatch(/^jbs1/);
    expect(receipt.signature).toHaveLength(64);
    expect(receipt.sth.treeSize).toBe(1);
  });

  it('projects the post into the read model', async () => {
    const h = await harness();
    const receipt = await h.pipeline.accept(validEnvelope());

    const doc = await h.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: receipt.contentId });

    expect(doc).not.toBeNull();
    expect(doc!.title).toBe('Water is rising in Mirpur');
    expect(doc!.community).toBe('dhaka-relief@jbs1a4f7m2k');
    expect(doc!.authorKey).toBe(Buffer.from(AUTHOR_KEY).toString('hex'));
    // From the SIGNED envelope, never the projector's clock — or a rebuild would differ.
    expect(doc!.createdAtMs).toBe(NOW_MS);
  });

  it('the receipt carries an inclusion proof that verifies OFFLINE', async () => {
    // This is what the client actually does: recompute from the provenance block with no
    // network and no trust in the server's word (THR-01).
    const h = await harness();
    const receipt = await h.pipeline.accept(validEnvelope());

    const proof = await h.witness.inclusionProof(receipt.contentId);
    const leaf = hashLeaf(new TextEncoder().encode(receipt.contentId));

    expect(
      verifyInclusion(leaf, proof.leafIndex, proof.treeSize, proof.path, receipt.sth.rootHash),
    ).toBe(true);
  });

  it('enqueues for federation after commit (step 19)', async () => {
    const h = await harness();
    await h.pipeline.accept(validEnvelope());
    expect(h.federation.queued).toHaveLength(1);
  });

  it('a Bangla post round-trips intact', async () => {
    const h = await harness();
    const receipt = await h.pipeline.accept(
      validEnvelope({ body: postBody({ title: 'পানি বাড়ছে' }) }),
    );
    const doc = await h.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: receipt.contentId });
    expect(doc!.title).toBe('পানি বাড়ছে');
  });
});

describe('ER-01 — a duplicate returns the ORIGINAL receipt', () => {
  it('does not fail, and does not issue a second log position', async () => {
    // The same envelope arriving over HTTP, then federation, then mesh is NORMAL. Treating
    // the retry as an error would make store-and-forward unusable.
    const h = await harness();
    const raw = validEnvelope();

    const first = await h.pipeline.accept(raw);
    const second = await h.pipeline.accept(raw);

    expect(second.contentId).toBe(first.contentId);
    expect(second.logIndex).toBe(first.logIndex);
    expect(h.witness.size).toBe(1);
    expect(h.envelopes.size).toBe(1);
  });
});

describe('rejection paths, in pipeline order', () => {
  it('step 1 — TOO_LARGE', async () => {
    const h = await harness();
    await expectRejection(() => h.pipeline.accept(new Uint8Array(70000)), RejectionCode.TOO_LARGE);
  });

  it('step 1 — an empty body is MALFORMED', async () => {
    const h = await harness();
    await expectRejection(() => h.pipeline.accept(new Uint8Array(0)), RejectionCode.MALFORMED);
  });

  it('step 2 — MALFORMED on a non-canonical encoding', async () => {
    const h = await harness();
    await expectRejection(
      () => h.pipeline.accept(new Uint8Array([0xff, 0xff, 0xff])),
      RejectionCode.MALFORMED,
    );
  });

  it('step 3 — UNKNOWN_VERSION', async () => {
    const h = await harness();
    await expectRejection(
      () => h.pipeline.accept(validEnvelope({ version: 2 })),
      RejectionCode.UNKNOWN_VERSION,
    );
  });

  it('step 4 — UNKNOWN_DOMAIN', async () => {
    const h = await harness();
    // A real registry domain, but no handler registered on this node.
    await expectRejection(
      () => h.pipeline.accept(validEnvelope({ domain: 'jb:comment:create:v1' })),
      RejectionCode.UNKNOWN_DOMAIN,
    );
  });

  it('step 5 — PLANE_MISMATCH', async () => {
    // The signed plane is field 2, so a SIGNAL envelope can never reach a FORUM handler.
    const h = await harness();
    await expectRejection(
      () => h.pipeline.accept(validEnvelope({ plane: SdkPlane.SIGNAL })),
      RejectionCode.PLANE_MISMATCH,
    );
  });

  it('step 6 — ALG_NOT_PERMITTED', async () => {
    const h = await harness();
    await expectRejection(
      () => h.pipeline.accept(validEnvelope({ keyAlg: 2 })),
      RejectionCode.ALG_NOT_PERMITTED,
    );
  });

  it('step 7 — PRIORITY_MISMATCH', async () => {
    // Without this, a sender could label bulk traffic BROADCAST and jump every queue.
    const h = await harness();
    await expectRejection(
      () => h.pipeline.accept(validEnvelope({ priority: 1 })),
      RejectionCode.PRIORITY_MISMATCH,
    );
  });

  it('step 8 — CLOCK_SKEW rejects a far-future timestamp', async () => {
    const h = await harness();
    const rejection = await expectRejection(
      () => h.pipeline.accept(validEnvelope({ createdAtMs: BigInt(NOW_MS + 60 * 60 * 1000) })),
      RejectionCode.CLOCK_SKEW,
    );
    expect(rejection.retryable).toBe(true);
  });

  it('step 8 — but ACCEPTS a three-day-old envelope', async () => {
    // Composed offline during a blackout and carried by hand. Rejecting this would discard
    // exactly the content the system exists to move.
    const h = await harness();
    const threeDays = BigInt(NOW_MS - 3 * 24 * 60 * 60 * 1000);
    await expect(h.pipeline.accept(validEnvelope({ createdAtMs: threeDays }))).resolves.toBeDefined();
  });

  it('step 9 — BAD_SIGNATURE', async () => {
    const h = await harness();
    await expectRejection(
      () => h.pipeline.accept(validEnvelope({ forgeSignature: true })),
      RejectionCode.BAD_SIGNATURE,
    );
  });

  it('step 10 — NO_CERTIFICATE for an unknown author', async () => {
    const h = await harness();
    await expectRejection(
      () => h.pipeline.accept(validEnvelope({ seed: new Uint8Array(32).fill(9) })),
      RejectionCode.NO_CERTIFICATE,
    );
  });

  it('step 10 — KEY_REVOKED only for content created AFTER the revocation (KY-01)', async () => {
    const h = await harness();
    h.certificates.revoke({ key: AUTHOR_KEY, effectiveFromMs: NOW_MS, reason: 'rotation' });

    // Signed before the revocation took effect: still valid. Revocation is not retroactive,
    // or coercing someone into revoking would retroactively erase their history.
    await expect(
      h.pipeline.accept(validEnvelope({ createdAtMs: BigInt(NOW_MS - 1000) })),
    ).resolves.toBeDefined();

    await expectRejection(() => h.pipeline.accept(validEnvelope()), RejectionCode.KEY_REVOKED);
  });

  it('step 13 — CREDENTIAL_INVALID when the credential is missing', async () => {
    const h = await harness();
    await expectRejection(
      () => h.pipeline.accept(signEnvelope({ body: postBody(), nullifier: new Uint8Array(16).fill(7), epoch: 1 })),
      RejectionCode.CREDENTIAL_INVALID,
    );
  });

  it('step 13 — NULLIFIER_SPENT on the second use in one epoch', async () => {
    const h = await harness();
    await h.pipeline.accept(validEnvelope());
    // Same nullifier and epoch, different content, so it is not a duplicate.
    await expectRejection(
      () => h.pipeline.accept(validEnvelope({ body: postBody({ title: 'Second post' }) })),
      RejectionCode.NULLIFIER_SPENT,
    );
  });

  it('step 13 — INSUFFICIENT_CREDITS', async () => {
    const h = await buildHarness((registry, projections) => {
      registry.register(new PostCreateHandler(projections));
    });
    await h.credentials.issue(new Uint8Array([1, 2, 3, 4]));
    // Drain the balance: post costs 10 credits per its registry row.
    await h.credits.consume({ kind: 'nullifier', value: Buffer.from(new Uint8Array(16).fill(7)).toString('hex') }, 1000);

    await expectRejection(() => h.pipeline.accept(validEnvelope()), RejectionCode.INSUFFICIENT_CREDITS);
  });

  it('step 15 — BODY_INVALID on an over-length title', async () => {
    const h = await harness();
    await expectRejection(
      () => h.pipeline.accept(validEnvelope({ body: postBody({ title: 'x'.repeat(301) }) })),
      RejectionCode.BODY_INVALID,
    );
  });

  it('step 15 — BODY_INVALID when an attachment is not a content ID (ID-01)', async () => {
    const h = await harness();
    const rejection = await expectRejection(
      () => h.pipeline.accept(validEnvelope({ body: postBody({ attachments: ['507f1f77bcf86cd799439011'] }) })),
      RejectionCode.BODY_INVALID,
    );
    expect(rejection.field).toBe('attachments');
  });
});

describe('VP-01 — steps 1-12 perform NO database writes', () => {
  it('a flood of invalid envelopes does not amplify into writes', async () => {
    // The property: an attacker who can send garbage cannot make the node do write work.
    const h = await harness();

    const garbage: Uint8Array[] = [
      new Uint8Array(70000), // TOO_LARGE
      new Uint8Array([0xff, 0xff]), // MALFORMED
      validEnvelope({ version: 3 }), // UNKNOWN_VERSION
      validEnvelope({ domain: 'jb:comment:create:v1' }), // UNKNOWN_DOMAIN
      validEnvelope({ plane: SdkPlane.SIGNAL }), // PLANE_MISMATCH
      validEnvelope({ keyAlg: 3 }), // ALG_NOT_PERMITTED
      validEnvelope({ priority: 2 }), // PRIORITY_MISMATCH
      validEnvelope({ createdAtMs: BigInt(NOW_MS + 999999999) }), // CLOCK_SKEW
      validEnvelope({ forgeSignature: true }), // BAD_SIGNATURE
      validEnvelope({ seed: new Uint8Array(32).fill(8) }), // NO_CERTIFICATE
    ];

    for (const raw of garbage) {
      await expect(h.pipeline.accept(raw)).rejects.toBeInstanceOf(EnvelopeRejected);
    }

    expect(h.envelopes.size, 'no envelope should have been stored').toBe(0);
    expect(h.witness.size, 'no leaf should have been appended').toBe(0);
  });
});

describe('VP-02 — steps 16 and 17 are atomic', () => {
  it('a witness-append failure rolls the projection back', async () => {
    // A projected envelope missing from the Merkle log is a transparency failure, so the
    // two writes must fail together or not at all.
    const h = await harness();

    const boom = new Error('witness unavailable');
    h.witness.append = async () => {
      throw boom;
    };

    await expect(h.pipeline.accept(validEnvelope())).rejects.toThrow('witness unavailable');

    const docs = await h.projections.collection<PostDoc>(POSTS_COLLECTION).find({}, 10);
    expect(docs, 'the projection must have rolled back').toHaveLength(0);
  });
});
