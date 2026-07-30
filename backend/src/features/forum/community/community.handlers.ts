/**
 * T1.21 — community lifecycle: create, update, archive.
 *
 * Three handlers in one file because they share a projection and a validation vocabulary.
 * The feature is still one directory (CLAUDE.md §5.4) — deleting `community/` and its
 * registry rows removes it completely.
 *
 * COM-06: archive is a TOMBSTONE. There is no hard delete anywhere in this system; a
 * community that disappeared without a trace would be indistinguishable from one that had
 * been quietly censored (VIS-05, VIS-06).
 */

import { CommunityArchive, CommunityCreate, CommunityUpdate } from '@jagoo/sdk/proto';
import type { HandlerContext, Tx } from '../../../core/domain/domain-handler.js';
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
import type { NodeSigner } from '../../../core/ports/node-signer.port.js';
import { can, hexKey, loadAuthContext } from '../shared/permissions.js';
import { MembershipFlag } from '../shared/flags.js';
import {
  MEMBERSHIPS_COLLECTION,
  membershipKey,
  type MembershipDoc,
} from '../shared/membership.projection.js';
import {
  COMMUNITIES_COLLECTION,
  COMMUNITY_NAME_PATTERN,
  DEFAULT_SETTINGS,
  DEFAULT_THEME,
  communityId,
  type CommunityDoc,
  type CommunitySettingsDoc,
  type CommunityThemeDoc,
} from './community.projection.js';

const MAX_TITLE = 100;
const MAX_DESCRIPTION = 500;
const MAX_RULES = 10000;

function settingsFrom(patch: CommunityCreate): CommunitySettingsDoc {
  const s = patch.settings;
  if (!s) return DEFAULT_SETTINGS;
  return {
    allowTextPosts: s.allow_text_posts,
    allowLinkPosts: s.allow_link_posts,
    allowImagePosts: s.allow_image_posts,
    allowVideoPosts: s.allow_video_posts,
    requirePostApproval: s.require_post_approval,
    allowCrossposts: s.allow_crossposts,
    minimumKarmaToPost: s.minimum_karma_to_post,
    minimumAccountAgeDays: s.minimum_account_age_days,
  };
}

function themeFrom(patch: CommunityCreate): CommunityThemeDoc {
  const t = patch.theme;
  if (!t) return DEFAULT_THEME;
  return {
    primary: t.primary,
    accent: t.accent,
    background: t.background,
    foreground: t.foreground,
  };
}

function validateMetadata(
  title: string,
  description: string,
  rules: string,
): ValidationResult | null {
  if ([...title].length > MAX_TITLE) return invalid(`title exceeds ${MAX_TITLE} characters`, 'title');
  if ([...description].length > MAX_DESCRIPTION) {
    return invalid(`description exceeds ${MAX_DESCRIPTION} characters`, 'description');
  }
  if ([...rules].length > MAX_RULES) {
    return invalid(`rules exceed ${MAX_RULES} characters`, 'rules_markdown');
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// create
// ─────────────────────────────────────────────────────────────────────────────────────

export class CommunityCreateHandler implements DomainHandler<CommunityCreate> {
  readonly domain = 'jb:community:create:v1';
  readonly plane = Plane.FORUM;

  constructor(
    private readonly projections: ProjectionStore,
    private readonly nodeSigner: NodeSigner,
  ) {}

  decode(body: Uint8Array): CommunityCreate {
    return CommunityCreate.decode(body);
  }

  validate(body: CommunityCreate, _env: ParsedEnvelope): ValidationResult {
    if (!COMMUNITY_NAME_PATTERN.test(body.name)) {
      return invalid('name must be 3-24 lowercase letters, digits or underscores', 'name');
    }
    return validateMetadata(body.title, body.description, body.rules_markdown) ?? valid;
  }

  async authorize(
    body: CommunityCreate,
    env: ParsedEnvelope,
    ctx?: HandlerContext,
  ): Promise<AuthDecision> {
    console.log('[CommunityCreateHandler] Authorizing community creation:', body.name);
    // COM-02: the name must be free ON THIS ORIGIN. Two instances may each host a
    // `dhaka-relief`; the origin fingerprint in the ID keeps them distinct (COM-19).
    //
    // The origin is the node the create envelope was PUBLISHED to, not the node projecting
    // it. Using the local key here would make a federated community collide with a
    // same-named local one and be refused — see ADR-010.
    const id = communityId(body.name, ctx?.originServerId ?? this.nodeSigner.serverId);
    const existing = await this.projections
      .collection<CommunityDoc>(COMMUNITIES_COLLECTION)
      .findOne({ id });
    if (existing) {
      console.log('[CommunityCreateHandler] Authorization denied: already exists.');
      return denied(`community ${body.name} already exists on this instance`);
    }

    // Publish-then-attest still applies: the check above is uniqueness, not approval.
    void env;
    console.log('[CommunityCreateHandler] Authorization granted.');
    return allowed;
  }

  async project(
    body: CommunityCreate,
    env: ParsedEnvelope,
    tx: Tx,
    ctx?: HandlerContext,
  ): Promise<void> {
    console.log('[CommunityCreateHandler] Projecting community creation:', body.name);
    // Plans/02 §7: a community ID is stable across nodes. It therefore cannot be derived
    // from the key of whichever node happens to be projecting it (ADR-010).
    const id = communityId(body.name, ctx?.originServerId ?? this.nodeSigner.serverId);
    const owner = hexKey(env.authorKey);
    const createdAtMs = Number(env.createdAtMs);

    const doc: CommunityDoc = {
      id,
      name: body.name,
      title: body.title,
      description: body.description,
      rulesMarkdown: body.rules_markdown,
      ownerKey: owner,
      theme: themeFrom(body),
      settings: settingsFrom(body),
      isPrivate: body.is_private,
      isNsfw: body.is_nsfw,
      archived: false,
      memberCount: 1,
      postCount: 0,
      createdAtMs,
      updatedAtMs: createdAtMs,
      contentId: env.contentId,
    };
    await this.projections.collection<CommunityDoc>(COMMUNITIES_COLLECTION).put(id, doc, tx);
    console.log('[CommunityCreateHandler] Community document saved:', id);

    // The creator is a member and a moderator from the first moment, so a community is
    // never left with nobody able to moderate it.
    const membership: MembershipDoc = {
      id: membershipKey(id, owner),
      community: id,
      memberKey: owner,
      flags: (MembershipFlag.MEMBER | MembershipFlag.MODERATOR).toString(),
      joinedAtMs: createdAtMs,
      restrictedUntilMs: null,
      restrictionReason: null,
    };
    await this.projections
      .collection<MembershipDoc>(MEMBERSHIPS_COLLECTION)
      .put(membership.id, membership, tx);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────
// update
// ─────────────────────────────────────────────────────────────────────────────────────

export class CommunityUpdateHandler implements DomainHandler<CommunityUpdate> {
  readonly domain = 'jb:community:update:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): CommunityUpdate {
    return CommunityUpdate.decode(body);
  }

  validate(body: CommunityUpdate, env: ParsedEnvelope): ValidationResult {
    if (!body.target) return invalid('target community is required', 'target');
    if (env.scope && env.scope !== body.target) {
      return invalid('scope must match the community being updated', 'scope');
    }
    const patch = body.patch;
    if (!patch) return invalid('patch is required', 'patch');
    return validateMetadata(patch.title, patch.description, patch.rules_markdown) ?? valid;
  }

  async authorize(body: CommunityUpdate, env: ParsedEnvelope): Promise<AuthDecision> {
    const ctx = await loadAuthContext(
      this.projections,
      hexKey(env.authorKey),
      body.target,
      Number(env.createdAtMs),
    );
    if (!ctx.communityDoc) return denied('community is not known here');
    if (!can(ctx, 'community.update')) return denied('community.update permission required');
    return allowed;
  }

  async project(body: CommunityUpdate, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const communities = this.projections.collection<CommunityDoc>(COMMUNITIES_COLLECTION);
    const existing = await communities.findOne({ id: body.target });
    if (!existing) return;

    const patch = body.patch;
    if (!patch) return;

    // The name is immutable: it is half of the community's identity (COM-19), and letting
    // it change would silently repoint every federated reference.
    await communities.put(
      body.target,
      {
        ...existing,
        title: patch.title || existing.title,
        description: patch.description || existing.description,
        rulesMarkdown: patch.rules_markdown || existing.rulesMarkdown,
        theme: patch.theme ? themeFrom(patch) : existing.theme,
        settings: patch.settings ? settingsFrom(patch) : existing.settings,
        isPrivate: patch.is_private,
        isNsfw: patch.is_nsfw,
        updatedAtMs: Number(env.createdAtMs),
      },
      tx,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────
// archive
// ─────────────────────────────────────────────────────────────────────────────────────

export class CommunityArchiveHandler implements DomainHandler<CommunityArchive> {
  readonly domain = 'jb:community:archive:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): CommunityArchive {
    return CommunityArchive.decode(body);
  }

  validate(body: CommunityArchive, _env: ParsedEnvelope): ValidationResult {
    if (!body.target) return invalid('target community is required', 'target');
    return valid;
  }

  async authorize(body: CommunityArchive, env: ParsedEnvelope): Promise<AuthDecision> {
    const ctx = await loadAuthContext(
      this.projections,
      hexKey(env.authorKey),
      body.target,
      Number(env.createdAtMs),
    );
    if (!ctx.communityDoc) return denied('community is not known here');
    // Archiving is the owner's call alone — it is the closest thing to deletion that
    // exists, so it does not ride on a delegated moderation bit.
    if (ctx.communityDoc.ownerKey !== hexKey(env.authorKey)) {
      return denied('only the community owner may archive it');
    }
    return allowed;
  }

  async project(body: CommunityArchive, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const communities = this.projections.collection<CommunityDoc>(COMMUNITIES_COLLECTION);
    const existing = await communities.findOne({ id: body.target });
    if (!existing) return;
    await communities.put(
      body.target,
      { ...existing, archived: body.archived, updatedAtMs: Number(env.createdAtMs) },
      tx,
    );
  }
}
