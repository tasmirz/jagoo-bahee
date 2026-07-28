/**
 * Forum-plane feature registration (T1.18–T1.30).
 *
 * ── One list, and the pipeline never learns it exists ───────────────────────────────
 * Every handler below registers into `DomainRegistry` at bootstrap. Ingress looks a domain
 * up; it does not branch on one. Adding a feature means adding a registry row in
 * `proto/jagoo/v1/registry.yaml`, writing a handler, and adding one line here — with ZERO
 * changes to ingress, projection dispatch, signing, verification or receipt code. That is
 * P1-G11, and `forum-features.spec.ts` asserts it by registering a domain the core has
 * never heard of.
 *
 * A feature is one directory (CLAUDE.md §5.4): deleting the directory and its registry
 * rows removes it completely, with no dangling references.
 */

import type { DomainHandler } from '../../core/domain/domain-handler.js';
import type { ProjectionStore } from '../../core/ports/storage.port.js';
import type { NodeSigner } from '../../core/ports/node-signer.port.js';
import type { BlobStore } from '../../core/ports/content.port.js';

import { PostCreateHandler } from './post/post-create.handler.js';
import { PostDeleteHandler, PostUpdateHandler } from './post/post-edit.handlers.js';
import { CommentCreateHandler } from './comment/comment-create.handler.js';
import { CommentDeleteHandler, CommentUpdateHandler } from './comment/comment-edit.handlers.js';
import { VoteCastHandler } from './vote/vote-cast.handler.js';
import {
  CommunityArchiveHandler,
  CommunityCreateHandler,
  CommunityUpdateHandler,
} from './community/community.handlers.js';
import { MembershipJoinHandler, MembershipLeaveHandler } from './membership/membership.handlers.js';
import { ModActionHandler } from './moderation/mod-action.handler.js';
import { ReportCreateHandler, ReportResolveHandler } from './report/report.handlers.js';
import { RoleAssignHandler, RoleDefineHandler, RoleRevokeHandler } from './role/role.handlers.js';
import { AwardGiveHandler, AwardTypeDefineHandler } from './award/award.handlers.js';
import { AttachmentClaimHandler } from './attachment/attachment.handler.js';
import {
  BlockIdentityHandler,
  FeedPreferencesHandler,
  FollowIdentityHandler,
  ProfileUpdateHandler,
  SaveContentHandler,
} from './social/social.handlers.js';
import { ForumMessageHandler } from './message/forum-message.handler.js';
import { LabelEmitHandler } from './label/label.handler.js';
import { KeyCertifyHandler, KeyRevokeHandler } from './identity/certificate.handlers.js';

/**
 * Every Forum-plane handler this build serves.
 *
 * The registry cross-checks each one against the generated `DOMAIN_SPECS` at registration
 * (RG-01): a handler for a domain the contract does not define, or whose plane disagrees
 * with the contract, throws at bootstrap rather than at the first request.
 */
export function forumHandlers(
  projections: ProjectionStore,
  nodeSigner: NodeSigner,
  blobs?: BlobStore,
): readonly DomainHandler<never>[] {
  const handlers = [
    // Content
    new PostCreateHandler(projections),
    new PostUpdateHandler(projections),
    new PostDeleteHandler(projections),
    new CommentCreateHandler(projections),
    new CommentUpdateHandler(projections),
    new CommentDeleteHandler(projections),
    new VoteCastHandler(projections),

    // Communities and membership
    new CommunityCreateHandler(projections, nodeSigner),
    new CommunityUpdateHandler(projections),
    new CommunityArchiveHandler(projections),
    new MembershipJoinHandler(projections),
    new MembershipLeaveHandler(projections),

    // Governance
    new ModActionHandler(projections),
    new ReportCreateHandler(projections),
    new ReportResolveHandler(projections),
    new RoleDefineHandler(projections),
    new RoleAssignHandler(projections),
    new RoleRevokeHandler(projections),

    // Engagement and media
    new AwardGiveHandler(projections),
    new AwardTypeDefineHandler(projections),
    new AttachmentClaimHandler(projections, blobs),

    // Identity-adjacent, self-scoped
    new ProfileUpdateHandler(projections),
    new FollowIdentityHandler(projections),
    new BlockIdentityHandler(projections),
    new SaveContentHandler(projections),
    new FeedPreferencesHandler(projections),

    // Messaging and moderation attestation
    new ForumMessageHandler(projections),
    new LabelEmitHandler(projections),

    // Identity. The certify row is the one bootstrap exception to pipeline step 10
    // (ADR-004); its handler re-checks everything that step would have.
    new KeyCertifyHandler(projections),
    new KeyRevokeHandler(projections),
  ];

  return handlers as unknown as readonly DomainHandler<never>[];
}
