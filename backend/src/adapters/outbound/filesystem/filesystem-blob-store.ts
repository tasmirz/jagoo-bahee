import { createHash } from 'node:crypto';
import { access, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import {
  BlobStore,
  type BlobMetadata,
  type UploadTicket,
} from '../../../core/ports/content.port.js';
import type { Clock } from '../../../core/ports/system.port.js';

interface Ticket {
  readonly mime: string;
  readonly size: number;
  readonly sha256: string;
  readonly expiresAtMs: number;
  readonly confirmed: boolean;
}

export class FilesystemBlobStore extends BlobStore {
  private readonly root: string;

  constructor(root: string, private readonly clock: Clock) {
    super();
    if (!isAbsolute(root)) throw new Error('BLOB_FILESYSTEM_ROOT must be an absolute path');
    this.root = resolve(root);
  }

  async ready(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await access(this.root, constants.R_OK | constants.W_OK);
  }

  private path(key: string, suffix = ''): string {
    if (!/^[a-zA-Z0-9/_-]+$/.test(key)) throw new Error('blob key is invalid');
    const value = resolve(join(this.root, `${key}${suffix}`));
    if (value !== this.root && !value.startsWith(`${this.root}${sep}`)) {
      throw new Error('blob key escapes the configured root');
    }
    return value;
  }

  private async ticket(key: string, forUpload = false): Promise<Ticket> {
    const value = JSON.parse(await readFile(this.path(key, '.ticket.json'), 'utf8')) as Ticket;
    if (forUpload && (value.confirmed || value.expiresAtMs < this.clock.nowMs())) {
      throw new Error(value.confirmed ? 'upload is already confirmed' : 'upload ticket expired');
    }
    return value;
  }

  private endpoint(kind: 'local-upload' | 'local-download', key: string): string {
    const id = key.split('/').at(-1);
    if (!id) throw new Error('blob key is invalid');
    const baseUrl = process.env.PUBLIC_BASE_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`;
    return `${baseUrl.replace(/\/+$/, '')}/v1/attachments/${kind}/${id}`;
  }

  async presignUpload(
    key: string,
    mime: string,
    size: number,
    sha256: Uint8Array,
  ): Promise<UploadTicket> {
    const expiresAtMs = this.clock.nowMs() + 15 * 60 * 1000;
    const ticketPath = this.path(key, '.ticket.json');
    await mkdir(dirname(ticketPath), { recursive: true });
    await writeFile(
      ticketPath,
      JSON.stringify({
        mime,
        size,
        sha256: Buffer.from(sha256).toString('hex'),
        expiresAtMs,
        confirmed: false,
      } satisfies Ticket),
      { encoding: 'utf8', flag: 'wx' },
    );
    return {
      url: this.endpoint('local-upload', key),
      key,
      expiresAtMs,
      headers: { 'content-type': 'application/octet-stream' },
    };
  }

  async presignDownload(key: string): Promise<string> {
    return this.endpoint('local-download', key);
  }

  async write(key: string, bytes: Uint8Array): Promise<void> {
    const ticket = await this.ticket(key, true);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== ticket.size || digest !== ticket.sha256) {
      throw new Error('uploaded bytes do not match the ticket');
    }
    const target = this.path(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' });
  }

  async read(key: string): Promise<{ readonly bytes: Uint8Array; readonly mime: string }> {
    const ticket = await this.ticket(key);
    if (!ticket.confirmed) throw new Error('blob is not confirmed');
    return { bytes: new Uint8Array(await readFile(this.path(key))), mime: ticket.mime };
  }

  async confirm(key: string): Promise<BlobMetadata> {
    const ticket = await this.ticket(key);
    const bytes = await readFile(this.path(key));
    const file = await stat(this.path(key));
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (file.size !== ticket.size || digest !== ticket.sha256) {
      throw new Error('stored bytes do not match the upload ticket');
    }
    if (!ticket.confirmed) {
      await writeFile(
        this.path(key, '.ticket.json'),
        JSON.stringify({ ...ticket, confirmed: true } satisfies Ticket),
        'utf8',
      );
    }
    return {
      key,
      mime: ticket.mime,
      size: file.size,
      sha256: new Uint8Array(Buffer.from(ticket.sha256, 'hex')),
    };
  }

  async delete(key: string): Promise<void> {
    const ignoreMissing = (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    };
    await Promise.all([
      unlink(this.path(key)).catch(ignoreMissing),
      unlink(this.path(key, '.ticket.json')).catch(ignoreMissing),
    ]);
  }
}
