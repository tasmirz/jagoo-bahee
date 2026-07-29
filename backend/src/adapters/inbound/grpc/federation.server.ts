/**
 * The federation gRPC server's lifecycle (T2.1, ADR-007).
 *
 * Owned by `composition/`, alongside the existing `RuntimeLifecycle` that closes Mongo,
 * Redis and S3. `main.ts` gains no `connectMicroservice` call, because this is not a Nest
 * microservice.
 *
 * ── AR-12: federation is off unless configured ─────────────────────────────────────
 * A node with `FEDERATION_GRPC_LISTEN` unset never constructs this class and behaves
 * exactly as it did in P1. A node in outbound-only mode (FD-12, the default for a home or
 * community node) also never constructs it: it federates fully through connections it
 * initiates, and binding a port it cannot receive on would be a lie in its own directory.
 */

import { createServer, type Server } from 'nice-grpc';
import { ServerCredentials } from '@grpc/grpc-js';
import { FederationWireDefinition } from './raw-envelope-codec.js';
import type { FederationRpcServer } from './federation.contract.js';
import type { FederationService } from './federation.service.js';

export interface FederationServerOptions {
  /** `host:port`. `0.0.0.0:8444` in a container, `127.0.0.1:0` in a test. */
  readonly listen: string;
  readonly credentials?: ServerCredentials;
}

export class FederationGrpcServer {
  private server: Server | null = null;
  private boundPort = 0;

  constructor(
    private readonly service: FederationService,
    private readonly options: FederationServerOptions,
  ) {}

  async start(): Promise<number> {
    if (this.server) return this.boundPort;
    const server = createServer();

    // The definition, not the service class, decides the wire shape — and the definition is
    // generated from the frozen proto, with only the three `Envelope` codecs replaced
    // (ADR-008 §1).
    //
    // `implementation` is checked against `FederationRpcServer`, which is stated in the
    // generated message types. The cast that follows crosses into nice-grpc's derived
    // request/response types, which are unusable here for the reason recorded in
    // `federation.contract.ts` — a ts-proto `Exact<>` generic resolved through
    // `Parameters<>`. One cast, at the one place the two type systems meet.
    const implementation: FederationRpcServer = {
      announce: this.service.announce,
      deliver: this.service.deliver,
      streamActivities: this.service.streamActivities.bind(this.service),
      backfill: this.service.backfill.bind(this.service),
      exchangeTreeHeads: this.service.exchangeTreeHeads,
      exchangeDirectory: this.service.exchangeDirectory,
    };
    server.add(
      FederationWireDefinition,
      implementation as unknown as Parameters<typeof server.add>[1],
    );
    this.boundPort = await server.listen(
      this.options.listen,
      this.options.credentials ?? ServerCredentials.createInsecure(),
    );
    this.server = server;
    return this.boundPort;
  }

  get port(): number {
    return this.boundPort;
  }

  /** Graceful: existing calls finish. A `Deliver` stream cut mid-batch would be re-sent
   * anyway, but re-sending is work both sides can avoid by simply waiting. */
  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (server) await server.shutdown();
  }
}
