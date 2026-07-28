jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import { LocalNotificationState, type NotificationStorage } from './notifications';

class MemoryStorage implements NotificationStorage {
  private readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const items = [
  { id: 'one', read: false, kind: 'reply' },
  { id: 'two', read: false, kind: 'mention' },
] as const;

describe('LocalNotificationState', () => {
  it('marks read and unread without mutating the derived server projection', async () => {
    const state = new LocalNotificationState('actor-one', new MemoryStorage());
    await state.markRead('one');
    expect(await state.apply(items)).toEqual([
      { id: 'one', read: true, kind: 'reply' },
      { id: 'two', read: false, kind: 'mention' },
    ]);
    expect(await state.unreadCount(items)).toBe(1);

    await state.markRead('one', false);
    expect(await state.unreadCount(items)).toBe(2);
  });

  it('keeps deleted notifications hidden locally', async () => {
    const storage = new MemoryStorage();
    const state = new LocalNotificationState('actor-one', storage);
    await state.delete('one');
    expect(await state.apply(items)).toEqual([{ id: 'two', read: false, kind: 'mention' }]);
    expect(await new LocalNotificationState('actor-two', storage).apply(items)).toEqual(items);
  });
});
