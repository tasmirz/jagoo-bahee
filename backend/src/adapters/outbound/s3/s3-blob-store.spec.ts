import { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { S3BlobStore } from './s3-blob-store.js';

const credentials = { accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' };
const clock = { nowMs: () => 1_700_000_000_000 };

describe('S3BlobStore public presigning endpoint', () => {
  it('signs upload URLs for the reachable public host, not the node-only S3 host', async () => {
    const internal = new S3Client({
      endpoint: 'http://minio:9000',
      region: 'us-east-1',
      credentials,
      forcePathStyle: true,
    });
    const publicClient = new S3Client({
      endpoint: 'http://bore.pub:9000',
      region: 'us-east-1',
      credentials,
      forcePathStyle: true,
    });
    const store = new S3BlobStore(internal, 'jagoo', clock, 60, publicClient);

    const ticket = await store.presignUpload('forum/example', 'image/png', 4, new Uint8Array(32));
    expect(new URL(ticket.url).host).toBe('bore.pub:9000');
    expect(ticket.url).toContain('X-Amz-Signature=');
  });
});
