import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  cacheSignalInbox,
  clearSignalLocalData,
  loadCachedSignalInbox,
  loadSignalSubscriptions,
  saveSignalSubscription,
  subscriptionAllows,
  type LocalSignalSubscription,
} from './storage';
import { admitRnsBroadcast } from './rns-broadcast';

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

  it('P5-G1 caches ciphertext-only inbox rows for offline reading and wipes them on panic', async () => {
    const sessions = [
      {
        id: 'jb1session',
        senderKey: 'aa',
        recipientKey: 'bb',
        kemCiphertext: 'AQ==',
        ephemeralX25519: 'Ag==',
        ciphertext: 'Aw==',
        createdAtMs: 1,
      },
    ];
    await cacheSignalInbox(sessions);
    await expect(loadCachedSignalInbox()).resolves.toEqual(sessions);
    await clearSignalLocalData();
    await expect(loadCachedSignalInbox()).resolves.toEqual([]);
  });

  it('admits a relayed mesh broadcast only when this device has a matching local follow', async () => {
    const packet = {
      id: 'mesh-1', channel: 'jbc1relief', severity: 3, category: 1, area: null,
      verification: 'known' as const, createdAtMs: 1, headline: 'Water point open', detail: 'School field',
    };
    await expect(admitRnsBroadcast(packet, 2)).resolves.toBe(false);
    await saveSignalSubscription(subscription);
    await expect(admitRnsBroadcast(packet, 2)).resolves.toBe(true);
  });
});
