/**
 * Two independent nodes, real gRPC over loopback (T2.16).
 *
 * ── Independent means independent ──────────────────────────────────────────────────
 * Separate stores, separate Merkle logs, separate node keys, separate certificate stores,
 * separate nonce stores. Sharing any of them would let a test pass because both nodes read
 * the same rows rather than because federation actually transferred and re-verified
 * anything — the exact false green `ops/docker-compose.yml` calls out for the container
 * harness, and it is just as easy to hit in process.
 *
 * ── The only shared thing is time ──────────────────────────────────────────────────
 * Both nodes use a `FixedClock` at the same instant. That is not a shortcut around clock
 * skew: it removes wall-clock flake from a suite whose subject is federation, and the
 * skew paths themselves are covered where they belong, by `announce.spec.ts` (±5 min
 * handshake window) and `peer-auth`'s 60-second call window.
 *
 * ── Everything below the gRPC boundary is the production code path ─────────────────
 * The real 19-step pipeline, the real Ed25519 verifier, the real Merkle log, the real
 * outbox with its real backoff, the real trust evaluation. The doubles are storage only.
 * A suite that stubbed the verifier would prove nothing about FG-06.
 */

import { ChannelCredentials } from '@grpc/grpc-js';
import { serverId as serverIdOf } from '@jagoo/sdk/core';
import { Plane, Priority } from '../core/domain/envelope.js';
import { DomainRegistry } from '../core/domain/domain-registry.js';
import { IngressPipeline } from '../core/app/ingress.js';
import { FederationInbox, type NodeIdentity } from '../core/app/federation-inbox.js';
import { FederationOutboxService } from '../core/app/federation-outbox.js';
import { FederationSync } from '../core/app/federation-sync.js';
import { PathRouter } from '../core/app/path-router.js';
import { BridgeRelayService } from '../core/app/bridge-relay.js';
import { TransportSupervisor } from '../core/app/transport-supervisor.js';
import {
  DISABLED_BRIDGE,
  type BridgeConfig,
} from '../core/domain/transport/bridge-policy.js';
import { PeerTrust, type PeerEndpoint, type PeerRecord } from '../core/ports/network.port.js';
import { ConfiguredUplinkManager } from '../adapters/outbound/transport/configured-uplinks.js';
import {
  ScriptedScopeProbe,
  scopeTarget,
} from '../adapters/outbound/in-memory/in-memory-transport.js';
import { InMemoryObservability } from '../adapters/outbound/in-memory/in-memory-observability.js';
import {
  IMPLICIT_UPLINK,
  type ProbeConfig,
  type UplinkConfig,
} from '../composition/transport.config.js';
import {
  FixedClock,
  InMemoryEnvelopeStore,
  InMemoryProjectionStore,
  SequentialRandom,
} from '../adapters/outbound/in-memory/in-memory-stores.js';
import {
  InMemoryCreditLedger,
  InMemoryCredentialIssuer,
  InMemoryNullifierRegistry,
  InMemoryPeerDirectory,
  InMemoryPowVerifier,
} from '../adapters/outbound/in-memory/in-memory-services.js';
import {
  InMemoryFederationLedger,
  InMemoryFederationOutbox,
} from '../adapters/outbound/in-memory/in-memory-federation.js';
import {
  InMemoryOperatorAlerts,
  InMemoryPeerQuotaLimiter,
} from '../adapters/outbound/in-memory/in-memory-quota.js';
import { LocalMerkleLog } from '../adapters/outbound/in-memory/local-merkle-log.js';
import {
  InMemoryNodeSigner,
  InMemoryNonceStore,
} from '../adapters/outbound/in-memory/in-memory-node.js';
import { RealSignatureVerifier } from '../adapters/outbound/in-memory/real-signature-verifier.js';
import { ProjectionCertificateStore } from '../adapters/outbound/projection-certificate-store.js';
import { FederationService } from '../adapters/inbound/grpc/federation.service.js';
import { FederationGrpcServer } from '../adapters/inbound/grpc/federation.server.js';
import { GrpcFederationSender } from '../adapters/outbound/grpc/federation-client.js';
import { forumHandlers } from '../features/forum/index.js';
import { signalHandlers } from '../features/signal/index.js';
import { NOW_MS } from '../testing/harness.js';

export interface FederatedNode {
  readonly name: string;
  readonly signer: InMemoryNodeSigner;
  readonly serverId: string;
  readonly clock: FixedClock;
  readonly registry: DomainRegistry;
  readonly envelopes: InMemoryEnvelopeStore;
  readonly projections: InMemoryProjectionStore;
  readonly witness: LocalMerkleLog;
  readonly credits: InMemoryCreditLedger;
  readonly credentials: InMemoryCredentialIssuer;
  readonly pipeline: IngressPipeline;
  readonly peers: InMemoryPeerDirectory;
  readonly ledger: InMemoryFederationLedger;
  readonly queue: InMemoryFederationOutbox;
  readonly alerts: InMemoryOperatorAlerts;
  readonly inbox: FederationInbox;
  readonly outbox: FederationOutboxService;
  readonly sync: FederationSync;
  readonly service: FederationService;
  readonly server: FederationGrpcServer;
  readonly sender: GrpcFederationSender;
  readonly identity: () => NodeIdentity;
  // ── P3 ────────────────────────────────────────────────────────────────────────────
  readonly uplinks: ConfiguredUplinkManager;
  readonly paths: PathRouter;
  readonly bridge: BridgeRelayService;
  readonly supervisor: TransportSupervisor;
  readonly prober: ScriptedScopeProbe;
  readonly observability: InMemoryObservability;
  port: number;
}

export interface NodeOptions {
  readonly name: string;
  readonly seed: number;
  /** FD-12 — an outbound-only node still binds a loopback port in this harness so the
   * test can prove it never advertises it, which is the behaviour FG-07 turns on. */
  readonly outboundOnly?: boolean;
  /**
   * P3 — this node's uplinks. Absent means the AR-12 default: one implicit uplink that
   * declares every scope, binds nothing and probes nothing.
   *
   * The P2 suite therefore runs through the P3 path router unchanged, which is the evidence
   * that "transport is off unless configured" holds by construction rather than by
   * assertion — FG-01…FG-10 staying green IS the AR-12 test.
   */
  readonly uplinks?: readonly UplinkConfig[];
  readonly bridge?: BridgeConfig;
  /** Scopes to probe. Empty means "unmeasurable, therefore assumed live". */
  readonly probeScopes?: readonly PeerEndpoint['scope'][];
  /** Extra scoped endpoints this node advertises beyond the LAN loopback one. */
  readonly advertise?: (port: number) => readonly PeerEndpoint[];
}

export async function startNode(options: NodeOptions): Promise<FederatedNode> {
  const clock = new FixedClock(NOW_MS);
  const signer = new InMemoryNodeSigner(new Uint8Array(32).fill(options.seed));
  const projections = new InMemoryProjectionStore();
  const envelopes = new InMemoryEnvelopeStore(clock);
  const witness = new LocalMerkleLog(signer, clock);
  const registry = new DomainRegistry();
  for (const handler of forumHandlers(projections, signer)) registry.register(handler);
  for (const handler of signalHandlers(projections)) registry.register(handler);

  const peers = new InMemoryPeerDirectory();
  const ledger = new InMemoryFederationLedger();
  const queue = new InMemoryFederationOutbox();
  const alerts = new InMemoryOperatorAlerts();
  const quotas = new InMemoryPeerQuotaLimiter();
  const verifier = new RealSignatureVerifier();
  const credits = new InMemoryCreditLedger(100_000_000);
  const credentials = new InMemoryCredentialIssuer();
  // The blind credential the registry's Forum rows demand. Issued per node, because a
  // credential is a claim against THIS node's issuer — federation grants no exemption.
  await credentials.issue(new Uint8Array([1, 2, 3, 4]));

  let endpoints: PeerRecord['endpoints'] = [];
  const identity = (): NodeIdentity => ({
    serverId: signer.serverId,
    publicKey: signer.publicKey,
    displayName: options.name,
    software: 'jagoo-bahee',
    version: '2.0.0',
    endpoints: options.outboundOnly ? [] : endpoints,
    planes: [Plane.FORUM, Plane.SIGNAL],
    acceptedClasses: [Priority.BROADCAST, Priority.DIRECT, Priority.CHECKIN, Priority.BULK],
    communities: [],
    channels: [],
  });

  // ── P3 transport ──────────────────────────────────────────────────────────────────
  const observability = new InMemoryObservability();
  const prober = new ScriptedScopeProbe();
  const uplinkConfigs = options.uplinks ?? [IMPLICIT_UPLINK];
  const probe: ProbeConfig = {
    targets: Object.fromEntries(
      (options.probeScopes ?? []).map((scope) => [scope, [scopeTarget(scope)]]),
    ),
    intervalMs: 0,
    failureThreshold: 1,
    timeoutMs: 100,
  };
  const uplinks = new ConfiguredUplinkManager({
    uplinks: uplinkConfigs,
    probe,
    prober,
    clock,
  });
  const paths = new PathRouter({
    uplinks,
    peers,
    clock,
    random: new SequentialRandom(),
    observability,
  });

  const sender = new GrpcFederationSender({
    signer,
    clock,
    random: new SequentialRandom(),
    identity,
    credentials: ChannelCredentials.createInsecure(),
    paths,
  });

  const bridge = new BridgeRelayService({
    config: options.bridge ?? DISABLED_BRIDGE,
    peers,
    paths,
    uplinks,
    clock,
  });

  const outbox = new FederationOutboxService({
    outbox: queue,
    peers,
    ledger,
    sender,
    reader: envelopes,
    projections,
    clock,
    alerts,
    bridge,
  });

  const pipeline = new IngressPipeline({
    registry,
    reader: envelopes,
    writer: envelopes,
    projections,
    verifier,
    certificates: new ProjectionCertificateStore(projections),
    witness,
    nonces: new InMemoryNonceStore(),
    antiAbuse: {
      credits,
      nullifiers: new InMemoryNullifierRegistry(),
      credentials,
      pow: new InMemoryPowVerifier(),
    },
    nodeSigner: signer,
    clock,
    federation: outbox,
    federationLedger: ledger,
  });

  const inbox = new FederationInbox({
    pipeline,
    peers,
    ledger,
    reader: envelopes,
    witness,
    quotas,
    verifier,
    clock,
    identity,
    alerts,
  });

  const sync = new FederationSync({
    peers,
    ledger,
    sender,
    inbox,
    reader: envelopes,
    pipeline,
    clock,
    selfServerId: () => signer.serverId,
  });

  const service = new FederationService({
    inbox,
    peers,
    ledger,
    witness,
    signer,
    clock,
    identity,
    ...(options.outboundOnly ? { outboundOnly: true } : {}),
  });

  const supervisor = new TransportSupervisor({
    uplinks,
    peers,
    sync,
    clock,
    bridge,
    observability,
    alerts,
  });

  // `127.0.0.1:0` — the OS picks the port, so two nodes in one suite never collide and the
  // suite never depends on a port being free.
  const server = new FederationGrpcServer(service, { listen: '127.0.0.1:0' });
  const port = await server.start();
  endpoints = options.advertise
    ? options.advertise(port)
    : [{ address: `grpc://127.0.0.1:${port}`, scope: 'LAN', inboundCapable: true }];

  return {
    name: options.name,
    signer,
    serverId: signer.serverId,
    clock,
    registry,
    envelopes,
    projections,
    witness,
    credits,
    credentials,
    pipeline,
    peers,
    ledger,
    queue,
    alerts,
    inbox,
    outbox,
    sync,
    service,
    server,
    sender,
    identity,
    uplinks,
    paths,
    bridge,
    supervisor,
    prober,
    observability,
    port,
  };
}

export async function stopNode(node: FederatedNode): Promise<void> {
  node.sync.stopAll();
  node.sender.close();
  await node.server.stop();
}

/**
 * Tell `from` how to reach `to`, without granting any trust.
 *
 * The record lands at `PROBATION` exactly as TOFU would place it, so a test that wants
 * `NORMAL` or `TRUSTED` has to get there through the promotion rules rather than by being
 * handed it — which is what makes FG-01 and FG-09 mean something.
 */
export async function introduce(
  from: FederatedNode,
  to: FederatedNode,
  trust: PeerTrust = PeerTrust.PROBATION,
  endpoints?: readonly PeerEndpoint[],
): Promise<void> {
  await from.peers.upsert({
    serverId: serverIdOf(to.signer.publicKey),
    publicKey: to.signer.publicKey,
    displayName: to.name,
    endpoints: endpoints ?? [
      { address: `grpc://127.0.0.1:${to.port}`, scope: 'LAN', inboundCapable: true },
    ],
    trust,
    planes: [Plane.FORUM, Plane.SIGNAL],
    acceptedClasses: [Priority.BROADCAST, Priority.DIRECT, Priority.CHECKIN, Priority.BULK],
    firstSeenMs: from.clock.nowMs(),
    lastSeenMs: from.clock.nowMs(),
  });
}

/** The `jbs1…` id a node's peers know it by. */
export const peerIdOf = (node: FederatedNode): string => serverIdOf(node.signer.publicKey);
