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
import { APP_INTERCEPTOR } from '@nestjs/core';
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
import { DiscoveryController } from '../adapters/inbound/http/discovery.controller.js';
import { EvidenceController } from '../adapters/inbound/http/evidence.controller.js';
import { SecurityHeadersInterceptor } from '../adapters/inbound/http/security-headers.interceptor.js';
import { RequestSecurityInterceptor } from '../adapters/inbound/http/request-security.interceptor.js';
import { ObservabilityInterceptor } from '../adapters/inbound/http/observability.interceptor.js';
import { AdminController } from '../adapters/inbound/http/admin.controller.js';
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
import { FilesystemBlobStore } from '../adapters/outbound/filesystem/filesystem-blob-store.js';
import { InMemoryEventBus } from '../adapters/outbound/in-memory/in-memory-event-bus.js';
import { ConfiguredNodeSigner } from '../adapters/outbound/configured-node-signer.js';
import { NullTaggedCache } from '../adapters/outbound/in-memory/null-tagged-cache.js';
import { RedisTaggedCache } from '../adapters/outbound/redis/tagged-cache.js';
import { RequestSecurity } from '../core/ports/request-security.port.js';
import { InMemoryRequestSecurity } from '../adapters/outbound/in-memory/in-memory-request-security.js';
import { RedisRequestSecurity } from '../adapters/outbound/redis/redis-request-security.js';
import { Observability } from '../core/ports/observability.port.js';
import { InMemoryObservability } from '../adapters/outbound/in-memory/in-memory-observability.js';
import { OperatorConfig } from '../core/ports/operator-config.port.js';
import { InMemoryOperatorConfig } from '../adapters/outbound/in-memory/in-memory-operator-config.js';
import { RedisOperatorConfig } from '../adapters/outbound/redis/redis-operator-config.js';
import { forumHandlers } from '../features/forum/index.js';
import { signalHandlers } from '../features/signal/index.js';
import { MONGO_RUNTIME, REDIS_RUNTIME, S3_RUNTIME, type MongoRuntime } from './runtime.js';
import { ServiceDirectory } from '../core/ports/service-directory.port.js';
import { ConfiguredServiceDirectory } from '../adapters/outbound/configured-service-directory.js';
import { serverId as serverIdOf } from '@jagoo/sdk/core';
import { FederationController } from '../adapters/inbound/http/federation.controller.js';
import { SignalReadController } from '../adapters/inbound/http/signal-read.controller.js';
import {
  FederationLedger,
  FederationOut,
  FederationOutbox,
  FederationSender,
  PeerDirectory,
  PeerQuotaLimiter,
} from '../core/ports/network.port.js';
import { OperatorAlerts } from '../core/ports/alerts.port.js';
import { FederationInbox, type NodeIdentity } from '../core/app/federation-inbox.js';
import { FederationOutboxService } from '../core/app/federation-outbox.js';
import { FederationSync } from '../core/app/federation-sync.js';
import {
  InMemoryFederationLedger,
  InMemoryFederationOutbox,
} from '../adapters/outbound/in-memory/in-memory-federation.js';
import {
  InMemoryOperatorAlerts,
  InMemoryPeerQuotaLimiter,
} from '../adapters/outbound/in-memory/in-memory-quota.js';
import { InMemoryPeerDirectory } from '../adapters/outbound/in-memory/in-memory-services.js';
import {
  MongoFederationLedger,
  MongoFederationOutbox,
  MongoPeerDirectory,
} from '../adapters/outbound/mongo/mongo-federation.js';
import {
  RedisOperatorAlerts,
  RedisPeerQuotaLimiter,
} from '../adapters/outbound/redis/redis-federation.js';
import { FederationService } from '../adapters/inbound/grpc/federation.service.js';
import { FederationGrpcServer } from '../adapters/inbound/grpc/federation.server.js';
import { GrpcFederationSender } from '../adapters/outbound/grpc/federation-client.js';
import { FEDERATION_CONFIG, loadFederationConfig, type FederationConfig } from './federation.config.js';
import { FederationRuntime } from './federation.runtime.js';

// ── P3 · ISP availability and bridging ────────────────────────────────────────────────
import { TransportController } from '../adapters/inbound/http/transport.controller.js';
import { TunnelController } from '../adapters/inbound/http/tunnel.controller.js';
import {
  BridgeRelay,
  LocalDiscovery,
  NatTraversal,
  ScopeProbe,
  UplinkManager,
} from '../core/ports/transport.port.js';
import { PathRouter } from '../core/app/path-router.js';
import { BridgeRelayService } from '../core/app/bridge-relay.js';
import { TransportSupervisor } from '../core/app/transport-supervisor.js';
import { ReverseTunnelExchange } from '../core/app/reverse-tunnel.js';
import { PathSelector } from '../core/ports/network.port.js';
import { TcpScopeProbe } from '../adapters/outbound/transport/tcp-probe.js';
import { ConfiguredUplinkManager } from '../adapters/outbound/transport/configured-uplinks.js';
import { UdpNatTraversal } from '../adapters/outbound/transport/nat-traversal.js';
import { MulticastLocalDiscovery } from '../adapters/outbound/transport/local-discovery.js';
import { ReverseTunnelClient } from '../adapters/outbound/transport/reverse-tunnel-client.js';
import { TRANSPORT_STATE, TransportRuntime } from './transport.runtime.js';
import { TRANSPORT_CONFIG, loadTransportConfig, type TransportConfig } from './transport.config.js';

export const NONCE_STORE = Symbol('NonceStore');
export const NODE_ENVELOPE_STORE = Symbol('NodeEnvelopeStore');
export const NODE_IDENTITY = Symbol('NodeIdentity');
export const FEDERATION_GRPC_SERVER = Symbol('FederationGrpcServer');

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
    DiscoveryController,
    EvidenceController,
    AdminController,
    FederationController,
    SignalReadController,
    TransportController,
    TunnelController,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: SecurityHeadersInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestSecurityInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ObservabilityInterceptor },
    { provide: Observability, useClass: InMemoryObservability },
    { provide: Clock, useClass: SystemClock },
    { provide: RandomSource, useClass: SequentialRandom },
    { provide: EventBus, useClass: InMemoryEventBus },
    { provide: ServiceDirectory, useClass: ConfiguredServiceDirectory },
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
          if (process.env.NODE_ENV === 'production' && !process.env.BLOB_FILESYSTEM_ROOT) {
            throw new Error('S3_ENDPOINT or BLOB_FILESYSTEM_ROOT is required in production');
          }
          return null;
        }
        const accessKeyId = process.env.S3_ACCESS_KEY;
        const secretAccessKey = process.env.S3_SECRET_KEY;
        if (process.env.NODE_ENV === 'production' && (!accessKeyId || !secretAccessKey)) {
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
        process.env.BLOB_FILESYSTEM_ROOT
          ? new FilesystemBlobStore(process.env.BLOB_FILESYSTEM_ROOT, clock)
          : client
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
      provide: RequestSecurity,
      useFactory: (redis: Redis | null) =>
        redis
          ? new RedisRequestSecurity(redis, Number(process.env.REQUEST_LIMIT_PER_MINUTE ?? 300))
          : new InMemoryRequestSecurity(Number(process.env.REQUEST_LIMIT_PER_MINUTE ?? 300)),
      inject: [REDIS_RUNTIME],
    },
    {
      provide: OperatorConfig,
      useFactory: (redis: Redis | null) => {
        const requestLimit = Number(process.env.REQUEST_LIMIT_PER_MINUTE ?? 300);
        const registrationsOpen = process.env.REGISTRATIONS_OPEN !== 'false';
        return redis
          ? new RedisOperatorConfig(redis, requestLimit, registrationsOpen)
          : new InMemoryOperatorConfig(requestLimit, registrationsOpen);
      },
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
          // Keep the tiny deterministic issuer only in the unit-test composition. A
          // dependency-free development node must expose the same blind-credential
          // protocol as a durable node so the app and demo seeder are truly runnable.
          return process.env.NODE_ENV === 'test'
            ? new InMemoryCredentialIssuer()
            : RsaBlindCredentialIssuer.generate();
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
      useFactory: (
        projections: ProjectionStore,
        nodeSigner: NodeSigner,
        blobs: BlobStore,
        operatorConfig: OperatorConfig,
      ) => {
        const registry = new DomainRegistry();
        const enabledPlanes = new Set(
          (process.env.NODE_PLANES ?? 'FORUM,SIGNAL')
            .split(',')
            .map((value) => value.trim().toUpperCase()),
        );
        if (enabledPlanes.has('FORUM')) {
          for (const handler of forumHandlers(projections, nodeSigner, blobs, operatorConfig)) {
            registry.register(handler);
          }
        }
        if (enabledPlanes.has('SIGNAL')) {
          for (const handler of signalHandlers(projections)) {
            registry.register(handler);
          }
        }
        return registry;
      },
      inject: [ProjectionStore, NodeSigner, BlobStore, OperatorConfig],
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
        federation: FederationOut,
        federationLedger: FederationLedger,
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
          // Step 19 fanout and the ADR-008 §2 direction row. Both optional in the
          // pipeline's own contract, so a P1-shaped node with federation off is unchanged.
          federation,
          federationLedger,
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
        FederationOut,
        FederationLedger,
      ],
    },
    {
      provide: RuntimeLifecycle,
      useFactory: (mongo: MongoRuntime | null, redis: Redis | null, s3: S3Client | null) =>
        new RuntimeLifecycle(mongo, redis, s3),
      inject: [MONGO_RUNTIME, REDIS_RUNTIME, S3_RUNTIME],
    },

    // ── P2 · Federation ─────────────────────────────────────────────────────────────
    // Every binding below follows the same shape as the P1 ports: a Mongo/Redis adapter
    // when the node is durable, an in-memory double otherwise, chosen HERE and nowhere
    // else. AR-12 holds — with no peers and no listen address the runtime binds nothing
    // and the node behaves exactly as it did in P1.
    {
      provide: FEDERATION_CONFIG,
      useFactory: (): FederationConfig => loadFederationConfig(process.env, serverIdOf),
    },
    {
      provide: NODE_IDENTITY,
      useFactory:
        (signer: NodeSigner, config: FederationConfig) => (): NodeIdentity => ({
          serverId: signer.serverId,
          publicKey: signer.publicKey,
          displayName: config.displayName,
          software: 'jagoo-bahee',
          version: '2.0.0',
          endpoints: config.endpoints,
          planes: config.planes,
          acceptedClasses: config.acceptedClasses,
          // Advertised on the handshake so a peer can filter its streams. Empty means "ask
          // me for everything"; the frozen contract has no way to say "I host none".
          communities: [],
          channels: [],
        }),
      inject: [NodeSigner, FEDERATION_CONFIG],
    },
    {
      provide: PeerDirectory,
      useFactory: async (mongo: MongoRuntime | null) => {
        if (!mongo) return new InMemoryPeerDirectory();
        const directory = new MongoPeerDirectory(mongo.db);
        await directory.ensureIndexes();
        return directory;
      },
      inject: [MONGO_RUNTIME],
    },
    {
      provide: FederationLedger,
      useFactory: async (mongo: MongoRuntime | null) => {
        if (!mongo) return new InMemoryFederationLedger();
        const ledger = new MongoFederationLedger(mongo.db);
        // FD-05 — the unique `(content_id, direction)` index is DECLARED, not assumed.
        // v1's dedupe was a race because this line did not exist.
        await ledger.ensureIndexes();
        return ledger;
      },
      inject: [MONGO_RUNTIME],
    },
    {
      provide: FederationOutbox,
      useFactory: async (mongo: MongoRuntime | null) => {
        if (!mongo) return new InMemoryFederationOutbox();
        const outbox = new MongoFederationOutbox(mongo.db);
        await outbox.ensureIndexes();
        return outbox;
      },
      inject: [MONGO_RUNTIME],
    },
    {
      provide: PeerQuotaLimiter,
      useFactory: (redis: Redis | null) =>
        redis ? new RedisPeerQuotaLimiter(redis) : new InMemoryPeerQuotaLimiter(),
      inject: [REDIS_RUNTIME],
    },
    {
      provide: OperatorAlerts,
      useFactory: (redis: Redis | null) =>
        redis ? new RedisOperatorAlerts(redis) : new InMemoryOperatorAlerts(),
      inject: [REDIS_RUNTIME],
    },
    {
      provide: FederationSender,
      useFactory: (
        signer: NodeSigner,
        clock: Clock,
        random: RandomSource,
        identity: () => NodeIdentity,
        // P3 — the selector decides WHICH uplink carries each connection and binds the
        // socket to its source address (TP-08), and is told whether the dial worked.
        paths: PathSelector,
      ) => new GrpcFederationSender({ signer, clock, random, identity, paths }),
      inject: [NodeSigner, Clock, RandomSource, NODE_IDENTITY, PathSelector],
    },
    {
      provide: FederationInbox,
      useFactory: (
        pipeline: IngressPipeline,
        peers: PeerDirectory,
        ledger: FederationLedger,
        reader: EnvelopeReader,
        witness: WitnessLog,
        quotas: PeerQuotaLimiter,
        verifier: SignatureVerifier,
        clock: Clock,
        identity: () => NodeIdentity,
        alerts: OperatorAlerts,
        observability: Observability,
        config: FederationConfig,
      ) =>
        new FederationInbox({
          pipeline,
          peers,
          ledger,
          reader,
          witness,
          quotas,
          verifier,
          clock,
          identity,
          alerts,
          observability,
          adminTrust: (serverId) =>
            config.peers.find((peer) => peer.serverId === serverId)?.trust,
        }),
      inject: [
        IngressPipeline,
        PeerDirectory,
        FederationLedger,
        EnvelopeReader,
        WitnessLog,
        PeerQuotaLimiter,
        SignatureVerifier,
        Clock,
        NODE_IDENTITY,
        OperatorAlerts,
        Observability,
        FEDERATION_CONFIG,
      ],
    },
    {
      provide: FederationOutboxService,
      useFactory: (
        outbox: FederationOutbox,
        peers: PeerDirectory,
        ledger: FederationLedger,
        sender: FederationSender,
        reader: EnvelopeReader,
        projections: ProjectionStore,
        clock: Clock,
        alerts: OperatorAlerts,
        bridge: BridgeRelay,
      ) =>
        new FederationOutboxService({
          outbox,
          peers,
          ledger,
          sender,
          reader,
          projections,
          clock,
          alerts,
          // BR-01…BR-05 — gates CROSSINGS only. With one uplink nothing is a crossing.
          bridge,
        }),
      inject: [
        FederationOutbox,
        PeerDirectory,
        FederationLedger,
        FederationSender,
        EnvelopeReader,
        ProjectionStore,
        Clock,
        OperatorAlerts,
        BridgeRelay,
      ],
    },
    // Step 19 fanout goes through the durable queue. The pipeline knows only `FederationOut`.
    { provide: FederationOut, useExisting: FederationOutboxService },
    {
      provide: FederationSync,
      useFactory: (
        peers: PeerDirectory,
        ledger: FederationLedger,
        sender: FederationSender,
        inbox: FederationInbox,
        reader: EnvelopeReader,
        pipeline: IngressPipeline,
        clock: Clock,
        signer: NodeSigner,
      ) =>
        new FederationSync({
          peers,
          ledger,
          sender,
          inbox,
          reader,
          pipeline,
          clock,
          selfServerId: () => signer.serverId,
        }),
      inject: [
        PeerDirectory,
        FederationLedger,
        FederationSender,
        FederationInbox,
        EnvelopeReader,
        IngressPipeline,
        Clock,
        NodeSigner,
      ],
    },
    {
      provide: FederationService,
      useFactory: (
        inbox: FederationInbox,
        peers: PeerDirectory,
        ledger: FederationLedger,
        witness: WitnessLog,
        signer: NodeSigner,
        clock: Clock,
        identity: () => NodeIdentity,
        config: FederationConfig,
      ) =>
        new FederationService({
          inbox,
          peers,
          ledger,
          witness,
          signer,
          clock,
          identity,
          outboundOnly: config.outboundOnly,
        }),
      inject: [
        FederationInbox,
        PeerDirectory,
        FederationLedger,
        WitnessLog,
        NodeSigner,
        Clock,
        NODE_IDENTITY,
        FEDERATION_CONFIG,
      ],
    },
    {
      provide: FEDERATION_GRPC_SERVER,
      useFactory: (service: FederationService, config: FederationConfig) =>
        // FD-12 — no listen address means no bound port. The node still federates in both
        // directions over connections it initiates (FD-11).
        config.listen && !config.outboundOnly
          ? new FederationGrpcServer(service, { listen: config.listen })
          : null,
      inject: [FederationService, FEDERATION_CONFIG],
    },
    {
      provide: FederationRuntime,
      useFactory: (
        config: FederationConfig,
        peers: PeerDirectory,
        outbox: FederationOutboxService,
        sync: FederationSync,
        server: FederationGrpcServer | null,
        sender: FederationSender,
      ) =>
        new FederationRuntime(
          config,
          peers,
          outbox,
          sync,
          server,
          sender instanceof GrpcFederationSender ? sender : null,
        ),
      inject: [
        FEDERATION_CONFIG,
        PeerDirectory,
        FederationOutboxService,
        FederationSync,
        FEDERATION_GRPC_SERVER,
        FederationSender,
      ],
    },

    // ── P3 · ISP availability and bridging ──────────────────────────────────────────
    // AR-12 one rung up: with no `UPLINKS` this whole block resolves to one implicit
    // uplink that declares every scope, binds nothing and probes nothing — a P2-shaped
    // node is bit-for-bit unchanged, and the resilience machinery costs it nothing.
    {
      provide: TRANSPORT_CONFIG,
      useFactory: (): TransportConfig => loadTransportConfig(process.env),
    },
    { provide: ScopeProbe, useClass: TcpScopeProbe },
    {
      provide: UplinkManager,
      useFactory: (config: TransportConfig, prober: ScopeProbe, clock: Clock) =>
        new ConfiguredUplinkManager({
          uplinks: config.uplinks,
          probe: config.probe,
          prober,
          clock,
        }),
      inject: [TRANSPORT_CONFIG, ScopeProbe, Clock],
    },
    {
      provide: PathSelector,
      useFactory: (
        uplinks: UplinkManager,
        peers: PeerDirectory,
        clock: Clock,
        random: RandomSource,
        observability: Observability,
      ) => new PathRouter({ uplinks, peers, clock, random, observability }),
      inject: [UplinkManager, PeerDirectory, Clock, RandomSource, Observability],
    },
    {
      provide: BridgeRelayService,
      useFactory: (
        config: TransportConfig,
        peers: PeerDirectory,
        paths: PathSelector,
        uplinks: UplinkManager,
        clock: Clock,
      ) => new BridgeRelayService({ config: config.bridge, peers, paths, uplinks, clock }),
      inject: [TRANSPORT_CONFIG, PeerDirectory, PathSelector, UplinkManager, Clock],
    },
    { provide: BridgeRelay, useExisting: BridgeRelayService },
    {
      provide: TransportSupervisor,
      useFactory: (
        uplinks: UplinkManager,
        peers: PeerDirectory,
        sync: FederationSync,
        clock: Clock,
        bridge: BridgeRelayService,
        observability: Observability,
        alerts: OperatorAlerts,
      ) =>
        new TransportSupervisor({ uplinks, peers, sync, clock, bridge, observability, alerts }),
      inject: [
        UplinkManager,
        PeerDirectory,
        FederationSync,
        Clock,
        BridgeRelayService,
        Observability,
        OperatorAlerts,
      ],
    },
    {
      provide: ReverseTunnelExchange,
      useFactory: (clock: Clock) => new ReverseTunnelExchange({ clock }),
      inject: [Clock],
    },
    {
      provide: NatTraversal,
      useFactory: (config: TransportConfig, clock: Clock) =>
        // TP-14/TP-15 are opt-in: an unsolicited SSDP burst is a fingerprint, and on a
        // hostile network a fingerprint is a target.
        config.nat.upnp || config.nat.natPmp || config.nat.stunServers.length > 0
          ? new UdpNatTraversal({
              clock,
              upnp: config.nat.upnp,
              natPmp: config.nat.natPmp,
              stunServers: config.nat.stunServers,
            })
          : null,
      inject: [TRANSPORT_CONFIG, Clock],
    },
    {
      provide: LocalDiscovery,
      useFactory: (config: TransportConfig, clock: Clock) =>
        config.localDiscovery
          ? new MulticastLocalDiscovery({ clock, httpPort: Number(process.env.PORT ?? 3000) })
          : null,
      inject: [TRANSPORT_CONFIG, Clock],
    },
    {
      provide: ReverseTunnelClient,
      useFactory: (
        config: TransportConfig,
        signer: NodeSigner,
        clock: Clock,
        random: RandomSource,
      ) => {
        const through = config.tunnel.through;
        if (!through) return null;
        // `serverId@https://host` — the id is checked by the exit node's TRUSTED lookup, and
        // carrying it here means a misconfigured origin fails loudly rather than tunnelling
        // to a stranger.
        const origin = through.includes('@') ? through.slice(through.indexOf('@') + 1) : through;
        return new ReverseTunnelClient({
          signer,
          clock,
          random,
          exitOrigin: origin.replace(/\/$/, ''),
          localOrigin: `http://127.0.0.1:${Number(process.env.PORT ?? 3000)}`,
        });
      },
      inject: [TRANSPORT_CONFIG, NodeSigner, Clock, RandomSource],
    },
    {
      provide: TransportRuntime,
      useFactory: (
        config: TransportConfig,
        uplinks: UplinkManager,
        supervisor: TransportSupervisor,
        bridge: BridgeRelayService,
        nat: NatTraversal | null,
        discovery: LocalDiscovery | null,
        tunnel: ReverseTunnelClient | null,
        signer: NodeSigner,
        federation: FederationConfig,
      ) =>
        new TransportRuntime({
          config,
          uplinks,
          supervisor,
          bridge,
          nat,
          discovery,
          tunnel,
          nodeIdentity: () => ({
            serverId: signer.serverId,
            displayName: federation.displayName,
          }),
          grpcPort: Number(federation.listen?.split(':').pop() ?? 8444),
        }),
      inject: [
        TRANSPORT_CONFIG,
        UplinkManager,
        TransportSupervisor,
        BridgeRelayService,
        NatTraversal,
        LocalDiscovery,
        ReverseTunnelClient,
        NodeSigner,
        FEDERATION_CONFIG,
      ],
    },
    {
      provide: TRANSPORT_STATE,
      useExisting: TransportRuntime,
    },
  ],
})
export class AppModule {}
