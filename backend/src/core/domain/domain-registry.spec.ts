/**
 * T0.21 — a handler registers and dispatches with NO core change.
 *
 * This is the Open/Closed test. The domain used here (`jb:throwaway:test:v1`) appears
 * nowhere in the core, nowhere in the registry YAML, and nowhere in the pipeline. If this
 * suite passes, adding a real feature is exactly this plus a registry row — which is what
 * P1-G11 asserts at the feature level.
 *
 * The negative worth stating: nothing in `core/` may contain `switch (env.domain)`. That
 * is lint-enforced (AR-05). This test is the positive half — proving the alternative
 * actually works, not merely that the bad shape is banned.
 */

import { describe, expect, it } from 'vitest';
import { DomainRegistry } from './domain-registry.js';
import { Plane, type ParsedEnvelope } from './envelope.js';
import { allowed, valid, type DomainHandler, type Tx } from './domain-handler.js';

interface ThrowawayBody {
  readonly text: string;
}

/** A domain the core has never heard of. */
class ThrowawayHandler implements DomainHandler<ThrowawayBody> {
  readonly domain = 'jb:throwaway:test:v1';
  readonly plane = Plane.FORUM;
  readonly projected: string[] = [];

  decode(body: Uint8Array): ThrowawayBody {
    return { text: new TextDecoder().decode(body) };
  }
  validate(body: ThrowawayBody) {
    return body.text.length > 0 ? valid : { ok: false as const, reason: 'empty' };
  }
  async authorize() {
    return allowed;
  }
  async project(body: ThrowawayBody, _env: ParsedEnvelope, _tx: Tx) {
    this.projected.push(body.text);
  }
}

class SignalHandler implements DomainHandler<unknown> {
  readonly domain = 'jb:throwaway:signal:v1';
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

describe('DomainRegistry (T0.21)', () => {
  it('registers and dispatches a domain the core has never heard of', async () => {
    const registry = new DomainRegistry();
    const handler = new ThrowawayHandler();
    registry.register(handler);

    const found = registry.lookup('jb:throwaway:test:v1');
    expect(found).toBe(handler);

    // Round-trip through the handler exactly as the pipeline would.
    const body = found!.decode(new TextEncoder().encode('hello'));
    expect(found!.validate(body, {} as ParsedEnvelope)).toEqual({ ok: true });
    await found!.project(body, {} as ParsedEnvelope, { id: 'tx-1' });
    expect(handler.projected).toEqual(['hello']);
  });

  it('returns null for an unregistered domain rather than throwing', () => {
    // Unknown domain is an ordinary rejection at pipeline step 4, not an exception. An
    // exception here would make an invalid-envelope flood expensive to reject.
    expect(new DomainRegistry().lookup('jb:nope:v1')).toBeNull();
  });

  it('rejects a duplicate domain at registration rather than last-one-wins', () => {
    const registry = new DomainRegistry();
    registry.register(new ThrowawayHandler());
    expect(() => registry.register(new ThrowawayHandler())).toThrow(/duplicate handler/);
  });

  it('records each handler’s plane so step 5 can compare against the signed value', () => {
    const registry = new DomainRegistry();
    registry.register(new ThrowawayHandler());
    registry.register(new SignalHandler());

    expect(registry.planeFor('jb:throwaway:test:v1')).toBe(Plane.FORUM);
    expect(registry.planeFor('jb:throwaway:signal:v1')).toBe(Plane.SIGNAL);
    expect(registry.planeFor('jb:absent:v1')).toBeNull();
  });

  it('lists domains in a stable order', () => {
    const registry = new DomainRegistry();
    registry.register(new SignalHandler());
    registry.register(new ThrowawayHandler());
    expect(registry.domains()).toEqual(['jb:throwaway:signal:v1', 'jb:throwaway:test:v1']);
    expect(registry.size).toBe(2);
  });
});
