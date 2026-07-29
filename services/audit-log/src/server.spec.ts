import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Plane,
  buildEnvelope,
  canonicalBytes,
  createAuditCertificate,
  receiptSigningBytes,
  sealEnvelope,
  serverId,
  sthSigningBytes,
  type AuditReceiptJson,
  type OfflineReceipt,
  type OfflineTreeHead,
} from '@jagoo/sdk';
import { ed25519 } from '@jagoo/sdk/crypto';
import { createAuditLogServer } from './server.js';

const apps: ReturnType<typeof createAuditLogServer>[] = [];

function validCertificate() {
  const authorSeed = new Uint8Array(32).fill(7);
  const authorKey = ed25519.derivePublicKey(authorSeed);
  const unsigned = buildEnvelope({
    domain: 'jb:profile:update:v1',
    plane: Plane.FORUM,
    authorKey,
    body: new Uint8Array([1]),
    nowMs: 1_700_000_000_000n,
    nonce: new Uint8Array(16).fill(9),
  });
  const sealed = sealEnvelope(unsigned, ed25519.sign(canonicalBytes(unsigned), authorSeed));
  const nodeSeed = new Uint8Array(32).fill(3);
  const nodeKey = ed25519.derivePublicKey(nodeSeed);
  const rootHash = new Uint8Array(
    createHash('sha256')
      .update(Buffer.concat([Buffer.from([0]), Buffer.from(sealed.contentId)]))
      .digest(),
  );
  const unsignedSth = {
    treeSize: 1,
    rootHash,
    timestampMs: 1_700_000_000_100,
  };
  const sth: OfflineTreeHead = {
    ...unsignedSth,
    serverKey: nodeKey,
    signature: ed25519.sign(sthSigningBytes(unsignedSth), nodeSeed),
  };
  const receiptWithoutSignature: Omit<OfflineReceipt, 'signature'> = {
    contentId: sealed.contentId,
    logIndex: 0,
    leafIndex: 0,
    acceptedAtMs: 1_700_000_000_100,
    serverId: serverId(nodeKey),
    serverKey: nodeKey,
    sth,
    inclusionProof: [],
  };
  const receipt: AuditReceiptJson = {
    content_id: sealed.contentId,
    log_index: 0,
    leaf_index: 0,
    accepted_at_ms: receiptWithoutSignature.acceptedAtMs,
    server_id: receiptWithoutSignature.serverId,
    server_key: Buffer.from(nodeKey).toString('base64'),
    signature: Buffer.from(
      ed25519.sign(receiptSigningBytes(receiptWithoutSignature), nodeSeed),
    ).toString('base64'),
    sth: {
      tree_size: sth.treeSize,
      server_key: Buffer.from(sth.serverKey).toString('base64'),
      root_hash: Buffer.from(sth.rootHash).toString('base64'),
      timestamp_ms: sth.timestampMs,
      signature: Buffer.from(sth.signature).toString('base64'),
    },
    inclusion_proof: [],
  };
  const requestBody = new TextEncoder().encode(
    JSON.stringify({ envelope: Buffer.from(sealed.wireBytes).toString('base64') }),
  );
  return createAuditCertificate(requestBody, receipt);
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('independent audit log service', () => {
  it('verifies and stores a certificate in its append-only chain', async () => {
    const app = createAuditLogServer({ dataFile: null });
    apps.push(app);
    const certificate = validCertificate();
    const stored = await app.inject({
      method: 'POST',
      url: '/v1/audit-records',
      payload: certificate,
    });
    expect(stored.statusCode, stored.body).toBe(201);
    expect(stored.json()).toMatchObject({
      accepted: true,
      identifier: certificate.identifier,
      duplicate: false,
    });

    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/audit-records',
      payload: certificate,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json().duplicate).toBe(true);

    const retrieved = await app.inject({
      method: 'GET',
      url: `/v1/audit-records/${certificate.identifier}`,
    });
    expect(retrieved.statusCode).toBe(200);
    expect(retrieved.json().items).toHaveLength(1);
    expect(retrieved.json().items[0].recordHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a tampered certificate', async () => {
    const app = createAuditLogServer({ dataFile: null });
    apps.push(app);
    const certificate = validCertificate();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/audit-records',
      payload: { ...certificate, identifier: `${certificate.identifier}x` },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().valid).toBe(false);
  });
});
