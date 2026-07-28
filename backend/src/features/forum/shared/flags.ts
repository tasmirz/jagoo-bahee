/**
 * Frozen bitmap positions (Plans/03 §3, Plans/requirements/R4 §3).
 *
 * ── These numbers cross federation boundaries and MUST NOT be renumbered ────────────
 * A membership flag or permission bit is persisted, projected, and read by other
 * instances that may be running a different build. Renumbering one silently converts
 * "moderator" into "banned" on every peer that has not upgraded — there is no version
 * negotiation for a bitmap, which is exactly why ROL-11 freezes them.
 *
 * Adding a capability means claiming the next unused bit, never reordering the existing
 * ones and never reusing a retired one.
 */

/** Identity status (uint64). Plans/03 §3. */
export const IdentityFlag = {
  ACTIVE: 1n << 0n,
  BANNED: 1n << 1n,
  SHADOWBANNED: 1n << 2n,
  VERIFIED: 1n << 3n,
  GLOBAL_MODERATOR: 1n << 4n,
  GLOBAL_ADMIN: 1n << 5n,
  KEY_REVOKED: 1n << 6n,
} as const;

/** Membership status (uint64). Plans/03 §3, R4 §2. */
export const MembershipFlag = {
  MEMBER: 1n << 0n,
  MUTED: 1n << 1n,
  BANNED: 1n << 2n,
  MODERATOR: 1n << 3n,
  CONTRIBUTOR: 1n << 4n,
  APPROVED_SUBMITTER: 1n << 5n,
} as const;

/** Content status (uint64). Plans/03 §3, R3 §5. */
export const ContentFlag = {
  ACTIVE: 1n << 0n,
  NSFW: 1n << 1n,
  SPOILER: 1n << 2n,
  PINNED: 1n << 3n,
  LOCKED: 1n << 4n,
  ARCHIVED: 1n << 5n,
  REMOVED: 1n << 6n,
  FLAGGED: 1n << 7n,
  APPROVED: 1n << 8n,
  OC: 1n << 9n,
  COLLAPSED: 1n << 10n,
} as const;

/**
 * Community permission bits (uint64). Plans/03 §3, R4 §3.
 *
 * The string names are what a registry row's `permission` field refers to, so the
 * registry and this table are joined by name rather than by position — a row saying
 * `permission: post.create` resolves here without the pipeline knowing any bit numbers.
 */
export const Permission = {
  'community.read': 1n << 0n,
  'post.create': 1n << 1n,
  'community.update': 1n << 2n,
  'member.ban': 1n << 3n,
  'member.unban': 1n << 4n,
  'member.kick': 1n << 5n,
  'member.role.update': 1n << 6n,
  'post.moderate': 1n << 7n,
  'comment.moderate': 1n << 8n,
  'modlog.read': 1n << 9n,
  'report.review': 1n << 10n,
  'label.trust': 1n << 11n,
  'federation.manage': 1n << 12n,
  'broadcast.emit': 1n << 13n,
} as const;

export type PermissionName = keyof typeof Permission;

export function hasFlag(mask: bigint, flag: bigint): boolean {
  return (mask & flag) === flag;
}

export function setFlag(mask: bigint, flag: bigint): bigint {
  return mask | flag;
}

export function clearFlag(mask: bigint, flag: bigint): bigint {
  return mask & ~flag;
}

/**
 * ROL-07: what a new member gets.
 *
 * Read and post, nothing else. Deliberately not "everything a contributor has" — a
 * default that grants moderation is how a community loses control of itself the first
 * time someone joins.
 */
export const DEFAULT_MEMBER_PERMISSIONS =
  Permission['community.read'] | Permission['post.create'];

/** ROL-02: the owner of a community holds every bit defined above. */
export const OWNER_PERMISSIONS = Object.values(Permission).reduce((a, b) => a | b, 0n);

/** A moderator gets everything except the two instance-level capabilities. */
export const MODERATOR_PERMISSIONS =
  Permission['community.read'] |
  Permission['post.create'] |
  Permission['member.ban'] |
  Permission['member.unban'] |
  Permission['member.kick'] |
  Permission['post.moderate'] |
  Permission['comment.moderate'] |
  Permission['modlog.read'] |
  Permission['report.review'];
