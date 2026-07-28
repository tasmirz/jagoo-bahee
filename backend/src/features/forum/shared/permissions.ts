/**
 * Permission resolution (ROL-09, ROL-14, ROL-12).
 *
 * ── ROL-14: a pure function of (actor key, community, projection snapshot) ──────────
 * `resolvePermissions` below takes the already-loaded documents and computes a mask with
 * no I/O of its own, so authorisation logic is unit-testable against literal values. The
 * `loadAuthContext` helper does the reading and is the only part that touches a store.
 *
 * ── Why a ban is checked before roles, not after ────────────────────────────────────
 * A banned member may still hold a moderator role row — the ban is what revokes their
 * reach, and deleting the role on ban would lose the fact that they had it, which the
 * public mod log needs to stay honest (FM-07). So the ban short-circuits to "no
 * permissions" and the role rows are left alone.
 */

import {
  DEFAULT_MEMBER_PERMISSIONS,
  IdentityFlag,
  MODERATOR_PERMISSIONS,
  MembershipFlag,
  OWNER_PERMISSIONS,
  Permission,
  hasFlag,
  type PermissionName,
} from './flags.js';
import type { ProjectionStore } from '../../../core/ports/storage.port.js';
import {
  IDENTITIES_COLLECTION,
  MEMBERSHIPS_COLLECTION,
  ROLES_COLLECTION,
  ROLE_ASSIGNMENTS_COLLECTION,
  membershipKey,
  roleKey,
  type IdentityDoc,
  type MembershipDoc,
  type RoleAssignmentDoc,
  type RoleDoc,
} from './membership.projection.js';
import { COMMUNITIES_COLLECTION, type CommunityDoc } from '../community/community.projection.js';

/** Everything permission resolution needs, already loaded. */
export interface AuthContext {
  readonly actorKey: string;
  readonly community: string | null;
  readonly communityDoc: CommunityDoc | null;
  readonly membership: MembershipDoc | null;
  readonly identity: IdentityDoc | null;
  readonly roles: readonly RoleDoc[];
  /** Wall-clock now, injected — permission resolution must stay deterministic (AR-02). */
  readonly nowMs: number;
}

/**
 * Compute the actor's permission mask. Pure.
 *
 * Order matters and is deliberate:
 *   1. A global admin bypasses community policy (ROL-15, preserving v1 behaviour).
 *   2. An active ban or an unexpired temporary ban yields nothing at all.
 *   3. The community owner holds every bit.
 *   4. Otherwise: default member bits, plus moderator bits, plus each assigned role's mask.
 */
export function resolvePermissions(ctx: AuthContext): bigint {
  const identityFlags = BigInt(ctx.identity?.flags ?? '0');

  // ROL-15: instance-level admin/moderator overrides community permissions where v1
  // allowed it. A globally banned key overrides in the other direction and wins outright.
  if (hasFlag(identityFlags, IdentityFlag.BANNED)) return 0n;
  if (hasFlag(identityFlags, IdentityFlag.GLOBAL_ADMIN)) return OWNER_PERMISSIONS;

  if (!ctx.community) {
    // Instance-scoped action (profile, follow, block, preferences). Nothing
    // community-specific applies; the handler's own `self` check governs.
    return DEFAULT_MEMBER_PERMISSIONS;
  }

  const membershipFlags = BigInt(ctx.membership?.flags ?? '0');

  const restrictionActive =
    ctx.membership?.restrictedUntilMs == null || ctx.membership.restrictedUntilMs > ctx.nowMs;
  if (hasFlag(membershipFlags, MembershipFlag.BANNED) && restrictionActive) return 0n;

  if (hasFlag(identityFlags, IdentityFlag.GLOBAL_MODERATOR)) {
    return MODERATOR_PERMISSIONS | DEFAULT_MEMBER_PERMISSIONS;
  }

  if (ctx.communityDoc && ctx.communityDoc.ownerKey === ctx.actorKey) return OWNER_PERMISSIONS;

  let mask = Permission['community.read'];

  if (hasFlag(membershipFlags, MembershipFlag.MEMBER)) {
    mask |= DEFAULT_MEMBER_PERMISSIONS;
  }

  // A mute removes the ability to author while leaving membership intact (COM-26).
  if (hasFlag(membershipFlags, MembershipFlag.MUTED) && restrictionActive) {
    mask &= ~Permission['post.create'];
  }

  if (hasFlag(membershipFlags, MembershipFlag.MODERATOR)) {
    mask |= MODERATOR_PERMISSIONS;
  }

  for (const role of ctx.roles) {
    mask |= BigInt(role.permissionMask);
  }

  return mask;
}

export function can(ctx: AuthContext, permission: PermissionName): boolean {
  const bit = Permission[permission];
  return (resolvePermissions(ctx) & bit) === bit;
}

/** True when the actor may author in this community at all (not banned, not muted). */
export function canPost(ctx: AuthContext): boolean {
  return can(ctx, 'post.create');
}

/** Registry `permission: member`, including owner/global overrides but excluding active bans. */
export function isCommunityMember(ctx: AuthContext): boolean {
  const identityFlags = BigInt(ctx.identity?.flags ?? '0');
  if (hasFlag(identityFlags, IdentityFlag.BANNED)) return false;
  if (
    hasFlag(identityFlags, IdentityFlag.GLOBAL_ADMIN) ||
    hasFlag(identityFlags, IdentityFlag.GLOBAL_MODERATOR) ||
    ctx.communityDoc?.ownerKey === ctx.actorKey
  ) {
    return true;
  }
  const membershipFlags = BigInt(ctx.membership?.flags ?? '0');
  const restrictionActive =
    ctx.membership?.restrictedUntilMs == null || ctx.membership.restrictedUntilMs > ctx.nowMs;
  if (hasFlag(membershipFlags, MembershipFlag.BANNED) && restrictionActive) return false;
  return hasFlag(membershipFlags, MembershipFlag.MEMBER);
}

/**
 * Load every document permission resolution needs.
 *
 * Reads only — authorisation runs at pipeline step 14 and writes nothing (ROL-12).
 */
export async function loadAuthContext(
  projections: ProjectionStore,
  actorKeyHex: string,
  community: string | null,
  nowMs: number,
): Promise<AuthContext> {
  const identity = await projections
    .collection<IdentityDoc>(IDENTITIES_COLLECTION)
    .findOne({ id: actorKeyHex });

  if (!community) {
    return {
      actorKey: actorKeyHex,
      community: null,
      communityDoc: null,
      membership: null,
      identity,
      roles: [],
      nowMs,
    };
  }

  const communityDoc = await projections
    .collection<CommunityDoc>(COMMUNITIES_COLLECTION)
    .findOne({ id: community });

  const membership = await projections
    .collection<MembershipDoc>(MEMBERSHIPS_COLLECTION)
    .findOne({ id: membershipKey(community, actorKeyHex) });

  const assignments = await projections
    .collection<RoleAssignmentDoc>(ROLE_ASSIGNMENTS_COLLECTION)
    .find({ community, subjectKey: actorKeyHex }, 64);

  const roles: RoleDoc[] = [];
  for (const assignment of assignments) {
    if (assignment.community !== community || assignment.subjectKey !== actorKeyHex) continue;
    const role = await projections
      .collection<RoleDoc>(ROLES_COLLECTION)
      .findOne({ id: roleKey(community, assignment.role) });
    if (role) roles.push(role);
  }

  return { actorKey: actorKeyHex, community, communityDoc, membership, identity, roles, nowMs };
}

export const hexKey = (key: Uint8Array): string => Buffer.from(key).toString('hex');
