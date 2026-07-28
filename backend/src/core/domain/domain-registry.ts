/**
 * T0.21 / T1.2 — the dispatch table that replaces the switch statement.
 *
 * The pipeline never learns which features exist. It asks the registry for the handler and
 * the policy bound to an envelope's `domain`, and gets them or gets a rejection. This is
 * the mechanism behind CLAUDE.md's first ban ("no switch/if on domain in the core") and
 * behind P1-G11 (a trivial new domain requires zero changes to ingress, projector dispatch
 * or signing code).
 *
 * ── Two sources of truth, joined here ───────────────────────────────────────────────
 * `DOMAIN_SPECS` is GENERATED from `proto/jagoo/v1/registry.yaml` and carries the policy:
 * plane, priority class, permitted key algorithms, size budget, credit cost, anti-abuse
 * gates, idempotency. A `DomainHandler` carries the behaviour. Registration joins them and
 * rejects any disagreement, so a handler cannot quietly claim a domain the contract does
 * not define, or a plane the contract does not assign it (RG-01, SEP-02).
 *
 * That check is why pipeline steps 6, 7 and 13 can be written as policy lookups instead of
 * conditionals — the policy is guaranteed to exist for every dispatchable domain.
 *
 * ── Registration is fail-fast ───────────────────────────────────────────────────────
 * A duplicate domain throws at bootstrap rather than last-registration-wins. Two handlers
 * claiming `jb:post:create:v1` is a merge accident, and the silent version of that bug
 * projects content through the wrong handler in production while every test passes locally.
 */

import { lookupDomain, type DomainSpec } from '@jagoo/sdk';
import type { DomainHandler } from './domain-handler.js';
import { Plane } from './envelope.js';

/** A handler joined to its generated policy row. */
export interface RegisteredDomain {
  readonly handler: DomainHandler<never>;
  readonly spec: DomainSpec;
}

/** The registry's `FORUM`/`SIGNAL` strings mapped onto the signed enum values. */
const PLANE_BY_NAME: Record<string, Plane> = {
  FORUM: Plane.FORUM,
  SIGNAL: Plane.SIGNAL,
};

export class DomainRegistry {
  private readonly entries = new Map<string, RegisteredDomain>();

  register<TBody>(handler: DomainHandler<TBody>): void {
    if (this.entries.has(handler.domain)) {
      throw new Error(
        `duplicate handler for domain "${handler.domain}" — a domain binds to exactly one handler`,
      );
    }

    // RG-01: the contract defines which domains exist. A handler cannot invent one.
    const spec = lookupDomain(handler.domain);
    if (!spec) {
      throw new Error(
        `domain "${handler.domain}" is not in the generated registry. ` +
          'Add a row to proto/jagoo/v1/registry.yaml and run `pnpm proto:gen` — ' +
          'the registry is the only place a domain is defined.',
      );
    }

    // SEP-02: the plane is signed, so a handler disagreeing with the contract about which
    // plane it serves would let cross-plane content reach the wrong code.
    const specPlane = PLANE_BY_NAME[spec.plane];
    if (specPlane !== handler.plane) {
      throw new Error(
        `handler for "${handler.domain}" declares plane ${handler.plane} but the registry says ` +
          `${spec.plane} (${specPlane}). The registry is authoritative.`,
      );
    }

    this.entries.set(handler.domain, { handler: handler as unknown as DomainHandler<never>, spec });
  }

  /** Null rather than throwing: "unknown domain" is an ordinary rejection, not an exception. */
  lookup(domain: string): RegisteredDomain | null {
    return this.entries.get(domain) ?? null;
  }

  handlerFor(domain: string): DomainHandler<never> | null {
    return this.entries.get(domain)?.handler ?? null;
  }

  specFor(domain: string): DomainSpec | null {
    return this.entries.get(domain)?.spec ?? null;
  }

  has(domain: string): boolean {
    return this.entries.has(domain);
  }

  planeFor(domain: string): Plane | null {
    return this.entries.get(domain)?.handler.plane ?? null;
  }

  /** Sorted, so diagnostics and tests are order-stable. */
  domains(): readonly string[] {
    return [...this.entries.keys()].sort();
  }

  get size(): number {
    return this.entries.size;
  }
}
