/**
 * Community projection (T1.21, COM-01 … COM-19).
 *
 * ── The identifier is `<name>@<origin_fingerprint>`, never a row ID ─────────────────
 * COM-19/ID-01. v1 signed `subredditId` as a Mongo ObjectId, which is meaningless on any
 * other node — a remote instance can neither resolve nor verify it. That single choice is
 * what made v1 federation impossible, so the community's identity here is derived from
 * data every node can see: the requested name plus the fingerprint of the instance it was
 * created on. Names are not globally unique; the origin fingerprint disambiguates.
 */

export const COMMUNITIES_COLLECTION = 'forum_communities';

export interface CommunitySettingsDoc {
  readonly allowTextPosts: boolean;
  readonly allowLinkPosts: boolean;
  readonly allowImagePosts: boolean;
  readonly allowVideoPosts: boolean;
  readonly requirePostApproval: boolean;
  readonly allowCrossposts: boolean;
  readonly minimumKarmaToPost: number;
  readonly minimumAccountAgeDays: number;
}

export interface CommunityThemeDoc {
  readonly primary: string;
  readonly accent: string;
  readonly background: string;
  readonly foreground: string;
}

export interface CommunityDoc {
  /** `<name>@<origin_fp>` (COM-19). */
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly rulesMarkdown: string;
  /** Creator's public key, hex. The owner is a key, not an account row. */
  readonly ownerKey: string;
  readonly theme: CommunityThemeDoc;
  readonly settings: CommunitySettingsDoc;
  readonly isPrivate: boolean;
  readonly isNsfw: boolean;
  /** COM-06: archived is a tombstone. Hard delete does not exist here. */
  readonly archived: boolean;
  readonly memberCount: number;
  readonly postCount: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  /** The content ID of the CommunityCreate envelope — provenance for the read API. */
  readonly contentId: string;
}

/** COM-01: 3–24 chars, lowercase alphanumeric plus underscore. */
export const COMMUNITY_NAME_PATTERN = /^[a-z0-9_]{3,24}$/;

export const DEFAULT_SETTINGS: CommunitySettingsDoc = {
  allowTextPosts: true,
  allowLinkPosts: true,
  allowImagePosts: true,
  allowVideoPosts: true,
  requirePostApproval: false,
  allowCrossposts: true,
  minimumKarmaToPost: 0,
  minimumAccountAgeDays: 0,
};

export const DEFAULT_THEME: CommunityThemeDoc = {
  primary: '',
  accent: '',
  background: '',
  foreground: '',
};

/**
 * COM-19: `<name>@<origin_fingerprint>`.
 *
 * Deterministic from signed data, so replaying the log rebuilds the identical ID on any
 * node (P1-G3).
 */
export function communityId(name: string, originServerId: string): string {
  return `${name}@${originServerId}`;
}
