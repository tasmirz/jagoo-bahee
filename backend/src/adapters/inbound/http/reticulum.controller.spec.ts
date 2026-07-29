import { afterEach, describe, expect, it } from 'vitest';
import type { ReticulumTransport } from '../../outbound/grpc/reticulum-transport.js';
import type { SessionAuth } from '../../../core/ports/auth.port.js';
import { ReticulumController } from './reticulum.controller.js';

const key = new Uint8Array(32).fill(7);
const previousAdminKeys = process.env.ADMIN_KEYS;

const auth = {
  async verifyAccess(token: string) {
    if (token !== 'valid') throw new Error('invalid');
    return { key, tokenId: 'session' };
  },
} as SessionAuth;

afterEach(() => {
  if (previousAdminKeys === undefined) delete process.env.ADMIN_KEYS;
  else process.env.ADMIN_KEYS = previousAdminKeys;
});

describe('Reticulum admin status', () => {
  it('requires a server-enforced administrator session', async () => {
    const controller = new ReticulumController(null, auth);
    await expect(controller.status()).rejects.toMatchObject({ status: 401 });
  });

  it('returns JSON-safe interface, path and queue telemetry', async () => {
    process.env.ADMIN_KEYS = Buffer.from(key).toString('hex');
    const transport = {
      async status() {
        return {
          queue_depth: 3,
          interfaces: [
            {
              name: 'RNode 1',
              kind: 'RNodeInterface',
              up: true,
              rssi: -91,
              snr: 7,
              tx_bytes: 100n,
              rx_bytes: 200n,
            },
          ],
          paths: [{ destination_hash: 'abcd', hops: 2, last_seen_ms: 123n }],
        };
      },
    } as ReticulumTransport;
    const controller = new ReticulumController(transport, auth);
    await expect(controller.status('Bearer valid')).resolves.toEqual({
      enabled: true,
      available: true,
      queueDepth: 3,
      interfaces: [
        {
          name: 'RNode 1',
          kind: 'RNodeInterface',
          up: true,
          rssi: -91,
          snr: 7,
          txBytes: '100',
          rxBytes: '200',
        },
      ],
      paths: [{ destinationHash: 'abcd', hops: 2, lastSeenMs: '123' }],
    });
  });
});
