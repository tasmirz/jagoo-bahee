import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../in-memory/in-memory-stores.js';
import { FilesystemBlobStore } from './filesystem-blob-store.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('FilesystemBlobStore', () => {
  it('writes, verifies, reads, and deletes a content-bound local blob', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jb-blobs-'));
    roots.push(root);
    const store = new FilesystemBlobStore(root, new FixedClock(1_700_000_000_000));
    const bytes = new TextEncoder().encode('offline node attachment');
    const digest = new Uint8Array(createHash('sha256').update(bytes).digest());

    await store.ready();
    const ticket = await store.presignUpload(
      'forum/12345678-1234-1234-1234-123456789abc',
      'text/plain',
      bytes.length,
      digest,
    );
    expect(ticket.url).toContain('/v1/attachments/local-upload/');

    await store.write(ticket.key, bytes);
    await expect(store.confirm(ticket.key)).resolves.toMatchObject({
      mime: 'text/plain',
      size: bytes.length,
    });
    await expect(store.read(ticket.key)).resolves.toMatchObject({ mime: 'text/plain' });

    await store.delete(ticket.key);
    await expect(store.read(ticket.key)).rejects.toThrow();
  });

  it('rejects traversal outside the configured blob root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jb-blobs-'));
    roots.push(root);
    const store = new FilesystemBlobStore(root, new FixedClock(1_700_000_000_000));
    await expect(
      store.presignUpload('../outside', 'text/plain', 1, new Uint8Array(32)),
    ).rejects.toThrow('blob key is invalid');
  });
});
