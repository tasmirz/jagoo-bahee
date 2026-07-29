import AsyncStorage from '@react-native-async-storage/async-storage';

const SUBSCRIPTIONS_KEY = 'jb.signal.subscriptions.v1';
const VERIFIED_KEY = 'jb.signal.verified-fingerprints.v1';
const ACKNOWLEDGED_KEY = 'jb.signal.acknowledged-alerts.v1';
const ALERT_SETTINGS_KEY = 'jb.signal.alert-settings.v1';

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

export async function clearSignalLocalData(): Promise<void> {
  await AsyncStorage.multiRemove([
    SUBSCRIPTIONS_KEY,
    VERIFIED_KEY,
    ACKNOWLEDGED_KEY,
    ALERT_SETTINGS_KEY,
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
