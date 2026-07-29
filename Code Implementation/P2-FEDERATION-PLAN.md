# P2 — Federation ★ PRIMARY GOAL

> **Goal:** two independent instances exchange, verify, and project content.
> Contracts are frozen (`Plans/05-CONTRACTS-FEDERATION.md`, `Plans/06-CONTRACTS-TRANSPORT.md`); this
> phase implements against them and changes **nothing** in `proto/` or `registry.yaml`.

**Status: COMPLETE — T2.1 through T2.16.** The original scope of this document was T2.1–T2.9 only,
with T2.10–T2.16 deferred. That deferral was lifted and the full catalogue shipped; §5 now records
what remains genuinely open rather than what was postponed.

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

All ten run in CI as a dedicated blocking job (`federation`), over two independent stacks with real
`nice-grpc` servers on loopback, real Ed25519 signatures and the real 19-step pipeline on both sides.

| Gate | Status | Asserted by |
|---|---|---|
| FG-01 — `Announce` succeeds; peer lands at `PROBATION` via TOFU | ☑ | `federation.e2e.spec.ts` |
| FG-02 — a post on A appears, verified and projected, on B | ☑ | `federation.e2e.spec.ts` |
| FG-03 — vote, comment, and moderation action all project on B | ☑ | `federation.e2e.spec.ts` — **this is the gate that found ADR-010** |
| FG-04 — partition, 20 envelopes, reconnect → exactly 20, zero duplicates | ☑ | `federation.e2e.spec.ts` |
| FG-05 — replay rejected by the unique index, not a racy read | ☑ | `federation.e2e.spec.ts` (branch entered) + `mongo/federation.integration.spec.ts` (index + real concurrency) |
| FG-06 — a tampered envelope from a peer is rejected and not projected | ☑ | `federation.e2e.spec.ts`, incl. the non-canonical re-encoding probe |
| FG-07 — an outbound-only node behind simulated NAT federates both ways | ☑ | `federation.e2e.spec.ts` + `federation.config.spec.ts` |
| FG-08 — `ExchangeTreeHeads` detects a rewritten log; peer demoted and operator alerted | ☑ | `federation.e2e.spec.ts` |
| FG-09 — a `PROBATION` peer's class-3 envelopes rejected, class 0–2 accepted | ☑ | `federation.e2e.spec.ts`, `quota.spec.ts`, `trust.spec.ts` |
| FG-10 — Signal and Forum never share a stream frame sequence | ☑ | `federation.e2e.spec.ts`, `stream-filter` guard |
| FD-17 — all endpoint scopes advertised, not just the public one | ☑ | `federation-discovery.spec.ts` |

---

## 5. What is genuinely still open

Nothing from T2.1–T2.16 was dropped. These are the limits of what shipped, stated so none of them is
mistaken for working.

| Open | Why it is acceptable now | Who must close it |
|---|---|---|
| **Multi-hop community origin.** `originServerId` is the delivering peer, which equals the origin for a direct delivery and diverges under relay. | Every path this build exercises fetches a peer's own content from that peer: `Deliver` is push-from-origin, `StreamActivities`/`Backfill` are pull-from-origin. | **T3.11 `BridgeRelay`** — relay is exactly where the two stop coinciding. Fix is `origin_server_key` in a `jb:community:create:v2` row (ADR-010). |
| **`WitnessLog.verifyPeerSth` keeps peer heads in an in-process `Map`** in both `LocalMerkleLog` and `MongoMerkleLog`. | The `MongoFederationLedger` persists peer tree heads and is what `FederationInbox.observePeerSth` actually compares against in production — that path IS durable and is asserted by `federation.integration.spec.ts`. The witness log's copy is a second, weaker signal. | Fold the witness log's copy into the ledger, or delete it. |
| **`AnnounceResponse.vouches` is always empty.** Vouches are stored, weighed and enforced (`recordVouch`, `evaluateTrust`), but not yet gossiped in the handshake. | Trust still derives correctly from vouches this node holds; it simply does not yet learn a third party's vouches from a handshake. | T2.13's directory exchange is the natural carrier. |
| **`bytes_per_min` is granted but not enforced.** Envelope-per-minute buckets are enforced per class; the byte budget is advertised in `Quota` and not spent. | Per-domain `max_bytes` already bounds a single envelope, and the envelope rate bounds the aggregate within an order of magnitude. | A second Lua bucket in `RedisPeerQuotaLimiter`, same shape as the first. |
| **No TLS on the federation port.** `ChannelCredentials.createInsecure()` is the default. | Operators terminate TLS at their own proxy today, and every payload is independently signed — an interceptor can read but cannot forge. | P3, alongside uplink and source-IP work. |
| **Admission cost is charged at origin, not per hop** (ADR-011). A peer could relay envelopes whose origin never paid. | Every anti-abuse gate is keyed to one node by design, so re-charging makes 29 of 30 Forum rows unfederatable. The peer's quota bounds the volume, its trust bounds the classes, FD-16 demotes it for repeated breach. | P4, if cross-node cost accounting becomes necessary: an origin-signed cost attestation, verifiable by any peer holding that node's key. |

Two things landed early because they were cheap now and expensive to retrofit, and both are done:

- **The backpressure hint** (`DeliverAck.backpressure_hint_ms`) — produced, honoured by the sender's
  backoff, and asserted by FG-09.
- **The plane guard** — one plane per stream, a mismatched frame rejected `PLANE_MISMATCH`, written
  before any Signal domain exists per `P0-P2-IMPLEMENTATION-PLAN.md` §5.1. A guard added after the
  second plane ships is a guard added after the leak.

---

## 6. Definition of done — met

Per `Plans/10` §9 and CLAUDE.md §7.3. A federation RPC is done when it satisfies its port, re-runs the
full pipeline on inbound, has an in-memory double alongside its production adapter, and is exercised by
a test citing its FG or FD identifier. The phase closes when the FG criteria pass **in CI**, not by hand.

All six RPCs satisfy that. `pnpm test` runs 356 workspace tests; the `federation` CI job runs
FG-01…FG-10 as a dedicated blocking gate; the `build` job runs the real-Mongo half of FG-05.

## 7. The demo (`Plans/08` §P2)

```bash
pnpm ops:two-node          # node-a on :3001, node-b on :3002, gRPC on :8451/:8452
                           # each lists the other by KEY — change a seed and you must
                           # change the key its partner lists (FD-02)

# post on A, watch it appear on B within a drain interval (1s here)
curl http://localhost:3002/v1/feed

# partition, publish, reconnect
docker compose -f ops/docker-compose.yml stop node-b
#   … publish 20 envelopes on A …
docker compose -f ops/docker-compose.yml start node-b
#   Backfill closes the gap exactly, from the durable cursor

curl http://localhost:3001/v1/federation/peers   # trust levels, scoped endpoints
curl http://localhost:3001/v1/federation/alerts  # FD-09 / FD-16 findings
pnpm ops:two-node:down
```
