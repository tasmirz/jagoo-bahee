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
 * ── P1 status: in-memory adapters ───────────────────────────────────────────────────
 * Every port below is bound to its in-memory implementation. The Mongo and Redis adapters
 * are the next task (T1.3, T1.4, T1.13) and swapping them in is a change to THIS FILE
 * ONLY — no core, feature or controller code refers to a concrete adapter. That property is
 * the point of the whole arrangement, so it should stay true when the swap happens.
 */

import { Module } from '@nestjs/common';
import { EnvelopeController } from '../adapters/inbound/http/envelope.controller.js';
import { PostsController } from '../adapters/inbound/http/posts.controller.js';
import { IngressPipeline, type NonceStore } from '../core/app/ingress.js';
import { DomainRegistry } from '../core/domain/domain-registry.js';
import { EnvelopeReader, EnvelopeWriter, ProjectionStore } from '../core/ports/storage.port.js';
import { CertificateStore, SignatureVerifier } from '../core/ports/identity.port.js';
import {
  CreditLedger,
  CredentialIssuer,
  NullifierRegistry,
} from '../core/ports/anti-abuse.port.js';
import { WitnessLog } from '../core/ports/transparency.port.js';
import { NodeSigner } from '../core/ports/node-signer.port.js';
import { Clock, RandomSource } from '../core/ports/system.port.js';
import {
  InMemoryEnvelopeStore,
  InMemoryProjectionStore,
  SequentialRandom,
} from '../adapters/outbound/in-memory/in-memory-stores.js';
import {
  InMemoryCertificateStore,
  InMemoryCreditLedger,
  InMemoryCredentialIssuer,
  InMemoryNullifierRegistry,
} from '../adapters/outbound/in-memory/in-memory-services.js';
import { LocalMerkleLog } from '../adapters/outbound/in-memory/local-merkle-log.js';
import {
  InMemoryNodeSigner,
  InMemoryNonceStore,
} from '../adapters/outbound/in-memory/in-memory-node.js';
import { RealSignatureVerifier } from '../adapters/outbound/in-memory/real-signature-verifier.js';
import { SystemClock } from '../adapters/outbound/system-clock.js';
import { PostCreateHandler } from '../features/forum/post/post-create.handler.js';
import { CommentCreateHandler } from '../features/forum/comment/comment-create.handler.js';
import { VoteCastHandler } from '../features/forum/vote/vote-cast.handler.js';

export const NONCE_STORE = Symbol('NonceStore');

@Module({
  controllers: [EnvelopeController, PostsController],
  providers: [
    { provide: Clock, useClass: SystemClock },
    { provide: RandomSource, useClass: SequentialRandom },
    { provide: NodeSigner, useClass: InMemoryNodeSigner },
    { provide: SignatureVerifier, useClass: RealSignatureVerifier },
    { provide: CertificateStore, useClass: InMemoryCertificateStore },
    { provide: CreditLedger, useClass: InMemoryCreditLedger },
    { provide: NullifierRegistry, useClass: InMemoryNullifierRegistry },
    { provide: CredentialIssuer, useClass: InMemoryCredentialIssuer },
    { provide: ProjectionStore, useClass: InMemoryProjectionStore },
    { provide: NONCE_STORE, useClass: InMemoryNonceStore },

    // One adapter, both halves of the segregated storage port.
    { provide: InMemoryEnvelopeStore, useFactory: (c: Clock) => new InMemoryEnvelopeStore(c), inject: [Clock] },
    { provide: EnvelopeReader, useExisting: InMemoryEnvelopeStore },
    { provide: EnvelopeWriter, useExisting: InMemoryEnvelopeStore },

    {
      provide: WitnessLog,
      useFactory: (signer: NodeSigner, clock: Clock) => new LocalMerkleLog(signer, clock),
      inject: [NodeSigner, Clock],
    },

    // Feature handlers register into the registry; the pipeline never learns they exist.
    {
      provide: DomainRegistry,
      useFactory: (projections: ProjectionStore) => {
        const registry = new DomainRegistry();
        registry.register(new PostCreateHandler(projections));
        registry.register(new CommentCreateHandler(projections));
        registry.register(new VoteCastHandler(projections));
        return registry;
      },
      inject: [ProjectionStore],
    },

    {
      provide: IngressPipeline,
      useFactory: (
        registry: DomainRegistry,
        envelopes: InMemoryEnvelopeStore,
        projections: ProjectionStore,
        verifier: SignatureVerifier,
        certificates: CertificateStore,
        witness: WitnessLog,
        nonces: NonceStore,
        credits: CreditLedger,
        nullifiers: NullifierRegistry,
        credentials: CredentialIssuer,
        nodeSigner: NodeSigner,
        clock: Clock,
      ) =>
        new IngressPipeline({
          registry,
          reader: envelopes,
          writer: envelopes,
          projections,
          verifier,
          certificates,
          witness,
          nonces,
          antiAbuse: { credits, nullifiers, credentials },
          nodeSigner,
          clock,
        }),
      inject: [
        DomainRegistry,
        InMemoryEnvelopeStore,
        ProjectionStore,
        SignatureVerifier,
        CertificateStore,
        WitnessLog,
        NONCE_STORE,
        CreditLedger,
        NullifierRegistry,
        CredentialIssuer,
        NodeSigner,
        Clock,
      ],
    },
  ],
})
export class AppModule {}
