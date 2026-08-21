# 09 — Task Backlog

> Task IDs are stable. `deps` lists blocking task IDs. `gate` references the exit criterion in `08-PHASES.md`.
> **Rule:** a task is done when its acceptance line passes as an automated test, not when the code compiles.

---

## P0 — Contracts & Skeleton

| ID | Task | Deps | Acceptance |
|---|---|---|---|
| **T0.1** | Write `proto/jagoo/v1/envelope.proto` — Envelope, Receipt, SignedTreeHead, Plane, KeyAlg, Priority, AntiAbuse | — | Compiles under `protoc` for TS, Rust, Python |
| **T0.2** | Write `proto/jagoo/v1/forum.proto` — all Plane A bodies | T0.1 | Compiles; every body in `03` §1 present |
| **T0.3** | Write `proto/jagoo/v1/signal.proto` — all Plane B bodies | T0.1 | Compiles; every body in `04` §2–6 present |
| **T0.4** | Write `proto/jagoo/v1/federation.proto` | T0.1 | Compiles; all 6 RPCs present |
| **T0.5** | Write `proto/jagoo/v1/bridge.proto` | T0.1 | Compiles |
| **T0.6** | Write `registry.yaml` with every domain row from `03` §2 and `04` §5 | T0.2, T0.3 | Schema-validated; no domain missing |
| **T0.7** | Build the registry code generator → TS, Rust, Python | T0.6 | Generated tables identical across languages (P0-G5) |
| **T0.8** | `jb-core`: deterministic protobuf canonical encoder | T0.1 | Field order, omitted defaults, NFC normalisation all unit-tested |
| **T0.9** | `jb-core`: `contentId()` | T0.8 | Matches the spec format; stable across re-signing |
| **T0.10** | `jb-crypto`: Ed25519 sign/verify | — | RFC 8032 test vectors pass |
| **T0.11** | `jb-crypto`: BIP85 derivation for all paths in `01` §2.2 and §3.2 | T0.10 | Known-answer tests; Forum and Signal paths produce distinct keys |
| **T0.12** | `jb-crypto`: ML-DSA-44 for key certificates | T0.10 | NIST KAT vectors pass |
| **T0.13** | `jb-wasm`: browser binding for core + crypto | T0.8–T0.12 | < 250 KB gzipped (NFR-F02) |
| **T0.14** | Cross-language fixture set + CI gate | T0.8, T0.13 | **P0-G1** — byte-identical across TS/Rust/Python |
| **T0.15** | Domain-separation regression test | T0.14 | **P0-G2** |
| **T0.16** | Plane-separation regression test | T0.14 | **P0-G3** |
| **T0.17** | Field-omission signature-confusion regression test *(the v1 bug)* | T0.14 | **P0-G4** |
| **T0.18** | `services/node` hexagonal skeleton — `core/domain`, `core/ports`, `core/app`, `adapters`, `features`, `composition` | — | Directories exist; composition root builds an empty node |
| **T0.19** | Port interfaces from `07` §2 | T0.18 | All compile; in-memory doubles for each |
| **T0.20** | Import-boundary lint rule | T0.18 | **P0-G6** — fails when `core/domain` imports a driver |
| **T0.21** | `DomainRegistry` + `DomainHandler` plugin machinery | T0.19 | A test handler registers and dispatches with no core change |
| **T0.22** | Unknown-version / unknown-domain rejection | T0.21 | **P0-G7** |

---

## P1 — Core Node & Forum Plane

### Pipeline & storage

| ID | Task | Deps | Acceptance |
|---|---|---|---|
| **T1.1** | Validation pipeline steps 1–12 as individually testable pure functions | T0.21 | Each step unit-tested in isolation; **VP-01** (no DB writes) verified |
| **T1.2** | Pipeline composition + typed error contract (`02` §6) | T1.1 | Every error code reachable by a test |
| **T1.3** | `MongoEnvelopeStore` (reader + writer) | T0.19 | Unique index on `content_id`; range iteration works |
| **T1.4** | `MongoProjectionStore` with transactions | T0.19 | Projection + log append atomic (**VP-02**) |
| **T1.5** | `LocalMerkleLog` — append, STH, inclusion, consistency | T1.4 | Inclusion proof verifies offline; consistency detects a rewrite |
| **T1.6** | `rebuild-projections` command | T1.3, T1.4 | **P1-G3** — byte-identical rebuild |
| **T1.7** | `POST /v1/envelopes` — the single write endpoint | T1.2 | **WE-01**; batch rejects mixed planes (**WE-03**) |

### Identity & anti-abuse

| ID | Task | Deps | Acceptance |
|---|---|---|---|
| **T1.8** | Forum `PlaneSigner` in a Web Worker; passphrase-wrapped IndexedDB key store | T0.13 | **SG-01** — no private key reachable from page JS |
| **T1.9** | Key certificate publish + `CertificateStore` | T0.12, T1.4 | Uncertified author rejected with `NO_CERTIFICATE` |
| **T1.10** | Key revocation with `effective_from_ms` semantics | T1.9 | **KY-01** — pre-revocation content stays valid |
| **T1.11** | Duress revocation: pre-sign, export, third-party publish | T1.10 | **KY-02** |
| **T1.12** | Challenge/response auth, key-bound challenge, typed claims, separate signing keys per token class | T1.8 | **P1-G7**; challenge replay rejected |
| **T1.13** | `RedisCreditLedger` — atomic Lua token bucket | T0.19 | **P1-G6** — 50 concurrent vs 10 credits → exactly 10 |
| **T1.14** | Argon2id PoW, pressure-scaled, key-bound, stateless HMAC challenge | T1.13 | **P1-G9** — 10⁵ challenges, no memory growth |
| **T1.15** | `NullifierRegistry` | T1.13 | Second claim in the same epoch rejected |
| **T1.16** | `CredentialIssuer` — blind signature issue/verify | T1.14 | Issued credential unlinkable to the issuing session |
| **T1.17** | Rate-limit subject fix: no User-Agent; trusted-proxy XFF parsing | T1.13 | **P1-G4**, **P1-G5** |

### Forum features (one directory each — `07` §3)

| ID | Task | Deps | Acceptance |
|---|---|---|---|
| **T1.18** | `features/forum/post` — create, update, delete | T1.7 | Projects correctly; owner-only enforced |
| **T1.19** | `features/forum/comment` — create, update, delete, threading, depth | T1.18 | Tree renders; depth precomputed |
| **T1.20** | `features/forum/vote` | T1.18 | Unique `(author, target)`; score aggregation correct |
| **T1.21** | `features/forum/community` — create, update, archive, settings, theme | T1.7 | All v1 settings preserved |
| **T1.22** | `features/forum/membership` — join, leave, flags | T1.21 | Bitmap positions match `03` §3 |
| **T1.23** | `features/forum/moderation` — all 16 `ModVerb`s, hash-chained mod log | T1.18, T1.19 | **P1-G8** — replay rejected; chain verifies |
| **T1.24** | `features/forum/report` — create, resolve | T1.23 | Status lifecycle correct |
| **T1.25** | `features/forum/role` — define, assign, revoke; 29-bit enum translation | T1.21 | **FM-02** — v1 role definitions survive |
| **T1.26** | `features/forum/award` — types, give, anonymous | T1.18 | |
| **T1.27** | `features/forum/attachment` — presign, confirm, claim with content hash | T1.7 | **ATT-11** — hash binds the blob to the signed claim |
| **T1.28** | `features/forum/social` — profile, follow, block, save, preferences | T1.7 | All v1 fields preserved |
| **T1.29** | `features/forum/message` — pseudonymous E2EE DMs via `MessagingEngine` | T1.8 | Server stores ciphertext only |
| **T1.30** | `features/forum/label` + `LabelProvider` with `NullLabeller` default | T1.18 | **FM-06** — labeller down ⇒ publishing still succeeds |

### Read API & client

| ID | Task | Deps | Acceptance |
|---|---|---|---|
| **T1.31** | All read endpoints from `03` §5 with cursor pagination and `provenance` blocks | T1.18–T1.30 | Every row in the table returns |
| **T1.32** | SSE `/v1/events` (replacing v1's no-op stub) | T1.31 | Live post/comment/vote updates arrive |
| **T1.33** | Tagged cache keys — **no** keyspace `SCAN` on write | T1.31 | Cache invalidation cost independent of keyspace size |
| **T1.34** | `apps/web`: all 42 v1 routes | T1.31 | **P1-G2** |
| **T1.35** | Static export build target | T1.34 | Serves correctly from a file:// or plain static host |
| **T1.36** | Client-side signature verification + badges | T0.13, T1.34 | Verification works with the network disabled |
| **T1.37** | Audit view with inclusion proof | T1.5, T1.34 | Proof verifies offline against a stored STH |
| **T1.38** | Bundle-size CI gate | T1.34 | **P1-G10** — < 300 KB gzipped |
| **T1.39** | New-domain smoke test | T1.21 | **P1-G11** — zero core changes required |

---

## P2 — Federation ★ PRIMARY

| ID | Task | Deps | Acceptance |
|---|---|---|---|
| **T2.1** | gRPC server + client scaffolding from `federation.proto` | T0.4, T1.7 | Both directions connect over loopback |
| **T2.2** | `Announce` handshake + TOFU admission at `PROBATION` | T2.1 | **FG-01** |
| **T2.3** | `PeerDirectory` with trust levels and vouches | T2.2 | Promotion rules from `05` §3 enforced |
| **T2.4** | `Deliver` (client-streaming) with `DeliverAck` and backpressure | T2.2 | Quota exceeded → `backpressure_hint_ms`, connection held |
| **T2.5** | `StreamActivities` (server-streaming) with `since_index` | T2.4 | **FG-02** |
| **T2.6** | Inbound projection through the full pipeline | T2.5 | **FD-04**; **FG-06** — tampered envelope rejected |
| **T2.7** | Unique index on `(content_id, direction)` | T2.6 | **FG-05** — replay rejected by the DB, not a racy read |
| **T2.8** | Durable outbound queue: backoff, dead-letter | T2.4 | Survives process restart with no loss |
| **T2.9** | `Backfill` with auto-trigger on reconnect | T2.8 | **FG-04** — exactly 20, zero duplicates |
| **T2.10** | Per-peer, per-class quotas + auto-demotion on repeated breach | T2.3 | **FG-09** — `PROBATION` class-3 rejected, class 0–2 accepted |
| **T2.11** | Outbound-only mode for NATed nodes | T2.4, T2.5 | **FG-07** |
| **T2.12** | `ExchangeTreeHeads` + fork detection + operator alert | T1.5, T2.2 | **FG-08** |
| **T2.13** | `ExchangeDirectory` | T2.3 | Peer records propagate with scope tags |
| **T2.14** | Discovery endpoints with full scoped endpoint lists | T2.13 | **FD-17** — all scopes listed, not just public |
| **T2.15** | Plane separation on the wire | T2.4 | **FG-10** — never co-batched |
| **T2.16** | Two-node integration test harness | T2.1–T2.15 | All FG criteria automated |

---

## P3 — ISP Availability & Bridging ★ SECONDARY

| ID | Task | Deps | Acceptance |
|---|---|---|---|
| **T3.1** | `ReachabilityScope` through endpoint, peer, and uplink records | T2.13 | Scope survives a directory round trip |
| **T3.2** | `UplinkManager` — config parsing, per-uplink probing, state machine | T3.1 | State transitions logged and exported as metrics (**TP-10**) |
| **T3.3** | Source-IP binding for outbound gRPC | T3.2 | **TG-01** — verified with `ss`/`netstat` in the test |
| **T3.4** | `PathSelector` — narrowest-working-scope + same-ASN bonus | T3.2 | **TP-13** — pure function, unit-tested with no network |
| **T3.5** | Endpoint failure backoff with jitter | T3.4 | No hot retry loop; no thundering herd on recovery |
| **T3.6** | Durable client peer directory with hourly refresh, never age-evicted | T3.1 | **TP-05**, **TP-06** |
| **T3.7** | Baked-in per-ISP seed directory | T3.6 | **TG-09** — cold client connects with `GLOBAL` blocked |
| **T3.8** | Network-namespace test harness: simulated ASNs, iptables scope control | T3.2 | **AR-14** — no physical multi-ISP setup needed |
| **T3.9** | ISP-local federation | T3.3, T3.8 | **TG-02** |
| **T3.10** | Scope-preference metrics | T3.4 | **TG-03** — metrics prove `ISP_LOCAL` wins |
| **T3.11** | `BridgeRelay` — pair config, relay decision, loop prevention | T3.2, T2.6 | **TG-04** — islands merge |
| **T3.12** | Per-pair, per-class quotas with reserved class 0–2 capacity | T3.11 | **TG-05** — broadcast crosses despite a bulk backlog |
| **T3.13** | Uplink failover: re-evaluate within 30 s, zero loss | T3.4, T2.8 | **TG-06** |
| **T3.14** | Auto re-announce + backfill after a switch | T3.13, T2.9 | **TG-07** |
| **T3.15** | UPnP-IGD / NAT-PMP mapping with clear failure reporting | T3.2 | **TP-14** — continues outbound-only on failure |
| **T3.16** | STUN reflexive discovery + CGNAT detection | T3.15 | **TP-15** — CGNAT surfaced in the admin UI |
| **T3.17** | Reverse-tunnel mode through a `TRUSTED` peer | T2.11 | **TG-08** |
| **T3.18** | mDNS / SSDP local discovery | T3.6 | Finds a node on the same segment |
| **T3.19** | Manual node entry (≤ 3 taps) + QR node address | T3.6 | **TP-19** |
| **T3.20** | Always-visible scope indicator in the client | T3.6 | **TG-10** — updates within 30 s |
| **T3.21** | Bridge visibility in the admin UI | T3.11 | **BR-06** — bytes per direction, per class, quota headroom |
| **T3.22** | Router port-forwarding docs, Bangla + English | — | **TP-17** — covers the common consumer models |

---

## P4 — Signal Plane over IP

| ID | Task | Deps | Acceptance |
|---|---|---|---|
| **T4.1** | Signal `PlaneSigner` — separate worker, separate key store | T1.8 | **SG-02**; **P4-G10** — independent panic wipe |
| **T4.2** | Plane-separation schema audit | T4.1 | **P4-G9** — no stored Forum↔Signal association |
| **T4.3** | `features/signal/channel` — declare, update, rotate, retire | T4.1 | **CH-03** — rotation signed by the old key, subscribers preserved |
| **T4.4** | Channel verification: claims, vouches, instance attestation | T4.3 | Trust signals from `01` §5.2 all render |
| **T4.5** | In-person QR fingerprint verification | T4.4 | **CV-03**, **P4-G1** — works with no network |
| **T4.6** | Confusable-name detection | T4.3 | **CH-02** — homoglyph collision surfaced |
| **T4.7** | `features/signal/broadcast` — emit, sequence, supersede, revoke | T4.3 | **P4-G2** |
| **T4.8** | Sequence gap detection in the client | T4.7 | **P4-G3** |
| **T4.9** | Severity gating on verification level | T4.4, T4.7 | **P4-G4** |
| **T4.10** | Retraction with in-place alert update | T4.7 | **P4-G5** — marked revoked, not deleted |
| **T4.11** | Broadcast size-budget enforcement at construction | T4.7 | **P4-G12** — ≤ 512 B, typed error before send |
| **T4.12** | Local subscription store with severity/category/area filters | T4.7 | **SB-01** — never serialised or transmitted |
| **T4.13** | Area-based subscription independent of channel | T4.12 | **SB-04** |
| **T4.14** | Opt-in server-side push subscription with explicit privacy warning | T4.12 | **SB-02** |
| **T4.15** | `MessagingEngine` generic over plane | T1.29 | **AR-07** — separate stores per plane |
| **T4.16** | Prekey bundles for offline session initiation | T4.15 | **P4-G6** |
| **T4.17** | Hybrid X25519 + ML-KEM-768 key agreement | T4.15 | **MS-01** — session key derives from both |
| **T4.18** | Symmetric ratchet forward secrecy | T4.17 | **MS-02** — today's compromise does not decrypt yesterday |
| **T4.19** | Delivery receipts + counter gap detection | T4.15 | **MS-05** |
| **T4.20** | Small-group messaging via sender keys (≤ 64) | T4.18 | **MS-06** |
| **T4.21** | Ciphertext-only storage audit | T4.15 | **P4-G7** — verified by direct DB inspection |
| **T4.22** | `features/signal/checkin` — zero cost, no credential | T4.1 | **P4-G11**, **CR-01** |
| **T4.23** | `features/signal/missing` — report, search, status | T4.1 | |
| **T4.24** | `features/signal/resource` — kind, area, state | T4.1 | |
| **T4.25** | Map view for broadcasts, check-ins, resources | T4.7, T4.22, T4.24 | Renders offline from cached data |
| **T4.26** | Separate SSE stream per plane | T1.32, T4.7 | **P4-G8**, **SG-API-01** |
| **T4.27** | Alert UI: distinct channel, pinned unread `CRITICAL`, max-font-scale legible | T4.7 | **NFR-A05** |

---

## P5 — Offline store-and-forward

| ID | Task | Deps | Acceptance |
|---|---|---|---|
| **T5.1** | `Outbox` — durable IndexedDB queue of signed envelopes | T1.36 | Survives app termination and device reboot |
| **T5.2** | Priority-ordered drain | T5.1 | **P5-G5** — class 0 before 500 class-3 |
| **T5.3** | Idempotent drain; `DUPLICATE` returns the original receipt | T5.1, T1.7 | **P5-G4** — no duplicates |
| **T5.4** | Service-worker background sync | T5.2 | Replaces v1's empty stubs; fires on reconnect |
| **T5.5** | Offline compose for every content type | T5.1 | **P5-G1** — final content IDs assigned offline |
| **T5.6** | Offline read of cached feed, comments, broadcasts, messages | T1.34 | Full navigation with the adapter disabled |
| **T5.7** | `MeshTransport` — WebRTC data channels | T5.1 | Registered as a `Transport`; no app-layer branching |
| **T5.8** | QR-exchanged SDP pairing | T5.7 | **P5-G2** — pairs with no network infrastructure |
| **T5.9** | Bloom-filter reconciliation | T5.7 | Diff computed correctly; reuses the existing bloom utility |
| **T5.10** | Store-and-forward with hop limit and TTL | T5.9 | **TR-08** — hop 8, TTL 72 h enforced |
| **T5.11** | Full pipeline verification before mesh storage **and** before relay | T5.7 | **P5-G3** — tampered envelope rejected and not relayed |
| **T5.12** | Per-peer mesh quotas | T5.7 | A flooding peer degrades only its own link |
| **T5.13** | `.jbpack` signed bundle export/import | T5.1 | **P5-G6** — every envelope independently verified on import |
| **T5.14** | Battery-aware and data-saver modes | T5.7 | Mesh scan frequency drops; page weight < 50 KB |

---

## P6 — Reticulum / LoRa (lowest priority)

| ID | Task | Deps | Acceptance |
|---|---|---|---|
| **T6.1** | `services/relay` — Python RNS daemon skeleton | T0.5 | Starts, announces a destination |
| **T6.2** | gRPC/Unix-socket bridge to the node | T6.1 | `Send`/`Receive`/`Status` round-trip |
| **T6.3** | `ReticulumTransport` adapter behind the `Transport` port | T6.2, T5.7 | Registered by config only |
| **T6.4** | Class filter — `BULK` rejected | T6.3 | **RG-03** — typed error |
| **T6.5** | Fragmentation + reassembly with per-fragment integrity | T6.3 | Partial reassembly discarded, never delivered |
| **T6.6** | Server-forwarding path: user → node (IP) → RNS → LoRa | T6.3 | **RG-01** — user device needs no RNS |
| **T6.7** | `TCPInterface` demo path | T6.6 | **RG-01** with no radio hardware |
| **T6.8** | Store-and-forward across a link break | T6.6 | **RG-02** |
| **T6.9** | Admin visibility: interfaces, paths, RSSI, SNR, queue depth | T6.2 | Renders in the admin UI |
| **T6.10** | Build without the Reticulum adapter | T6.3 | **RG-04** — full suite passes with it removed |
| **T6.11** | `RNodeInterface` hardware documentation | T6.7 | Tested on real LoRa boards if available |
| **T6.12** | *(optional)* End-device direct RNS | T6.3 | Opt-in; may slip past P6 |
| **T6.13** | *(optional)* RNS island ↔ IP federation bridge | T6.6, T3.11 | May slip past P6 |

---

## Cross-cutting, continuous

| ID | Task | Acceptance |
|---|---|---|
| **TX.1** | Every MUST requirement has a test referencing it by ID | **AR-15** — coverage report by requirement ID |
| **TX.2** | Cross-language vector gate stays green | Blocking CI on every commit |
| **TX.3** | Bundle-size and WASM-size gates | NFR-F01, NFR-F02 |
| **TX.4** | Raspberry Pi 4 acceptance run | NFR-F06 |
| **TX.5** | Bangla + English localisation | NFR-A04 |
| **TX.6** | WCAG 2.1 AA on core flows | NFR-A01 |
| **TX.7** | Dependency audit + SBOM | NFR-S07 |
| **TX.8** | Threat-model coverage — each A1–A6 adversary has a mitigation test | NFR-S08 |

---

## Suggested first week

| Day | Tasks |
|---|---|
| 1 | T0.1, T0.2, T0.3 — envelope and body protos |
| 2 | T0.4, T0.5, T0.6, T0.7 — federation proto, registry, generator |
| 3 | T0.8, T0.9, T0.10 — canonical encoder, content IDs, Ed25519 |
| 4 | T0.11, T0.12, T0.13 — BIP85, ML-DSA, WASM binding |
| 5 | **T0.14–T0.17 — the cross-language gate and the three regression tests.** This is the highest-value day in the plan: it locks the contract and permanently forecloses the v1 signature-confusion class of bug. |
| 6–7 | T0.18–T0.22 — skeleton, ports, lint rule, plugin registry |

Everything after this compiles against frozen, generated, cross-verified types.
