import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createAuditCertificate,
  type AuditCertificate,
  type AuditReceiptJson,
  type Plane,
  type Priority,
} from '@jagoo/sdk';
import { storeAndForwardCertificate } from '../audit';
import type { DiscoveredService } from '../data/node-config';

const OUTBOX_KEY = 'jb.offline.outbox.v1';
const text = new TextEncoder();

const base64 = (value: Uint8Array): string =>
  globalThis.btoa(String.fromCharCode(...value));
const unbase64 = (value: string): Uint8Array =>
  Uint8Array.from(globalThis.atob(value), (character) => character.charCodeAt(0));

export type OutboxState = 'pending' | 'sending' | 'receipted';

export interface OutboxRecord {
  readonly contentId: string;
  readonly plane: Plane;
  readonly priority: Priority;
  readonly envelope: string;
  readonly baseUrl: string;
  readonly auditServices: readonly DiscoveredService[];
  readonly queuedAtMs: number;
  readonly attempts: number;
  readonly nextAttemptAtMs: number;
  readonly state: OutboxState;
  readonly receipt?: AuditReceiptJson;
}

export interface OutboxSubmission {
  readonly contentId: string;
  readonly pending: boolean;
  readonly receipt?: AuditReceiptJson;
  readonly certificate?: AuditCertificate;
  readonly auditCopies: number;
  readonly auditPending: number;
}

export interface QueueInput {
  readonly contentId: string;
  readonly plane: Plane;
  readonly priority: Priority;
  readonly wireBytes: Uint8Array;
  readonly baseUrl: string;
  readonly auditServices?: readonly DiscoveredService[];
}

export type EnvelopeSubmitter = (
  baseUrl: string,
  requestBody: string,
) => Promise<AuditReceiptJson>;

async function read(): Promise<readonly OutboxRecord[]> {
  const encoded = await AsyncStorage.getItem(OUTBOX_KEY);
  if (!encoded) return [];
  try {
    const records = JSON.parse(encoded) as readonly OutboxRecord[];
    // A process death while sending is recoverable: the exact signed bytes return to pending.
    return records.map((record) =>
      record.state === 'sending' ? { ...record, state: 'pending' as const } : record,
    );
  } catch {
    return [];
  }
}

async function write(records: readonly OutboxRecord[]): Promise<void> {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(records));
}

async function replace(record: OutboxRecord): Promise<void> {
  const records = await read();
  await write([...records.filter((item) => item.contentId !== record.contentId), record]);
}

const rank: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3 };

export function orderOutbox(records: readonly OutboxRecord[]): readonly OutboxRecord[] {
  return [...records].sort(
    (left, right) =>
      (rank[left.priority] ?? 9) - (rank[right.priority] ?? 9) ||
      left.queuedAtMs - right.queuedAtMs ||
      left.contentId.localeCompare(right.contentId),
  );
}

export async function listOutbox(includeReceipted = false): Promise<readonly OutboxRecord[]> {
  const rows = await read();
  return orderOutbox(
    includeReceipted ? rows : rows.filter((record) => record.state !== 'receipted'),
  );
}

export async function enqueueSignedEnvelope(input: QueueInput): Promise<OutboxRecord> {
  const records = await read();
  const existing = records.find((record) => record.contentId === input.contentId);
  if (existing) return existing;
  const record: OutboxRecord = {
    contentId: input.contentId,
    plane: input.plane,
    priority: input.priority,
    envelope: base64(input.wireBytes),
    baseUrl: input.baseUrl.replace(/\/+$/, ''),
    auditServices: input.auditServices ?? [],
    queuedAtMs: Date.now(),
    attempts: 0,
    nextAttemptAtMs: 0,
    state: 'pending',
  };
  await write([...records, record]);
  return record;
}

async function defaultSubmit(baseUrl: string, requestBody: string): Promise<AuditReceiptJson> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(new URL('/v1/envelopes', `${baseUrl}/`).toString(), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: requestBody,
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error(`Network timeout or error connecting to ${baseUrl}: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeoutId);
  }
  
  const payload = (await response.json()) as AuditReceiptJson & { readonly detail?: string };
  if (!response.ok) {
    const error = new Error(payload.detail ?? `Node request failed with HTTP ${response.status}`);
    Object.assign(error, { permanent: response.status >= 400 && response.status < 500 });
    throw error;
  }
  return payload;
}

async function deliver(
  record: OutboxRecord,
  submitter: EnvelopeSubmitter,
): Promise<OutboxSubmission> {
  await replace({ ...record, state: 'sending' });
  const requestBody = JSON.stringify({ envelope: record.envelope });
  try {
    console.log('[outbox.deliver] Sending envelope to node...', record.baseUrl);
    const receipt = await submitter(record.baseUrl, requestBody);
    console.log('[outbox.deliver] Envelope submitted, receipt received.', receipt);
    const certificate = createAuditCertificate(text.encode(requestBody), receipt);
    console.log('[outbox.deliver] Storing and forwarding certificate to audit logs...');
    const stored = await storeAndForwardCertificate(certificate, record.auditServices);
    console.log('[outbox.deliver] Certificate stored and forwarded.', stored);
    await replace({ ...record, state: 'receipted', receipt });
    return {
      contentId: record.contentId,
      pending: false,
      receipt,
      certificate,
      auditCopies: stored.deliveries.filter((item) => item.delivered).length,
      auditPending: stored.deliveries.filter((item) => !item.delivered).length,
    };
  } catch (error) {
    if ((error as Error & { readonly permanent?: boolean }).permanent) {
      const records = await read();
      await write(records.filter((item) => item.contentId !== record.contentId));
      throw error;
    }
    const attempts = record.attempts + 1;
    const backoff = Math.min(300_000, 1_000 * 2 ** Math.min(attempts, 8));
    await replace({
      ...record,
      state: 'pending',
      attempts,
      nextAttemptAtMs: Date.now() + backoff,
    });
    return {
      contentId: record.contentId,
      pending: true,
      auditCopies: 0,
      auditPending: record.auditServices.length,
    };
  }
}

/**
 * Queue-before-send closes the crash window: once signing returns a final ID, the envelope
 * survives app termination even if the first network request never starts.
 */
export async function submitSignedEnvelope(
  input: QueueInput,
  submitter: EnvelopeSubmitter = defaultSubmit,
): Promise<OutboxSubmission> {
  const record = await enqueueSignedEnvelope(input);
  return record.state === 'receipted' && record.receipt
    ? {
        contentId: record.contentId,
        pending: false,
        receipt: record.receipt,
        auditCopies: 0,
        auditPending: 0,
      }
    : deliver(record, submitter);
}

export async function drainOutbox(
  submitter: EnvelopeSubmitter = defaultSubmit,
  nowMs = Date.now(),
): Promise<{
  readonly attempted: number;
  readonly receipted: number;
  readonly pending: number;
  readonly rejected: number;
}> {
  const records = (await listOutbox()).filter((record) => record.nextAttemptAtMs <= nowMs);
  let receipted = 0;
  let rejected = 0;
  for (const record of records) {
    try {
      const result = await deliver(record, submitter);
      if (!result.pending) receipted += 1;
    } catch {
      // A permanent rejection removes only that record. One malformed or
      // superseded action must not strand every later item in the queue.
      rejected += 1;
    }
  }
  return {
    attempted: records.length,
    receipted,
    pending: (await listOutbox()).length,
    rejected,
  };
}

let activeDrain: Promise<Awaited<ReturnType<typeof drainOutbox>>> | null = null;

export function drainOutboxOnce(): Promise<Awaited<ReturnType<typeof drainOutbox>>> {
  if (activeDrain) return activeDrain;
  activeDrain = drainOutbox().finally(() => {
    activeDrain = null;
  });
  return activeDrain;
}

export async function clearOutboxPlane(plane: Plane): Promise<void> {
  await write((await read()).filter((record) => record.plane !== plane));
}

export function envelopeBytes(record: OutboxRecord): Uint8Array {
  return unbase64(record.envelope);
}
