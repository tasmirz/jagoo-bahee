// Same MONGO_URL / NODE_SIGNING_SEED the node itself boots from — an operator who has
// configured `backend/.env` must not have to re-export them to rebuild projections.
import '../composition/load-env.js';
import { MongoClient } from 'mongodb';
import { DomainRegistry } from '../core/domain/domain-registry.js';
import { ProjectionRebuilder } from '../core/app/projection-rebuilder.js';
import { SystemClock } from '../adapters/outbound/system-clock.js';
import {
  MongoEnvelopeStore,
  MongoProjectionStore,
} from '../adapters/outbound/mongo/mongo-stores.js';
import { ConfiguredNodeSigner } from '../adapters/outbound/configured-node-signer.js';
import { forumHandlers } from '../features/forum/index.js';

async function main(): Promise<void> {
  const url = process.env.MONGO_URL;
  if (!url) throw new Error('MONGO_URL is required');
  const signingSeed = process.env.NODE_SIGNING_SEED;
  if (!signingSeed) throw new Error('NODE_SIGNING_SEED is required');
  const client = new MongoClient(url);
  await client.connect();
  try {
    const db = client.db(process.env.MONGO_DB);
    const projections = new MongoProjectionStore(db, client);
    const reader = new MongoEnvelopeStore(db, new SystemClock());
    const registry = new DomainRegistry();
    for (
      const handler of forumHandlers(
        projections,
        new ConfiguredNodeSigner(new Uint8Array(Buffer.from(signingSeed, 'base64'))),
      )
    ) {
      registry.register(handler);
    }
    const report = await new ProjectionRebuilder(reader, projections, registry).rebuild();
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await client.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
