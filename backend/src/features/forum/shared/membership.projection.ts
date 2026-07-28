/**
 * Membership and role projections.
 *
 * Shared by community, membership, moderation and role features, because they are four
 * views of one question: what may this key do in this community. Keeping the documents in
 * one place stops four handlers inventing four subtly different answers.
 *
 * Every field is derived from the envelope log (P1-G3). `joinedAtMs` comes from the signed
 * envelope, never from the projector's clock.
 */

export const MEMBERSHIPS_COLLECTION = 'forum_memberships';
export const ROLES_COLLECTION = 'forum_roles';
export const ROLE_ASSIGNMENTS_COLLECTION = 'forum_role_assignments';
export const IDENTITIES_COLLECTION = 'forum_identities';

export interface MembershipDoc {
  /** `${communityId}:${authorKeyHex}` — stable, so a re-join overwrites. */
  readonly id: string;
  readonly community: string;
  readonly memberKey: string;
  /** MembershipFlag bitmap, serialised as a decimal string — BSON has no uint64. */
  readonly flags: string;
  readonly joinedAtMs: number;
  /** Temporary ban / mute expiry (COM-23). null = permanent or not applicable. */
  readonly restrictedUntilMs: number | null;
  readonly restrictionReason: string | null;
}

export interface RoleDoc {
  /** `${communityId}:${roleName}` */
  readonly id: string;
  readonly community: string;
  readonly name: string;
  /** Permission bitmap, decimal string. */
  readonly permissionMask: string;
  readonly isDefault: boolean;
  readonly definedAtMs: number;
}

export interface RoleAssignmentDoc {
  /** `${communityId}:${authorKeyHex}:${roleName}` */
  readonly id: string;
  readonly community: string;
  readonly subjectKey: string;
  readonly role: string;
  readonly assignedAtMs: number;
}

/**
 * Instance-level identity state.
 *
 * PA-01: this row carries NO network address, session, or device fingerprint. The node
 * must not persist any mapping from a Forum key to an IP — rate-limit state is keyed by
 * nullifier or by network address alone, never by both together.
 */
export interface IdentityDoc {
  /** Author public key, hex. Identity IS the key (VIS-02). */
  readonly id: string;
  readonly displayName: string;
  readonly bio: string;
  readonly avatar: string;
  readonly banner: string;
  /** IdentityFlag bitmap, decimal string. */
  readonly flags: string;
  readonly postKarma: number;
  readonly commentKarma: number;
  readonly firstSeenAtMs: number;
}

export function membershipKey(community: string, memberKeyHex: string): string {
  return `${community}:${memberKeyHex}`;
}

export function roleKey(community: string, name: string): string {
  return `${community}:${name}`;
}

export function roleAssignmentKey(community: string, subjectKeyHex: string, role: string): string {
  return `${community}:${subjectKeyHex}:${role}`;
}
