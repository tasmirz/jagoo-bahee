import { base32Decode } from '@jagoo/sdk';
import type { Tx } from '../../../core/domain/domain-handler.js';
import type { ProjectionStore } from '../../../core/ports/storage.port.js';

export const NOTIFICATIONS_COLLECTION = 'forum_notifications';

export type NotificationKind = 'reply' | 'mention' | 'award' | 'mod_action' | 'follow';

export interface NotificationDoc {
  readonly id: string;
  readonly recipientKey: string;
  readonly kind: NotificationKind;
  readonly contentId: string;
  readonly actorKey: string;
  readonly createdAtMs: number;
  /** Delivery state is initialized here; clients may keep personal read state locally. */
  readonly read: boolean;
}

export async function addNotification(
  projections: ProjectionStore,
  notification: Omit<NotificationDoc, 'id' | 'read'>,
  tx: Tx,
): Promise<void> {
  if (notification.recipientKey === notification.actorKey) return;
  const id = `${notification.contentId}:${notification.recipientKey}:${notification.kind}`;
  await projections
    .collection<NotificationDoc>(NOTIFICATIONS_COLLECTION)
    .put(id, { id, ...notification, read: false }, tx);
}

/** `@jbk1…` mentions are stable key IDs, not mutable display names. */
export async function addMentionNotifications(
  projections: ProjectionStore,
  text: string,
  contentId: string,
  actorKey: string,
  createdAtMs: number,
  tx: Tx,
): Promise<void> {
  const recipients = new Set<string>();
  for (const match of text.matchAll(/@jbk1([a-z2-7]{52})(?![a-z2-7])/g)) {
    try {
      recipients.add(Buffer.from(base32Decode(match[1]!)).toString('hex'));
    } catch {
      // Invalid user text is not a projection failure.
    }
  }
  for (const recipientKey of recipients) {
    await addNotification(
      projections,
      { recipientKey, kind: 'mention', contentId, actorKey, createdAtMs },
      tx,
    );
  }
}
