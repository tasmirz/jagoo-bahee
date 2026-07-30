import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HomeNode } from './node-config';

const PROFILES_KEY = 'jb.identity-profiles.v1';
const ACTIVE_PROFILE_KEY = 'jb.identity-profiles.active.v1';

export interface IdentityProfile {
  readonly vaultId: string;
  readonly identityId?: string;
  readonly label: string;
  readonly homeNode: HomeNode;
  readonly createdAtMs: number;
  readonly lastUsedAtMs: number;
}

function validProfile(value: unknown): value is IdentityProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Partial<IdentityProfile>;
  return (
    typeof profile.vaultId === 'string' &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(profile.vaultId) &&
    typeof profile.label === 'string' &&
    typeof profile.createdAtMs === 'number' &&
    typeof profile.lastUsedAtMs === 'number' &&
    Boolean(profile.homeNode?.baseUrl && profile.homeNode.discovery?.node?.serverId)
  );
}

async function write(profiles: readonly IdentityProfile[]): Promise<void> {
  await AsyncStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export async function loadIdentityProfiles(): Promise<readonly IdentityProfile[]> {
  const encoded = await AsyncStorage.getItem(PROFILES_KEY);
  if (!encoded) return [];
  try {
    const parsed = JSON.parse(encoded) as unknown;
    return Array.isArray(parsed) ? parsed.filter(validProfile) : [];
  } catch {
    return [];
  }
}

export async function loadActiveProfileId(): Promise<string | null> {
  return AsyncStorage.getItem(ACTIVE_PROFILE_KEY);
}

export async function saveIdentityProfile(profile: IdentityProfile): Promise<void> {
  const profiles = await loadIdentityProfiles();
  await write([...profiles.filter((item) => item.vaultId !== profile.vaultId), profile]);
}

export async function setActiveProfileId(vaultId: string): Promise<void> {
  const profiles = await loadIdentityProfiles();
  if (!profiles.some((profile) => profile.vaultId === vaultId)) {
    throw new Error('That identity is no longer stored on this device.');
  }
  await Promise.all([
    AsyncStorage.setItem(ACTIVE_PROFILE_KEY, vaultId),
    write(
      profiles.map((profile) =>
        profile.vaultId === vaultId ? { ...profile, lastUsedAtMs: Date.now() } : profile,
      ),
    ),
  ]);
}

export async function removeIdentityProfile(vaultId: string): Promise<void> {
  const profiles = (await loadIdentityProfiles()).filter(
    (profile) => profile.vaultId !== vaultId,
  );
  await write(profiles);
  if ((await loadActiveProfileId()) === vaultId) {
    if (profiles[0]) await AsyncStorage.setItem(ACTIVE_PROFILE_KEY, profiles[0].vaultId);
    else await AsyncStorage.removeItem(ACTIVE_PROFILE_KEY);
  }
}
