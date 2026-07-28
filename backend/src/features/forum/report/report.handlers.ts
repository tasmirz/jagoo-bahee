/**
 * T1.24 — `jb:report:create:v1`, `jb:report:resolve:v1` (MOD-13 … MOD-19).
 *
 * A report is a signed statement that someone believes content breaks a rule. It is not a
 * removal — resolving one records the moderator's judgement and, separately, a `ModAction`
 * does the removing. Keeping them apart means the mod log shows what was actually done
 * rather than what was merely requested.
 */

import { ReportCreate, ReportResolve } from '@jagoo/sdk/proto';
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
import { can, hexKey, isCommunityMember, loadAuthContext } from '../shared/permissions.js';
import { POSTS_COLLECTION, type PostDoc } from '../post/post.projection.js';
import { COMMENTS_COLLECTION, type CommentDoc } from '../comment/comment-create.handler.js';
import { IDENTITIES_COLLECTION, type IdentityDoc } from '../shared/membership.projection.js';

export const REPORTS_COLLECTION = 'forum_reports';

/** MOD-18: pending → reviewed → resolved | dismissed. */
export const ReportStatus = {
  UNSPECIFIED: 0,
  PENDING: 1,
  REVIEWED: 2,
  RESOLVED: 3,
  DISMISSED: 4,
} as const;

export interface ReportDoc {
  /** content ID of the ReportCreate envelope. */
  readonly id: string;
  readonly community: string;
  readonly reporterKey: string;
  readonly target: string;
  readonly targetKind: number;
  readonly reason: number;
  readonly detail: string;
  readonly status: number;
  readonly actionTaken: number;
  readonly resolutionNote: string;
  readonly resolvedByKey: string | null;
  readonly createdAtMs: number;
  readonly resolvedAtMs: number | null;
}

const MAX_DETAIL = 2000;

export class ReportCreateHandler implements DomainHandler<ReportCreate> {
  readonly domain = 'jb:report:create:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): ReportCreate {
    return ReportCreate.decode(body);
  }

  validate(body: ReportCreate, env: ParsedEnvelope): ValidationResult {
    if (!body.target) return invalid('target is required', 'target');
    if (!env.scope) return invalid('a report must name its community', 'scope');
    if (body.reason === 0) return invalid('a reason is required', 'reason');
    if ([...body.detail].length > MAX_DETAIL) {
      return invalid(`detail exceeds ${MAX_DETAIL} characters`, 'detail');
    }
    return valid;
  }

  async authorize(body: ReportCreate, env: ParsedEnvelope): Promise<AuthDecision> {
    const ctx = await loadAuthContext(
      this.projections,
      hexKey(env.authorKey),
      env.scope,
      Number(env.createdAtMs),
    );
    if (!ctx.communityDoc) return denied('community is not known here');
    if (!isCommunityMember(ctx)) return denied('community membership required');
    const post = await this.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: body.target });
    const comment = post
      ? null
      : await this.projections
          .collection<CommentDoc>(COMMENTS_COLLECTION)
          .findOne({ id: body.target });
    const identity =
      post || comment
        ? null
        : await this.projections
            .collection<IdentityDoc>(IDENTITIES_COLLECTION)
            .findOne({ id: body.target });
    if (!post && !comment && !identity) return denied('report target is not known here');
    if (post && post.community !== env.scope) return denied('target is in another community');
    if (comment) {
      const parent = await this.projections
        .collection<PostDoc>(POSTS_COLLECTION)
        .findOne({ id: comment.post });
      if (!parent || parent.community !== env.scope) {
        return denied('target is in another community');
      }
    }
    return allowed;
  }

  async project(body: ReportCreate, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const doc: ReportDoc = {
      id: env.contentId,
      community: env.scope,
      reporterKey: hexKey(env.authorKey),
      target: body.target,
      targetKind: body.target_kind,
      reason: body.reason,
      detail: body.detail,
      status: ReportStatus.PENDING,
      actionTaken: 0,
      resolutionNote: '',
      resolvedByKey: null,
      createdAtMs: Number(env.createdAtMs),
      resolvedAtMs: null,
    };
    await this.projections.collection<ReportDoc>(REPORTS_COLLECTION).put(doc.id, doc, tx);
  }
}

export class ReportResolveHandler implements DomainHandler<ReportResolve> {
  readonly domain = 'jb:report:resolve:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): ReportResolve {
    return ReportResolve.decode(body);
  }

  validate(body: ReportResolve, _env: ParsedEnvelope): ValidationResult {
    if (!body.target.startsWith('jb1')) {
      return invalid('target must be the content ID of a report', 'target');
    }
    if (body.status === ReportStatus.UNSPECIFIED || body.status === ReportStatus.PENDING) {
      return invalid('resolution must set a terminal status', 'status');
    }
    return valid;
  }

  async authorize(body: ReportResolve, env: ParsedEnvelope): Promise<AuthDecision> {
    const report = await this.projections
      .collection<ReportDoc>(REPORTS_COLLECTION)
      .findOne({ id: body.target });
    if (!report) return denied('report is not known here');

    const ctx = await loadAuthContext(
      this.projections,
      hexKey(env.authorKey),
      report.community,
      Number(env.createdAtMs),
    );
    if (!can(ctx, 'report.review')) return denied('report.review permission required');
    return allowed;
  }

  async project(body: ReportResolve, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const reports = this.projections.collection<ReportDoc>(REPORTS_COLLECTION);
    const report = await reports.findOne({ id: body.target });
    if (!report) return;

    await reports.put(
      body.target,
      {
        ...report,
        status: body.status,
        actionTaken: body.action_taken,
        resolutionNote: body.note,
        resolvedByKey: hexKey(env.authorKey),
        resolvedAtMs: Number(env.createdAtMs),
      },
      tx,
    );
  }
}
