/**
 * T0.21 / T1.2 — registration and dispatch.
 *
 * The Open/Closed test. `jb:membership:join:v1` appears nowhere in `core/` — no import, no
 * case, no mention — yet a handler for it registers and dispatches here. The end-to-end
 * version of this, pushing a signed envelope through the unmodified pipeline, is in
 * `features/forum/forum-features.spec.ts` (P1-G11).
 *
 * The negative half — no `switch (domain)` anywhere in `core/` — is lint-enforced (AR-05)
 * and probed by `import-boundary.spec.ts`.
 */

import { describe, expect, it } from 'vitest';
import { DomainRegistry } from './domain-registry.js';
import { Plane, type ParsedEnvelope } from './envelope.js';
import { allowed, valid, type DomainHandler, type Tx } from './domain-handler.js';

interface JoinBody {
  readonly community: string;
}

/** A real registry domain, implemented entirely outside the core. */
class JoinHandler implements DomainHandler<JoinBody> {
  readonly domain = 'jb:membership:join:v1';
  readonly plane = Plane.FORUM;
  readonly projected: string[] = [];

  decode(body: Uint8Array): JoinBody {
    return { community: new TextDecoder().decode(body) };
  }
  validate(body: JoinBody) {
    return body.community.length > 0 ? valid : { ok: false as const, reason: 'empty' };
  }
  async authorize() {
    return allowed;
  }
  async project(body: JoinBody, _env: ParsedEnvelope, _tx: Tx) {
    this.projected.push(body.community);
  }
}

/** A SIGNAL-plane domain, to prove the plane is recorded per handler. */
class BroadcastHandler implements DomainHandler<unknown> {
  readonly domain = 'jb:broadcast:emit:v1';
  readonly plane = Plane.SIGNAL;
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

describe('DomainRegistry', () => {
  it('registers and dispatches a domain the core has never heard of', async () => {
    const registry = new DomainRegistry();
    const handler = new JoinHandler();
    registry.register(handler);

    const entry = registry.lookup('jb:membership:join:v1');
    expect(entry).not.toBeNull();
    expect(entry!.handler).toBe(handler);

    const body = entry!.handler.decode(new TextEncoder().encode('dhaka-relief@jbs1a4f7m2k'));
    expect(entry!.handler.validate(body, {} as ParsedEnvelope)).toEqual({ ok: true });
    await entry!.handler.project(body, {} as ParsedEnvelope, { id: 'tx-1' });
    expect(handler.projected).toEqual(['dhaka-relief@jbs1a4f7m2k']);
  });

  it('joins the handler to its GENERATED policy row', async () => {
    // Steps 6, 7 and 13 read policy from here instead of branching on the domain string,
    // which is only safe because registration guarantees the row exists.
    const registry = new DomainRegistry();
    registry.register(new JoinHandler());

    const spec = registry.specFor('jb:membership:join:v1');
    expect(spec).not.toBeNull();
    expect(spec!.plane).toBe('FORUM');
    expect(spec!.permission).toBeTypeOf('string');
    expect(spec!.keyAlgs).toContain('ED25519');
  });

  it('returns null for an unregistered domain rather than throwing', () => {
    // Unknown domain is an ordinary rejection at pipeline step 4, not an exception — an
    // exception would make an invalid-envelope flood expensive to reject.
    expect(new DomainRegistry().lookup('jb:post:create:v1')).toBeNull();
  });

  it('rejects a duplicate domain at registration rather than last-one-wins', () => {
    const registry = new DomainRegistry();
    registry.register(new JoinHandler());
    expect(() => registry.register(new JoinHandler())).toThrow(/duplicate handler/);
  });

  it('records each handler’s plane so step 5 can compare against the signed value', () => {
    const registry = new DomainRegistry();
    registry.register(new JoinHandler());
    registry.register(new BroadcastHandler());

    expect(registry.planeFor('jb:membership:join:v1')).toBe(Plane.FORUM);
    expect(registry.planeFor('jb:broadcast:emit:v1')).toBe(Plane.SIGNAL);
    expect(registry.planeFor('jb:post:create:v1')).toBeNull();
  });

  it('lists domains in a stable order', () => {
    const registry = new DomainRegistry();
    registry.register(new BroadcastHandler());
    registry.register(new JoinHandler());
    expect(registry.domains()).toEqual(['jb:broadcast:emit:v1', 'jb:membership:join:v1']);
    expect(registry.size).toBe(2);
  });
});
