# 07 — Architecture & SOLID Structure

> How the code is organised so features can be swapped, experimented with, and removed without touching the core.

---

## 1. Hexagonal (ports & adapters)

```
                    ┌─────────────────────────────────────┐
                    │           ADAPTERS (in)             │
                    │  HTTP  gRPC  Mesh  Reticulum  QR    │
                    └──────────────────┬──────────────────┘
                                       │  implements inbound ports
                    ┌──────────────────▼──────────────────┐
                    │              CORE                    │
                    │  ┌────────────────────────────────┐ │
                    │  │  Domain (pure, no I/O)         │ │
                    │  │  envelope · canonical encoding │ │
                    │  │  validation · reducers ·       │ │
                    │  │  permissions · path selection  │ │
                    │  └────────────────────────────────┘ │
                    │  ┌────────────────────────────────┐ │
                    │  │  Application services          │ │
                    │  │  ingress · projection ·        │ │
                    │  │  federation · relay            │ │
                    │  └────────────────────────────────┘ │
                    │            declares OUTBOUND PORTS   │
                    └──────────────────┬──────────────────┘
                                       │  implemented by
                    ┌──────────────────▼──────────────────┐
                    │           ADAPTERS (out)            │
                    │  Mongo  Redis  S3  LLM  RNS  Merkle │
                    └─────────────────────────────────────┘
```

**Requirement AR-01 — dependency rule.** The core depends on nothing but its own ports. Adapters depend on the core. Nothing in `core/domain` may import a database driver, an HTTP framework, or a network library. Enforced in CI by an import-boundary lint rule, not by discipline.

**Requirement AR-02 — the domain layer is pure.** Every function in `core/domain` is deterministic given its inputs. No clock reads, no random, no I/O — those are injected. This is what makes the validation pipeline and the path selector unit-testable without infrastructure.

---

## 2. Port catalogue

Ports are **small and role-focused** (Interface Segregation). A consumer that only reads never depends on a write method.

```typescript
// ─── Storage ──────────────────────────────────────────────────────────────
interface EnvelopeWriter { put(e: ParsedEnvelope, raw: Uint8Array, tx: Tx): Promise<void>; }
interface EnvelopeReader {
  get(contentId: string): Promise<StoredEnvelope | null>;
  has(contentId: string): Promise<boolean>;
  range(from: number, to: number): AsyncIterable<StoredEnvelope>;
  bloom(classes: Priority[], sinceMs: number): Promise<BloomFilter>;
}
interface ProjectionStore { collection<T>(name: string): Collection<T>; transaction<R>(fn: (tx: Tx) => Promise<R>): Promise<R>; }

// ─── Identity & crypto ────────────────────────────────────────────────────
interface SignatureVerifier { verify(alg: KeyAlg, key: Uint8Array, msg: Uint8Array, sig: Uint8Array): boolean; }
interface CertificateStore  { certificateAt(key: Uint8Array, atMs: number): Promise<KeyCertificate | null>;
                              revocationFor(key: Uint8Array): Promise<KeyRevocation | null>; }
interface PlaneSigner<P extends Plane> { /* 01-IDENTITY-PLANES §8 */ }

// ─── Anti-abuse ───────────────────────────────────────────────────────────
interface CreditLedger      { consume(s: CreditSubject, cost: number): Promise<CreditStatus>;
                              issueChallenge(s: CreditSubject): Promise<PowChallenge>;
                              redeem(s: CreditSubject, sol: PowSolution): Promise<CreditStatus>; }
interface NullifierRegistry { claim(nullifier: Uint8Array, epoch: number, scope: string): Promise<boolean>; }
interface CredentialIssuer  { issue(blinded: Uint8Array): Promise<Uint8Array>;
                              verify(credential: Uint8Array): Promise<boolean>; }

// ─── Transparency ─────────────────────────────────────────────────────────
interface WitnessLog {
  append(contentId: string, tx: Tx): Promise<number>;
  currentSth(): Promise<SignedTreeHead>;
  inclusionProof(contentId: string): Promise<InclusionProof>;
  consistencyProof(from: number, to: number): Promise<Uint8Array[]>;
  verifyPeerSth(peerKey: Uint8Array, sth: SignedTreeHead): Promise<PeerLogStatus>;
}

// ─── Network ──────────────────────────────────────────────────────────────
interface Transport      { /* 06-CONTRACTS-TRANSPORT §2 */ }
interface PeerDirectory  { get(key: string): Promise<PeerRecord | null>;
                           upsert(r: PeerRecord): Promise<void>;
                           forScope(s: ReachabilityScope): Promise<PeerRecord[]>;
                           forAsn(asn: number): Promise<PeerRecord[]>; }
interface UplinkManager  { /* 06-CONTRACTS-TRANSPORT §4 */ }
interface PathSelector   { select(peer: PeerRecord): Promise<SelectedPath | null>; }
interface FederationOut  { enqueue(e: ParsedEnvelope, targets?: string[]): Promise<void>;
                           backfillFrom(peerKey: string, fromIndex: number): Promise<BackfillReport>; }
interface BridgeRelay    { /* 06-CONTRACTS-TRANSPORT §6 */ }

// ─── Content services ─────────────────────────────────────────────────────
interface LabelProvider   { preflight(d: DraftContent): Promise<LabelAdvice>;
                            label(id: string, c: ResolvedContent): Promise<Label>; }
interface BlobStore       { presignUpload(k: string, mime: string, size: number): Promise<UploadTicket>;
                            presignDownload(k: string): Promise<string>; }
interface NotificationSink{ deliver(to: Uint8Array, n: Notification): Promise<void>; }
interface Clock           { nowMs(): number; }
interface RandomSource    { bytes(n: number): Uint8Array; }
```

**Requirement AR-03:** Every port has at least one production adapter and one in-memory test double. Integration tests run against real adapters; unit tests run against doubles. Mesh and Reticulum paths are testable with **no hardware**.

---

## 3. Plugin registry — the Open/Closed mechanism

Adding a feature registers a handler. It never modifies the pipeline.

```typescript
interface DomainHandler<TBody = unknown> {
  readonly domain: string;
  readonly plane: Plane;
  readonly bodyType: MessageType<TBody>;

  /** Domain-specific field constraints. Pure — no I/O. */
  validate(body: TBody, env: ParsedEnvelope): ValidationResult;

  /** Permission check against current projections. */
  authorize(body: TBody, env: ParsedEnvelope, ctx: AuthContext): Promise<AuthDecision>;

  /** Apply to the read model. Runs inside the same transaction as the log append. */
  project(body: TBody, env: ParsedEnvelope, tx: Tx): Promise<void>;

  /** Optional: side effects after commit — notifications, fanout hints. */
  afterCommit?(body: TBody, env: ParsedEnvelope): Promise<void>;
}

interface DomainRegistry {
  register(h: DomainHandler): void;
  lookup(domain: string): DomainHandler | null;
  spec(domain: string): DomainSpec | null;   // from registry.yaml
}
```

Wiring a whole feature:

```typescript
// features/forum/post/index.ts — the complete surface of "posts"
export const postFeature: Feature = {
  name: "forum.post",
  handlers: [postCreateHandler, postUpdateHandler, postDeleteHandler],
  projections: ["posts"],
  readRoutes: [feedRoute, postDetailRoute, postCommentsRoute],
};
```

```typescript
// composition root
registry.register(postFeature);
registry.register(voteFeature);
registry.register(broadcastFeature);
if (config.features.reticulum) transports.register(new ReticulumTransport(cfg));
if (config.features.labeller)  container.bind(LabelProvider, new LlmLabeller(cfg));
else                            container.bind(LabelProvider, new NullLabeller());
```

**Requirement AR-04:** A feature is one directory containing its handlers, projections, read routes, and tests. Deleting the directory and its registry rows removes the feature completely, with no dangling references.
**Requirement AR-05:** The ingress pipeline MUST NOT contain a `switch` on domain. It looks the handler up in the registry. A `switch` on domain anywhere in the core is a defect.
**Requirement AR-06:** Features are toggleable by configuration for experimentation. A disabled feature's domains return `UNKNOWN_DOMAIN`.

---

## 4. One engine, two planes

Messaging is the clearest case: the same cryptographic engine serves both the anonymous forum DMs and identified Signal messaging. This is Dependency Inversion in practice — the engine depends on an abstraction, and the plane supplies the implementation.

```typescript
class MessagingEngine<P extends Plane> {
  constructor(
    private readonly signer: PlaneSigner<P>,
    private readonly prekeys: PrekeyStore<P>,
    private readonly sessions: SessionStore<P>,
    private readonly clock: Clock,
  ) {}
  // identical logic for both planes
}

const forumMessaging  = new MessagingEngine(forumSigner,  forumPrekeys,  forumSessions,  clock);
const signalMessaging = new MessagingEngine(signalSigner, signalPrekeys, signalSessions, clock);
```

**Requirement AR-07:** The two instances MUST have separate stores. Sharing a session store across planes would violate `SEP-05` regardless of the engine being shared.
**Requirement AR-08:** The type parameter `P` prevents a Forum signer being passed where a Signal signer is expected. Cross-plane misuse is a compile error, not a runtime check.

---

## 5. SOLID, concretely

| Principle | Applied here | Violation would look like |
|---|---|---|
| **S**ingle responsibility | Ingress validates. Projector projects. Transport moves bytes. Witness logs. Each has one reason to change. | A "PostService" that validates, saves, notifies, and federates — v1's shape |
| **O**pen/closed | New content type = new `DomainHandler` + registry row. Pipeline untouched. | Adding a `case` to a domain switch in ingress |
| **L**iskov | Every `Transport` is substitutable. The outbox drains through HTTP, mesh, or Reticulum with identical calling code. | `if (transport.id === "reticulum")` in application code |
| **I**nterface segregation | `EnvelopeReader` and `EnvelopeWriter` are separate. Projections depend only on the reader. | One fat `Store` interface everyone depends on |
| **D**ependency inversion | Core declares `WitnessLog`; the Merkle implementation depends on the core. Swap it for a stub in tests, a remote witness in production. | Core importing the Mongo driver |

**Requirement AR-09:** These are checked in code review with the table above as the checklist. A PR that adds a domain `switch` to the core, or an `if` on transport ID outside the transport layer, is rejected.

---

## 6. Repository layout

```
jagoo-bahee/
├── proto/jagoo/v1/               # SOURCE OF TRUTH — all contracts
│   ├── envelope.proto            # Envelope, Receipt, SignedTreeHead, Plane, Priority
│   ├── forum.proto               # Plane A bodies
│   ├── signal.proto              # Plane B bodies
│   ├── federation.proto          # server↔server gRPC
│   ├── bridge.proto              # Reticulum sidecar
│   └── registry.yaml             # domain registry → generated to every language
│
├── crates/
│   ├── jb-core/                  # envelope encode/decode, canonical bytes, content IDs
│   ├── jb-crypto/                # BIP85, Ed25519, ML-DSA, X25519+ML-KEM, blind creds
│   └── jb-wasm/                  # wasm-bindgen wrapper for browsers
│
├── services/node/
│   ├── src/core/
│   │   ├── domain/               # PURE — validation, reducers, permissions, path selection
│   │   ├── ports/                # interfaces only
│   │   └── app/                  # ingress, projector, federation, relay orchestration
│   ├── src/adapters/
│   │   ├── inbound/              # http, grpc, mesh, reticulum
│   │   └── outbound/             # mongo, redis, s3, merkle, llm, rns
│   ├── src/features/             # one directory per feature
│   │   ├── forum/{post,comment,vote,community,moderation,role,award,attachment,message}
│   │   └── signal/{channel,broadcast,checkin,message,resource,missing}
│   └── src/composition/          # DI wiring, config, feature toggles
│
├── services/relay/               # Python RNS bridge (P6)
├── services/labeller/            # LLM labelling (optional adapter)
├── services/witness/             # Merkle transparency log
│
├── apps/
│   ├── web/                      # Next.js PWA — static export target
│   └── mobile/                   # native shell (BLE, background mesh, keystore)
│
├── packages/
│   ├── sdk-ts/                   # generated protos + Signer/Transport/Outbox
│   └── ui/                       # shared components
│
├── ops/                          # compose, haproxy, uplink configs, deployment
└── docs/                         # this plan
```

**Requirement AR-10:** `proto/` is the single source of truth. TypeScript, Rust, and Python bindings are **generated**. Hand-written duplicates of a contract are forbidden and caught in CI by regenerating and diffing.

---

## 7. Composition root

All wiring happens in one place. Nothing else constructs a dependency.

```typescript
// services/node/src/composition/root.ts
export function buildNode(cfg: NodeConfig): Node {
  const c = new Container();

  // Outbound adapters — every one swappable by config
  c.bind(ProjectionStore, new MongoProjectionStore(cfg.mongo));
  c.bind(EnvelopeReader,  new MongoEnvelopeStore(cfg.mongo));
  c.bind(EnvelopeWriter,  c.get(EnvelopeReader));
  c.bind(CreditLedger,    new RedisCreditLedger(cfg.redis));
  c.bind(WitnessLog,      cfg.witness.remote
                            ? new RemoteWitness(cfg.witness)
                            : new LocalMerkleLog(cfg.mongo));
  c.bind(LabelProvider,   cfg.features.labeller
                            ? new LlmLabeller(cfg.labeller)
                            : new NullLabeller());
  c.bind(BlobStore,       new S3BlobStore(cfg.s3));
  c.bind(Clock,           new SystemClock());

  // Network
  const uplinks = new UplinkManager(cfg.uplinks);
  c.bind(UplinkManager, uplinks);
  c.bind(PeerDirectory, new MongoPeerDirectory(cfg.mongo, cfg.seedDirectory));
  c.bind(PathSelector,  new ScopeRankingPathSelector(uplinks, c.get(Clock)));

  // Transports — registered, not hard-coded
  const transports = new TransportRegistry();
  transports.register(new HttpTransport(cfg.http));
  transports.register(new GrpcFederationTransport(cfg.grpc, uplinks));
  if (cfg.features.mesh)      transports.register(new MeshTransport(cfg.mesh));
  if (cfg.features.reticulum) transports.register(new ReticulumTransport(cfg.reticulum));

  // Bridge relay (P3)
  if (cfg.bridge.enabled) c.bind(BridgeRelay, new UplinkBridgeRelay(cfg.bridge, uplinks));

  // Features — the entire mutable surface of the application
  const registry = new DomainRegistry();
  for (const f of selectFeatures(cfg.features)) registry.register(f);

  return new Node(c, registry, transports);
}
```

**Requirement AR-11:** No `new` of an adapter outside the composition root. No service locator lookups at call sites — dependencies are constructor-injected.
**Requirement AR-12:** Every optional subsystem (labeller, mesh, Reticulum, remote witness, bridge) has a null or in-process default so the node runs with all of them disabled.

---

## 8. Testing strategy

| Level | Scope | Doubles used | Runs in |
|---|---|---|---|
| **Unit** | `core/domain` pure functions | none needed — inputs are values | ms, no infra |
| **Handler** | One `DomainHandler` | in-memory stores | ms |
| **Pipeline** | Full validation pipeline | in-memory everything | ms |
| **Integration** | Node + Mongo + Redis | real adapters, testcontainers | seconds |
| **Federation** | Two nodes | real gRPC over loopback | seconds |
| **ISP simulation** | Multi-uplink, network namespaces / iptables | real stack, simulated ASNs | minutes |
| **Cross-language** | TS ↔ Rust ↔ Python canonical bytes | shared fixture file | CI gate |

**Requirement AR-13:** The cross-language vector test is a **blocking CI gate**. A canonicalization divergence between the Rust/WASM signer and the TypeScript node is the highest-cost bug this architecture can have, and it must be caught at commit time, not at runtime.
**Requirement AR-14:** ISP-bridging tests use Linux network namespaces with simulated ASNs and firewall rules. No physical multi-ISP setup is required to run the P3 suite.
**Requirement AR-15:** Every requirement ID in these documents that says MUST has at least one test referencing it by ID.

---

## 9. Configuration and feature toggles

```yaml
features:
  forum:      true
  signal:     true         # P4
  mesh:       false        # P5
  reticulum:  false        # P6 — off by default (RT-06)
  labeller:   true
  bridge:     false        # P3, opt-in (BR-01)

planes:
  forum:  { enabled: true }
  signal: { enabled: true }
```

**Requirement AR-16:** A node MAY serve Forum only, Signal only, or both. A Signal-only relay — small, cheap, running on a Raspberry Pi, carrying only broadcasts and messages — is a first-class deployment and MUST be supported.
**Requirement AR-17:** Feature toggles are for experimentation and deployment shaping, not for hiding incomplete work. A toggled-on feature is complete or it does not merge.
