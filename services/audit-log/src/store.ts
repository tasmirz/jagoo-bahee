import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AuditCertificate } from '@jagoo/sdk';

export interface AuditRecord {
  readonly certificate: AuditCertificate;
  readonly observedAtMs: number;
  readonly previousHash: string;
  readonly recordHash: string;
}

function recordKey(certificate: AuditCertificate): string {
  return `${certificate.acknowledgement.server_id}:${certificate.identifier}`;
}

function hashRecord(
  certificate: AuditCertificate,
  observedAtMs: number,
  previousHash: string,
): string {
  return createHash('sha256')
    .update('jagoo-als-record-v1\0')
    .update(previousHash)
    .update('\0')
    .update(String(observedAtMs))
    .update('\0')
    .update(JSON.stringify(certificate))
    .digest('hex');
}

export class AuditRecordStore {
  private readonly records: AuditRecord[] = [];
  private readonly byKey = new Map<string, AuditRecord>();
  private ready = false;
  private initialising: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly dataFile: string | null) {}

  async initialise(): Promise<void> {
    if (this.ready) return;
    if (this.initialising) return this.initialising;
    this.initialising = this.load();
    try {
      await this.initialising;
      this.ready = true;
    } finally {
      this.initialising = null;
    }
  }

  private async load(): Promise<void> {
    if (!this.dataFile) return;
    await mkdir(dirname(this.dataFile), { recursive: true });
    let encoded = '';
    try {
      encoded = await readFile(this.dataFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return;
    }
    let previousHash = '';
    for (const [index, line] of encoded.split(/\r?\n/).filter(Boolean).entries()) {
      const record = JSON.parse(line) as AuditRecord;
      const expected = hashRecord(record.certificate, record.observedAtMs, previousHash);
      if (record.previousHash !== previousHash || record.recordHash !== expected) {
        throw new Error(`audit chain verification failed at record ${index + 1}`);
      }
      this.records.push(record);
      this.byKey.set(recordKey(record.certificate), record);
      previousHash = record.recordHash;
    }
  }

  async append(certificate: AuditCertificate): Promise<{
    readonly record: AuditRecord;
    readonly created: boolean;
  }> {
    const operation = this.writeChain.then(() => this.appendSerial(certificate));
    this.writeChain = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async appendSerial(certificate: AuditCertificate): Promise<{
    readonly record: AuditRecord;
    readonly created: boolean;
  }> {
    await this.initialise();
    const key = recordKey(certificate);
    const existing = this.byKey.get(key);
    if (existing) {
      if (JSON.stringify(existing.certificate) !== JSON.stringify(certificate)) {
        throw new Error('a different certificate already exists for this node and identifier');
      }
      return { record: existing, created: false };
    }

    const observedAtMs = Date.now();
    const previousHash = this.records.at(-1)?.recordHash ?? '';
    const record: AuditRecord = {
      certificate,
      observedAtMs,
      previousHash,
      recordHash: hashRecord(certificate, observedAtMs, previousHash),
    };
    if (this.dataFile) {
      await appendFile(this.dataFile, `${JSON.stringify(record)}\n`, 'utf8');
    }
    this.records.push(record);
    this.byKey.set(key, record);
    return { record, created: true };
  }

  async find(identifier: string): Promise<readonly AuditRecord[]> {
    await this.initialise();
    return this.records.filter((record) => record.certificate.identifier === identifier);
  }

  async summary(): Promise<{
    readonly records: number;
    readonly chainHead: string | null;
  }> {
    await this.initialise();
    return {
      records: this.records.length,
      chainHead: this.records.at(-1)?.recordHash ?? null,
    };
  }
}
