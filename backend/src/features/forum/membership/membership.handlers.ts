/**
 * T1.22 — `jb:membership:join:v1`, `jb:membership:leave:v1`.
 *
 * ── Leaving does not erase a ban ────────────────────────────────────────────────────
 * If leaving deleted the membership row, a banned member could clear their own ban by
 * leaving and re-joining. So leave clears the MEMBER bit and keeps the row, which
 * preserves the ban, the mute, and their expiry — the same reason removal is a tombstone
 * rather than a delete everywhere else in this system.
 */

import { MembershipJoin, MembershipLeave } from '@jagoo/sdk/proto';
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
import { MembershipFlag, clearFlag, hasFlag, setFlag } from '../shared/flags.js';
import { hexKey } from '../shared/permissions.js';
import {
  MEMBERSHIPS_COLLECTION,
  ROLES_COLLECTION,
  ROLE_ASSIGNMENTS_COLLECTION,
  membershipKey,
  roleAssignmentKey,
  type MembershipDoc,
  type RoleAssignmentDoc,
  type RoleDoc,
} from '../shared/membership.projection.js';
import { COMMUNITIES_COLLECTION, type CommunityDoc } from '../community/community.projection.js';

export class MembershipJoinHandler implements DomainHandler<MembershipJoin> {
  readonly domain = 'jb:membership:join:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): MembershipJoin {
    return MembershipJoin.decode(body);
  }

  validate(body: MembershipJoin, _env: ParsedEnvelope): ValidationResult {
    if (!body.community) return invalid('community is required', 'community');
    return valid;
  }

  async authorize(body: MembershipJoin, env: ParsedEnvelope): Promise<AuthDecision> {
    const community = await this.projections
      .collection<CommunityDoc>(COMMUNITIES_COLLECTION)
      .findOne({ id: body.community });
    if (!community) return denied('community is not known here');
    if (community.archived) return denied('community is archived');

    const existing = await this.projections
      .collection<MembershipDoc>(MEMBERSHIPS_COLLECTION)
      .findOne({ id: membershipKey(body.community, hexKey(env.authorKey)) });

    // A ban outlives leaving. Re-joining must not be a way to launder it.
    if (existing && hasFlag(BigInt(existing.flags), MembershipFlag.BANNED)) {
      const stillBanned =
        existing.restrictedUntilMs == null || existing.restrictedUntilMs > Number(env.createdAtMs);
      if (stillBanned) return denied('this key is banned from the community');
    }

    return allowed;
  }

  async project(body: MembershipJoin, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const memberKey = hexKey(env.authorKey);
    const id = membershipKey(body.community, memberKey);
    const memberships = this.projections.collection<MembershipDoc>(MEMBERSHIPS_COLLECTION);
    const existing = await memberships.findOne({ id });

    const wasMember = existing != null && hasFlag(BigInt(existing.flags), MembershipFlag.MEMBER);

    await memberships.put(
      id,
      {
        id,
        community: body.community,
        memberKey,
        flags: setFlag(BigInt(existing?.flags ?? '0'), MembershipFlag.MEMBER).toString(),
        joinedAtMs: existing?.joinedAtMs ?? Number(env.createdAtMs),
        restrictedUntilMs: existing?.restrictedUntilMs ?? null,
        restrictionReason: existing?.restrictionReason ?? null,
      },
      tx,
    );

    // COM-15: only count a transition, so a repeated join is idempotent for the counter.
    if (!wasMember) await this.bumpMemberCount(body.community, 1, tx);

    const defaultRoles = await this.projections
      .collection<RoleDoc>(ROLES_COLLECTION)
      .find({ community: body.community, isDefault: true }, 64);
    const assignments = this.projections.collection<RoleAssignmentDoc>(ROLE_ASSIGNMENTS_COLLECTION);
    for (const role of defaultRoles) {
      const assignmentId = roleAssignmentKey(body.community, memberKey, role.name);
      await assignments.put(
        assignmentId,
        {
          id: assignmentId,
          community: body.community,
          subjectKey: memberKey,
          role: role.name,
          assignedAtMs: Number(env.createdAtMs),
        },
        tx,
      );
    }
  }

  private async bumpMemberCount(community: string, delta: number, tx: Tx): Promise<void> {
    const communities = this.projections.collection<CommunityDoc>(COMMUNITIES_COLLECTION);
    const doc = await communities.findOne({ id: community });
    if (!doc) return;
    await communities.put(
      community,
      { ...doc, memberCount: Math.max(0, doc.memberCount + delta) },
      tx,
    );
  }
}

export class MembershipLeaveHandler implements DomainHandler<MembershipLeave> {
  readonly domain = 'jb:membership:leave:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): MembershipLeave {
    return MembershipLeave.decode(body);
  }

  validate(body: MembershipLeave, _env: ParsedEnvelope): ValidationResult {
    if (!body.community) return invalid('community is required', 'community');
    return valid;
  }

  async authorize(_body: MembershipLeave, _env: ParsedEnvelope): Promise<AuthDecision> {
    // Anyone may always leave. A community that can trap members is a worse failure than
    // a stale membership row.
    return allowed;
  }

  async project(body: MembershipLeave, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const memberKey = hexKey(env.authorKey);
    const id = membershipKey(body.community, memberKey);
    const memberships = this.projections.collection<MembershipDoc>(MEMBERSHIPS_COLLECTION);
    const existing = await memberships.findOne({ id });
    if (!existing) return;

    const wasMember = hasFlag(BigInt(existing.flags), MembershipFlag.MEMBER);

    // Clear MEMBER and MODERATOR; keep BANNED / MUTED and their expiry. See the header.
    let flags = clearFlag(BigInt(existing.flags), MembershipFlag.MEMBER);
    flags = clearFlag(flags, MembershipFlag.MODERATOR);

    await memberships.put(id, { ...existing, flags: flags.toString() }, tx);

    if (wasMember) {
      const communities = this.projections.collection<CommunityDoc>(COMMUNITIES_COLLECTION);
      const doc = await communities.findOne({ id: body.community });
      if (doc) {
        await communities.put(
          body.community,
          { ...doc, memberCount: Math.max(0, doc.memberCount - 1) },
          tx,
        );
      }
    }
  }
}
