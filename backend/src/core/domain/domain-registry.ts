/**
 * T0.21 — the dispatch table that replaces the switch statement.
 *
 * The pipeline never learns which features exist. It asks the registry for the handler
 * bound to an envelope's `domain` and gets one or gets a rejection. This is the whole
 * mechanism behind CLAUDE.md's first ban ("no switch/if on domain in the core") and
 * behind P1-G11 (adding a trivial new domain requires zero changes to ingress, projector
 * dispatch, or signing code).
 *
 * ── Registration is fail-fast, and deliberately so ──────────────────────────────────
 * A duplicate domain throws at bootstrap rather than last-registration-wins. Two handlers
 * claiming `jb:post:create:v1` is a merge accident, and the silent version of that bug is
 * one where content is projected by the wrong handler in production while every test
 * passes locally.
 *
 * ── Plane is checked at registration, not at dispatch ───────────────────────────────
 * A handler declares its plane; the registry records it. Pipeline step 5 then compares the
 * envelope's signed `plane` against the registered one, so a SIGNAL-plane envelope can
 * never reach a FORUM handler even if the domain string matches (SEP-02).
 */

import type { DomainHandler } from './domain-handler.js';
import type { Plane } from './envelope.js';

export class DomainRegistry {
  private readonly handlers = new Map<string, DomainHandler<never>>();

  register<TBody>(handler: DomainHandler<TBody>): void {
    const existing = this.handlers.get(handler.domain);
    if (existing) {
      throw new Error(
        `duplicate handler for domain "${handler.domain}" — a domain binds to exactly one handler`,
      );
    }
    this.handlers.set(handler.domain, handler as unknown as DomainHandler<never>);
  }

  /** Null rather than throwing: "unknown domain" is an ordinary rejection, not an exception. */
  lookup(domain: string): DomainHandler<never> | null {
    return this.handlers.get(domain) ?? null;
  }

  has(domain: string): boolean {
    return this.handlers.has(domain);
  }

  planeFor(domain: string): Plane | null {
    return this.handlers.get(domain)?.plane ?? null;
  }

  /** Sorted, so diagnostics and tests are order-stable. */
  domains(): readonly string[] {
    return [...this.handlers.keys()].sort();
  }

  get size(): number {
    return this.handlers.size;
  }
}
