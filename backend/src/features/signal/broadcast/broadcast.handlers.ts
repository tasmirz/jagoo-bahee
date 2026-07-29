import {
  BroadcastCategory,
  BroadcastEmit,
  BroadcastRevoke,
  RevokeReason,
  Severity,
  VouchLevel,
} from '@jagoo/sdk/proto';
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
import type { SignalPushGateway } from '../../../core/ports/signal-push.port.js';
import {
  SIGNAL_CHANNELS_COLLECTION,
  SIGNAL_CHANNEL_VOUCHES_COLLECTION,
  type GeoAreaDoc,
  type SignalChannelDoc,
  type SignalChannelVouchDoc,
} from '../channel/channel.handlers.js';
import {
  SIGNAL_PUSH_SUBSCRIPTIONS_COLLECTION,
  type SignalPushSubscriptionDoc,
} from '../channel/channel-subscribe.handler.js';

export const SIGNAL_BROADCASTS_COLLECTION = 'signal_broadcasts';

export interface SignalBroadcastDoc {
  readonly id: string;
  readonly channel: string;
  readonly sequence: string;
  readonly previousSequence: string;
  readonly severity: Severity;
  readonly category: BroadcastCategory;
  readonly headline: string;
  readonly detail: string;
  readonly area: GeoAreaDoc | null;
  readonly expiresAtMs: number;
  readonly supersedes: string;
  readonly supersededBy: string;
  readonly language: string;
  readonly authorKey: string;
  readonly createdAtMs: number;
  readonly revokedAtMs: number | null;
  readonly revokeReason: RevokeReason;
  readonly revokeNote: string;
  readonly revokeContentId: string;
}

const hex = (value: Uint8Array): string => Buffer.from(value).toString('hex');
const MAX_HEADLINE_CHARS = 120;

function area(body: BroadcastEmit): GeoAreaDoc | null {
  return body.area
    ? {
        latE5: body.area.lat_e5,
        lonE5: body.area.lon_e5,
        radiusM: body.area.radius_m,
        placeName: body.area.place_name,
      }
    : null;
}

export async function channelVerificationLevel(
  projections: ProjectionStore,
  channel: string,
): Promise<'unverified' | 'known' | 'verified' | 'endorsed' | 'disputed'> {
  const rows = await projections
    .collection<SignalChannelVouchDoc>(SIGNAL_CHANNEL_VOUCHES_COLLECTION)
    .find({ channel }, 1_000);
  if (rows.some((row) => row.level === VouchLevel.VOUCH_LEVEL_NEGATIVE)) return 'disputed';
  if (rows.some((row) => row.level === VouchLevel.VOUCH_LEVEL_ENDORSED)) return 'endorsed';
  if (rows.some((row) => row.level === VouchLevel.VOUCH_LEVEL_VERIFIED)) return 'verified';
  if (rows.some((row) => row.level === VouchLevel.VOUCH_LEVEL_KNOWN)) return 'known';
  return 'unverified';
}

/** SIG-19: the subscriber's default, kept pure for native and server tests. */
export function defaultSeverityAllows(
  severity: Severity,
  verification: Awaited<ReturnType<typeof channelVerificationLevel>>,
): boolean {
  return (
    severity !== Severity.SEVERITY_CRITICAL ||
    verification === 'known' ||
    verification === 'verified' ||
    verification === 'endorsed'
  );
}

export class BroadcastEmitHandler implements DomainHandler<BroadcastEmit> {
  readonly domain = 'jb:broadcast:emit:v1';
  readonly plane = Plane.SIGNAL;

  constructor(
    private readonly projections: ProjectionStore,
    private readonly push?: SignalPushGateway,
  ) {}

  decode(body: Uint8Array): BroadcastEmit {
    return BroadcastEmit.decode(body);
  }

  validate(body: BroadcastEmit, env: ParsedEnvelope): ValidationResult {
    if (!body.channel || body.channel !== env.scope) {
      return invalid('body channel must equal envelope scope', 'channel');
    }
    if (body.sequence <= 0n) return invalid('sequence must be positive', 'sequence');
    if (body.severity === Severity.SEVERITY_UNSPECIFIED) {
      return invalid('severity is required', 'severity');
    }
    if (body.category === BroadcastCategory.BROADCAST_CATEGORY_UNSPECIFIED) {
      return invalid('category is required', 'category');
    }
    if (!body.headline.trim()) return invalid('headline is required', 'headline');
    if ([...body.headline.trim()].length > MAX_HEADLINE_CHARS) {
      return invalid(`headline exceeds ${MAX_HEADLINE_CHARS} characters`, 'headline');
    }
    if (body.expires_at_ms <= env.createdAtMs) {
      return invalid('broadcast expiry must be after publication', 'expires_at_ms');
    }
    if (body.supersedes && !body.supersedes.startsWith('jb1')) {
      return invalid('supersedes must be a content ID', 'supersedes');
    }
    return valid;
  }

  async authorize(body: BroadcastEmit, env: ParsedEnvelope): Promise<AuthDecision> {
    const channel = await this.projections
      .collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION)
      .findOne({ id: body.channel });
    if (!channel) return denied('channel is not known here');
    if (channel.retiredAtMs !== null) return denied('channel is retired');
    if (channel.currentSigningKey !== hex(env.authorKey)) {
      return denied('the current channel signing key is required');
    }
    if (body.sequence <= BigInt(channel.lastSequence)) {
      return denied('broadcast sequence must increase monotonically');
    }
    if (body.supersedes) {
      const target = await this.projections
        .collection<SignalBroadcastDoc>(SIGNAL_BROADCASTS_COLLECTION)
        .findOne({ id: body.supersedes });
      if (!target || target.channel !== body.channel) {
        return denied('superseded broadcast is not part of this channel');
      }
    }
    return allowed;
  }

  async project(body: BroadcastEmit, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const broadcasts =
      this.projections.collection<SignalBroadcastDoc>(SIGNAL_BROADCASTS_COLLECTION);
    const channels = this.projections.collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION);
    const channel = await channels.findOne({ id: body.channel });
    const previousSequence = channel?.lastSequence ?? '0';
    const doc: SignalBroadcastDoc = {
      id: env.contentId,
      channel: body.channel,
      sequence: body.sequence.toString(),
      previousSequence,
      severity: body.severity,
      category: body.category,
      headline: body.headline.trim(),
      detail: body.detail,
      area: area(body),
      expiresAtMs: Number(body.expires_at_ms),
      supersedes: body.supersedes,
      supersededBy: '',
      language: body.language || 'und',
      authorKey: hex(env.authorKey),
      createdAtMs: Number(env.createdAtMs),
      revokedAtMs: null,
      revokeReason: RevokeReason.REVOKE_REASON_UNSPECIFIED,
      revokeNote: '',
      revokeContentId: '',
    };
    await broadcasts.put(doc.id, doc, tx);
    if (body.supersedes) {
      const previous = await broadcasts.findOne({ id: body.supersedes });
      if (previous) {
        await broadcasts.put(previous.id, { ...previous, supersededBy: doc.id }, tx);
      }
    }
    if (channel) {
      await channels.put(channel.id, { ...channel, lastSequence: body.sequence.toString() }, tx);
    }
  }

  async afterCommit(body: BroadcastEmit, env: ParsedEnvelope): Promise<void> {
    if (!this.push) return;
    const subscriptions = await this.projections
      .collection<SignalPushSubscriptionDoc>(SIGNAL_PUSH_SUBSCRIPTIONS_COLLECTION)
      .find({ channel: body.channel }, 10_000);
    await this.push.deliver(
      subscriptions.map((subscription) =>
        Buffer.from(subscription.pushToken, 'base64').toString('utf8'),
      ),
      {
        channel: body.channel,
        broadcast: env.contentId,
        sequence: body.sequence.toString(),
        severity: body.severity,
        headline: body.headline.trim(),
        expiresAtMs: Number(body.expires_at_ms),
      },
    );
  }
}

export class BroadcastRevokeHandler implements DomainHandler<BroadcastRevoke> {
  readonly domain = 'jb:broadcast:revoke:v1';
  readonly plane = Plane.SIGNAL;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): BroadcastRevoke {
    return BroadcastRevoke.decode(body);
  }
  validate(body: BroadcastRevoke, env: ParsedEnvelope): ValidationResult {
    if (!body.channel || body.channel !== env.scope) {
      return invalid('body channel must equal envelope scope', 'channel');
    }
    if (!body.target.startsWith('jb1')) return invalid('target must be a content ID', 'target');
    if (body.reason === RevokeReason.REVOKE_REASON_UNSPECIFIED) {
      return invalid('revoke reason is required', 'reason');
    }
    return valid;
  }
  async authorize(body: BroadcastRevoke, env: ParsedEnvelope): Promise<AuthDecision> {
    const channel = await this.projections
      .collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION)
      .findOne({ id: body.channel });
    if (!channel || channel.currentSigningKey !== hex(env.authorKey)) {
      return denied('the current channel signing key is required');
    }
    const target = await this.projections
      .collection<SignalBroadcastDoc>(SIGNAL_BROADCASTS_COLLECTION)
      .findOne({ id: body.target });
    return target?.channel === body.channel ? allowed : denied('broadcast target is not known');
  }
  async project(body: BroadcastRevoke, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const collection =
      this.projections.collection<SignalBroadcastDoc>(SIGNAL_BROADCASTS_COLLECTION);
    const target = await collection.findOne({ id: body.target });
    if (!target) return;
    await collection.put(
      target.id,
      {
        ...target,
        revokedAtMs: Number(env.createdAtMs),
        revokeReason: body.reason,
        revokeNote: body.note,
        revokeContentId: env.contentId,
      },
      tx,
    );
  }
}
