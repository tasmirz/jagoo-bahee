/**
 * T0.22 / P0-G7 — an unknown version and an unknown domain are BOTH hard-rejected.
 *
 * Every error path below is reachable by a test, which is the definition-of-done bar for a
 * pipeline step. These functions perform no I/O and touch no database, so an
 * invalid-envelope flood is rejected without amplifying into writes (VP-01).
 */

import { describe, expect, it } from 'vitest';
import { acceptDomain, acceptEnvelopeHeader, acceptPlane, acceptVersion } from './accept.js';
import { DomainRegistry } from './domain-registry.js';
import { ENVELOPE_VERSION, Plane, Priority, KeyAlg, type ParsedEnvelope } from './envelope.js';
import { RejectionCode, isRejection, type EnvelopeRejected } from './errors.js';
import { allowed, valid, type DomainHandler } from './domain-handler.js';

const forumHandler: DomainHandler<null> = {
  domain: 'jb:post:create:v1',
  plane: Plane.FORUM,
  decode: () => null,
  validate: () => valid,
  authorize: async () => allowed,
  project: async () => {},
};

function registry(): DomainRegistry {
  const r = new DomainRegistry();
  r.register(forumHandler);
  return r;
}

function envelope(over: Partial<ParsedEnvelope> = {}): ParsedEnvelope {
  return {
    version: ENVELOPE_VERSION,
    plane: Plane.FORUM,
    domain: 'jb:post:create:v1',
    authorKey: new Uint8Array(32),
    keyAlg: KeyAlg.ED25519,
    parent: '',
    scope: '',
    createdAtMs: 0n,
    nonce: new Uint8Array(16),
    priority: Priority.BULK,
    body: new Uint8Array(0),
    signature: new Uint8Array(64),
    contentId: 'jb1test',
    ...over,
  };
}

/** Assert the thrown value is a typed rejection carrying `code`. */
function expectRejection(fn: () => void, code: RejectionCode): EnvelopeRejected {
  try {
    fn();
  } catch (e) {
    expect(isRejection(e), `expected an EnvelopeRejected, got ${String(e)}`).toBe(true);
    expect((e as EnvelopeRejected).code).toBe(code);
    return e as EnvelopeRejected;
  }
  throw new Error(`expected a ${code} rejection, but nothing was thrown`);
}

describe('step 3 — VERSION (P0-G7)', () => {
  it('accepts exactly version 1', () => {
    expect(() => acceptVersion(ENVELOPE_VERSION)).not.toThrow();
  });

  // EN-02: there is no "try the other shape too" path. Accepting more than one form per
  // version IS the v1 signature-confusion bug.
  it.each([0, 2, 99, -1])('hard-rejects version %i', (version) => {
    const rejection = expectRejection(
      () => acceptVersion(version),
      RejectionCode.UNKNOWN_VERSION,
    );
    expect(rejection.retryable).toBe(false);
    expect(rejection.field).toBe('version');
  });
});

describe('step 4 — DOMAIN (P0-G7)', () => {
  it('accepts a registered domain', () => {
    expect(() => acceptDomain('jb:post:create:v1', registry())).not.toThrow();
  });

  it('hard-rejects an unregistered domain', () => {
    const rejection = expectRejection(
      () => acceptDomain('jb:unknown:thing:v1', registry()),
      RejectionCode.UNKNOWN_DOMAIN,
    );
    expect(rejection.retryable).toBe(false);
  });

  it('rejects the empty domain', () => {
    expectRejection(() => acceptDomain('', registry()), RejectionCode.UNKNOWN_DOMAIN);
  });

  // ER-02: the error must not reveal whether a key or a domain exists elsewhere, or which
  // other domains this node carries. The detail string stays deliberately uninformative.
  it('does not leak the registry contents in the error detail', () => {
    const rejection = expectRejection(
      () => acceptDomain('jb:unknown:thing:v1', registry()),
      RejectionCode.UNKNOWN_DOMAIN,
    );
    expect(rejection.message).not.toContain('jb:post:create:v1');
  });
});

describe('step 5 — PLANE (SEP-02)', () => {
  it('accepts when the signed plane matches the handler', () => {
    expect(() => acceptPlane('jb:post:create:v1', Plane.FORUM, registry())).not.toThrow();
  });

  // The signed plane is field 2. A SIGNAL envelope must never reach a FORUM handler, or
  // the two-plane separation the whole design rests on collapses.
  it('rejects a SIGNAL envelope aimed at a FORUM domain', () => {
    expectRejection(
      () => acceptPlane('jb:post:create:v1', Plane.SIGNAL, registry()),
      RejectionCode.PLANE_MISMATCH,
    );
  });

  it('rejects an unspecified plane', () => {
    expectRejection(
      () => acceptPlane('jb:post:create:v1', Plane.UNSPECIFIED, registry()),
      RejectionCode.PLANE_MISMATCH,
    );
  });

  it('reports an unregistered domain as UNKNOWN_DOMAIN, not PLANE_MISMATCH', () => {
    expectRejection(
      () => acceptPlane('jb:absent:v1', Plane.FORUM, registry()),
      RejectionCode.UNKNOWN_DOMAIN,
    );
  });
});

describe('steps 3-5 composed', () => {
  it('accepts a well-formed header', () => {
    expect(() => acceptEnvelopeHeader(envelope(), registry())).not.toThrow();
  });

  it('checks version before domain, so a bad version wins', () => {
    // Ordering is part of the contract: the cheapest check runs first so the expensive
    // ones are never reached by garbage.
    expectRejection(
      () => acceptEnvelopeHeader(envelope({ version: 7, domain: 'jb:absent:v1' }), registry()),
      RejectionCode.UNKNOWN_VERSION,
    );
  });

  it('checks domain before plane', () => {
    expectRejection(
      () => acceptEnvelopeHeader(envelope({ domain: 'jb:absent:v1', plane: Plane.SIGNAL }), registry()),
      RejectionCode.UNKNOWN_DOMAIN,
    );
  });
});
