/**
 * T1.23 — `jb:mod:action:v1`, all 16 verbs.
 *
 * ── P1-G8: a captured moderator action cannot be replayed ───────────────────────────
 * The registry marks this domain NON-IDEMPOTENT, which makes the pipeline require a nonce
 * and check `(author_key, nonce)` at step 12. That is what closes the v1 hole: v1 signed
 * `${action}|${subredditId}|${postId}|${reason}` with no nonce, no expiry and no server
 * binding, so anyone who observed a single approve/remove could replay it forever, on any
 * instance. Nothing in THIS file implements that protection — it comes from one registry
 * field, which is the point of the registry.
 *
 * ── FM-08: removal is a tombstone ───────────────────────────────────────────────────
 * REMOVE sets a flag and records who did it and why. Content ID, author, timestamp,
 * acting moderator and reason stay publicly visible; only the body is withheld from the
 * default view. Nothing here deletes a row.
 */

import { ModAction } from '@jagoo/sdk/proto';
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
import { MembershipFlag, clearFlag, setFlag, type PermissionName } from '../shared/flags.js';
import { can, hexKey, loadAuthContext } from '../shared/permissions.js';
import {
  MEMBERSHIPS_COLLECTION,
  membershipKey,
  type MembershipDoc,
} from '../shared/membership.projection.js';
import { POSTS_COLLECTION, type PostDoc } from '../post/post.projection.js';
import { COMMENTS_COLLECTION, type CommentDoc } from '../comment/comment-create.handler.js';
import {
  MOD_EVENTS_COLLECTION,
  MOD_HEADS_COLLECTION,
  ModVerb,
  ModVerbName,
  VERB_PERMISSION,
  modChainHash,
  type ModEventDoc,
  type ModHeadDoc,
} from './moderation.projection.js';
import { addNotification } from '../shared/notification.projection.js';

const MAX_REASON = 1000;

/** Verbs that act on a member key rather than on a content ID. */
const MEMBER_VERBS = new Set<number>([
  ModVerb.BAN,
  ModVerb.UNBAN,
  ModVerb.MUTE,
  ModVerb.UNMUTE,
  ModVerb.KICK,
]);

export class ModActionHandler implements DomainHandler<ModAction> {
  readonly domain = 'jb:mod:action:v1';
  readonly plane = Plane.FORUM;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): ModAction {
    return ModAction.decode(body);
  }

  validate(body: ModAction, env: ParsedEnvelope): ValidationResult {
    if (body.verb === ModVerb.UNSPECIFIED || !(body.verb in ModVerbName)) {
      return invalid('unknown moderation verb', 'verb');
    }
    if (!body.target) return invalid('target is required', 'target');
    if (!env.scope) return invalid('a moderation action must name its community', 'scope');
    if ([...body.reason].length > MAX_REASON) {
      return invalid(`reason exceeds ${MAX_REASON} characters`, 'reason');
    }

    // A content verb takes a content ID; a member verb takes a key. Mixing them is how a
    // ban ends up applied to a post ID that will never match a member row.
    if (MEMBER_VERBS.has(body.verb)) {
      if (!/^[0-9a-f]{64}$/.test(body.target)) {
        return invalid('member actions target a hex public key', 'target');
      }
    } else if (!body.target.startsWith('jb1')) {
      return invalid('content actions target a content ID', 'target');
    }

    // A temporary restriction that expires before it starts is a mistake worth catching
    // rather than silently storing.
    if (body.expires_at_ms !== 0n && Number(body.expires_at_ms) <= Number(env.createdAtMs)) {
      return invalid('expiry must be in the future', 'expires_at_ms');
    }

    return valid;
  }

  async authorize(body: ModAction, env: ParsedEnvelope): Promise<AuthDecision> {
    const required = VERB_PERMISSION[body.verb as keyof typeof VERB_PERMISSION] as
      PermissionName | undefined;
    if (!required) return denied('verb has no permission mapping');

    const ctx = await loadAuthContext(
      this.projections,
      hexKey(env.authorKey),
      env.scope,
      Number(env.createdAtMs),
    );
    if (!ctx.communityDoc) return denied('community is not known here');
    if (!can(ctx, required)) return denied(`${required} permission required`);

    // A moderator may not ban the owner — otherwise a delegated moderator can capture the
    // community from the person who created it.
    if (MEMBER_VERBS.has(body.verb) && ctx.communityDoc.ownerKey === body.target) {
      return denied('the community owner cannot be moderated');
    }

    return allowed;
  }

  async project(body: ModAction, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const community = env.scope;
    const actorKey = hexKey(env.authorKey);
    const createdAtMs = Number(env.createdAtMs);
    const expiresAtMs = body.expires_at_ms === 0n ? null : Number(body.expires_at_ms);

    await this.appendToChain(body, env, community, actorKey, createdAtMs, expiresAtMs, tx);

    if (MEMBER_VERBS.has(body.verb)) {
      await this.applyMemberVerb(body, community, expiresAtMs, createdAtMs, tx);
    } else {
      await this.applyContentVerb(body, tx);
    }
    const recipientKey = MEMBER_VERBS.has(body.verb)
      ? body.target
      : await this.contentAuthor(body.target);
    if (recipientKey) {
      await addNotification(
        this.projections,
        {
          recipientKey,
          kind: 'mod_action',
          contentId: env.contentId,
          actorKey,
          createdAtMs,
        },
        tx,
      );
    }
  }

  private async contentAuthor(target: string): Promise<string | null> {
    const post = await this.projections
      .collection<PostDoc>(POSTS_COLLECTION)
      .findOne({ id: target });
    if (post) return post.authorKey;
    const comment = await this.projections
      .collection<CommentDoc>(COMMENTS_COLLECTION)
      .findOne({ id: target });
    return comment?.authorKey ?? null;
  }

  /** FM-07 — one link per action, chained to the previous action in this community. */
  private async appendToChain(
    body: ModAction,
    env: ParsedEnvelope,
    community: string,
    actorKey: string,
    createdAtMs: number,
    expiresAtMs: number | null,
    tx: Tx,
  ): Promise<void> {
    const events = this.projections.collection<ModEventDoc>(MOD_EVENTS_COLLECTION);
    const heads = this.projections.collection<ModHeadDoc>(MOD_HEADS_COLLECTION);
    // Every action for a community replaces the same head row. Mongo therefore detects
    // concurrent writers and retries one transaction instead of allowing two sequence-N
    // events to fork the public chain.
    const previous = await heads.findOne({ id: community });
    const previousHash = previous?.chainHash ?? '';
    const sequence = (previous?.sequence ?? -1) + 1;

    const doc: ModEventDoc = {
      id: env.contentId,
      community,
      actorKey,
      verb: body.verb,
      verbName: ModVerbName[body.verb] ?? 'UNKNOWN',
      target: body.target,
      targetKind: body.target_kind,
      reason: body.reason,
      expiresAtMs,
      createdAtMs,
      previousHash,
      chainHash: modChainHash({
        previousHash,
        contentId: env.contentId,
        verb: body.verb,
        target: body.target,
        actorKey,
        createdAtMs,
      }),
      sequence,
    };
    await events.put(doc.id, doc, tx);
    await heads.put(community, { id: community, sequence, chainHash: doc.chainHash }, tx);
  }

  private async applyContentVerb(body: ModAction, tx: Tx): Promise<void> {
    const posts = this.projections.collection<PostDoc>(POSTS_COLLECTION);
    const post = await posts.findOne({ id: body.target });
    if (post) {
      await posts.put(body.target, { ...post, ...this.contentPatch(body, post.removed) }, tx);
      return;
    }

    const comments = this.projections.collection<CommentDoc>(COMMENTS_COLLECTION);
    const comment = await comments.findOne({ id: body.target });
    if (comment) {
      await comments.put(
        body.target,
        { ...comment, ...this.contentPatch(body, comment.removed) },
        tx,
      );
    }
  }

  /** Tombstones and the frozen content-state flags from Plans/requirements/R3 §5. */
  private contentPatch(body: ModAction, currentlyRemoved: boolean): Partial<PostDoc & CommentDoc> {
    switch (body.verb) {
      case ModVerb.REMOVE:
        return { removed: true, removedReason: body.reason || 'removed by a moderator' };
      case ModVerb.RESTORE:
        return { removed: false, removedReason: null };
      case ModVerb.APPROVE:
        return { approved: true, removed: false, removedReason: null };
      case ModVerb.LOCK:
        return { locked: true };
      case ModVerb.UNLOCK:
        return { locked: false };
      case ModVerb.PIN:
        return { pinned: true };
      case ModVerb.UNPIN:
        return { pinned: false };
      case ModVerb.FLAG:
        return { flagged: true };
      case ModVerb.UNFLAG:
        return { flagged: false };
      case ModVerb.COLLAPSE:
        return { collapsed: true };
      case ModVerb.UNCOLLAPSE:
        return { collapsed: false };
      default:
        return { removed: currentlyRemoved };
    }
  }

  private async applyMemberVerb(
    body: ModAction,
    community: string,
    expiresAtMs: number | null,
    createdAtMs: number,
    tx: Tx,
  ): Promise<void> {
    const memberships = this.projections.collection<MembershipDoc>(MEMBERSHIPS_COLLECTION);
    const id = membershipKey(community, body.target);
    const existing = await memberships.findOne({ id });

    const base: MembershipDoc = existing ?? {
      id,
      community,
      memberKey: body.target,
      flags: '0',
      joinedAtMs: createdAtMs,
      restrictedUntilMs: null,
      restrictionReason: null,
    };

    let flags = BigInt(base.flags);
    let restrictedUntilMs = base.restrictedUntilMs;
    let restrictionReason = base.restrictionReason;

    switch (body.verb) {
      case ModVerb.BAN:
        flags = setFlag(flags, MembershipFlag.BANNED);
        flags = clearFlag(flags, MembershipFlag.MEMBER);
        restrictedUntilMs = expiresAtMs;
        restrictionReason = body.reason || null;
        break;
      case ModVerb.UNBAN:
        flags = clearFlag(flags, MembershipFlag.BANNED);
        restrictedUntilMs = null;
        restrictionReason = null;
        break;
      case ModVerb.MUTE:
        flags = setFlag(flags, MembershipFlag.MUTED);
        restrictedUntilMs = expiresAtMs;
        restrictionReason = body.reason || null;
        break;
      case ModVerb.UNMUTE:
        flags = clearFlag(flags, MembershipFlag.MUTED);
        restrictedUntilMs = null;
        restrictionReason = null;
        break;
      case ModVerb.KICK:
        // A kick removes membership without banning: they may re-join.
        flags = clearFlag(flags, MembershipFlag.MEMBER);
        flags = clearFlag(flags, MembershipFlag.MODERATOR);
        break;
      default:
        return;
    }

    await memberships.put(
      id,
      { ...base, flags: flags.toString(), restrictedUntilMs, restrictionReason },
      tx,
    );
  }
}
