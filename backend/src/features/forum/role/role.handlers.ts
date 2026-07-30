/**
 * T1.25 — `jb:role:define:v1`, `jb:role:assign:v1`, `jb:role:revoke:v1` (ROL-04 … ROL-10).
 *
 * ── A role cannot grant more than its author holds ──────────────────────────────────
 * Without that rule, anyone with `member.role.update` could define a role carrying
 * `community.update`, assign it to themselves, and take the community — privilege
 * escalation in two envelopes. So `define` rejects any bit the author does not already
 * hold, which makes the permission lattice monotonic.
 */

import { RoleAssign, RoleDefine, RoleRevoke } from '@jagoo/sdk/proto';
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
import { OWNER_PERMISSIONS } from '../shared/flags.js';
import { can, hexKey, loadAuthContext, resolvePermissions } from '../shared/permissions.js';
import {
  ROLES_COLLECTION,
  ROLE_ASSIGNMENTS_COLLECTION,
  roleAssignmentKey,
  roleKey,
  type RoleAssignmentDoc,
  type RoleDoc,
} from '../shared/membership.projection.js';

const ROLE_NAME_PATTERN = /^[a-z0-9_-]{2,32}$/;

export class RoleDefineHandler implements DomainHandler<RoleDefine> {
  readonly domain = 'jb:role:define:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): RoleDefine {
    return RoleDefine.decode(body);
  }

  validate(body: RoleDefine, _env: ParsedEnvelope): ValidationResult {
    if (!body.community) return invalid('community is required', 'community');
    if (!ROLE_NAME_PATTERN.test(body.name)) {
      return invalid('role name must be 2-32 lowercase letters, digits, - or _', 'name');
    }
    // ROL-11: bit positions are frozen. A mask with bits outside the defined set would
    // mean something different on a peer running a build that defines them.
    if ((body.permission_mask & ~OWNER_PERMISSIONS) !== 0n) {
      return invalid('permission_mask contains undefined bits', 'permission_mask');
    }
    return valid;
  }

  async authorize(body: RoleDefine, env: ParsedEnvelope): Promise<AuthDecision> {
    const ctx = await loadAuthContext(
      this.projections,
      hexKey(env.authorKey),
      body.community,
      Number(env.createdAtMs),
    );
    if (!ctx.communityDoc) return denied('community is not known here');
    if (!can(ctx, 'member.role.update')) return denied('member.role.update permission required');

    // The escalation guard. See the header.
    const authorMask = resolvePermissions(ctx);
    if ((body.permission_mask & ~authorMask) !== 0n) {
      return denied('a role cannot grant permissions its author does not hold');
    }
    const existing = await this.projections
      .collection<RoleDoc>(ROLES_COLLECTION)
      .findOne({ id: roleKey(body.community, body.name) });
    if (existing && (BigInt(existing.permissionMask) & ~authorMask) !== 0n) {
      return denied('cannot redefine a role granting more than you hold');
    }
    return allowed;
  }

  async project(body: RoleDefine, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const id = roleKey(body.community, body.name);
    const doc: RoleDoc = {
      id,
      community: body.community,
      name: body.name,
      permissionMask: body.permission_mask.toString(),
      isDefault: body.is_default,
      definedAtMs: Number(env.createdAtMs),
    };
    await this.projections.collection<RoleDoc>(ROLES_COLLECTION).put(id, doc, tx);
  }
}

export class RoleAssignHandler implements DomainHandler<RoleAssign> {
  readonly domain = 'jb:role:assign:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): RoleAssign {
    return RoleAssign.decode(body);
  }

  validate(body: RoleAssign, _env: ParsedEnvelope): ValidationResult {
    if (!body.community) return invalid('community is required', 'community');
    if (!body.role) return invalid('role is required', 'role');
    if (body.subject_key.length !== 32) {
      return invalid('subject_key must be a 32-byte Ed25519 key', 'subject_key');
    }
    return valid;
  }

  async authorize(body: RoleAssign, env: ParsedEnvelope): Promise<AuthDecision> {
    const ctx = await loadAuthContext(
      this.projections,
      hexKey(env.authorKey),
      body.community,
      Number(env.createdAtMs),
    );
    if (!ctx.communityDoc) return denied('community is not known here');
    if (!can(ctx, 'member.role.update')) return denied('member.role.update permission required');

    const role = await this.projections
      .collection<RoleDoc>(ROLES_COLLECTION)
      .findOne({ id: roleKey(body.community, body.role) });
    if (!role) return denied('role is not defined in this community');

    // Assigning is granting: the same escalation guard applies as when defining.
    if ((BigInt(role.permissionMask) & ~resolvePermissions(ctx)) !== 0n) {
      return denied('cannot assign a role granting more than you hold');
    }
    return allowed;
  }

  async project(body: RoleAssign, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const subjectKey = Buffer.from(body.subject_key).toString('hex');
    const id = roleAssignmentKey(body.community, subjectKey, body.role);
    const doc: RoleAssignmentDoc = {
      id,
      community: body.community,
      subjectKey,
      role: body.role,
      assignedAtMs: Number(env.createdAtMs),
    };
    await this.projections
      .collection<RoleAssignmentDoc>(ROLE_ASSIGNMENTS_COLLECTION)
      .put(id, doc, tx);
  }
}

export class RoleRevokeHandler implements DomainHandler<RoleRevoke> {
  readonly domain = 'jb:role:revoke:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): RoleRevoke {
    return RoleRevoke.decode(body);
  }

  validate(body: RoleRevoke, _env: ParsedEnvelope): ValidationResult {
    if (!body.community) return invalid('community is required', 'community');
    if (!body.role) return invalid('role is required', 'role');
    if (body.subject_key.length !== 32) {
      return invalid('subject_key must be a 32-byte Ed25519 key', 'subject_key');
    }
    return valid;
  }

  async authorize(body: RoleRevoke, env: ParsedEnvelope): Promise<AuthDecision> {
    const ctx = await loadAuthContext(
      this.projections,
      hexKey(env.authorKey),
      body.community,
      Number(env.createdAtMs),
    );
    if (!ctx.communityDoc) return denied('community is not known here');
    if (!can(ctx, 'member.role.update')) return denied('member.role.update permission required');

    // The owner's standing cannot be revoked by a delegate.
    if (ctx.communityDoc.ownerKey === Buffer.from(body.subject_key).toString('hex')) {
      return denied("the community owner's roles cannot be revoked");
    }
    const role = await this.projections
      .collection<RoleDoc>(ROLES_COLLECTION)
      .findOne({ id: roleKey(body.community, body.role) });
    if (!role) return denied('role is not defined in this community');
    if ((BigInt(role.permissionMask) & ~resolvePermissions(ctx)) !== 0n) {
      return denied('cannot revoke a role granting more than you hold');
    }
    return allowed;
  }

  async project(body: RoleRevoke, _env: ParsedEnvelope, tx: Tx): Promise<void> {
    const subjectKey = Buffer.from(body.subject_key).toString('hex');
    await this.projections
      .collection<RoleAssignmentDoc>(ROLE_ASSIGNMENTS_COLLECTION)
      .delete(roleAssignmentKey(body.community, subjectKey, body.role), tx);
  }
}
