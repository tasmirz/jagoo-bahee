# P2 — Federation ★ PRIMARY GOAL

> **Goal:** two independent instances exchange, verify, and project content.
> Contracts are frozen (`Plans/05-CONTRACTS-FEDERATION.md`, `Plans/06-CONTRACTS-TRANSPORT.md`); this
> phase implements against them and changes **nothing** in `proto/` or `registry.yaml`.

**Scope of this push: T2.1–T2.9 only** — the block `Plans/10-IMPLEMENTATION-SEQUENCE.md` §8 marks
never-cut ("T0.14–T0.17, T1.1–T1.7, T2.1–T2.9 … those three blocks are the project"). T2.10–T2.16 are
deliberately deferred and tracked in §5 below, not silently dropped.

---

## 0. Entry condition

P1's mandatory CI gate was **red on every run on `main`**, not merely unexecuted, so
`P1-REQUIREMENTS-AUDIT.md`'s rule ("P2 may begin only after the mandatory CI job confirms the
Mongo/Redis gates") was unmet. Closed first — see BUILD-LOG `L-16`.

---

## 1. Order of work

```
0. Close P1's Mongo/Redis gate                                  ← blocking
1. Federation payload signing bytes (SDK)                       T2.2 prerequisite
2. Pure trust / announce / backoff domain logic                 T2.2, T2.3, T2.8
3. Port extensions + ingress origin threading (FD-14)           T2.6, T2.8
4. gRPC server + client scaffolding, raw-envelope codec         T2.1
5. Announce + TOFU admission                                    T2.2, T2.3  → FG-01
6. Deliver + inbound projection + direction ledger              T2.4, T2.6, T2.7 → FG-05, FG-06
7. StreamActivities                                             T2.5  → FG-02, FG-03
8. Durable outbox + drainer                                     T2.8
9. Backfill + auto-trigger on reconnect                         T2.9  → FG-04
10. Two-node FG suite over loopback gRPC                        (T2.16 partial)
```

Steps 4–7 are the spine: once an envelope leaves node A's outbox, crosses gRPC, re-runs all 19 steps
on node B and lands in B's read model, everything after it is quota policy and gossip.

---

## 2. The three design decisions that carry risk

### 2.1 The gRPC layer must never re-encode an envelope

`Deliver`/`StreamActivities`/`Backfill` are declared as streaming `Envelope` **messages**, but
`IngressPipeline.accept` takes `Uint8Array`, and `packages/sdk-ts/src/core/decode.ts` establishes
canonicality by **re-encoding and comparing bytes**.

Decoding a peer's frame into a ts-proto object and re-serialising it would *silently repair* a
non-canonical encoding, defeating precisely the check that forecloses the v1 signature-confusion bug —
and doing so on input from an untrusted peer. So the adapter carries the peer's exact bytes through to
the pipeline using a passthrough codec (`adapters/inbound/grpc/raw-envelope-codec.ts`). gRPC
length-prefixes the message body, so this is wire-identical to any conforming implementation.

Asserted by a test that sends a protobuf-valid but non-canonical encoding of a genuine envelope and
requires `MALFORMED`.

### 2.2 Deduplication belongs to the database (FED-12, FG-05)

Collection `federation_ledger`, unique compound index `{ content_id: 1, direction: 1 }`. v1 wrote
`findOne` then `insertOne` and caught error 11000 — but never declared the index, so the catch was
unreachable and the check was a race. The gate therefore asserts the index exists **with `unique: true`**
by reading `listIndexes`, and that the duplicate-key branch is genuinely entered.

### 2.3 An envelope must never be relayed back to its sender (FD-14 / FED-28)

No T2.x task owns this, and without it T2.6 plus T2.8 make two nodes ping-pong every envelope forever.
`IngressPipeline.accept(raw, origin?)` carries `{ transportId, peerId? }`; step 19 excludes
`origin.peerId` from fanout. `transportId` is data, never a branch — `eslint.config.mjs` already errors
on `switch` over it (NFR-M03).

---

## 3. Deliverables

| Area | Files |
|---|---|
| SDK | `packages/sdk-ts/src/signer/federation-signing.ts` (+ spec), exported from `signer/index.ts` |
| Pure domain | `backend/src/core/domain/federation/{trust,announce,backoff}.ts` (+ specs) |
| Ports | `core/ports/network.port.ts` — 5 trust levels, richer `PeerRecord`, `FederationOut` options, new `FederationSender` / `PeerStateStore` / `FederationLedger` |
| App | `core/app/ingress.ts` (origin), `core/app/federation-inbox.ts`, `core/app/federation-outbox.ts` |
| Inbound adapter | `adapters/inbound/grpc/{raw-envelope-codec,error-map,federation.service,federation.server}.ts` |
| Outbound adapter | `adapters/outbound/grpc/federation-client.ts` |
| Storage | `adapters/outbound/mongo/mongo-federation.ts`, `adapters/outbound/in-memory/in-memory-federation.ts` |
| Composition | `composition/app.module.ts`, `composition/federation.config.ts` |
| Gates | `backend/src/federation/federation.e2e.spec.ts`, `adapters/outbound/mongo/federation.integration.spec.ts` |

`ServerVouch`, `AnnounceRequest` and `TreeHeadExchange` are gRPC payloads carrying their own `signature`
fields, **not** registry-dispatched envelopes — hence zero rows added to `registry.yaml` and zero edits
under `proto/`. `pnpm proto:check` staying clean is the proof the freeze held.

---

## 4. Gate status

| Gate | Status |
|---|---|
| FG-01 — `Announce` succeeds; peer lands at `PROBATION` via TOFU | ☐ |
| FG-02 — a post on A appears, verified and projected, on B | ☐ |
| FG-03 — vote, comment, and moderation action all project on B | ☐ |
| FG-04 — partition, 20 envelopes, reconnect → exactly 20, zero duplicates | ☐ |
| FG-05 — replay rejected by the unique index, not a racy read | ☐ CI-gated (needs real Mongo) |
| FG-06 — a tampered envelope from a peer is rejected and not projected | ☐ |

---

## 5. Explicitly deferred, with owning task IDs

Not dropped. Each is a row in `Plans/09-TASKS.md` and remains open.

| Deferred | Task | Gate |
|---|---|---|
| Per-peer per-class quotas, auto-demotion on repeated breach | T2.10 | FG-09 |
| Outbound-only mode for NATed nodes | T2.11 | FG-07 |
| `ExchangeTreeHeads`, fork detection, operator alert | T2.12 | FG-08 |
| `ExchangeDirectory` | T2.13 | — |
| Discovery endpoints with full scoped endpoint lists | T2.14 | FD-17 |
| Plane separation on the wire — full gate | T2.15 | FG-10 |
| Compose two-node harness, all FG automated against containers | T2.16 | — |

Two carry-forwards land early because they are cheap now and expensive to retrofit:

- **A backpressure hint** (`DeliverAck.backpressure_hint_ms`) is produced by T2.4's acceptance line, so
  the mechanism exists; the per-class allow-list and auto-demotion that make FG-09 pass are T2.10.
- **The plane guard** — one plane per stream, a mismatched frame rejected `PLANE_MISMATCH` — is written
  now per `P0-P2-IMPLEMENTATION-PLAN.md` §5.1 ("the guard is written now so it isn't forgotten later").
  Only FORUM domains exist today, so the full FG-10 gate still belongs to T2.15.

`ExchangeTreeHeads` and `ExchangeDirectory` are registered and return a typed `UNIMPLEMENTED` rather
than being absent, so a peer gets an honest answer instead of a connection error.

Also carried into T2.12: `verifyPeerSth` keeps peer tree heads in an **in-process `Map`** in both
`LocalMerkleLog` and `MongoMerkleLog`, so fork-detection state is lost on restart. Persisting it is part
of T2.12, noted here so it is not mistaken for working.

---

## 6. Definition of done

Per `Plans/10` §9 and CLAUDE.md §7.3. A federation RPC is done when it satisfies its port, re-runs the
full pipeline on inbound, has an in-memory double alongside its production adapter, and is exercised by
a test citing its FG or FD identifier. The phase closes when FG-01…FG-06 pass **in CI**, not by hand.
