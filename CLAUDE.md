# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 1. What this is

**Jagoo Bahee v2** — a federated, censorship-resistant community platform that degrades gracefully from
full internet, through ISP-level blocking, to complete national blackout, and keeps working at every step.

It looks like a forum (communities, posts, threaded comments, votes, moderation, messaging). Underneath,
**every mutation is a self-authenticating signed envelope** that does not depend on any server for its
validity, so it can travel over HTTP, gRPC, LoRa, Bluetooth, or a QR code and still be verified on arrival.

Alongside it runs a second, deliberately unlinkable system: identified broadcast channels and
person-to-person messaging, where knowing exactly who is speaking is the entire point.

### Goal priority — normative, ordered

A later goal must never be built at the cost of an earlier one, and must never become a dependency of one.

| #   | Goal                                                                               | Rank            | Phase |
| --- | ---------------------------------------------------------------------------------- | --------------- | ----- |
| 1   | **Federation works** — independent instances exchange, verify, and project content | ★ **PRIMARY**   | P2    |
| 2   | **ISP-level availability and ISP bridging**                                        | ★ **SECONDARY** | P3    |
| 3   | Broadcast + identified messaging over IP                                           | tertiary        | P4    |
| 4   | Offline store-and-forward                                                          | low             | P5    |
| 5   | Reticulum / LoRa                                                                   | **lowest**      | P6    |

When a trade-off appears, resolve it in this order. Reticulum is an optional adapter behind a port and
must never be a dependency — the system ships complete with it absent from the build.

---

## 2. Repository layout

```
proto/jagoo/v1/          SOURCE OF TRUTH — envelope, forum, signal, federation, bridge, transport, registry.yaml
crates/jb-core/          Rust reference impl: canonical encode, contentId, Ed25519 verify
tools/vectors/           Python reference impl + shared fixture runner
tools/codegen/           generate.mjs — registry.yaml → TS / Rust / Python domain tables
packages/sdk-ts/         Generated TS types + canonical encoder + contentId + crypto + PlaneSigner
backend/                 NestJS node  — hexagonal: core/{domain,ports,app}, adapters, features, composition, cli
frontend/                Expo React Native app — the only client for P0–P2
Plans/                   FROZEN specification. Read-only unless explicitly revising a contract.
Code Implementation/     Phase plans, BUILD-LOG.md, decision records. Written before code, updated after.
```

**No source code in the repository root.** Every runtime artefact belongs to exactly one workspace
package. The root holds only workspace-level configuration — `package.json`, `pnpm-workspace.yaml`,
`turbo.json`, `tsconfig.base.json`, `Cargo.toml`, `eslint.config.mjs`, `buf.*`, `.npmrc`. Backend code
goes in `backend/`, client code in `frontend/`, shared code in a `packages/*` package. A `.ts`/`.tsx`
file at the root is a design-pattern violation, not a shortcut.

**State: P0, P1 and P2 complete — federation, the PRIMARY goal, is met. P4, P5 and P6 are
complete at their software gates. P3 is the one phase with a failing gate.**
`P0-SKELETON-PLAN.md` §10, `P1-CORE-NODE-PLAN.md` §6 and `P2-FEDERATION-PLAN.md` §4 hold the
gate-by-gate evidence tables; `P3-HANDOFF.md` holds P3's state and is authoritative over
`P3-ISP-AVAILABILITY-PLAN.md` §7.

**P3's container gate now runs, and it fails two criteria — see §3.** `P3-HANDOFF.md` says the
gate "has never once run green" and that the four node containers "then exit(1)". Both statements
are stale: as of 2026-08-15 the stack comes up healthy and `pnpm gate:isp` completes, scoring
**17 of 19**. The two failures are one defect and it is real, not flaky — it reproduces on a
stack recreated with `-v`. Do not mark P3 done, and do not re-derive its state from the plan file.

**P4/P5/P6 are "software gate" complete, which is a narrower claim than it looks.** The Signal
plane, offline mesh and Reticulum adapter pass their own suites. What has never been observed:
phone-to-phone LAN mesh between two real devices (the available handsets were on different
subnets), RNS reaching `running` on device, and any physical radio drill. The build log's
2026-07-31 entries say so explicitly. Treat "complete" in `P4-`/`P5-`/`P6-*.md` as "implemented
and unit-gated", never as "observed working end to end".

What works today: all 30 Forum domains use the 19-step ingress pipeline; Mongo, Redis, S3/filesystem
blobs, projection rebuild, Merkle receipts, auth, certificates/revocation, anti-abuse, the frozen
read API, SSE, tagged caching, notifications, operator controls, request security, and aggregate-only
observability are implemented. The Expo client follows `Plans/design.md`, exposes all 14 P1 feature
families, manages its SecureStore identity, and publishes real signed posts through the node.

**Federation (P2) works end to end.** All six `Federation` RPCs are served over `nice-grpc`
(ADR-007): TOFU admission at `PROBATION`, vouch-based promotion, `Deliver` with per-peer per-class
quotas and backpressure, `StreamActivities`, resumable `Backfill`, STH gossip with fork detection,
and directory exchange. Inbound envelopes re-run all 19 steps and are **projected**, never archived.
A durable outbox drains by priority class then FIFO, with exponential backoff and a dead-letter path.
`pnpm ops:two-node` brings up two nodes with separate databases that federate for real.

`pnpm smoke:local` is the dependency-free end-to-end acceptance path. It certifies a key,
authenticates, acquires a blind credential, creates a community, publishes a signed post, and reads
its projection and proof. Real Mongo/Redis integration tests remain mandatory in CI and skip unless
`MONGO_URL`/`REDIS_URL` point at running services; do not report them as locally executed when those
services are absent.

### `@jagoo/sdk` is consumed by three toolchains — do not "simplify" this

The sdk ships a **dual build** and every consumer resolves it differently. All three paths are asserted
by tests (`backend/src/sdk-interop.spec.ts`, `frontend/src/verify/verify.test.ts`) against the shared
`tools/vectors/expected.json`, so a client that drifts from the canonical form fails loudly.

| Consumer                      | Resolves via             | Gets       | Requires                                                                                           |
| ----------------------------- | ------------------------ | ---------- | -------------------------------------------------------------------------------------------------- |
| `backend/` (NestJS, CommonJS) | `require` condition      | `dist/cjs` | `module`/`moduleResolution: "node16"` — the legacy `Node` resolver ignores `exports` maps entirely |
| `frontend/` (Expo, Metro)     | `react-native` condition | `dist/esm` | `moduleResolution: "bundler"` + `unstable_enablePackageExports` in `metro.config.js`               |
| `pnpm vectors` (plain node)   | `import` condition       | `dist/esm` | —                                                                                                  |

Three things that look like cleanups and are not:

- **`react-native` must stay FIRST in each `exports` entry.** Condition order is priority order; move it
  after `require` and Metro bundles the CommonJS build meant for Nest.
- **`dist/cjs/package.json` and `dist/esm/package.json` (`{"type": ...}`) are load-bearing.** The sdk root
  is `"type": "module"`, so without the nested marker Node parses `dist/cjs` as ESM and throws
  `Unexpected token 'export'` — at require time, not build time.
- **Metro cannot bundle the sdk's TypeScript source**, because it does not remap TS-ESM `./x.js`
  specifiers to `./x.ts`. Hence `dist/esm`, hence `dev` depends on `^build`. For active sdk work run
  `tsc -w` alongside.

### Crypto has one semantic implementation and two primitive backends

ADR-017 adds `CryptoBackend` under `packages/sdk-ts/src/crypto/`. Node, iOS, tests and vectors use
the portable JS backend. Android installs the synchronous local Expo module from
`frontend/modules/jagoo-crypto` before a signer can run.

- BIP-39, hardened BIP-32/BIP-85, canonical hashing and signing policy remain shared TypeScript.
- Only `crypto/js-backend.ts` and the word-list data adapter may import Noble/Scure in production.
  `CRYPTO-01` is lint-enforced and has a failing-on-purpose probe.
- Do not import a primitive directly in a feature to “avoid the seam.” Add it to `CryptoBackend`,
  implement both adapters and extend the on-device parity suite.
- Forum and Signal root seeds are memoised only for an unlocked signer and zeroed on lock/panic.
- Expo Go cannot contain this local native module. Use `pnpm --filter @jagoo/frontend android` or a
  development client for Android parity; JS fallback in Expo Go is expected, not evidence of native
  execution.

**Folder mapping vs. the Plans.** `Plans/07-ARCHITECTURE.md` §6 names `services/node` and `apps/web`.
This repo uses **`backend/`** (= `services/node`) and **`frontend/`** (= `apps/mobile`, Expo RN).
`apps/web` is out of scope for P0–P2. Everything else in that layout is unchanged. When a doc says
`services/node/src/...`, read `backend/src/...`.

---

## 3. Commands

```bash
pnpm install                      # workspace install (pnpm 9, node-linker=hoisted for Metro)

# Contracts — proto/ is the source of truth, bindings are generated
pnpm proto:lint                   # buf lint + breaking-change check
pnpm proto:gen                    # regenerate TS / Rust / Python bindings
pnpm proto:check                  # regenerate and diff — fails on hand-edited generated code (AR-10)

# Build / verify — turborepo task graph
pnpm build
pnpm typecheck
pnpm lint                         # includes the import-boundary rules (AR-01, SG-01)
pnpm test                         # all workspaces
pnpm vectors                      # ★ cross-language canonical gate: TS ≡ Rust ≡ Python (P0-G1..G4)

# Single test
pnpm --filter @jagoo/backend exec vitest run src/core/domain/envelope.spec.ts
pnpm --filter @jagoo/backend exec vitest run -t "rejects unknown domain"
pnpm --filter @jagoo/sdk exec vitest run src/core/canonical.spec.ts
pnpm --filter @jagoo/frontend exec jest src/verify/provenance.test.ts

# Run
pnpm ops:up                       # mongo (single-node replica set) + redis + minio
pnpm dev:backend                  # NestJS, watch mode
pnpm dev:frontend                 # Expo dev client  (NOT Expo Go — native modules required)
pnpm --filter @jagoo/backend exec nest start --debug

# P2 federation
pnpm ops:two-node                 # node-a :3001 + node-b :3002, gRPC :8451/:8452, separate DBs
pnpm ops:two-node:down
pnpm --filter @jagoo/backend exec vitest run src/federation    # ★ FG-01..FG-10

# Operational
pnpm --filter @jagoo/backend rebuild-projections
pnpm smoke:local                  # dependency-free end-to-end acceptance
```

Rust and Python are invoked through `pnpm vectors`; run them directly with `cargo test -p jb-core`
and `python -m pytest tools/vectors`.

**Current verified baseline (2026-08-15, every line below re-run on this date):**

| Gate | Command | Result |
| --- | --- | --- |
| Cross-language vectors | `pnpm vectors` | ✅ 3 implementations agree on 16 vectors |
| Rust / Python directly | `cargo test -p jb-core`, `pytest tools/vectors`, `pytest services/relay` | ✅ 6 / 22 / 6 |
| Full suite, no infra | `pnpm test` | ✅ **813 passing**, 13 skipped — backend 519, frontend 219, SDK 71, audit-log 4 |
| Infra adapters | the three integration specs with `MONGO_URL`/`REDIS_URL` | ✅ 17/17 — the 13 skips above all pass, so **826** total |
| Lint / typecheck / proto | `pnpm lint`, `pnpm typecheck`, `pnpm proto:lint`, `pnpm proto:check` | ✅ all clean |
| Acceptance | `pnpm smoke:local` | ✅ |
| ★ Federation | `vitest run src/federation` | ✅ 30/30 (FG-01…FG-10) |
| ★ Federation, deployed | `pnpm ops:two-node` | ✅ both nodes healthy; a post on node-a projects on node-b with an identical content ID and an **origin-derived** community ID (ADR-010 holding in the wild) |
| ISP, in-process | `vitest run src/transport/isp.e2e.spec.ts` | ✅ 22/22 |
| ISP, deployed | `pnpm ops:isp && pnpm gate:isp` | ❌ **17/19 — see below** |

**Do not run the whole suite with `MONGO_URL` exported.** Setting it makes `NODE_SIGNING_SEED`
mandatory and swaps in the real adapters for specs written against the in-memory doubles: 4 files
fail and 30 tests skip. CI is right — `pnpm test` runs bare, and only the three integration specs
get the infra env. `MONGO_URL` from the host also needs `?directConnection=true`, never
`?replicaSet=rs0`, or the driver chases the in-network member name `mongo:27017` and hangs (L-16).

**The two P3 container-gate failures, characterised.** Both are one defect, and it is in the
bridge:

- `TG-04` — "the bridge reports itself ready (BR-01)": **no uplink pair has a TRUSTED peer on
  both sides.** `ops/isp-compose.yml` gives `jb-bridge` three static peers in `FEDERATION_PEERS`
  (a1, a2 on ASN 64501; b1 on 64502). The env var is intact inside the container, the keys match
  what those nodes actually derive, and `parsePeers` trims and would yield all three — but
  `/v1/federation/peers` on the bridge returns **exactly one**, b1, the last entry, with its
  endpoint listed twice. Last-write-wins onto one row: this is **L-21's shape** (an identity field
  that is constant across entities collapsing them onto one document), now on the *configured*
  peer path rather than the directory-exchange path. Look between parse and persist, not in the parser.
- `TG-04` — "a post published on island A after the cut appears on island B": fails as a
  consequence. Island B holds the post already, because a1 and b1 peer *directly* after directory
  exchange, so the crossing cannot be attributed to the bridge.

`TG-01` passes, and it is the assertion no in-process harness can make: `/proc/net/tcp` inside
`jb-bridge` shows established federation sockets leaving from **both** configured source
addresses, 10.90.1.30 and 10.90.2.30. The bulk crossing, per-direction accounting, IX-cut
isolation, uplink override and zero-loss failover all pass too. **L-20 one more time: the
in-process suite had TG-04 green and the container run does not.**

CI starts a Mongo replica set and Redis and runs the adapter tests as mandatory gates, and runs
FG-01…FG-10 as a **separate blocking job** — burying the project's primary goal inside the general
test job would let a green summary hide it being skipped. The ISP container gate is **not** in CI
and should be, once the bridge defect is fixed.

**First measurements ever taken on this system (2026-08-15).** The repository had no benchmark,
latency or memory harness of any kind before this; these came from the running containers and are
first datapoints, not a characterisation:

- **Federation propagation, node-a → node-b:** 623–857 ms over 5 samples, median ~790 ms.
  Upper bound only — the poller costs an HTTP round trip per attempt.
- **Read path** (`/v1/posts/:id`, keep-alive, node-b): 228 req/s at concurrency 1 (p50 4.1 ms),
  750 req/s at 8 (p50 9.4 ms), 688 req/s at 32 (p50 44.2 ms). Measure with keep-alive — a
  `curl`-per-request loop reports ~144 ms and is timing process spawn, not the node.
- **Resident memory:** an idle federating node is **~62 MiB**; under the TG-05 bulk crossing
  `jb-a1` reached **233 MiB at 54% CPU**. With Mongo (147 MiB) and Redis (3.7 MiB) on the same
  box that is ~384 MiB, so the "< 512 MB on a Pi 4" constraint in §5.5 is **tight rather than
  comfortable**, and Mongo is the term that dominates.
- **Canonical wire sizes**, straight from `tools/vectors/expected.json` + 64 B Ed25519:
  check-in **155 B**, Bangla broadcast **243 B**, full forum post **220 B**.

Two environment notes that will otherwise cost you an hour:

- **Rust is required** for `pnpm vectors`. If `cargo` is missing, install it — do not "temporarily" cut
  the gate to two languages. `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
--profile minimal --no-modify-path`, then add `~/.cargo/bin` to PATH.
- **`frontend` exports native platforms only** (`expo export --platform ios --platform android`). Web is
  not a P0–P2 target and `react-native-web` is deliberately absent, so a bare `expo export` fails.

**`pnpm vectors --update` rewrites `expected.json`.** It only does so after all three implementations
already agree, and it never runs in CI. Review the diff by hand — regenerating expectations without
reading them turns the project's highest-value gate into a rubber stamp (build log L-02).

---

## 4. The architecture in one pass

### 4.1 Everything is an envelope

There is **exactly one write endpoint in the entire system**: `POST /v1/envelopes`. A post, a vote, a ban,
a broadcast, a message, a key revocation — all of it is an `Envelope` (`Plans/02-CONTRACTS-CORE.md` §2).
No feature may add a write route. If a feature appears to need one, the registry row or the body schema
is wrong.

```
content_id = "jb1" + base32-nopad-lower( SHA-256( canonical_bytes(fields 1..12) ) )
signature  = Ed25519 over the same canonical bytes
```

Canonical encoding is deterministic protobuf: ascending field number, zero values omitted, no unknown
fields retained, NFC-normalised strings, **no floats anywhere in a signed structure**. There is exactly
one accepted form per version. Fallback chains and "try the legacy shape too" are forbidden — that
ambiguity is the exact v1 bug (signature confusion) this rebuild exists to foreclose.

### 4.2 The 19-step validation pipeline

Every envelope, from every transport — HTTP, gRPC federation, mesh, Reticulum — runs the same pipeline
in the same order (`Plans/02-CONTRACTS-CORE.md` §5):

```
1 SIZE → 2 PARSE → 3 VERSION → 4 DOMAIN → 5 PLANE → 6 ALG POLICY → 7 PRIORITY → 8 CLOCK
→ 9 SIGNATURE → 10 CERTIFICATE → 11 DEDUPE → 12 REPLAY → 13 ANTI-ABUSE → 14 AUTHORISE
→ 15 BODY VALIDATE → 16 APPLY → 17 WITNESS → 18 RECEIPT → 19 FANOUT
```

- Steps 1–12 perform **no database writes**, so an invalid-envelope flood cannot amplify into writes.
- Steps 16 and 17 are **atomic with respect to each other**. A projected envelope missing from the
  Merkle log is a transparency failure.
- Each step is an independently unit-testable pure function. The pipeline is composed from them, never
  written as one procedure.
- Peer trust affects **quota only, never verification**. Federated and mesh inbound re-runs all 19 steps.

### 4.3 The registry is the extension point

`proto/jagoo/v1/registry.yaml` maps each `domain` string (`jb:post:create:v1`) to its plane, body type,
priority class, idempotency, scope kind, credit cost, anti-abuse gates, and permission. It generates into
TS, Rust, and Python. Adding a feature adds a **row plus a handler**, never a branch in the pipeline.

```ts
interface DomainHandler<TBody> {
  readonly domain: string;
  readonly plane: Plane;
  validate(body, env): ValidationResult; // pure, no I/O
  authorize(body, env, ctx): Promise<AuthDecision>; // against projections
  project(body, env, tx): Promise<void>; // same transaction as the log append
  afterCommit?(body, env): Promise<void>; // notifications, fanout hints
}
```

### 4.4 Two identity planes, unlinkable by construction

|                 | **FORUM** (Plane A)                                               | **SIGNAL** (Plane B)                                      |
| --------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| Identity        | Pseudonymous — a key with no real-world binding                   | Identified — a key bound to a verifiable claim            |
| Root secret     | `M_forum` mnemonic                                                | **Separate** `M_signal` mnemonic                          |
| Unlinkability   | Per-community derived keys, blind credentials, epoch nullifiers   | None wanted — recognisability is the point                |
| Contents        | Posts, comments, votes, communities, moderation, pseudonymous DMs | Channels, broadcasts, subscriptions, identified messaging |
| Transport class | Bulk                                                              | Priority — small, floods first                            |

This separation is a **security requirement**. If a person's known broadcast identity were linkable to
their forum identity, publishing under their real name as a relief coordinator would retroactively
deanonymise every forum post that key ever made.

### 4.5 Storage

MongoDB (envelope log + projections + Merkle log) and Redis (credits, nullifiers, rate limits, cache),
both behind ports. **Mongo must run as a replica set even single-node** — pipeline step 16/17 atomicity
needs multi-document transactions. `ops/docker-compose.yml` initialises `rs0` automatically.

The **envelope store is the only backup-critical dataset.** Projections are derived and must be fully
reconstructible by `rebuild-projections`, byte-identical. If a projection cannot be rebuilt from the
envelope log alone, that is a defect in the handler, not a reason to back up projections.

### 4.6 Federation (P2) — how a second instance changes things

Six gRPC RPCs, server↔server only (`Plans/05`). Clients never speak gRPC: HTTP/2 has a distinctive
fingerprint and degrades badly on lossy mobile links, and operators — unlike clients — choose their
peers.

Four rules carry almost all of the weight:

- **A peer's bytes are never re-encoded.** The gRPC layer uses a passthrough codec (ADR-008 §1). The
  canonical decoder establishes canonicality by re-encoding and comparing, so a ts-proto round trip in
  the adapter would silently *repair* a non-canonical envelope from an untrusted peer and it would
  then validate — the v1 signature-confusion bug, arriving over the network, past the exact gate built
  to foreclose it.
- **Trust affects quota only, never verification** (FD-03). Inbound envelopes re-run all 19 steps. A
  `TRUSTED` peer's forged envelope is rejected exactly as a stranger's is.
- **Deduplication is a unique database index**, `(content_id, direction)`, not a read-then-write
  (FD-05, ADR-008 §2). v1's catch was unreachable because the index was never declared.
- **An envelope is never relayed back to its sender** (FD-14). `IngressPipeline.accept(raw, origin)`
  carries the origin; step 19 excludes it from fanout. Content dedupe makes the loop terminate; it
  does not make it free.

**An identifier must be derivable by any node from the signed bytes.** Anything keyed on
`nodeSigner.serverId` is wrong the moment a peer projects the same envelope — that is ID-01 wearing a
better name, and it is what ADR-010 exists to record. Before deriving an ID, ask: *would a different
node, given only these bytes, compute the same value?*

Federation is **off unless configured** (AR-12), and a node with no listen address is
**outbound-only** — which is not degraded. `Deliver` is client-streaming and `StreamActivities` is
caller-initiated, so a node behind CGNAT federates fully in both directions over connections it
opened. That is the default for a home or community node (FD-12), not a fallback.

---

## 5. Coding rules

These are checked in review and, where marked, by lint. A PR that violates one does not merge.

### 5.1 Hexagonal boundaries

- `backend/src/core/domain/**` is **pure**: deterministic given its inputs, no clock reads, no random,
  no I/O, and **no NestJS decorators**. `Clock` and `RandomSource` are injected ports. This is what makes
  the validation pipeline and the path selector unit-testable with no infrastructure. _(lint-enforced)_
- `core/**` may import only from `core/**`. Adapters depend on the core; the core never depends on an
  adapter, a driver, or a framework. _(lint-enforced)_
- Every port gets a production adapter **and** an in-memory double. Unit tests use doubles; integration
  tests use real adapters via testcontainers.
- Nothing constructs an adapter outside `backend/src/composition/`. No service-locator lookups at call
  sites — dependencies are constructor-injected.

### 5.2 The four bans

| Banned                                                             | Why                                                                                                             |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `switch` / `if` on `domain` anywhere in the core                   | The registry dispatches. A domain switch means the Open/Closed abstraction failed.                              |
| Branching on transport ID outside the transport layer              | Every `Transport` is substitutable. `if (t.id === "reticulum")` in app code is a Liskov violation.              |
| A database row ID inside any signed structure or federated payload | Row IDs are meaningless off-instance. **This is the specific defect that made v1 federation impossible.**       |
| A private key in a variable outside the signer boundary            | _(lint-enforced)_ Only `packages/sdk-ts/src/signer/**` and `frontend/src/signer/**` may touch raw key material. |

### 5.3 SOLID, concretely

| Principle | Here                                                                           | A violation looks like                                                      |
| --------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **S**     | Ingress validates. Projector projects. Transport moves bytes. Witness logs.    | A `PostService` that validates, saves, notifies, and federates — v1's shape |
| **O**     | New content type = new `DomainHandler` + registry row, pipeline untouched      | Adding a `case` to a domain switch                                          |
| **L**     | The outbox drains through HTTP, mesh, or Reticulum with identical calling code | `if (transport.id === …)` in application code                               |
| **I**     | `EnvelopeReader` and `EnvelopeWriter` are separate ports                       | One fat `Store` interface everyone depends on                               |
| **D**     | Core declares `WitnessLog`; the Merkle adapter depends on the core             | Core importing the Mongo driver                                             |

### 5.4 A feature is one directory

`backend/src/features/<plane>/<name>/` holds its handlers, projections, read routes, and tests, and
nothing else depends on its internals. Deleting the directory and its registry rows removes the feature
completely, with no dangling references. Features are config-toggleable for experimentation — but a
toggle is **not** for hiding incomplete work. A toggled-on feature is complete or it does not merge.

### 5.5 Performance and scale

- Every list endpoint is **cursor-paginated**. Offset pagination does not exist here.
- Cache invalidation uses **tagged keys**. A keyspace `SCAN` per write is a self-inflicted load amplifier
  that gets worse exactly as the instance gets busier — it is what v1 did.
- Every counter or balance mutation is **one atomic Redis Lua script**. Read-modify-write and
  `INCR`-then-`PEXPIRE` are both forbidden.
- Outbound queues are ordered by priority class first, then FIFO. A queued emergency broadcast overtakes
  500 queued votes.
- Class 0–2 envelopes (`BROADCAST`, `DIRECT`, `CHECKIN`) have hard size budgets — ≤ 512 B / ≤ 1 KB / ≤ 512 B
  **after** encoding, including signature and anti-abuse fields. Enforced at construction with a typed
  error, never discovered at send time.
- The node must run on a Raspberry Pi 4 in < 512 MB RAM. Treat that as a design constraint, not a target.

---

## 6. Frontend rules (Expo React Native)

The client is the product surface for people under a shutdown. Its quality bar is not "functional".

- **Design system first.** Colours, spacing, radii, typography, and motion live in `packages/ui` tokens.
  No raw hex values, no magic numbers, no ad-hoc `StyleSheet` spacing in screens.
- **Responsive across every size.** Layouts adapt from a 320 pt phone to a tablet in landscape and to
  split-screen. Use the shared responsive scale and `useWindowDimensions`; never hardcode pixel widths.
- **Bangla and English are both first-class.** Bangla is not a translation layer added at the end —
  size budgets and layout are computed against Bangla UTF-8 worst case, because that is the primary
  language of the target users. Every string ships through i18n from the first commit.
- **Accessibility is a requirement, not a pass at the end.** WCAG 2.1 AA on core flows, full screen-reader
  labelling, touch targets ≥ 44×44 pt on crisis actions, legible at maximum system font scale, and
  **colour is never the sole carrier of meaning** — verification state, alert severity, and transport
  scope each need shape or text too.
- **The client verifies; it never trusts the server's word.** Signature badges and inclusion proofs are
  recomputed on-device from the `provenance` block, and must work with the network fully disabled.
- **Offline is the default assumption.** Every screen renders from cache, shows its staleness honestly,
  and never blocks on a request that may never return.
- **The UI must not offer plane linkage.** No feature publishes both identities together, cross-links
  profiles, or imports one plane's contacts into the other. If a user asks, explain the risk and refuse.

---

## 7. Working protocol

### 7.1 Contracts are frozen

`Plans/02` through `Plans/06` are frozen before implementation. Contract churn during implementation is
the failure mode this plan exists to prevent. Changing a frozen contract requires a **version bump**, never
an in-place edit, and a decision record in `Code Implementation/`. If a contract looks wrong mid-build,
write the concern down and keep building against the frozen shape.

### 7.2 Plan before code, log after

1. **Before a phase**, write its plan to `Code Implementation/P<n>-*.md` — scope, task IDs, file-by-file
   deliverables, exit gate. This is what survives between sessions; nothing important lives only in chat.
2. **After each work block**, append to `Code Implementation/BUILD-LOG.md`: what was built, what broke,
   what the fix was, and what to do differently. Read it at the start of every session. Its purpose is
   that the same mistake is never made twice.
3. Update the phase plan's checklist as tasks land, so plan and reality never drift.

### 7.3 Definition of done

| Work type                      | Done means                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| Contract (proto, registry row) | Compiles in three languages, codegen diff clean, a fixture exercises it                     |
| Pipeline step                  | Pure function, unit-tested in isolation, every error path reachable by a test               |
| Domain handler                 | validate + authorize + project implemented and registered, **zero core changes required**   |
| Read endpoint                  | Cursor pagination, `provenance` block, integration test against a real database             |
| Adapter                        | Implements its port, production impl **plus** in-memory double, integration test            |
| Transport                      | Satisfies the `Transport` port, class filter enforced, no app-layer branch on its ID        |
| Client screen                  | Renders offline from cache, signature status visible, a11y-labelled, Bangla strings present |
| Requirement                    | At least one automated test cites its ID (`NFR-M08`)                                        |
| Phase                          | Every gate criterion in `Plans/08-PHASES.md` passes **in CI**, not by hand                  |

### 7.4 Blocking CI gates

Never disable these to get a build green. They exist because each one caught a real, expensive v1 bug.

| Gate                                                                      | From                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------- |
| **Cross-language canonical vectors** — TS ≡ Rust ≡ Python, byte-identical | P0 · the single highest-value gate in the project |
| Import-boundary lint (`core/domain` purity, signer boundary)              | P0                                                |
| Regenerate-and-diff on generated code                                     | P0                                                |
| **Two-node federation suite (FG-01…FG-10)** — its own CI job              | P2 · the PRIMARY goal                             |
| Network-namespace ISP suite                                               | P3                                                |
| Build-without-Reticulum suite                                             | P6                                                |

**A gate that is only _configured_ is not a gate.** P0-G6 was silently false for its entire existence:
the import-boundary lint was correctly written, but a later ESLint flat-config block matching
`backend/src/**` **replaced** the rule's options instead of merging them, erasing every AR-01 pattern.
Nothing failed, because the codebase happened to be clean. It was caught only by
`backend/src/core/import-boundary.spec.ts`, which writes a genuinely violating file, runs the real
ESLint over it, and asserts a non-zero exit — plus a clean control file that must pass.

Two rules follow, and they apply to every gate added from here:

- **Every gate needs a test that makes it fail on purpose.** Assert the failure _and_ assert that a
  compliant input still passes, or you have only proved the tool dislikes the directory.
- **In ESLint flat config, the last matching block wins outright for a given rule.** Declare shared
  pattern sets once, spread them into each block that applies, and order blocks most-specific-LAST.
  Check the result with `eslint --print-config <file>`, not by reading the config.

---

## 8. Where to look

| Question                                                   | Document                              |
| ---------------------------------------------------------- | ------------------------------------- |
| Goals, planes, resilience ladder                           | `Plans/00-OVERVIEW.md`                |
| Plane separation invariants, key hierarchy, revocation     | `Plans/01-IDENTITY-PLANES.md`         |
| Envelope, canonical encoding, pipeline, errors, anti-abuse | `Plans/02-CONTRACTS-CORE.md`          |
| Forum bodies, domain registry rows, read API               | `Plans/03-CONTRACTS-FORUM.md`         |
| Channels, broadcast, identified messaging, crisis bodies   | `Plans/04-CONTRACTS-SIGNAL.md`        |
| Federation gRPC, TOFU trust, STH gossip                    | `Plans/05-CONTRACTS-FEDERATION.md`    |
| Scopes, uplinks, path selection, ISP bridging, Reticulum   | `Plans/06-CONTRACTS-TRANSPORT.md`     |
| Ports catalogue, plugin registry, composition root         | `Plans/07-ARCHITECTURE.md`            |
| Phase scope and exit gates                                 | `Plans/08-PHASES.md`                  |
| Task IDs and acceptance lines                              | `Plans/09-TASKS.md`                   |
| Build order, parallel lanes, descope ladder                | `Plans/10-IMPLEMENTATION-SEQUENCE.md` |
| Feature requirement IDs by module                          | `Plans/requirements/R0`–`R14`         |
| What we actually built and why                             | `Code Implementation/BUILD-LOG.md`    |
| Why federation uses `nice-grpc` and not Nest microservices | `Code Implementation/ADR-007`         |
| Raw-bytes ingress, the direction ledger, envelope origin   | `Code Implementation/ADR-008`         |
| Why a community ID cannot come from the projecting node    | `Code Implementation/ADR-010`         |
| Why a federated envelope does not pay anti-abuse twice     | `Code Implementation/ADR-011`         |

Cite requirement IDs (`FD-05`, `VP-02`, `SEP-04`, `TP-11`) in code comments and test names. They are the
link between the specification and the implementation, and `NFR-M08` requires every MUST to have one.

---

## 9. Context that prevents wrong decisions

Things that look like reasonable engineering choices but are wrong **in this specific system**:

- **Server-side approval before publishing.** Withheld approval is indistinguishable from a network error,
  which makes silent censorship structurally possible. Moderation is publish-then-attest: content is valid
  the instant its author signs it, and labels are additive signed opinions clients may honour.
- **Deleting content.** Removal is a tombstone — content ID, author, timestamp, acting moderator, and
  reason stay publicly visible; only the body is withheld. Every censorship action is itself evidence.
- **Admin-allowlisted federation.** During a shutdown, volunteers stand up relay nodes and cannot wait for
  manual approval. New peers land at `PROBATION` via TOFU and earn reach through vouches.
- **Server-side subscription tables.** In this context, a list of who follows which channel is a list of
  targets. Broadcasts flood and the client filters locally.
- **Requiring identity to stop spam.** That hands the adversary a censorship lever. Cost — memory-hard PoW,
  credits, blind credentials, epoch nullifiers — is the anti-abuse primitive, and it must work against a
  fully anonymous user.
- **Rate-limiting a check-in.** Telling people you are alive costs zero credits and needs no credential.
- **Only exercising the fallback path during a fallback.** Path selection prefers the _narrowest_ working
  scope (`LAN` > `ISP_LOCAL` > `NATIONAL` > `GLOBAL`) continuously, so the resilience path is warm and
  tested at the moment it becomes the only path. Code that only runs during a blackout fails during a blackout.
- **Publishing a list of blocked peers.** `/v1/federation/peers` and `ExchangeDirectory` omit `BLOCKED`
  peers rather than labelling them. A directory naming who a node blocked is a list of targets for
  whoever wanted them blocked. What IS published is the finding — `/v1/federation/alerts` names the
  peer and why — because censorship evidence is only useful if it is visible.
- **Dropping a peer's connection when it exceeds quota.** It reconnects immediately, pays the handshake
  again, and arrives in the same state, so refusing costs more than accepting would have.
  `backpressure_hint_ms` lets a well-behaved peer self-regulate, and a peer that ignores it is the one
  FD-16 demotes.
- **Deriving a federated identifier from the local node's key.** See §4.6 and ADR-010. This looked
  correct for the entire life of P1 because with one node the projecting node *is* the origin node.
- **Charging anti-abuse again on a federated envelope.** Proof of work, credits, blind credentials
  and nullifiers are each keyed to ONE node deliberately, so a proof minted at the origin is not
  merely unverifiable elsewhere — it is meaningless. Re-charging makes every gated domain
  unfederatable. Cost is charged at origin; the receiver's protection is the per-peer quota
  (ADR-011). Verification is unaffected: what is skipped is a payment, not a check.
- **Trusting a claim ABOUT a peer that arrives FROM another peer.** FD-10 relays tree-head
  observations labelled by the relayer. Any check that can `BLOCK` must first verify the claim
  belongs to the peer it names, or one peer can silence another — and `BLOCKED` needs an operator
  to lift.
- **Post-quantum signatures everywhere.** One ML-DSA signature is eleven LoRa transmissions before any
  content. The PQ budget goes to _confidentiality_ (hybrid X25519 + ML-KEM-768 key agreement, because
  traffic captured today is decrypted later) and not to per-message signatures, which stay Ed25519 at 64 B.
