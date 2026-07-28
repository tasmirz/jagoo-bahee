/**
 * T1.30 — `jb:label:emit:v1` (LBL-01 … LBL-11, FM-04 … FM-06).
 *
 * ── Publish-then-attest, and why it is not a pre-publish gate ───────────────────────
 * A label is a signed OPINION about content that is already published and already valid.
 * It never blocks publication. The alternative — holding the publish button until a
 * classifier approves — makes silent censorship structurally possible, because withheld
 * approval is indistinguishable from a network error. Here a missing label is visible and
 * a `RESTRICT` label is signed evidence the author can point at and contest (LBL-01's
 * `reasons[]` and `appealable`).
 *
 * ── Labels are additive; removing one removes a filter, never content ───────────────
 * Several labellers may disagree publicly about the same content, and the client chooses
 * whose opinions it honours (LBL-07). A user can remove ANY labeller from their trust set,
 * including the home instance's (LBL-08) — which is what stops the instance operator from
 * being a gatekeeper by another name.
 *
 * ── LBL-06: a dead labeller must never become an outage ─────────────────────────────
 * Nothing on the publish path calls a labeller. This handler only records labels that
 * arrive as envelopes, so the labeller being down means content is unlabelled, not
 * unpublishable.
 */

import { Label } from '@jagoo/sdk/proto';
import type { Tx } from '../../../core/domain/domain-handler.js';
import {
  allowed,
  denied,
  invalid,
  valid,
  type AuthDecision,
  type DomainHandler,
  type ValidationResult,
} from '../../../core/domain/domain-handler.js';
import { Plane, type ParsedEnvelope } from '../../../core/domain/envelope.js';
import type { ProjectionStore } from '../../../core/ports/storage.port.js';
import { can, hexKey, loadAuthContext } from '../shared/permissions.js';

export const LABELS_COLLECTION = 'forum_labels';

/** LBL-02. */
export const Verdict = {
  UNSPECIFIED: 0,
  OK: 1,
  REVIEW: 2,
  RESTRICT: 3,
  DANGEROUS: 4,
} as const;

export interface LabelDoc {
  /** content ID of the Label envelope. */
  readonly id: string;
  readonly target: string;
  /** Who is asserting this. The client decides whether to honour them (LBL-07). */
  readonly labellerKey: string;
  readonly verdict: number;
  readonly categories: readonly string[];
  readonly confidencePct: number;
  /** "claude-haiku-4-5" | "human:mod" — LBL-04 uses the same envelope for both. */
  readonly modelId: string;
  readonly reasons: readonly string[];
  readonly appealable: boolean;
  readonly createdAtMs: number;
}

export class LabelEmitHandler implements DomainHandler<Label> {
  readonly domain = 'jb:label:emit:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): Label {
    return Label.decode(body);
  }

  validate(body: Label, _env: ParsedEnvelope): ValidationResult {
    if (!body.target.startsWith('jb1')) return invalid('target must be a content ID', 'target');
    if (body.verdict === Verdict.UNSPECIFIED) return invalid('a verdict is required', 'verdict');
    if (body.confidence_pct > 100) return invalid('confidence must be 0-100', 'confidence_pct');
    if (!body.model_id) return invalid('model_id is required for attribution', 'model_id');

    // A RESTRICT or DANGEROUS verdict with no stated reason is unappealable in practice,
    // because there is nothing for the author to answer. LBL-01 requires the reasons.
    if (
      (body.verdict === Verdict.RESTRICT || body.verdict === Verdict.DANGEROUS) &&
      body.reasons.length === 0
    ) {
      return invalid('a restrictive verdict must state its reasons', 'reasons');
    }
    return valid;
  }

  async authorize(_body: Label, env: ParsedEnvelope): Promise<AuthDecision> {
    // LBL-10: third parties can label without the instance's cooperation, but a label
    // scoped to a community still needs that community's `label.trust` bit so a stranger
    // cannot flood a community's moderation view. An unscoped label is always allowed —
    // clients filter by labeller anyway.
    if (!env.scope) return allowed;

    const ctx = await loadAuthContext(
      this.projections,
      hexKey(env.authorKey),
      env.scope,
      Number(env.createdAtMs),
    );
    if (!can(ctx, 'label.trust')) return denied('label.trust permission required in this community');
    return allowed;
  }

  async project(body: Label, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const doc: LabelDoc = {
      id: env.contentId,
      target: body.target,
      labellerKey: hexKey(env.authorKey),
      verdict: body.verdict,
      categories: [...body.categories],
      confidencePct: body.confidence_pct,
      modelId: body.model_id,
      reasons: [...body.reasons],
      appealable: body.appealable,
      createdAtMs: Number(env.createdAtMs),
    };
    await this.projections.collection<LabelDoc>(LABELS_COLLECTION).put(doc.id, doc, tx);
  }
}
