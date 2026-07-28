/**
 * Reconstructs every derived collection from the authoritative envelope log (P1-G3).
 *
 * Rebuild intentionally calls only decode + project. Accepted envelopes have already
 * passed validation, authorization and anti-abuse; re-spending their credits or checking
 * current permissions would make a historical replay non-deterministic.
 */

import type { DomainRegistry } from '../domain/domain-registry.js';
import type { EnvelopeReader, ProjectionStore } from '../ports/storage.port.js';

export interface RebuildReport {
  readonly scanned: number;
  readonly projected: number;
  readonly lastLogIndex: number | null;
}

export class ProjectionRebuilder {
  constructor(
    private readonly reader: EnvelopeReader,
    private readonly projections: ProjectionStore,
    private readonly registry: DomainRegistry,
  ) {}

  async rebuild(): Promise<RebuildReport> {
    await this.projections.reset();
    let scanned = 0;
    let projected = 0;
    let lastLogIndex: number | null = null;

    for await (const stored of this.reader.range(0, Number.MAX_SAFE_INTEGER)) {
      scanned += 1;
      lastLogIndex = stored.logIndex;
      const handler = this.registry.handlerFor(stored.envelope.domain);
      if (!handler) {
        throw new Error(
          `cannot rebuild ${stored.envelope.contentId}: no handler for ${stored.envelope.domain}`,
        );
      }
      const body = handler.decode(stored.envelope.body);
      await this.projections.transaction(async (tx) => {
        await handler.project(body, stored.envelope, tx);
      });
      projected += 1;
    }

    return { scanned, projected, lastLogIndex };
  }
}
