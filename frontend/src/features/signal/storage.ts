import AsyncStorage from '@react-native-async-storage/async-storage';

const SUBSCRIPTIONS_KEY = 'jb.signal.subscriptions.v1';
const VERIFIED_KEY = 'jb.signal.verified-fingerprints.v1';
const ACKNOWLEDGED_KEY = 'jb.signal.acknowledged-alerts.v1';
const ALERT_SETTINGS_KEY = 'jb.signal.alert-settings.v1';
const PUSH_CHANNELS_KEY = 'jb.signal.push-channels.v1';
const INBOX_KEY = 'jb.signal.inbox.v1';
const PREKEY_PREFIX = 'jb.signal.prekey.v1:';
const BACKUP_OWED_KEY = 'jb.signal.backup-owed.v1';

export interface SignalArea {
  readonly latE5: number;
  readonly lonE5: number;
  readonly radiusM: number;
  readonly placeName: string;
}

export interface LocalSignalSubscription {
  /** Empty means an area-only subscription independent of channel (SIG-34). */
  readonly channel: string;
  readonly alertCritical: boolean;
  readonly alertWarning: boolean;
  readonly alertAdvisory: boolean;
  readonly alertInfo: boolean;
  readonly areaFilter: SignalArea | null;
  readonly categoryFilter: readonly number[];
  readonly mutedUntilMs: number;
}

export interface SignalAlertSettings {
  readonly soundCritical: boolean;
  readonly soundWarning: boolean;
  readonly vibrateCritical: boolean;
  readonly vibrateWarning: boolean;
}

export interface CachedSignalPrekey {
  readonly identityKey: string;
  readonly signedPrekey: string;
  readonly signedPrekeySignature: string;
  readonly kemPublicKey: string;
  readonly oneTimePrekeys: readonly string[];
  readonly validUntilMs: number;
}

export interface CachedSignalSession {
  readonly id: string;
  readonly senderKey: string;
  readonly recipientKey: string;
  readonly kemCiphertext: string;
  readonly ephemeralX25519: string;
  readonly ciphertext: string;
  readonly createdAtMs: number;
}

const defaultAlertSettings: SignalAlertSettings = {
  soundCritical: true,
  soundWarning: true,
  vibrateCritical: true,
  vibrateWarning: false,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const encoded = await AsyncStorage.getItem(key);
  if (!encoded) return fallback;
  try {
    return JSON.parse(encoded) as T;
  } catch {
    return fallback;
  }
}

export async function loadSignalSubscriptions(): Promise<readonly LocalSignalSubscription[]> {
  return readJson<readonly LocalSignalSubscription[]>(SUBSCRIPTIONS_KEY, []);
}

export async function saveSignalSubscription(value: LocalSignalSubscription): Promise<void> {
  const current = await loadSignalSubscriptions();
  const key = value.channel || `area:${value.areaFilter?.placeName ?? ''}`;
  const next = [
    ...current.filter(
      (item) => (item.channel || `area:${item.areaFilter?.placeName ?? ''}`) !== key,
    ),
    value,
  ];
  // SB-01 / AC-48: local storage only. No networking function exists in this module.
  await AsyncStorage.setItem(SUBSCRIPTIONS_KEY, JSON.stringify(next));
}

export async function removeSignalSubscription(channel: string): Promise<void> {
  const current = await loadSignalSubscriptions();
  await AsyncStorage.setItem(
    SUBSCRIPTIONS_KEY,
    JSON.stringify(current.filter((item) => item.channel !== channel)),
  );
}

/**
 * Whether the Signal recovery phrase has been written down yet.
 *
 * Onboarding creates the Signal identity but does not walk its 24 words: two recovery-phrase
 * grids back to back is how people stop reading either of them, and the Forum phrase — which
 * carries everything a person has posted — is the one that must land. So the Signal phrase is
 * owed rather than skipped, and the debt is recorded here so the prompt keeps returning
 * instead of being a single dismissible card nobody sees twice.
 *
 * A flag, never the phrase. The phrase is only ever read back out of the unlocked vault.
 */
export async function markSignalBackupOwed(): Promise<void> {
  await AsyncStorage.setItem(BACKUP_OWED_KEY, 'owed');
}

export async function clearSignalBackupOwed(): Promise<void> {
  await AsyncStorage.removeItem(BACKUP_OWED_KEY);
}

export async function isSignalBackupOwed(): Promise<boolean> {
  return (await AsyncStorage.getItem(BACKUP_OWED_KEY)) === 'owed';
}

export async function markSignalFingerprintVerified(fingerprint: string): Promise<void> {
  const current = new Set(await readJson<readonly string[]>(VERIFIED_KEY, []));
  current.add(fingerprint);
  await AsyncStorage.setItem(VERIFIED_KEY, JSON.stringify([...current]));
}

export async function isSignalFingerprintVerified(fingerprint: string): Promise<boolean> {
  return new Set(await readJson<readonly string[]>(VERIFIED_KEY, [])).has(fingerprint);
}

export async function acknowledgeSignalAlert(contentId: string): Promise<void> {
  const current = new Set(await readJson<readonly string[]>(ACKNOWLEDGED_KEY, []));
  current.add(contentId);
  await AsyncStorage.setItem(ACKNOWLEDGED_KEY, JSON.stringify([...current]));
}

export async function acknowledgedSignalAlerts(): Promise<ReadonlySet<string>> {
  return new Set(await readJson<readonly string[]>(ACKNOWLEDGED_KEY, []));
}

export async function loadSignalAlertSettings(): Promise<SignalAlertSettings> {
  return readJson(ALERT_SETTINGS_KEY, defaultAlertSettings);
}

export async function saveSignalAlertSettings(value: SignalAlertSettings): Promise<void> {
  await AsyncStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify(value));
}

export async function isSignalPushEnabled(channel: string): Promise<boolean> {
  return new Set(await readJson<readonly string[]>(PUSH_CHANNELS_KEY, [])).has(channel);
}

export async function markSignalPushEnabled(channel: string, enabled: boolean): Promise<void> {
  const channels = new Set(await readJson<readonly string[]>(PUSH_CHANNELS_KEY, []));
  if (enabled) channels.add(channel);
  else channels.delete(channel);
  await AsyncStorage.setItem(PUSH_CHANNELS_KEY, JSON.stringify([...channels]));
}

export async function cacheSignalPrekey(
  identityKey: string,
  value: CachedSignalPrekey,
): Promise<void> {
  await AsyncStorage.setItem(
    `${PREKEY_PREFIX}${identityKey.toLowerCase()}`,
    JSON.stringify(value),
  );
}

export async function loadCachedSignalPrekey(
  identityKey: string,
): Promise<CachedSignalPrekey | null> {
  return readJson<CachedSignalPrekey | null>(
    `${PREKEY_PREFIX}${identityKey.toLowerCase()}`,
    null,
  );
}

export async function cacheSignalInbox(
  sessions: readonly CachedSignalSession[],
): Promise<void> {
  await AsyncStorage.setItem(INBOX_KEY, JSON.stringify(sessions));
}

export async function loadCachedSignalInbox(): Promise<readonly CachedSignalSession[]> {
  return readJson<readonly CachedSignalSession[]>(INBOX_KEY, []);
}

export async function clearSignalLocalData(): Promise<void> {
  const prekeys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREKEY_PREFIX));
  await AsyncStorage.multiRemove([
    SUBSCRIPTIONS_KEY,
    VERIFIED_KEY,
    ACKNOWLEDGED_KEY,
    ALERT_SETTINGS_KEY,
    PUSH_CHANNELS_KEY,
    INBOX_KEY,
    ...prekeys,
  ]);
}

export interface FilterableBroadcast {
  readonly channel: string;
  readonly severity: number;
  readonly category: number;
  readonly area: SignalArea | null;
  readonly verification: 'unverified' | 'known' | 'verified' | 'endorsed' | 'disputed';
  readonly createdAtMs: number;
}

function areaOverlaps(left: SignalArea, right: SignalArea): boolean {
  const latMeters = (left.latE5 - right.latE5) * 1.1132;
  const lonScale = Math.cos(((left.latE5 + right.latE5) / 200_000) * (Math.PI / 180));
  const lonMeters = (left.lonE5 - right.lonE5) * 1.1132 * lonScale;
  return Math.hypot(latMeters, lonMeters) <= left.radiusM + right.radiusM;
}

/** SIG-19/SIG-29…36: deterministic subscriber-side policy; no request pattern is emitted. */
export function subscriptionAllows(
  broadcast: FilterableBroadcast,
  subscriptions: readonly LocalSignalSubscription[],
  nowMs: number,
): boolean {
  const trusted =
    broadcast.verification === 'known' ||
    broadcast.verification === 'verified' ||
    broadcast.verification === 'endorsed';
  if (broadcast.severity === 4 && !trusted) return false;
  return subscriptions.some((subscription) => {
    if (subscription.channel && subscription.channel !== broadcast.channel) return false;
    if (subscription.mutedUntilMs > nowMs) return false;
    if (
      subscription.categoryFilter.length > 0 &&
      !subscription.categoryFilter.includes(broadcast.category)
    ) {
      return false;
    }
    if (
      subscription.areaFilter &&
      (!broadcast.area || !areaOverlaps(subscription.areaFilter, broadcast.area))
    ) {
      return false;
    }
    return (
      (broadcast.severity === 4 && subscription.alertCritical) ||
      (broadcast.severity === 3 && subscription.alertWarning) ||
      (broadcast.severity === 2 && subscription.alertAdvisory) ||
      (broadcast.severity === 1 && subscription.alertInfo)
    );
  });
}
