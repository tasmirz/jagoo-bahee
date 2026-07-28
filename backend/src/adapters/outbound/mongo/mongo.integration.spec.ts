import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FixedClock } from '../in-memory/in-memory-stores.js';
import { InMemoryNodeSigner } from '../in-memory/in-memory-node.js';
import { MongoEnvelopeStore, MongoMerkleLog, MongoProjectionStore } from './mongo-stores.js';
import type { ParsedEnvelope } from '../../../core/domain/envelope.js';

const url = process.env.MONGO_URL;
const integration = describe.skipIf(!url);

integration('Mongo production adapters', () => {
  let client: MongoClient;
  let databaseName: string;

  beforeAll(async () => {
    client = new MongoClient(url!);
    await client.connect();
    databaseName = `jagoo_integration_${process.pid}_${randomUUID().replaceAll('-', '')}`;
  });

  afterAll(async () => {
    if (client) {
      await client.db(databaseName).dropDatabase();
      await client.close();
    }
  });

  it('VP-02 — envelope, projection, and witness leaf roll back atomically', async () => {
    const db = client.db(databaseName);
    const clock = new FixedClock(1_700_000_000_000);
    const envelopes = new MongoEnvelopeStore(db, clock, 4);
    const projections = new MongoProjectionStore(db, client);
    const witness = new MongoMerkleLog(db, new InMemoryNodeSigner(), clock);
    await envelopes.ensureIndexes();
    await witness.ensureIndexes();

    const contentId = `jb1${'a'.repeat(52)}`;
    const envelope = {
      contentId,
      priority: 4,
    } as ParsedEnvelope;

    await expect(
      projections.transaction(async (tx) => {
        await envelopes.put(envelope, new Uint8Array([1]), tx);
        const collection = projections.collection<{ id: string }>('forum_atomicity');
        await collection.put(contentId, { id: contentId }, tx);
        await expect(collection.findOne({ id: contentId })).resolves.toEqual({ id: contentId });
        await witness.append(contentId, tx);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    await expect(envelopes.has(contentId)).resolves.toBe(false);
    await expect(
      projections.collection<{ id: string }>('forum_atomicity').findOne({ id: contentId }),
    ).resolves.toBeNull();
    await expect(witness.inclusionProof(contentId)).rejects.toThrow('not in log');
  });
});
