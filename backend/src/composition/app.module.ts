/**
 * The composition root (Plans/07 §6, ADR-002).
 *
 * The ONLY place a port is bound to an adapter. Nothing under `core/` or `features/`
 * constructs one, and nothing looks one up at a call site — dependencies are
 * constructor-injected, which is what keeps the core testable with no framework at all.
 *
 * ── Ports are abstract classes, and that is deliberate ──────────────────────────────
 * A TypeScript `interface` vanishes at runtime and cannot be a DI token. Abstract classes
 * keep the structural contract for the type checker AND give Nest a token, with no parallel
 * `Symbol` to keep in sync. `useExisting` binds one adapter to both halves of a segregated
 * port, so a consumer that only reads still depends only on the reader (ISP, AR-02).
 *
 * ── Runtime selection ───────────────────────────────────────────────────────────────
 * Production selects Mongo, Redis, and S3 through environment configuration. Tests and
 * no-infrastructure local runs use deterministic in-memory doubles through the same ports.
 * No core, feature, or controller code selects a concrete adapter.
 */

import { Module, type OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { S3Client } from '@aws-sdk/client-s3';
import { MongoClient } from 'mongodb';
import { EnvelopeController } from '../adapters/inbound/http/envelope.controller.js';
import { PostsController } from '../adapters/inbound/http/posts.controller.js';
import { AntiAbuseController } from '../adapters/inbound/http/anti-abuse.controller.js';
import { AuthController } from '../adapters/inbound/http/auth.controller.js';
import { AttachmentsController } from '../adapters/inbound/http/attachments.controller.js';
import { ForumReadController } from '../adapters/inbound/http/forum-read.controller.js';
import { EventsController } from '../adapters/inbound/http/events.controller.js';
import { LabelsController } from '../adapters/inbound/http/labels.controller.js';
import { HealthController } from '../adapters/inbound/http/health.controller.js';
import { IngressPipeline, type NonceStore } from '../core/app/ingress.js';
import { DomainRegistry } from '../core/domain/domain-registry.js';
import { EnvelopeReader, EnvelopeWriter, ProjectionStore } from '../core/ports/storage.port.js';
import { CertificateStore, SignatureVerifier } from '../core/ports/identity.port.js';
import {
  CreditLedger,
  CredentialIssuer,
  NullifierRegistry,
  PowVerifier,
} from '../core/ports/anti-abuse.port.js';
import { WitnessLog } from '../core/ports/transparency.port.js';
import { NodeSigner } from '../core/ports/node-signer.port.js';
import { SessionAuth } from '../core/ports/auth.port.js';
import { Clock, RandomSource } from '../core/ports/system.port.js';
import { BlobStore, LabelProvider } from '../core/ports/content.port.js';
import { EventBus } from '../core/ports/events.port.js';
import { TaggedCache } from '../core/ports/cache.port.js';
import {
  InMemoryEnvelopeStore,
  InMemoryProjectionStore,
  SequentialRandom,
} from '../adapters/outbound/in-memory/in-memory-stores.js';
import {
  InMemoryCreditLedger,
  InMemoryCredentialIssuer,
  InMemoryBlobStore,
  InMemoryNullifierRegistry,
  InMemoryPowVerifier,
  NullLabelProvider,
} from '../adapters/outbound/in-memory/in-memory-services.js';
import { LocalMerkleLog } from '../adapters/outbound/in-memory/local-merkle-log.js';
import {
  InMemoryNodeSigner,
  InMemoryNonceStore,
} from '../adapters/outbound/in-memory/in-memory-node.js';
import { RealSignatureVerifier } from '../adapters/outbound/in-memory/real-signature-verifier.js';
import { ProjectionCertificateStore } from '../adapters/outbound/projection-certificate-store.js';
import { SystemClock } from '../adapters/outbound/system-clock.js';
import {
  MongoEnvelopeStore,
  MongoMerkleLog,
  MongoProjectionStore,
} from '../adapters/outbound/mongo/mongo-stores.js';
import { MongoNonceStore } from '../adapters/outbound/mongo/mongo-nonce-store.js';
import {
  RedisCreditLedger,
  RedisNonceStore,
  RedisNullifierRegistry,
} from '../adapters/outbound/redis/redis-services.js';
import { StatelessArgon2Pow } from '../adapters/outbound/redis/stateless-pow.js';
import { RsaBlindCredentialIssuer } from '../adapters/outbound/redis/rsa-blind-credentials.js';
import { HmacSessionAuth } from '../adapters/outbound/redis/session-auth.js';
import { S3BlobStore } from '../adapters/outbound/s3/s3-blob-store.js';
import { InMemoryEventBus } from '../adapters/outbound/in-memory/in-memory-event-bus.js';
import { ConfiguredNodeSigner } from '../adapters/outbound/configured-node-signer.js';
import { NullTaggedCache } from '../adapters/outbound/in-memory/null-tagged-cache.js';
import { RedisTaggedCache } from '../adapters/outbound/redis/tagged-cache.js';
import { forumHandlers } from '../features/forum/index.js';
import { MONGO_RUNTIME, REDIS_RUNTIME, S3_RUNTIME, type MongoRuntime } from './runtime.js';

export const NONCE_STORE = Symbol('NonceStore');
export const NODE_ENVELOPE_STORE = Symbol('NodeEnvelopeStore');

class RuntimeLifecycle implements OnApplicationShutdown {
  constructor(
    private readonly mongo: MongoRuntime | null,
    private readonly redis: Redis | null,
    private readonly s3: S3Client | null,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis?.quit();
    await this.mongo?.client.close();
    this.s3?.destroy();
  }
}

@Module({
  controllers: [
    EnvelopeController,
    PostsController,
    AntiAbuseController,
    AuthController,
    AttachmentsController,
    ForumReadController,
    EventsController,
    LabelsController,
    HealthController,
  ],
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: RandomSource, useClass: SequentialRandom },
    { provide: EventBus, useClass: InMemoryEventBus },
    { provide: LabelProvider, useClass: NullLabelProvider },
    {
      provide: NodeSigner,
      useFactory: () => {
        const encoded = process.env.NODE_SIGNING_SEED;
        if (!encoded) {
          if (process.env.MONGO_URL || process.env.NODE_ENV === 'production') {
            throw new Error('NODE_SIGNING_SEED is required for a durable or production node');
          }
          return new InMemoryNodeSigner();
        }
        return new ConfiguredNodeSigner(new Uint8Array(Buffer.from(encoded, 'base64')));
      },
    },
    { provide: SignatureVerifier, useClass: RealSignatureVerifier },
    // Certificates are derived from the envelope log like everything else, so the store
    // reads the projections the certify/revoke handlers write (P1-G3, ADM-42).
    {
      provide: CertificateStore,
      useFactory: (projections: ProjectionStore) => new ProjectionCertificateStore(projections),
      inject: [ProjectionStore],
    },
    {
      provide: PowVerifier,
      useFactory: (clock: Clock) => {
        const encoded = process.env.POW_SECRET;
        if (!encoded) {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('POW_SECRET is required in production');
          }
          return new InMemoryPowVerifier();
        }
        const secret = Buffer.from(encoded, 'base64');
        return new StatelessArgon2Pow(secret, clock);
      },
      inject: [Clock],
    },
    {
      provide: REDIS_RUNTIME,
      useFactory: async (): Promise<Redis | null> => {
        const url = process.env.REDIS_URL;
        if (!url) {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('REDIS_URL is required in production (AUTH-32)');
          }
          return null;
        }
        const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
        await redis.connect();
        await redis.ping();
        return redis;
      },
    },
    {
      provide: S3_RUNTIME,
      useFactory: (): S3Client | null => {
        const endpoint = process.env.S3_ENDPOINT;
        if (!endpoint) {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('S3_ENDPOINT is required in production');
          }
          return null;
        }
        const accessKeyId = process.env.S3_ACCESS_KEY;
        const secretAccessKey = process.env.S3_SECRET_KEY;
        if (
          process.env.NODE_ENV === 'production' &&
          (!accessKeyId || !secretAccessKey)
        ) {
          throw new Error('S3_ACCESS_KEY and S3_SECRET_KEY are required in production');
        }
        return new S3Client({
          endpoint,
          region: process.env.S3_REGION ?? 'us-east-1',
          forcePathStyle: true,
          credentials:
            accessKeyId && secretAccessKey
              ? { accessKeyId, secretAccessKey }
              : {
                  accessKeyId: 'jagoo',
                  secretAccessKey: 'jagoo-dev-only',
                },
        });
      },
    },
    {
      provide: BlobStore,
      useFactory: (client: S3Client | null, clock: Clock) =>
        client
          ? new S3BlobStore(client, process.env.S3_BUCKET ?? 'jagoo', clock)
          : new InMemoryBlobStore(),
      inject: [S3_RUNTIME, Clock],
    },
    {
      provide: CreditLedger,
      useFactory: (redis: Redis | null, pow: PowVerifier) =>
        redis ? new RedisCreditLedger(redis, pow) : new InMemoryCreditLedger(),
      inject: [REDIS_RUNTIME, PowVerifier],
    },
    {
      provide: NullifierRegistry,
      useFactory: (redis: Redis | null) =>
        redis ? new RedisNullifierRegistry(redis) : new InMemoryNullifierRegistry(),
      inject: [REDIS_RUNTIME],
    },
    {
      provide: TaggedCache,
      useFactory: (redis: Redis | null) =>
        redis ? new RedisTaggedCache(redis) : new NullTaggedCache(),
      inject: [REDIS_RUNTIME],
    },
    {
      provide: CredentialIssuer,
      useFactory: () => {
        const encoded = process.env.CREDENTIAL_RSA_JWK;
        if (!encoded) {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('CREDENTIAL_RSA_JWK is required in production');
          }
          return process.env.REDIS_URL
            ? RsaBlindCredentialIssuer.generate()
            : new InMemoryCredentialIssuer();
        }
        return new RsaBlindCredentialIssuer(
          JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')),
        );
      },
    },
    {
      provide: NONCE_STORE,
      useFactory: async (mongo: MongoRuntime | null, redis: Redis | null) => {
        if (mongo) {
          const nonces = new MongoNonceStore(mongo.db);
          await nonces.ensureIndexes();
          return nonces;
        }
        return redis ? new RedisNonceStore(redis) : new InMemoryNonceStore();
      },
      inject: [MONGO_RUNTIME, REDIS_RUNTIME],
    },
    {
      provide: SessionAuth,
      useFactory: (verifier: SignatureVerifier, clock: Clock, redis: Redis | null) => {
        if (
          process.env.NODE_ENV === 'production' &&
          (!process.env.AUTH_ACCESS_SECRET || !process.env.AUTH_REFRESH_SECRET)
        ) {
          throw new Error('AUTH_ACCESS_SECRET and AUTH_REFRESH_SECRET are required in production');
        }
        return new HmacSessionAuth(
          verifier,
          clock,
          redis,
          process.env.AUTH_ACCESS_SECRET,
          process.env.AUTH_REFRESH_SECRET,
        );
      },
      inject: [SignatureVerifier, Clock, REDIS_RUNTIME],
    },

    // MONGO_URL opts into the production adapters. Tests and a no-infrastructure local
    // demo retain deterministic in-memory doubles through the same ports.
    {
      provide: MONGO_RUNTIME,
      useFactory: async (): Promise<MongoRuntime | null> => {
        const url = process.env.MONGO_URL;
        if (!url) {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('MONGO_URL is required in production');
          }
          return null;
        }
        const client = new MongoClient(url);
        await client.connect();
        return { client, db: client.db(process.env.MONGO_DB) };
      },
    },

    // One adapter, both halves of the segregated storage port.
    {
      provide: NODE_ENVELOPE_STORE,
      useFactory: async (clock: Clock, mongo: MongoRuntime | null) => {
        if (!mongo) return new InMemoryEnvelopeStore(clock);
        const store = new MongoEnvelopeStore(mongo.db, clock);
        await store.ensureIndexes();
        return store;
      },
      inject: [Clock, MONGO_RUNTIME],
    },
    { provide: EnvelopeReader, useExisting: NODE_ENVELOPE_STORE },
    { provide: EnvelopeWriter, useExisting: NODE_ENVELOPE_STORE },

    {
      provide: ProjectionStore,
      useFactory: (mongo: MongoRuntime | null) =>
        mongo ? new MongoProjectionStore(mongo.db, mongo.client) : new InMemoryProjectionStore(),
      inject: [MONGO_RUNTIME],
    },

    {
      provide: WitnessLog,
      useFactory: async (signer: NodeSigner, clock: Clock, mongo: MongoRuntime | null) => {
        if (!mongo) return new LocalMerkleLog(signer, clock);
        const log = new MongoMerkleLog(mongo.db, signer, clock);
        await log.ensureIndexes();
        return log;
      },
      inject: [NodeSigner, Clock, MONGO_RUNTIME],
    },

    // Feature handlers register into the registry; the pipeline never learns they exist.
    // The whole mutable surface of the application is this one list (AR-04).
    {
      provide: DomainRegistry,
      useFactory: (projections: ProjectionStore, nodeSigner: NodeSigner, blobs: BlobStore) => {
        const registry = new DomainRegistry();
        for (const handler of forumHandlers(projections, nodeSigner, blobs)) {
          registry.register(handler);
        }
        return registry;
      },
      inject: [ProjectionStore, NodeSigner, BlobStore],
    },

    {
      provide: IngressPipeline,
      useFactory: (
        registry: DomainRegistry,
        reader: EnvelopeReader,
        writer: EnvelopeWriter,
        projections: ProjectionStore,
        verifier: SignatureVerifier,
        certificates: CertificateStore,
        witness: WitnessLog,
        nonces: NonceStore,
        credits: CreditLedger,
        nullifiers: NullifierRegistry,
        credentials: CredentialIssuer,
        pow: PowVerifier,
        nodeSigner: NodeSigner,
        clock: Clock,
        events: EventBus,
        cache: TaggedCache,
      ) =>
        new IngressPipeline({
          registry,
          reader,
          writer,
          projections,
          verifier,
          certificates,
          witness,
          nonces,
          antiAbuse: { credits, nullifiers, credentials, pow },
          nodeSigner,
          clock,
          events,
          cache,
        }),
      inject: [
        DomainRegistry,
        EnvelopeReader,
        EnvelopeWriter,
        ProjectionStore,
        SignatureVerifier,
        CertificateStore,
        WitnessLog,
        NONCE_STORE,
        CreditLedger,
        NullifierRegistry,
        CredentialIssuer,
        PowVerifier,
        NodeSigner,
        Clock,
        EventBus,
        TaggedCache,
      ],
    },
    {
      provide: RuntimeLifecycle,
      useFactory: (mongo: MongoRuntime | null, redis: Redis | null, s3: S3Client | null) =>
        new RuntimeLifecycle(mongo, redis, s3),
      inject: [MONGO_RUNTIME, REDIS_RUNTIME, S3_RUNTIME],
    },
  ],
})
export class AppModule {}
