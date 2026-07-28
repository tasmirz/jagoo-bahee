# Jagoo Bahee v2 — P0→P2 Coding Implementation Plan (React Native client)

## Context

`Plans/00-OVERVIEW.md` through `10-IMPLEMENTATION-SEQUENCE.md` define a frozen architecture: envelope contracts, two identity planes (FORUM anonymous / SIGNAL identified), a hexagonal `services/node` backend, and a phase order where **P2 (federation) is the primary goal**. The docs assume a Next.js web PWA as the reference client and a Rust→WASM signer for the browser. The user is building the client in **React Native** instead, which changes the client-side crypto and storage story but nothing about the backend, the wire contracts, or the federation goal.

Three decisions were confirmed with the user and drive every RN-specific choice below:
1. **Expo** (with a custom dev client / prebuild, not Expo Go) for the RN app.
2. **Pure JS/TS crypto** in RN — reusing the same TypeScript canonical-encoder/signer code the backend uses, via `@noble/*` libraries — instead of a native Rust (uniffi) binding.
3. **React Native is the only client for P0–P2.** `apps/web` is dropped from scope; it can be added later against the same shared packages.

This plan turns the frozen contracts into a concrete build order: what gets written, in what package, in what sequence, for P0 (Contracts & Skeleton), P1 (Core Node & Forum Plane), and P2 (Federation — the primary goal). Task IDs from `Plans/09-TASKS.md` (T0.x / T1.x / T2.x) are referenced throughout so this plan stays traceable to the frozen backlog; anything genuinely new for the RN path is marked **[NEW]**.

---

## 0. Consequences of the three decisions

| Original doc assumption | RN-only / pure-JS consequence |
|---|---|
| `crates/jb-wasm` — browser WASM binding (T0.13) | **Dropped.** Hermes (RN's JS engine) doesn't run WebAssembly, and there's no browser to target. |
| Web PWA: `jb-wasm` in a Web Worker, one worker per plane (SG-02) | **Adapted.** No Web Worker equivalent exists in RN. Signing runs on the JS thread inside a dedicated `signer/` module. Plane isolation (SEP-04) is enforced by nominal TypeScript types + an ESLint import-boundary rule (new, mirrors AR-01's core/domain rule), not by process isolation. This is a documented, deliberate weakening vs. the browser design — acceptable because RN apps aren't exposed to arbitrary third-party script injection the way a web page is. |
| Non-extractable IndexedDB entry, passphrase-derived AES-GCM unlock | **Adapted.** `expo-secure-store` (iOS Keychain / Android Keystore-backed) holds the passphrase-wrapped mnemonic; unwrap happens in JS using `@noble/hashes` (scrypt) + `@noble/ciphers` (XChaCha20-Poly1305). |
| Mobile: `jb-core` native, Secure Enclave / Android Keystore raw key ops | **Deferred.** Ed25519/ML-KEM/ML-DSA math runs in pure JS (`@noble/curves`, `@noble/post-quantum`). A native Rust binding (uniffi) remains the correct long-term hardening step but isn't justified for the P0–P2 hackathon timeline. Flagged in §7 as explicit future work, not silently dropped. |
| `apps/web`: 42 routes, static export, verification badges, audit view (T1.34–T1.37) | **Rebuilt once, as RN screens**, in `apps/mobile`. Same read API, same provenance verification logic, no static-export requirement. |
| SSE `/v1/events` (T1.32) | **Simplified to polling** via TanStack Query for P0–P2 (no native `EventSource` in RN). `react-native-sse` can upgrade this later; not needed to hit the P1/P2 exit gates. |
| Argon2id PoW solved client-side (T1.14 consumer) | RN needs a **native module** for Argon2id (pure JS is too slow and WASM doesn't run). Use `react-native-argon2`. This is the one PoW-related native dependency, alongside secure storage — both require Expo prebuild, which is already assumed. |
| Cross-language gate (P0-G1): TS / Rust / Python byte-identical | **Kept, scope-trimmed.** Rust (`crates/jb-core`) and Python stay as reference implementations of *only* canonical encoding + content ID + Ed25519 verify — enough to satisfy P0-G1–G4. BIP85 and ML-DSA-44 are implemented TS-only (used by backend + RN) and are not cross-language-gated, since they aren't required by the P0-G1–G7 exit criteria. This keeps "never cut" (T0.14–T0.17) intact while not building a Rust BIP85/ML-DSA implementation nobody will run. |

---

## 1. Monorepo & tooling

```
jagoo-bahee/
├── pnpm-workspace.yaml         # services/node, apps/mobile, packages/*
├── turbo.json                  # task graph: build/test/lint per package
├── Cargo.toml                  # workspace: crates/jb-core (Rust reference impl only)
├── tools/vectors/              # Python fixture/verification script (not a service)
├── ops/docker-compose.yml      # mongo, redis, minio (S3-compatible), node-a, node-b
```

- **JS/TS**: pnpm workspaces + Turborepo. Node backend and RN app share `packages/sdk-ts`.
- **Proto**: `buf` for lint/breaking-change checks; `ts-proto` generates TS, `prost` (build.rs) generates Rust, `protoc`'s Python plugin generates Python — all three from `proto/jagoo/v1/*.proto`, never hand-duplicated (AR-10).
- **Backend runtime**: Node.js + TypeScript, Fastify for HTTP (`POST /v1/envelopes`, read API), `@grpc/grpc-js` + `ts-proto` for the federation gRPC service (P2).
- **Data stores**: MongoDB (envelope log + projections + Merkle log), Redis (credit ledger, nullifiers — atomic Lua scripts), MinIO for attachment blobs (S3-compatible, local dev).
- **RN app**: Expo (prebuild/dev-client, not Expo Go — needed for `react-native-argon2` and secure-store native modules), `expo-router` for screens, TanStack Query for server state/caching, Zustand for local auth/UI state.
- **Testing**: Vitest (TS), `cargo test` (Rust), `pytest` (Python vectors), a two-node Docker Compose harness for P2 integration tests.

---

## 2. Repository layout (final)

```
jagoo-bahee/
├── proto/jagoo/v1/
│   ├── envelope.proto  forum.proto  federation.proto  registry.yaml
│   # signal.proto / bridge.proto exist as empty-ish stubs so P0's registry
│   # generator is exercised against all bodies, but no P4/P6 logic is built yet.
│
├── crates/
│   └── jb-core/                 # Rust reference: canonical encode, contentId, Ed25519 verify
│
├── tools/vectors/                # Python reference: same, + fixture runner used by CI
│
├── packages/
│   ├── sdk-ts/                   # generated TS types + canonical encoder + contentId +
│   │                              # Ed25519 sign/verify + BIP85 + PlaneSigner<FORUM> impl
│   └── ui/                       # shared RN components (feed card, vote widget, badges)
│
├── services/node/
│   ├── src/core/{domain,ports,app}
│   ├── src/adapters/{inbound/{http,grpc}, outbound/{mongo,redis,s3,merkle}}
│   ├── src/features/forum/{post,comment,vote,community,membership,moderation,
│   │                        report,role,award,attachment,social,message,label}
│   └── src/composition/root.ts
│
├── apps/mobile/                  # Expo app — the only client for P0–P2
│   ├── app/                      # expo-router file-based routes (replaces the 42 web routes)
│   ├── src/signer/                # PlaneSigner<FORUM> boundary — the only module allowed
│   │                              # to import raw key material (ESLint-enforced)
│   ├── src/data/                  # TanStack Query hooks per read-API resource
│   └── src/verify/                # client-side signature + inclusion-proof verification
│
└── ops/                          # docker-compose (mongo/redis/minio/node-a/node-b)
```

---

## 3. Phase P0 — Contracts & Skeleton

**Goal:** every contract frozen, generating code in TS/Rust/Python, cross-language gate green, a running node skeleton.

### 3.1 Proto & registry (T0.1–T0.7)
1. `proto/jagoo/v1/envelope.proto` — `Envelope`, `Receipt`, `SignedTreeHead`, `Plane`, `KeyAlg`, `Priority`, `AntiAbuse` (exact fields per `02-CONTRACTS-CORE.md` §2–3).
2. `proto/jagoo/v1/forum.proto` — every body in `03-CONTRACTS-FORUM.md` §1.
3. `proto/jagoo/v1/federation.proto` — the 6 RPCs in `05-CONTRACTS-FEDERATION.md` §2.
4. Minimal `signal.proto` / `bridge.proto` stubs (message shells only, no handlers) so registry codegen covers all planes without pulling P4/P6 logic forward.
5. `proto/jagoo/v1/registry.yaml` — every Forum domain row from `03-CONTRACTS-FORUM.md` §2.
6. Codegen: `buf generate` → `ts-proto` output into `packages/sdk-ts/src/gen`, `prost` build script into `crates/jb-core/src/gen`, `protoc --python_out` into `tools/vectors/gen`. A CI step regenerates and diffs — hand-edited generated code fails the build (AR-10).

### 3.2 Canonical encoding — three implementations (T0.8–T0.9, T0.10)
- **Rust (`crates/jb-core`)**: deterministic protobuf canonical encoder (ascending field order, omitted defaults, NFC-normalised strings, no floats), `content_id()`, Ed25519 verify (RFC 8032 vectors). This is the reference implementation, not a runtime dependency of anything else in P0–P2.
- **Python (`tools/vectors`)**: same three functions, using `pynacl`/`cryptography`. A script, not a service.
- **TypeScript (`packages/sdk-ts/src/core`)**: same three functions, using `@noble/curves/ed25519` and `@noble/hashes/sha256`. This is the one that actually runs in production — both `services/node` and `apps/mobile` import it.

### 3.3 Crypto primitives, TS-only for P0–P2 (T0.11–T0.12, trimmed)
- `packages/sdk-ts/src/crypto/bip85.ts` — BIP85 derivation for the paths in `01-IDENTITY-PLANES.md` §2.2 (forum device identity, per-community key, per-epoch posting secret, DM key agreement, credential blinding secret), built on `@scure/bip39` + `@scure/bip32`. Known-answer tests confirm distinct keys per path.
- `packages/sdk-ts/src/crypto/mldsa.ts` — ML-DSA-44 via `@noble/post-quantum`, used for `KeyCertificate.pq_attestation` in P1. NIST KAT vectors checked in TS only (see §0 rationale).

### 3.4 `packages/sdk-ts` signer boundary (SG-01, adapted)
- `PlaneSigner<FORUM>` implementation: `identity()`, `sign()`, `nullifier()`, `blind()`/`unblind()`, `panic()`. Private key material is only ever referenced inside `packages/sdk-ts/src/signer/` and `apps/mobile/src/signer/`.
- **[NEW]** ESLint rule (`no-restricted-imports` scoped by path, or a custom rule) that fails any file outside those two directories importing the raw-key module. This is the RN-appropriate substitute for SG-01/SG-02's Web Worker isolation — documented in §0.

### 3.5 `services/node` hexagonal skeleton (T0.18–T0.22)
- `core/domain`, `core/ports`, `core/app`, `adapters/{inbound,outbound}`, `features/`, `composition/` directories per `07-ARCHITECTURE.md` §6.
- Port interfaces from `07-ARCHITECTURE.md` §2 (`EnvelopeReader/Writer`, `ProjectionStore`, `SignatureVerifier`, `CertificateStore`, `CreditLedger`, `NullifierRegistry`, `WitnessLog`, `Transport`, `PeerDirectory`, `LabelProvider`, `BlobStore`, `Clock`), each with an in-memory double.
- Import-boundary lint rule: `core/domain` importing anything from `adapters/` fails CI (P0-G6).
- `DomainRegistry` + `DomainHandler` plugin machinery; a throwaway test handler proves register/dispatch requires zero core changes.
- Unknown-version / unknown-domain hard rejection (P0-G7).

### 3.6 Cross-language gate + regressions (T0.14–T0.17 — never cut)
- Shared fixture file (envelopes covering every registry domain) consumed by TS test, `cargo test`, and `pytest`. CI fails if any two languages diverge (P0-G1).
- Domain-separation regression: sign under domain A, verify under domain B → reject (P0-G2).
- Plane-separation regression: FORUM signature verified as SIGNAL envelope → reject (P0-G3).
- Field-omission regression — the v1 signature-confusion bug: a body with fields omitted must not validate against the same body with those fields populated (P0-G4).

**P0 exit checklist:** P0-G1 through P0-G7 all pass as CI-blocking tests (not manual checks). Demo: a CLI in `services/node` constructs/signs/encodes/verifies an envelope; the Rust binary and Python script verify the same fixture and print identical content IDs.

---

## 4. Phase P1 — Core Node & Forum Plane (single instance, RN client)

**Goal:** full forum feature parity on one instance, through the real pipeline, with the RN app as the only client.

### 4.1 Ingress pipeline & storage (T1.1–T1.7)
- The 19-step validation pipeline (`02-CONTRACTS-CORE.md` §5) as individually unit-tested pure functions, composed with a typed error contract. Steps 1–12 perform no DB writes (VP-01).
- `MongoEnvelopeStore` (unique index on `content_id`), `MongoProjectionStore` with transactions (projection write + log append atomic — VP-02), `LocalMerkleLog` (append/STH/inclusion/consistency, in-process, backed by Mongo).
- `rebuild-projections` CLI command — reconstructs every collection from the envelope log, byte-identical (P1-G3).
- `POST /v1/envelopes` — the single write endpoint (Fastify route), batch rejects mixed planes (WE-03).

### 4.2 Identity & anti-abuse (T1.8–T1.17, RN-adapted)
- `apps/mobile/src/signer/` — forum `PlaneSigner`, backed by `packages/sdk-ts`. Mnemonic generated on first run, passphrase-wrapped (scrypt + XChaCha20-Poly1305), stored via `expo-secure-store`.
- `CertificateStore` + key certificate publish flow; uncertified author → `NO_CERTIFICATE`.
- Key revocation with `effective_from_ms` semantics (KY-01); duress revocation export (KY-02) — the RN app exposes a "prepare duress revocation" action that produces an exportable signed blob.
- `RedisCreditLedger` — atomic Lua token bucket (P1-G6: 50 concurrent vs. 10 credits → exactly 10 succeed).
- Argon2id PoW: server issues stateless HMAC-derived challenges (P1-G9: 10⁵ challenges, no memory growth); RN app solves them via the `react-native-argon2` native module when credits run low.
- `NullifierRegistry`, `CredentialIssuer` (blind signatures) for anonymous membership credentials.
- Rate-limit subject fix: no `User-Agent` in any subject; trusted-proxy `X-Forwarded-For` parsing only (P1-G4, P1-G5).

### 4.3 Forum feature directories (T1.18–T1.30, parallelisable)
One `services/node/src/features/forum/<name>/` per feature — handlers + projections + read routes + tests, nothing shared beyond the registry row:
- **Group A**: `post`, `comment`, `vote`
- **Group B**: `community`, `membership`, `role`
- **Group C** (after A+B): `moderation` (16 `ModVerb`s, hash-chained mod log, replay-rejected — P1-G8), `report`, `label` (`NullLabeller` default, labeller-down still publishes — FM-06)
- **Group D**: `award`, `attachment` (presign/confirm/claim, hash binds blob to signed claim), `social`
- **Group E** (needs 4.2's signer): `message` — pseudonymous E2EE DMs, server stores ciphertext only

### 4.4 Read API (T1.31–T1.33)
- All endpoints from `03-CONTRACTS-FORUM.md` §5, cursor-paginated, every content object carrying a `provenance` block (contentId, signature, canonicalBytes, receipt with inclusion proof).
- Polling-based live updates for P0–P2 (see §0) instead of SSE; tagged cache keys so invalidation cost doesn't scale with keyspace size.

### 4.5 `apps/mobile` — the RN client (replaces T1.34–T1.37)
- **Screens** (`expo-router`), one screen group per v1 route family: feed, post detail + comments, community list/detail/settings, membership/roles, moderation queue + mod log, reports, profile, saved/follows/blocks, awards, attachment upload, DMs, search, audit/receipts view. Same functional coverage as the original 42 routes; no static-export requirement.
- **Data layer** (`src/data/`): one TanStack Query hook per read-API resource; mutations go through a single `submitEnvelope()` helper that signs via `src/signer/` and posts to `/v1/envelopes`.
- **Verification** (`src/verify/`): recompute canonical bytes + content ID from the `provenance` block and verify the Ed25519 signature client-side, entirely offline — signature badges never trust the server's word for it (T1.36 equivalent).
- **Audit view**: given a stored STH, verify a content item's inclusion proof offline (T1.37 equivalent).
- No bundle-size gate (that was a web-specific concern, T1.38); Expo's own release-build size is monitored informally.

**P1 exit checklist (adapted):** P1-G1 (every forum feature reachable in the RN UI), P1-G3–P1-G9 as originally specified, P1-G11 (new domain requires zero core changes). P1-G2 and P1-G10 (42 web routes, JS bundle size) are dropped — they were web-specific; the RN equivalent is "every feature has a screen," verified manually plus by an integration test per feature.

---

## 5. Phase P2 — Federation ★ PRIMARY GOAL

**Goal:** two independent node instances exchange, verify, and project content. This is backend-only work — the RN app needs no new capability beyond pointing at a different instance's base URL.

### 5.1 gRPC service, TOFU, directory (T2.1–T2.3, T2.10, T2.12–T2.15)
- gRPC server/client scaffolding from `federation.proto`; loopback connectivity test.
- `Announce` handshake → TOFU admission at `PROBATION` (FG-01); `PeerDirectory` with vouch-based promotion rules (`05-CONTRACTS-FEDERATION.md` §3).
- Per-peer, per-class quotas with auto-demotion on repeated breach (FG-09).
- `ExchangeTreeHeads` + fork detection + operator alert (FG-08).
- `ExchangeDirectory`; discovery endpoints (`/.well-known/jagoo-bahee`, `/v1/federation/peers`, `/v1/federation/sth`) listing all scoped endpoints (FD-17 — needed later by P3, cheap to build now).
- Plane separation enforced on the wire — Forum and Signal envelopes never co-batched (FG-10; trivially true in P0–P2 since Signal isn't built yet, but the guard is written now so it isn't forgotten later).

### 5.2 Delivery chain (T2.4–T2.9, T2.11)
- `Deliver` (client-streaming, with `DeliverAck` + backpressure) and `StreamActivities` (server-streaming, `since_index`) (FG-02).
- Inbound projection through the **full** pipeline, not archival (FG-06 — tampered envelope rejected, not projected).
- Unique index on `(content_id, direction)` — dedupe by the database, never a racy read (FG-05).
- Durable outbound queue: exponential backoff, dead-letter, survives process restart.
- `Backfill` with auto-trigger on reconnect (FG-04: partition 5 min, 20 envelopes, reconnect → exactly 20, zero duplicates).
- Outbound-only mode for NATed nodes — `Deliver`/`StreamActivities` both initiated outbound, no inbound port required (FG-07).

### 5.3 Two-node demo harness (T2.16)
- `ops/docker-compose.yml`: `node-a`, `node-b` (separate Mongo/Redis per instance), both reachable on different ports; a script that runs all FG-01–FG-10 as automated integration tests against the live pair.
- **[NEW, small]** RN app: an "instance" switcher in settings (base URL field), so the same build can point at node A or node B for the live demo — this is the only P2-driven client change.

**P2 exit checklist:** FG-01–FG-10 from `05-CONTRACTS-FEDERATION.md` §8, all passing as automated tests against the two-node harness, not by hand.

---

## 6. Sequencing

Same spine/lane structure as `10-IMPLEMENTATION-SEQUENCE.md`, with the CLIENT lane retargeted to `apps/mobile` and the CRYPTO lane trimmed per §0:

```
SPINE:  T0.1-T0.9 → T0.14-T0.17 (cross-language gate) → T0.18-T0.22
          → T1.1-T1.7 (pipeline) → T1.18-T1.30 (forum features, parallel)
          → T2.1-T2.16 (federation) ── PRIMARY GOAL MET
CRYPTO: BIP85 + Ed25519 + ML-DSA (TS only) ── in parallel from day 0
CLIENT: apps/mobile scaffold (waits for T0.7 codegen) → signer (waits for CRYPTO)
          → screens against fixtures → swap to live API at T1.7 → verification/audit views
INFRA:  CI skeleton, Docker compose, regenerate-and-diff check, import-boundary lint,
          two-node harness (build ahead of T2.16, not at it)
```

**Never cut, regardless of time pressure:** T0.14–T0.17 (cross-language gate), T1.1–T1.7 (pipeline), T2.1–T2.9 (federation core). If time runs out, the honest floor is P0 + P1 Group A (post/comment/vote) + P2 — federation between two minimally-featured instances, which is exactly the primary goal.

---

## 7. Explicit deviations & future hardening (not silent cuts)

- **Native Rust signer for mobile** (uniffi-bindgen-react-native binding `jb-core`/`jb-crypto`, keys unlockable but never fully leaving native memory) is the architecturally "correct" long-term state per `01-IDENTITY-PLANES.md` §8. Deferred past P2; revisit once the federation demo is solid and there's time for the native build/CI matrix.
- **SG-01/SG-02 process isolation** (one Web-Worker-equivalent per plane) has no RN analogue. Current mitigation is nominal typing + ESLint boundary + secure-store-wrapped-at-rest key material. If a Signal plane (P4) is added later, this should be revisited — SEP-04 was written assuming stronger isolation than a lint rule provides.
- **SSE→polling**: fine for P0–P2 demo purposes; revisit if P4 broadcast urgency (sub-second delivery) makes polling latency unacceptable.
- **apps/web**: deliberately out of scope for P0–P2, not abandoned — P5 (offline/service-worker) needs a web PWA regardless, so `packages/sdk-ts` and `packages/ui` are already shaped to be reused by a future `apps/web`.

---

## 8. Verification / demo script (end of P2)

1. `docker compose up` → `node-a`, `node-b`, Mongo, Redis, MinIO.
2. Run the cross-language vector suite (`turbo run test:vectors`) — TS/Rust/Python byte-identical, CI-blocking.
3. Point the RN app (dev client) at `node-a`. Register a forum identity (mnemonic generated, wrapped, stored). Create a community, post, comment, vote — verify signature badges render from client-side verification with the network disabled (airplane mode) once content is cached.
4. `Announce` node-b to node-a. Confirm `PROBATION` trust level (FG-01).
5. Post on node-a's app instance; switch the RN app's instance setting to node-b; confirm the post appears, verified, within seconds (FG-02).
6. Kill node-b, create 20 more envelopes on node-a, restart node-b — confirm `Backfill` delivers exactly 20 with zero duplicates (FG-04).
7. Run the full FG-01–FG-10 automated suite against the two-node harness; all green is the P2 (primary goal) exit gate.
