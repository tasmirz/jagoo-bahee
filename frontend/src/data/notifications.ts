import AsyncStorage from '@react-native-async-storage/async-storage';

const STATE_KEY_PREFIX = 'jb.notifications.forum.v1:';

export interface ForumNotification {
  readonly id: string;
  readonly read: boolean;
  readonly [key: string]: unknown;
}

interface NotificationState {
  readonly readIds: readonly string[];
  readonly hiddenIds: readonly string[];
}

export interface NotificationStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const EMPTY: NotificationState = { readIds: [], hiddenIds: [] };

/**
 * NOT-01: personal read/delete state stays on the device. Notifications themselves remain
 * deterministic server projections, so a private interaction never becomes a federated
 * envelope merely to toggle a badge.
 */
export class LocalNotificationState {
  private readonly stateKey: string;

  constructor(
    actorKey: string,
    private readonly storage: NotificationStorage = AsyncStorage,
  ) {
    this.stateKey = `${STATE_KEY_PREFIX}${actorKey}`;
  }

  private async load(): Promise<NotificationState> {
    const encoded = await this.storage.getItem(this.stateKey);
    if (!encoded) return EMPTY;
    try {
      const value = JSON.parse(encoded) as Partial<NotificationState>;
      return {
        readIds: Array.isArray(value.readIds) ? value.readIds : [],
        hiddenIds: Array.isArray(value.hiddenIds) ? value.hiddenIds : [],
      };
    } catch {
      return EMPTY;
    }
  }

  private async save(state: NotificationState): Promise<void> {
    await this.storage.setItem(this.stateKey, JSON.stringify(state));
  }

  async apply<T extends ForumNotification>(items: readonly T[]): Promise<readonly T[]> {
    const state = await this.load();
    const read = new Set(state.readIds);
    const hidden = new Set(state.hiddenIds);
    return items
      .filter((item) => !hidden.has(item.id))
      .map((item) => ({ ...item, read: item.read || read.has(item.id) }));
  }

  async markRead(id: string, value = true): Promise<void> {
    const state = await this.load();
    const read = new Set(state.readIds);
    if (value) read.add(id);
    else read.delete(id);
    await this.save({ ...state, readIds: [...read] });
  }

  async delete(id: string): Promise<void> {
    const state = await this.load();
    const hidden = new Set(state.hiddenIds);
    hidden.add(id);
    await this.save({ ...state, hiddenIds: [...hidden] });
  }

  async clear(): Promise<void> {
    await this.storage.removeItem(this.stateKey);
  }

  async unreadCount(items: readonly ForumNotification[]): Promise<number> {
    return (await this.apply(items)).filter((item) => !item.read).length;
  }
}
