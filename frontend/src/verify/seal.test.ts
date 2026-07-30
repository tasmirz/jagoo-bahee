/**
 * The Seal says what was actually checked (THR-01, AC-11).
 *
 * ── Why this suite exists ───────────────────────────────────────────────────────────
 * `verifyProvenance` was written, tested, and then referenced by nothing: the node sent a
 * `provenance` block, the client typed it, and every `<Seal>` rendered "verified · synced"
 * from a hardcoded prop. The crypto was honest and every pixel was not, which is the worst
 * arrangement available — a verification badge that cannot fail is the server's word in the
 * client's uniform.
 *
 * So these tests assert the mapping in both directions. A badge that can only ever say
 * "verified" proves nothing, so the tampered cases matter more than the happy one.
 */

import { sha256 } from '@noble/hashes/sha256';
import { concatBytes } from '@noble/hashes/utils';
import { ed25519 } from '@jagoo/sdk/crypto';
import {
  KeyAlg,
  Plane,
  Priority,
  canonicalBytes,
  contentIdFromCanonical,
  identityId,
  receiptSigningBytes,
  serverId,
  sthSigningBytes,
} from '@jagoo/sdk/core';
import {
  clearVerificationCache,
  sealStateFor,
  verifyProvenance,
  type ProvenanceJson,
} from './index';

const AUTHOR_SEED = new Uint8Array(32).fill(7);
const NODE_SEED = new Uint8Array(32).fill(9);
const ACCEPTED_AT_MS = 1_700_000_000_000;

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/** A real signed envelope — not a fixture object shaped like one. */
function signedEnvelope() {
  const authorKey = ed25519.derivePublicKey(AUTHOR_SEED);
  const envelope = {
    version: 1,
    plane: Plane.FORUM,
    domain: 'jb:membership:leave:v1',
    author_key: authorKey,
    key_alg: KeyAlg.ED25519,
    parent: '',
    scope: 'dhaka@jbs1node',
    created_at_ms: BigInt(ACCEPTED_AT_MS),
    nonce: new Uint8Array(16).fill(3),
    priority: Priority.BULK,
    body: new Uint8Array([1, 2, 3]),
  };
  const canonical = canonicalBytes(envelope);
  return {
    authorKey,
    canonical,
    contentId: contentIdFromCanonical(canonical),
    signature: ed25519.sign(canonical, AUTHOR_SEED),
  };
}

/**
 * A one-leaf transparency log, which is a complete and valid one.
 *
 * RFC 6962: the root of a single-leaf tree IS the leaf hash, and the inclusion proof is
 * empty. Using the smallest real tree rather than a mocked proof keeps this a test of the
 * verifier rather than of the fixture.
 */
function witnessed(contentId: string) {
  const nodeKey = ed25519.derivePublicKey(NODE_SEED);
  const rootHash = sha256(concatBytes(new Uint8Array([0]), new TextEncoder().encode(contentId)));
  const sth = {
    serverKey: nodeKey,
    treeSize: 1,
    rootHash,
    timestampMs: ACCEPTED_AT_MS,
  };
  const sthSignature = ed25519.sign(sthSigningBytes(sth), NODE_SEED);
  const receipt = {
    contentId,
    logIndex: 0,
    leafIndex: 0,
    acceptedAtMs: ACCEPTED_AT_MS,
    serverId: serverId(nodeKey),
    serverKey: nodeKey,
    sth: { ...sth, signature: sthSignature },
    inclusionProof: [] as readonly Uint8Array[],
  };
  const serverSignature = ed25519.sign(receiptSigningBytes(receipt), NODE_SEED);
  return {
    logIndex: 0,
    leafIndex: 0,
    acceptedAtMs: ACCEPTED_AT_MS,
    serverId: receipt.serverId,
    serverKey: b64(nodeKey),
    serverSignature: b64(serverSignature),
    sth: {
      treeSize: 1,
      serverKey: b64(nodeKey),
      rootHash: b64(rootHash),
      timestampMs: ACCEPTED_AT_MS,
      signature: b64(sthSignature),
    },
    inclusionProof: [] as readonly string[],
  };
}

function provenanceOf(overrides: Partial<ProvenanceJson> = {}): ProvenanceJson {
  const envelope = signedEnvelope();
  return {
    contentId: envelope.contentId,
    authorKey: identityId(envelope.authorKey),
    keyAlg: 'ED25519',
    signature: b64(envelope.signature),
    canonicalBytes: b64(envelope.canonical),
    receipt: witnessed(envelope.contentId),
    ...overrides,
  };
}

describe('sealStateFor', () => {
  beforeEach(() => clearVerificationCache());

  it('reports synced when authorship and the node receipt both verify', () => {
    expect(sealStateFor(provenanceOf())).toBe('synced');
  });

  it('reports queued when authorship holds but nothing has witnessed it yet', () => {
    // VIS-08 — authored offline, signed, awaiting a receipt. Not a failure.
    expect(sealStateFor(provenanceOf({ receipt: null }))).toBe('queued');
  });

  it('reports unsigned when no provenance was supplied at all', () => {
    // Distinct from `failed`: no claim was made, so none was broken.
    expect(sealStateFor(null)).toBe('unsigned');
  });

  it('reports failed when the author signature does not match the bytes', () => {
    const forged = provenanceOf({ signature: b64(new Uint8Array(64).fill(0xab)) });
    expect(sealStateFor(forged)).toBe('failed');
  });

  it('reports failed when the content ID does not match the canonical bytes', () => {
    // The relay attack: content handed over under someone else's identifier.
    expect(sealStateFor(provenanceOf({ contentId: `jb1${'a'.repeat(52)}` }))).toBe('failed');
  });

  it('reports failed when the node receipt was signed by a different key than it claims', () => {
    const genuine = provenanceOf();
    const impostor = ed25519.derivePublicKey(new Uint8Array(32).fill(11));
    expect(
      sealStateFor({
        ...genuine,
        receipt: { ...genuine.receipt!, serverKey: b64(impostor) },
      }),
    ).toBe('failed');
  });

  it('reports failed when the tree head does not cover the content', () => {
    const genuine = provenanceOf();
    expect(
      sealStateFor({
        ...genuine,
        receipt: {
          ...genuine.receipt!,
          sth: { ...genuine.receipt!.sth, rootHash: b64(new Uint8Array(32).fill(0xee)) },
        },
      }),
    ).toBe('failed');
  });

  it('computes immutable content once within the fixed verification TTL', () => {
    const provenance = provenanceOf();
    const verify = jest.spyOn(ed25519, 'verify');
    verifyProvenance(provenance);
    const firstPassCalls = verify.mock.calls.length;
    verifyProvenance(provenance);
    expect(firstPassCalls).toBeGreaterThan(0);
    expect(verify).toHaveBeenCalledTimes(firstPassCalls);

    // Reusing a content ID with different proof bytes must never hit the cached verdict.
    verifyProvenance({
      ...provenance,
      signature: b64(new Uint8Array(64).fill(0x44)),
    });
    expect(verify.mock.calls.length).toBeGreaterThan(firstPassCalls);
    verify.mockRestore();
  });
});
