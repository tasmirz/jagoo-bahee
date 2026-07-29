import { ChannelSubscribe } from '@jagoo/sdk/proto';
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
import {
  SIGNAL_CHANNELS_COLLECTION,
  type SignalChannelDoc,
} from './channel.handlers.js';

export const SIGNAL_PUSH_SUBSCRIPTIONS_COLLECTION = 'signal_push_subscriptions';

export interface SignalPushSubscriptionDoc {
  readonly id: string;
  readonly channel: string;
  readonly subscriberKey: string;
  readonly pushToken: string;
  readonly updatedAtMs: number;
  readonly contentId: string;
}

const hex = (value: Uint8Array): string => Buffer.from(value).toString('hex');

export class ChannelSubscribeHandler implements DomainHandler<ChannelSubscribe> {
  readonly domain = 'jb:channel:subscribe:v1';
  readonly plane = Plane.SIGNAL;

  constructor(private readonly projections: ProjectionStore) {}

  decode(body: Uint8Array): ChannelSubscribe {
    return ChannelSubscribe.decode(body);
  }

  validate(body: ChannelSubscribe, env: ParsedEnvelope): ValidationResult {
    if (!body.channel || body.channel !== env.scope) {
      return invalid('body channel must equal envelope scope', 'channel');
    }
    if (body.push && (body.push_token.length < 8 || body.push_token.length > 1024)) {
      return invalid('push_token must be between 8 and 1024 bytes', 'push_token');
    }
    if (!body.push && body.push_token.length > 0) {
      return invalid('unsubscription must not include a push token', 'push_token');
    }
    return valid;
  }

  async authorize(body: ChannelSubscribe): Promise<AuthDecision> {
    const channel = await this.projections
      .collection<SignalChannelDoc>(SIGNAL_CHANNELS_COLLECTION)
      .findOne({ id: body.channel });
    return channel ? allowed : denied('channel is not known here');
  }

  async project(body: ChannelSubscribe, env: ParsedEnvelope, tx: Tx): Promise<void> {
    const subscriberKey = hex(env.authorKey);
    const id = `${body.channel}:${subscriberKey}`;
    const collection =
      this.projections.collection<SignalPushSubscriptionDoc>(
        SIGNAL_PUSH_SUBSCRIPTIONS_COLLECTION,
      );
    if (!body.push) {
      await collection.delete(id, tx);
      return;
    }
    await collection.put(
      id,
      {
        id,
        channel: body.channel,
        subscriberKey,
        pushToken: Buffer.from(body.push_token).toString('base64'),
        updatedAtMs: Number(env.createdAtMs),
        contentId: env.contentId,
      },
      tx,
    );
  }
}
