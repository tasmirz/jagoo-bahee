import AsyncStorage from '@react-native-async-storage/async-storage';
import { normaliseServiceAddress, type ServiceKind } from './service-address';

const OVERRIDES_KEY = 'jb.service-overrides.v1';

/**
 * Addresses the user typed in Network & services, keyed by service kind.
 *
 * Stored per device rather than per home node. Someone correcting an address is almost always
 * correcting for where THEY are — behind a captive portal, on a phone that cannot resolve the
 * node's LAN name — and that stays true across the nodes they connect to. Scoping it per node
 * would make them retype it every time they switch, which is exactly when they are least able to.
 */
export type ServiceOverrides = Partial<Record<ServiceKind, string>>;

const EDITABLE: readonly ServiceKind[] = ['audit-log', 'mcaptcha', 'blob'];

/** Federation endpoints are peer-to-peer and never dialled by a client, so they are not editable. */
export function isEditableService(kind: ServiceKind): boolean {
  return EDITABLE.includes(kind);
}

export function editableServiceKinds(): readonly ServiceKind[] {
  return EDITABLE;
}

export async function loadServiceOverrides(): Promise<ServiceOverrides> {
  try {
    const stored = await AsyncStorage.getItem(OVERRIDES_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: ServiceOverrides = {};
    for (const kind of EDITABLE) {
      const value = (parsed as Record<string, unknown>)[kind];
      if (typeof value !== 'string' || !value.trim()) continue;
      try {
        result[kind] = normaliseServiceAddress(value);
      } catch {
        // Skip this one entry rather than discarding the whole file. One bad address should not
        // silently reset the other two the user got right.
      }
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Saves one override, or clears it when `address` is null/blank.
 *
 * Throws on an unparseable address so the settings screen can show the reason next to the field.
 * Persisting an invalid value and failing later would put the error arbitrarily far from the
 * typing that caused it.
 */
export async function setServiceOverride(
  kind: ServiceKind,
  address: string | null,
): Promise<ServiceOverrides> {
  const current = await loadServiceOverrides();
  const next: ServiceOverrides = { ...current };
  if (address === null || !address.trim()) {
    delete next[kind];
  } else {
    next[kind] = normaliseServiceAddress(address);
  }
  await AsyncStorage.setItem(OVERRIDES_KEY, JSON.stringify(next));
  return next;
}

export async function clearServiceOverrides(): Promise<void> {
  await AsyncStorage.removeItem(OVERRIDES_KEY);
}
