import type { DomainHandler } from '../../core/domain/domain-handler.js';
import type { ProjectionStore } from '../../core/ports/storage.port.js';
import type { SignalPushGateway } from '../../core/ports/signal-push.port.js';
import {
  ChannelDeclareHandler,
  ChannelRetireHandler,
  ChannelRotateHandler,
  ChannelUpdateHandler,
  ChannelVouchHandler,
} from './channel/channel.handlers.js';
import { ChannelSubscribeHandler } from './channel/channel-subscribe.handler.js';
import {
  BroadcastEmitHandler,
  BroadcastRevokeHandler,
} from './broadcast/broadcast.handlers.js';
import {
  CheckInHandler,
  MissingPersonHandler,
  ResourceReportHandler,
} from './crisis/crisis.handlers.js';
import {
  PrekeyBundleHandler,
  SignalDeliveryReceiptHandler,
  SignalGroupCreateHandler,
  SignalGroupUpdateHandler,
  SignalMessageHandler,
  SignalSessionHandler,
} from './message/signal-message.handlers.js';
import {
  SignalKeyCertifyHandler,
  SignalKeyRevokeHandler,
} from './identity/certificate.handlers.js';
import { SignalDirectoryProfileHandler } from './directory/profile.handlers.js';

/** P4 handlers stay in one plane-specific registration list; ingress remains unchanged. */
export function signalHandlers(
  projections: ProjectionStore,
  push?: SignalPushGateway,
): readonly DomainHandler<never>[] {
  return [
    new SignalKeyCertifyHandler(projections),
    new SignalKeyRevokeHandler(projections),
    new ChannelDeclareHandler(projections),
    new ChannelUpdateHandler(projections),
    new ChannelRotateHandler(projections),
    new ChannelRetireHandler(projections),
    new ChannelVouchHandler(projections),
    new ChannelSubscribeHandler(projections),
    new SignalDirectoryProfileHandler(projections),
    new BroadcastEmitHandler(projections, push),
    new BroadcastRevokeHandler(projections),
    new CheckInHandler(projections),
    new MissingPersonHandler(projections),
    new ResourceReportHandler(projections),
    new PrekeyBundleHandler(projections),
    new SignalSessionHandler(projections),
    new SignalMessageHandler(projections),
    new SignalDeliveryReceiptHandler(projections),
    new SignalGroupCreateHandler(projections),
    new SignalGroupUpdateHandler(projections),
  ] as unknown as readonly DomainHandler<never>[];
}
