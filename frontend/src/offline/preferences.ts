import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'jb.mesh.preferences.v1';

export interface MeshPreferences {
  readonly enabled: boolean;
  readonly batterySaver: boolean;
  readonly dataSaver: boolean;
}

const defaults: MeshPreferences = {
  enabled: false,
  batterySaver: true,
  dataSaver: false,
};

export async function loadMeshPreferences(): Promise<MeshPreferences> {
  const encoded = await AsyncStorage.getItem(KEY);
  if (!encoded) return defaults;
  try {
    return { ...defaults, ...(JSON.parse(encoded) as Partial<MeshPreferences>) };
  } catch {
    return defaults;
  }
}

export async function saveMeshPreferences(value: MeshPreferences): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(value));
}

/** T5.14: discovery is manual in v1; this cadence controls liveness/reconciliation probes. */
export function meshProbeIntervalMs(value: MeshPreferences): number {
  if (!value.enabled) return Number.POSITIVE_INFINITY;
  if (value.batterySaver) return 120_000;
  if (value.dataSaver) return 60_000;
  return 15_000;
}
