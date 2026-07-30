import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuditCertificate } from '@jagoo/sdk';
import { cryptoBackend } from '@jagoo/sdk/crypto';
import type { DiscoveredService } from '../data/node-config';
import { networkRequest, type ClientTransport } from '../data/request';
import type { ProvenanceJson, VerificationResult } from '../verify';

const AUDIT_RECORD_PREFIX = 'jb.audit-certificate.v1:';
const AUDIT_ISSUE_PREFIX = 'jb.audit-issue.v1:';
const text = new TextEncoder();

export type AuditIssueCode =
  | 'CONTENT_IDENTIFIER'
  | 'AUTHOR_SIGNATURE'
  | 'PUBLICATION_RECEIPT';

export interface AuditIssueReport {
  readonly version: 1;
  readonly reportId: string;
  readonly identifier: string;
  readonly issues: readonly AuditIssueCode[];
  readonly observedAtMs: number;
  readonly evidence: ProvenanceJson;
}

export interface StoredAuditIssue {
  readonly report: AuditIssueReport;
  readonly deliveries: readonly AuditDelivery[];
}

let issueServices: readonly DiscoveredService[] = [];
let issueTransport: ClientTransport | undefined;
const activeIssueReports = new Set<string>();

const hex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

function issueCodes(result: VerificationResult): readonly AuditIssueCode[] {
  const issues: AuditIssueCode[] = [];
  if (!result.contentId) issues.push('CONTENT_IDENTIFIER');
  if (!result.authorSignature) issues.push('AUTHOR_SIGNATURE');
  if (!result.publicationReceipt) issues.push('PUBLICATION_RECEIPT');
  return issues;
}

function issueReportId(value: ProvenanceJson, issues: readonly AuditIssueCode[]): string {
  return hex(
    cryptoBackend().sha256(
      text.encode(
        `jb-als-issue-v1\0${value.contentId}\0${issues.join(',')}\0${JSON.stringify(value)}`,
      ),
    ),
  );
}

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

async function writeIssue(record: StoredAuditIssue): Promise<void> {
  await AsyncStorage.setItem(
    `${AUDIT_ISSUE_PREFIX}${record.report.reportId}`,
    JSON.stringify(record),
  );
}

async function deliverIssue(
  record: StoredAuditIssue,
  services = issueServices,
  transport = issueTransport,
): Promise<StoredAuditIssue> {
  const completed = new Map(record.deliveries.map((item) => [item.serviceId, item]));
  const deliveries = await Promise.all(
    services.map(async (service): Promise<AuditDelivery> => {
      const previous = completed.get(service.id);
      if (previous?.delivered) return previous;
      try {
        const response = await networkRequest(
          new URL('/v1/audit-reports', `${service.address.replace(/\/+$/, '')}/`).toString(),
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(record.report),
          },
          transport,
        );
        return {
          serviceId: service.id,
          address: service.address,
          delivered: response.ok,
          detail: response.ok ? 'Issue recorded independently' : `HTTP ${response.status}`,
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
  const updated = { ...record, deliveries };
  await writeIssue(updated);
  return updated;
}

export function configureAuditIssueReporting(
  services: readonly DiscoveredService[],
  transport?: ClientTransport,
): void {
  issueServices = services;
  issueTransport = transport;
  void flushAuditIssueReports();
}

export async function reportProvenanceIssue(
  evidence: ProvenanceJson,
  verification: VerificationResult,
): Promise<StoredAuditIssue | null> {
  const issues = issueCodes(verification);
  if (issues.length === 0) return null;
  const reportId = issueReportId(evidence, issues);
  const key = `${AUDIT_ISSUE_PREFIX}${reportId}`;
  const existing = await AsyncStorage.getItem(key);
  if (existing) return JSON.parse(existing) as StoredAuditIssue;
  if (activeIssueReports.has(reportId)) return null;
  activeIssueReports.add(reportId);
  try {
    const record: StoredAuditIssue = {
      report: {
        version: 1,
        reportId,
        identifier: evidence.contentId,
        issues,
        observedAtMs: Date.now(),
        evidence,
      },
      deliveries: [],
    };
    await writeIssue(record);
    return await deliverIssue(record);
  } finally {
    activeIssueReports.delete(reportId);
  }
}

export async function flushAuditIssueReports(): Promise<void> {
  if (issueServices.length === 0) return;
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(AUDIT_ISSUE_PREFIX),
  );
  const rows = await AsyncStorage.multiGet(keys);
  await Promise.all(
    rows.map(async ([, encoded]) => {
      if (!encoded) return;
      const record = JSON.parse(encoded) as StoredAuditIssue;
      if (activeIssueReports.has(record.report.reportId)) return;
      activeIssueReports.add(record.report.reportId);
      try {
        await deliverIssue(record);
      } finally {
        activeIssueReports.delete(record.report.reportId);
      }
    }),
  );
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
  transport?: ClientTransport,
): Promise<StoredAuditCertificate> {
  const storedAtMs = Date.now();
  await write({ certificate, storedAtMs, deliveries: [] });
  const deliveries = await Promise.all(
    services.map(async (service): Promise<AuditDelivery> => {
      try {
        const response = await networkRequest(
          new URL('/v1/audit-records', `${service.address.replace(/\/+$/, '')}/`).toString(),
          {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(certificate),
          },
          transport,
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
  const response = await networkRequest(new URL('/status', `${baseUrl.replace(/\/+$/, '')}/`).toString(), {
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
