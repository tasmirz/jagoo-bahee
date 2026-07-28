/**
 * T1.28 — profile, follow, block, save, feed preferences (USR-02 … USR-10).
 *
 * ── PA-01: none of these rows may carry a network address ───────────────────────────
 * A profile is a label on a key. There is no IP, no session, no device fingerprint and no
 * User-Agent stored anywhere in this file, because the node MUST NOT persist any mapping
 * from a Forum key to a network address — such a table is a deanonymisation list for
 * exactly the population this system protects.
 *
 * ── Saves and preferences are private by construction ───────────────────────────────
 * `jb:social:save:v1` and `jb:prefs:feed:v1` cost zero credits and are visible only to
 * their author through `/v1/me/*`. A public "saved" list would leak reading habits, which
 * in this threat model is close to leaking political affiliation.
 */

import {
  BlockIdentity,
  FeedPreferences,
  FollowIdentity,
  ProfileUpdate,
  SaveContent,
} from '@jagoo/sdk/proto';
import type { Tx } from '../../../core/domain/domain-handler.js';
import {
  allowed,
  invalid,
  valid,
  type AuthDecision,
  type DomainHandler,
  type ValidationResult,
} from '../../../core/domain/domain-handler.js';
import { Plane, type ParsedEnvelope } from '../../../core/domain/envelope.js';
import type { ProjectionStore } from '../../../core/ports/storage.port.js';
import { IdentityFlag } from '../shared/flags.js';
import { hexKey } from '../shared/permissions.js';
import { IDENTITIES_COLLECTION, type IdentityDoc } from '../shared/membership.projection.js';
import { addNotification } from '../shared/notification.projection.js';

export const FOLLOWS_COLLECTION = 'forum_follows';
export const BLOCKS_COLLECTION = 'forum_blocks';
export const SAVED_COLLECTION = 'forum_saved';
export const FEED_PREFS_COLLECTION = 'forum_feed_prefs';

const MAX_DISPLAY_NAME = 64;
const MAX_BIO = 500;

export interface EdgeDoc {
  /** `${actorKeyHex}:${subjectKeyHex}` — one row per direction. */
  readonly id: string;
  readonly actorKey: string;
  readonly subjectKey: string;
  readonly reason: string;
  readonly updatedAtMs: number;
}

export interface SavedDoc {
  readonly id: string;
  readonly actorKey: string;
  readonly target: string;
  readonly targetKind: number;
  readonly collection: string;
  readonly updatedAtMs: number;
}

export interface FeedPrefsDoc {
  readonly id: string;
  readonly defaultSort: number;
  readonly defaultTimeframe: number;
  readonly showNsfw: boolean;
  readonly blurNsfw: boolean;
  readonly layout: number;
  readonly favouriteCommunities: readonly string[];
  readonly hiddenKeys: readonly string[];
  readonly updatedAtMs: number;
}

const edgeKey = (actor: string, subject: string): string => `${actor}:${subject}`;

/** Every social handler acts on the author's own state, so they share this. */
abstract class SelfScopedHandler<T> implements DomainHandler<T> {
  abstract readonly domain: string;
  readonly plane = Plane.FORUM;

  constructor(protected readonly projections: ProjectionStore) {}

  abstract decode(body: Uint8Array): T;
  abstract validate(body: T, env: ParsedEnvelope): ValidationResult;
  abstract project(body: T, env: ParsedEnvelope, tx: Tx): Promise<void>;

  async authorize(_body: T, _env: ParsedEnvelope): Promise<AuthDecision> {
    // The signature already proves the author is who they claim, and every one of these
    // domains writes only to that author's own row. There is nothing further to check.
    return allowed;
  }

  /** Upsert the author's identity row, creating it on first sight. */
  protected async upsertIdentity(
    env: ParsedEnvelope,
    tx: Tx,
    patch: Partial<IdentityDoc>,
  ): Promise<void> {
    const id = hexKey(env.authorKey);
    const identities = this.projections.collection<IdentityDoc>(IDENTITIES_COLLECTION);
    const existing = await identities.findOne({ id });
    const base: IdentityDoc = existing ?? {
      id,
      displayName: '',
      bio: '',
      avatar: '',
      banner: '',
      flags: IdentityFlag.ACTIVE.toString(),
      postKarma: 0,
      commentKarma: 0,
      firstSeenAtMs: Number(env.createdAtMs),
    };
    await identities.put(id, { ...base, ...patch }, tx);
  }
}

export class ProfileUpdateHandler extends SelfScopedHandler<ProfileUpdate> {
  readonly domain = 'jb:profile:update:v1';

  decode(body: Uint8Array): ProfileUpdate {
    return ProfileUpdate.decode(body);
  }

  validate(body: ProfileUpdate, _env: ParsedEnvelope): ValidationResult {
    if ([...body.display_name].length > MAX_DISPLAY_NAME) {
      return invalid(`display name exceeds ${MAX_DISPLAY_NAME} characters`, 'display_name');
    }
    if ([...body.bio].length > MAX_BIO) return invalid(`bio exceeds ${MAX_BIO} characters`, 'bio');
    return valid;
  }

  async project(body: ProfileUpdate, env: ParsedEnvelope, tx: Tx): Promise<void> {
    await this.upsertIdentity(env, tx, {
      displayName: body.display_name,
      bio: body.bio,
      avatar: body.avatar,
      banner: body.banner,
    });
  }
}

export class FollowIdentityHandler extends SelfScopedHandler<FollowIdentity> {
  readonly domain = 'jb:social:follow:v1';

  decode(body: Uint8Array): FollowIdentity {
    return FollowIdentity.decode(body);
  }

  validate(body: FollowIdentity, env: ParsedEnvelope): ValidationResult {
    if (body.subject_key.length !== 32) {
      return invalid('subject_key must be a 32-byte Ed25519 key', 'subject_key');
    }
    if (Buffer.from(body.subject_key).equals(Buffer.from(env.authorKey))) {
      return invalid('a key cannot follow itself', 'subject_key');
    }
    return valid;
  }

  async project(body: FollowIdentity, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const actor = hexKey(env.authorKey);
    const subject = Buffer.from(body.subject_key).toString('hex');
    const id = edgeKey(actor, subject);
    const follows = this.projections.collection<EdgeDoc>(FOLLOWS_COLLECTION);

    if (!body.follow) {
      await follows.delete(id, tx);
      return;
    }
    await follows.put(
      id,
      {
        id,
        actorKey: actor,
        subjectKey: subject,
        reason: '',
        updatedAtMs: Number(env.createdAtMs),
      },
      tx,
    );
    await addNotification(
      this.projections,
      {
        recipientKey: subject,
        kind: 'follow',
        contentId: env.contentId,
        actorKey: actor,
        createdAtMs: Number(env.createdAtMs),
      },
      tx,
    );
  }
}

export class BlockIdentityHandler extends SelfScopedHandler<BlockIdentity> {
  readonly domain = 'jb:social:block:v1';

  decode(body: Uint8Array): BlockIdentity {
    return BlockIdentity.decode(body);
  }

  validate(body: BlockIdentity, env: ParsedEnvelope): ValidationResult {
    if (body.subject_key.length !== 32) {
      return invalid('subject_key must be a 32-byte Ed25519 key', 'subject_key');
    }
    if (Buffer.from(body.subject_key).equals(Buffer.from(env.authorKey))) {
      return invalid('a key cannot block itself', 'subject_key');
    }
    return valid;
  }

  async project(body: BlockIdentity, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const actor = hexKey(env.authorKey);
    const subject = Buffer.from(body.subject_key).toString('hex');
    const id = edgeKey(actor, subject);
    const blocks = this.projections.collection<EdgeDoc>(BLOCKS_COLLECTION);

    if (!body.block) {
      await blocks.delete(id, tx);
      return;
    }
    await blocks.put(
      id,
      {
        id,
        actorKey: actor,
        subjectKey: subject,
        reason: body.reason,
        updatedAtMs: Number(env.createdAtMs),
      },
      tx,
    );
  }
}

export class SaveContentHandler extends SelfScopedHandler<SaveContent> {
  readonly domain = 'jb:social:save:v1';

  decode(body: Uint8Array): SaveContent {
    return SaveContent.decode(body);
  }

  validate(body: SaveContent, _env: ParsedEnvelope): ValidationResult {
    if (!body.target.startsWith('jb1')) return invalid('target must be a content ID', 'target');
    return valid;
  }

  async project(body: SaveContent, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const actor = hexKey(env.authorKey);
    const id = `${actor}:${body.target}`;
    const saved = this.projections.collection<SavedDoc>(SAVED_COLLECTION);

    if (!body.save) {
      await saved.delete(id, tx);
      return;
    }
    await saved.put(
      id,
      {
        id,
        actorKey: actor,
        target: body.target,
        targetKind: body.target_kind,
        collection: body.collection,
        updatedAtMs: Number(env.createdAtMs),
      },
      tx,
    );
  }
}

export class FeedPreferencesHandler extends SelfScopedHandler<FeedPreferences> {
  readonly domain = 'jb:prefs:feed:v1';

  decode(body: Uint8Array): FeedPreferences {
    return FeedPreferences.decode(body);
  }

  validate(body: FeedPreferences, _env: ParsedEnvelope): ValidationResult {
    for (const key of body.hidden_keys) {
      if (key.length !== 32) return invalid('hidden_keys must be 32-byte keys', 'hidden_keys');
    }
    return valid;
  }

  async project(body: FeedPreferences, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const id = hexKey(env.authorKey);
    const doc: FeedPrefsDoc = {
      id,
      defaultSort: body.default_sort,
      defaultTimeframe: body.default_timeframe,
      showNsfw: body.show_nsfw,
      blurNsfw: body.blur_nsfw,
      layout: body.layout,
      favouriteCommunities: [...body.favourite_communities],
      hiddenKeys: body.hidden_keys.map((k) => Buffer.from(k).toString('hex')),
      updatedAtMs: Number(env.createdAtMs),
    };
    await this.projections.collection<FeedPrefsDoc>(FEED_PREFS_COLLECTION).put(id, doc, tx);
  }
}
