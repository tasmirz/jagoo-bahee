# ADR-007 — gRPC runtime for the Federation service

**Status:** Accepted · 2026-07-29
**Supersedes:** ADR-002 "Transport-layer choices → gRPC" bullet
**Decision:** `nice-grpc` + `@grpc/grpc-js`, run as a standalone server started from the composition
root — **not** `@nestjs/microservices`.

---

## Context

Two frozen-adjacent documents gave different answers, and neither was wrong when written:

- `ADR-002-NESTJS-HEXAGONAL.md` says "`@nestjs/microservices` gRPC transport for the P2 `Federation`
  service, generated from `federation.proto`."
- `P0-P2-IMPLEMENTATION-PLAN.md` §1 says "`@grpc/grpc-js` + `ts-proto` for the federation gRPC service
  (P2)."

Nothing had been built either way — the backend has no gRPC dependency at all — so P2 had to pick one
and record it.

What changed between those two documents is that P0 shipped codegen. `buf.gen.yaml` sets
`outputServices=generic-definitions`, so `packages/sdk-ts/src/gen/jagoo/v1/federation.ts` already exports:

```ts
export const FederationDefinition = {
  name: 'Federation',
  fullName: 'jagoo.v1.Federation',
  methods: {
    deliver: { name: 'Deliver', requestType: Envelope, requestStream: true,
               responseType: DeliverAck, responseStream: false, options: {} },
    /* … */
  },
} as const;
```

That is a transport-agnostic method descriptor carrying the generated ts-proto codecs. It is, exactly,
`nice-grpc`'s input format.

## Decision

Use `nice-grpc` (plus `nice-grpc-common` and `@grpc/grpc-js`) over the already-generated
`FederationDefinition`. The gRPC server is an **inbound adapter** under
`backend/src/adapters/inbound/grpc/`; the dialer is an **outbound adapter** under
`backend/src/adapters/outbound/grpc/`. Both are constructed in `composition/` like every other adapter
(AR-11). Neither is a Nest microservice, and `main.ts` gains no `connectMicroservice` call.

## Why not `@nestjs/microservices`

Three costs, in descending order of seriousness:

1. **It reintroduces a second source of contract truth.** The Nest gRPC transport is built on
   `@grpc/proto-loader`, which parses `.proto` files **at runtime** from a filesystem path. That means
   `proto/jagoo/v1/*.proto` must be copied into the production Docker image and kept in step with the
   committed codegen — and nothing would fail if they diverged, because the two are never compared.
   AR-10 and P0-G5 exist to make generated artefacts provably derived from `proto/`; a runtime loader
   sits outside that gate.

2. **The generated codecs go unused.** proto-loader builds its own dynamic message types, so the
   `forceLong=bigint` and `snakeToCamel=false` decisions in `buf.gen.yaml` — both deliberate, the first
   because `created_at_ms` and `log_index` are signed over and must be exact — would not apply on the
   federation path. Two encoders over the same wire format is the shape of the v1 bug this rebuild
   exists to foreclose.

3. **Streaming style.** Nest exposes streams as RxJS `Observable`s. `Deliver` is client-streaming with
   per-message acknowledgement and backpressure, and `Backfill` is a resumable server stream over
   `EnvelopeReader.range()`, which is already an `AsyncIterable`. `nice-grpc` speaks async iterables
   natively, so the adapter is a `for await` loop rather than an RxJS bridge over one.

A fourth, smaller point: passing a peer's exact bytes through untouched (ADR-008 §1) requires
substituting the codec for one method's message type. With a definition object that is an ordinary
value, this is a spread. With a runtime proto loader it is a fight.

## Consequences

- `backend/package.json` gains `nice-grpc`, `nice-grpc-common`, `@grpc/grpc-js`.
- `@grpc/*` is already listed in `eslint.config.mjs`'s `IMPURE_MODULES`, so `core/domain/**` cannot
  import it. `nice-grpc` is added to that list too, and `core/import-boundary.spec.ts` gains a probe
  that makes the rule fail on purpose — a rule that is only configured is not a rule (L-09, L-11).
- The gRPC server's lifecycle is owned by `composition/`, alongside the existing `RuntimeLifecycle`
  that already closes Mongo, Redis and S3.
- Federation is off unless configured, and a node with it off behaves exactly as it did in P1 (AR-12).
- ADR-002's gRPC bullet is superseded. Its HTTP and validation bullets stand unchanged.

## What would reverse this

If a later phase needs Nest's interceptor and guard pipeline applied uniformly across HTTP and gRPC —
plausible if per-peer quotas (T2.10) end up wanting the same interceptor stack as
`RequestSecurityInterceptor` — the calculus changes. The mitigation is cheap and should be preferred to
switching runtimes: extract the quota decision into a port called from both adapters, which is where it
belongs anyway.
