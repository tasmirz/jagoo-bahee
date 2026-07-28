# ADR-002 — Mapping ports & adapters onto NestJS

**Status:** Accepted · 2026-07-29
**Affects:** all of `backend/`

---

## Context

`Plans/07-ARCHITECTURE.md` specifies hexagonal architecture with a hand-rolled `Container` in a single
composition root, and `AR-01` requires that nothing in `core/domain` imports a framework. The backend is
being built on **NestJS**, which is itself a DI container with decorator-based metadata.

Two ways this goes wrong:

1. `@Injectable()` spreads into `core/domain`, and the pure layer stops being pure — now unit-testing a
   validation step needs a Nest testing module, which is exactly the infrastructure dependency `AR-02`
   exists to prevent.
2. Nest modules become the feature boundary and start importing each other, so `NFR-M07` ("delete the
   directory and the feature is gone") quietly stops holding.

## Decision

**Nest owns wiring. The core owns interfaces. Decorators stop at the adapter boundary.**

### Layer rules

| Layer | Path | Nest allowed? |
|---|---|---|
| Domain | `core/domain/**` | **No.** Plain TypeScript functions and types. No decorators, no DI, no imports outside `core/**`. |
| Ports | `core/ports/**` | **No.** Abstract classes only — see below. |
| Application services | `core/app/**` | Constructor injection only, via `@Inject(TOKEN)`. No Nest lifecycle hooks, no `@Module` here. |
| Adapters | `adapters/**` | Yes. `@Injectable()`, drivers, framework types all live here. |
| Features | `features/**` | Handlers are plain classes; each feature exposes one Nest module that registers them. |
| Composition | `composition/**` | Yes. The only place a provider is bound to an implementation. |

### Ports are abstract classes, not interfaces

A TypeScript `interface` vanishes at runtime, so it cannot be a DI token. Ports are declared as abstract
classes with no implementation — they keep the structural contract for the type checker *and* give Nest a
token, with no `Symbol` indirection to keep in sync:

```ts
// core/ports/envelope-store.port.ts  — no decorators, no imports outside core
export abstract class EnvelopeReader {
  abstract get(contentId: string): Promise<StoredEnvelope | null>;
  abstract has(contentId: string): Promise<boolean>;
  abstract range(from: number, to: number): AsyncIterable<StoredEnvelope>;
}
export abstract class EnvelopeWriter {
  abstract put(e: ParsedEnvelope, raw: Uint8Array, tx: Tx): Promise<void>;
}
```

Reader and writer stay separate (`Interface Segregation`, `AR-02` port catalogue). The Mongo adapter
implements both and is bound twice in the composition root — a consumer that only reads still depends
only on the reader.

```ts
// composition/storage.module.ts — the only file that names both sides
@Module({
  providers: [
    MongoEnvelopeStore,
    { provide: EnvelopeReader, useExisting: MongoEnvelopeStore },
    { provide: EnvelopeWriter, useExisting: MongoEnvelopeStore },
  ],
  exports: [EnvelopeReader, EnvelopeWriter],
})
export class StorageModule {}
```

### Optional subsystems bind to a null default

`AR-12` requires the node to run with every optional subsystem disabled. Config decides the binding;
nothing downstream learns which one it got:

```ts
{
  provide: LabelProvider,
  inject: [NodeConfig],
  useFactory: (cfg: NodeConfig) =>
    cfg.features.labeller ? new LlmLabeller(cfg.labeller) : new NullLabeller(),
}
```

### Features register into the registry, never into the pipeline

A feature module's entire job is to hand its handlers to `DomainRegistry` at bootstrap. The ingress
pipeline never learns a feature exists — it looks the domain up. This is what makes `P1-G11` (adding a
trivial new domain requires zero changes to ingress, projector dispatch, or signing code) hold.

```ts
@Module({ providers: [PostCreateHandler, PostUpdateHandler, PostDeleteHandler] })
export class PostFeatureModule implements OnModuleInit {
  constructor(
    private readonly registry: DomainRegistry,
    private readonly handlers: PostCreateHandler[] /* …injected */,
  ) {}
  onModuleInit() { this.handlers.forEach((h) => this.registry.register(h)); }
}
```

### Read routes are controllers; the write route is one controller

`WE-01`/`WE-02`: `EnvelopeController` owns `POST /v1/envelopes` and is the only write route in the
system. Feature modules contribute **read** controllers only. A feature adding a write route is a
review rejection.

### Transport-layer choices

- **HTTP:** Fastify adapter (`@nestjs/platform-fastify`) rather than Express — lower overhead against
  `NFR-P03` (500 env/s) and `NFR-F05` (< 512 MB), and the P0–P2 plan already assumed Fastify.
- **gRPC:** `@nestjs/microservices` gRPC transport for the P2 `Federation` service, generated from
  `federation.proto`. Client-streaming `Deliver` and server-streaming `StreamActivities` are both
  supported, which `FD-11` (outbound-only NATed nodes) depends on.
- **Validation:** envelope bodies are validated by their `DomainHandler.validate()` against the
  generated proto types — **not** by `class-validator` DTOs. Two validation systems over the same bytes
  is how the shapes drift apart.

## Enforcement

`pnpm lint` fails the build on any of these (`AR-01`, `P0-G6`, `SG-01`):

| Rule | Effect |
|---|---|
| `core/domain/**` importing anything outside `core/domain/**` | error |
| `core/**` importing `@nestjs/*`, a driver, or `adapters/**` | error |
| Any file outside the signer directories importing raw key material | error |
| `switch` on a domain string inside `core/**` | error |

## Consequences

- Unit tests for the domain layer import plain functions and run in milliseconds with no Nest testing
  module. That is the payoff and the reason the boundary is worth policing.
- There is one extra indirection — abstract class as token — compared to idiomatic Nest, where services
  are injected by concrete class. This is deliberate: injecting a concrete adapter is exactly the
  dependency-inversion violation `AR-11` prohibits.
- Nest's module graph and the hexagonal layer graph are different views of the same code. When they
  disagree, the layer graph wins.
