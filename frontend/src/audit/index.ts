import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuditCertificate } from '@jagoo/sdk';
import type { DiscoveredService } from '../data/node-config';

const AUDIT_RECORD_PREFIX = 'jb.audit-certificate.v1:';

export interface AuditDelivery {
  readonly serviceId: string;
  readonly address: string;
  readonly delivered: boolean;
  readonly detail: string;
}

export interface StoredAuditCertificate {
  readonly certificate: AuditCertificate;
  readonly storedAtMs: number;
  readonly deliveries: readonly AuditDelivery[];
}

async function write(record: StoredAuditCertificate): Promise<void> {
  await AsyncStorage.setItem(
    `${AUDIT_RECORD_PREFIX}${record.certificate.identifier}`,
    JSON.stringify(record),
  );
}

export async function storeAndForwardCertificate(
  certificate: AuditCertificate,
  services: readonly DiscoveredService[],
): Promise<StoredAuditCertificate> {
  const storedAtMs = Date.now();
  await write({ certificate, storedAtMs, deliveries: [] });
  const deliveries = await Promise.all(
    services.map(async (service): Promise<AuditDelivery> => {
      try {
        const response = await fetch(
          new URL('/v1/audit-records', `${service.address.replace(/\/+$/, '')}/`).toString(),
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(certificate),
          },
        );
        return {
          serviceId: service.id,
          address: service.address,
          delivered: response.ok,
          detail: response.ok ? 'Stored independently' : `HTTP ${response.status}`,
        };
      } catch {
        return {
          serviceId: service.id,
          address: service.address,
          delivered: false,
          detail: 'Saved on this device; forwarding will retry later',
        };
      }
    }),
  );
  const record = { certificate, storedAtMs, deliveries };
  await write(record);
  return record;
}

export async function listAuditCertificates(): Promise<readonly StoredAuditCertificate[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(AUDIT_RECORD_PREFIX),
  );
  if (keys.length === 0) return [];
  const values = await AsyncStorage.multiGet(keys);
  return values
    .flatMap(([, value]) => {
      if (!value) return [];
      try {
        return [JSON.parse(value) as StoredAuditCertificate];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.storedAtMs - a.storedAtMs);
}

export async function certificateStatus(
  baseUrl: string,
  certificate: AuditCertificate,
): Promise<{
  readonly valid: boolean;
  readonly online: boolean;
  readonly status: 'online' | 'hidden' | 'deleted' | 'unknown_server';
  readonly reason: string | null;
}> {
  const response = await fetch(new URL('/status', `${baseUrl.replace(/\/+$/, '')}/`).toString(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(certificate),
  });
  const value = (await response.json()) as {
    readonly valid: boolean;
    readonly online: boolean;
    readonly status: 'online' | 'hidden' | 'deleted' | 'unknown_server';
    readonly reason: string | null;
    readonly detail?: string;
  };
  if (!response.ok)
    throw new Error(value.detail ?? `Status check returned HTTP ${response.status}`);
  return value;
}
