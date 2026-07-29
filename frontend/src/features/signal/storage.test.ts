import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadSignalSubscriptions,
  saveSignalSubscription,
  subscriptionAllows,
  type LocalSignalSubscription,
} from './storage';

const subscription: LocalSignalSubscription = {
  channel: 'jbc1relief',
  alertCritical: true,
  alertWarning: true,
  alertAdvisory: false,
  alertInfo: false,
  areaFilter: null,
  categoryFilter: [1],
  mutedUntilMs: 0,
};

describe('Signal local subscription policy', () => {
  afterEach(async () => AsyncStorage.clear());

  it('AC-48 persists locally and applies severity/category filters without network state', async () => {
    await saveSignalSubscription(subscription);
    await expect(loadSignalSubscriptions()).resolves.toEqual([subscription]);
    expect(
      subscriptionAllows(
        {
          channel: 'jbc1relief',
          severity: 3,
          category: 1,
          area: null,
          verification: 'unverified',
          createdAtMs: 1,
        },
        [subscription],
        2,
      ),
    ).toBe(true);
    expect(
      subscriptionAllows(
        {
          channel: 'jbc1relief',
          severity: 4,
          category: 1,
          area: null,
          verification: 'unverified',
          createdAtMs: 1,
        },
        [subscription],
        2,
      ),
    ).toBe(false);
  });

  it('SIG-34 supports an area-only subscription independent of channel', () => {
    expect(
      subscriptionAllows(
        {
          channel: 'jbc1never-seen-before',
          severity: 4,
          category: 1,
          area: { latE5: 23_78000, lonE5: 90_41000, radiusM: 500, placeName: 'Dhaka' },
          verification: 'verified',
          createdAtMs: 1,
        },
        [
          {
            ...subscription,
            channel: '',
            areaFilter: {
              latE5: 23_78100,
              lonE5: 90_41100,
              radiusM: 500,
              placeName: 'Home',
            },
          },
        ],
        2,
      ),
    ).toBe(true);
  });
});
