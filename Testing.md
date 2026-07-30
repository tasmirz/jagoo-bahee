# Testing

Every test command in **Jagoo Bahee v2**, what it actually proves, and how to run one test at a
time.

The test suite is not a formality here. This is a v2 rebuild, and several gates exist *specifically*
because a matching v1 bug was expensive. Where that is true, this document says which bug — because
a gate whose purpose nobody remembers is a gate that eventually gets disabled to make a build green.

---

## 0. Verified baseline

Run on **2026-07-30** on this working tree, macOS, no Docker services running:

```
pnpm test        →  6 turbo tasks successful
                    @jagoo/sdk        13 files  ·  71 tests passed
                    @jagoo/backend    38 files  ·  476 passed | 13 skipped  (3 files skipped)
                    @jagoo/frontend   25 suites · 121 tests passed
                    @jagoo/audit-log   1 file   ·   4 tests passed
                    ────────────────────────────────────────────────
                    672 passing, 13 skipped, 0 failing        (57.9 s)

pnpm vectors     →  ★ P0-G1 PASS — 3 implementations agree on 16 vectors
                    expected.json matches
```

The 13 skipped tests are the **real-infrastructure** suites (Mongo, Redis). They skip when
`MONGO_URL` / `REDIS_URL` are unset. They are mandatory in CI. See [§5](#5-infrastructure-integration-gates)
for how to run them locally — and do not report them as passing when the services were absent.

---

## 1. The five-command sanity pass

If you have thirty seconds and want to know whether the tree is healthy:

```bash
pnpm vectors        # ★ canonical encoding agrees across TS, Rust, Python
pnpm test           # every workspace suite
pnpm lint           # import boundaries, core purity, signer boundary
pnpm typecheck
pnpm smoke:local    # dependency-free end-to-end signed round trip
```

Everything below explains what those cover and how to go deeper.

---

## 2. ★ The cross-language canonical gate

```bash
pnpm vectors                # the gate proper — TS ≡ Rust ≡ Python
pnpm vectors:ts             # TypeScript regressions alone
pnpm vectors:rust           # cargo test -p jb-core --test vectors
pnpm vectors:python         # python -m pytest tools/vectors -q
```

**Requires Rust and Python installed** (see [Installation.md §1.2](Installation.md#12-required-to-run-the-cross-language-gate)).

### What it proves

Three *independently written* implementations of canonical encoding — TypeScript
(`packages/sdk-ts`), Rust (`crates/jb-core`), Python (`tools/vectors`) — produce **byte-identical**
output for 16 shared fixtures, and identical `content_id` values derived from those bytes.

```
content_id = "jb1" + base32-nopad-lower( SHA-256( canonical_bytes(fields 1..12) ) )
signature  = Ed25519 over the same canonical bytes
```

### Why it is the highest-value gate in the project

Canonical encoding is what makes a signature mean something. There is **exactly one accepted form**
per version: ascending field number, zero values omitted, no retained unknown fields, NFC-normalised
strings, no floats anywhere in a signed structure. Fallback chains and "try the legacy shape too"
are forbidden.

That ambiguity was the v1 **signature-confusion** bug: two encoders disagreeing about whether a
zero-valued field is present means two different byte strings for the same logical envelope, which
means a signature that verifies against one reading and not the other. Three independent
implementations agreeing is the strongest available evidence that only one reading exists.

| Sub-gate | Asserts                                   | File                                                |
| -------- | ----------------------------------------- | ---------------------------------------------------- |
| P0-G1    | TS = Rust = Python, byte-identical        | `tools/vectors/run-gate.mjs`                          |
| P0-G2    | Domain separation                         | `packages/sdk-ts/src/vectors/domain-separation.spec.ts` |
| P0-G3    | Plane separation                          | `packages/sdk-ts/src/vectors/plane-separation.spec.ts`  |
| P0-G4    | **Field omission — the v1 bug**           | `packages/sdk-ts/src/vectors/field-omission.spec.ts`    |

Each language also asserts G2–G4 in its own idiom, so a language cannot pass the pairwise diff while
getting separation wrong locally.

### Updating expectations

```bash
pnpm vectors --update       # rewrites tools/vectors/expected.json
```

It only rewrites after all three implementations already agree, and it **never runs in CI**.
Review the diff by hand. Regenerating expectations without reading them turns the project's
highest-value gate into a rubber stamp.

---

## 3. Workspace suites

```bash
pnpm test                                   # everything, via turborepo
pnpm --filter @jagoo/sdk       test
pnpm --filter @jagoo/backend   test
pnpm --filter @jagoo/frontend  test
pnpm --filter @jagoo/audit-log test
pnpm test:relay                             # python -m pytest services/relay -q
```

Running a single file or a single test name:

```bash
pnpm --filter @jagoo/backend  exec vitest run src/core/domain/envelope.spec.ts
pnpm --filter @jagoo/backend  exec vitest run -t "rejects unknown domain"
pnpm --filter @jagoo/sdk      exec vitest run src/core/canonical.spec.ts
pnpm --filter @jagoo/frontend exec jest src/verify/verify.test.ts
pnpm --filter @jagoo/backend  test:watch
```

### 3.1 `@jagoo/sdk` — 71 tests, 13 files

The shared contract layer: canonical encoding, content IDs, crypto, signing.

| File                                     | Proves                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| `vectors/canonical.spec.ts`              | Deterministic encode/decode round trip against the shared fixtures         |
| `vectors/decode.spec.ts`                 | The decoder establishes canonicality by **re-encoding and comparing** — a non-canonical envelope is rejected, never repaired |
| `vectors/domain-separation.spec.ts`      | A signature for one domain cannot be replayed as another                   |
| `vectors/plane-separation.spec.ts`       | Forum and Signal signing contexts cannot be crossed                        |
| `vectors/field-omission.spec.ts`         | Zero-valued fields are omitted, exactly once, in one way (the v1 bug)      |
| `crypto/bip39.spec.ts`, `bip32.spec.ts`  | Mnemonic and hardened derivation against published test vectors            |
| `crypto/backend.spec.ts`                 | The JS and native `CryptoBackend` adapters are semantically interchangeable |
| `crypto/signal.spec.ts`, `messaging.spec.ts` | Signal-plane key agreement and message crypto                          |
| `crypto/import-boundary.spec.ts`         | Only `crypto/js-backend.ts` and the word-list adapter import Noble/Scure — a feature importing a primitive directly fails |
| `signer/federation-signing.spec.ts`      | Peer handshake signatures                                                  |
| `core/evidence.spec.ts`                  | Inclusion / consistency proof verification                                 |

### 3.2 `@jagoo/backend` — 476 passing, 13 skipped, 41 files

Grouped by what they guard.

**The pipeline and the core (pure, no infrastructure)**

| File                                    | Proves                                                                          |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `core/app/ingress.spec.ts`              | All **19 steps** in normative order; every rejection path reachable               |
| `core/domain/accept.spec.ts`            | Version / domain / plane acceptance, incl. **P0-G7** unknown-version rejection    |
| `core/domain/domain-registry.spec.ts`   | The registry dispatches; **no `switch` on domain exists anywhere in the core**    |
| `core/domain/merkle.spec.ts`            | Merkle append, inclusion proof, consistency proof                                 |
| `core/domain/service-map.spec.ts`       | Port-map parsing for service advertisement                                        |
| `core/app/projection-rebuilder.spec.ts` | **P1-G3** — every populated collection rebuilds **byte-identically** from the envelope log alone |
| `core/import-boundary.spec.ts`          | **P0-G6** — see §4, this one is special                                           |

**Features**

| File                                        | Proves                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| `features/forum/forum-features.spec.ts`     | The 30 Forum domain handlers: validate → authorize → project                  |
| `features/forum/forum-parity.spec.ts`       | Registry rows and handlers stay in lockstep — a row with no handler fails      |
| `features/signal/signal-features.spec.ts`   | **P4-G3/G4/G5/G11/G12** — channels, broadcast size and sequence, crisis reports, plane-specific certificate isolation, direct database inspection proving messages are **ciphertext-only** |
| `features/signal/signal-federation.e2e.spec.ts` | **P4-G2** — an identified alert published on node A is projected on independent node B |

**Federation domain logic (pure)**

`core/domain/federation/{trust,quota,backoff,announce}.spec.ts` — TOFU admission at `PROBATION`,
vouch-based promotion, per-peer per-class quota with backpressure hints, exponential backoff with
jitter, and announce/handshake validity. Pure functions, no network.

**Transport domain logic (pure)**

`core/domain/transport/{path-selection,uplink-state,bridge-policy}.spec.ts` — narrowest-working-scope
ranking (`LAN` > `ISP_LOCAL` > `NATIONAL` > `GLOBAL`), probe-result → uplink-state transitions, and
the bridge relay decision with per-pair per-class quota and loop prevention.

**Adapters**

`adapters/inbound/http/*.spec.ts` (routes, SSE, discovery, request security, reverse tunnel,
Reticulum admin), `adapters/outbound/{filesystem,s3,in-memory,redis,grpc}/*.spec.ts`. Every port has
a production adapter **and** an in-memory double; unit tests use the doubles.

**Interop and end-to-end**

| File                              | Proves                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `sdk-interop.spec.ts`             | The CommonJS resolution path of `@jagoo/sdk` matches the shared `expected.json`      |
| `cli/seed-demo.spec.ts`           | `pnpm smoke:local` — the full dependency-free acceptance path (§7)                    |
| `federation/federation.e2e.spec.ts` | **FG-01…FG-10** — the primary goal (§6)                                            |
| `transport/isp.e2e.spec.ts`       | **TG-01…TG-10** in-process, real sockets on loopback aliases (§8)                     |

### 3.3 `@jagoo/frontend` — 121 tests, 25 suites

The client is the product surface for people under a shutdown, so its tests are about **not
trusting the server** and **working with the network off**.

| File                                     | Proves                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| `verify/verify.test.ts`                  | On-device signature verification matches the shared `expected.json` — the client recomputes, it never takes the server's word |
| `verify/seal.test.ts`                    | The provenance seal (signature + inclusion proof) recomputes **with the network disabled** |
| `crypto/parity.test.ts`                  | The native Android backend and the JS backend agree                            |
| `offline/outbox.test.ts`                 | Durable outbox: final content IDs assigned offline, priority ordering, crash recovery, idempotent receipt drain |
| `offline/mesh.test.ts`                   | Transport-neutral mesh frames, Bloom reconciliation, TTL/hop limits, per-peer quota, **tamper rejection** |
| `offline/jbpack.test.ts`                 | `.jbpack` export/import verified **per envelope**, not per bundle              |
| `security/panic.test.ts`                 | **P4-G1 / P4-G10** — a Forum panic wipe leaves the Signal vault untouched, and vice versa |
| `signer/root-seed-cache.test.ts`         | Root seeds are memoised only for an unlocked signer and zeroed on lock/panic   |
| `data/pow.test.ts`                       | Argon2id proof-of-work solving                                                 |
| `data/request.test.ts`, `node-config.test.ts`, `service-address.test.ts`, `service-overrides.test.ts` | Node discovery, transport selection, manual overrides winning over discovery |
| `data/federation.test.ts`                | Peer directory handling                                                        |
| `features/signal/{contacts,storage,rns}.test.ts` | Local-only subscriptions, Signal storage isolation, Reticulum bootstrap parsing |
| `design-system/accessibility.test.ts`    | Touch targets, contrast, and that **colour is never the sole carrier of meaning** |
| `features/{catalog,capability-manifest,command-coverage}.test.ts` | Every declared feature family has a reachable surface |
| `audit/index.test.ts`                    | Store-and-forward of acknowledgement certificates to the independent audit log |

### 3.4 `@jagoo/audit-log` — 4 tests

`services/audit-log/src/server.spec.ts` — the independent append-only hash chain accepts
acknowledgement certificates, rejects a break in the chain, and serves proofs. It is a **separate
service on purpose**: an archive the node operator controls cannot testify against that operator.

### 3.5 `services/relay` — Python

```bash
pnpm test:relay
```

`test_fragmentation.py` — deterministic fragmentation, integrity and reassembly for links with
tiny MTUs. `test_engine.py` — the class filter (bulk returns `TRANSPORT_UNSUPPORTED`), the durable
queue, and resume after a severed transfer.

---

## 4. Import boundaries — the gate that was silently false

```bash
pnpm lint
pnpm --filter @jagoo/backend exec vitest run src/core/import-boundary.spec.ts
pnpm --filter @jagoo/sdk exec vitest run src/crypto/import-boundary.spec.ts
```

### What is enforced

- `backend/src/core/domain/**` is **pure** — deterministic, no clock reads, no random, no I/O, no
  NestJS decorators. `Clock` and `RandomSource` are injected ports.
- `core/**` may import only from `core/**`. The core never depends on an adapter, a driver, or a
  framework.
- **No private key in a variable outside the signer boundary** — only `packages/sdk-ts/src/signer/**`
  and `frontend/src/signer/**` may touch raw key material.
- Only `crypto/js-backend.ts` and the word-list data adapter may import Noble/Scure in production.

### Why there is a *test* for a lint rule

**P0-G6 was silently false for its entire existence.** The rule was written correctly, but a later
ESLint flat-config block matching `backend/src/**` **replaced** the rule's options instead of
merging them, erasing every pattern. Nothing failed, because the codebase happened to be clean.

`core/import-boundary.spec.ts` catches that: it writes a genuinely **violating** file, runs the real
ESLint over it, and asserts a non-zero exit — plus a clean control file that must pass.

Two rules follow for every gate added from here:

1. **Every gate needs a test that makes it fail on purpose.** Assert the failure *and* assert that a
   compliant input still passes, or you have only proved the tool dislikes the directory.
2. **In ESLint flat config, the last matching block wins outright for a given rule.** Verify with
   `eslint --print-config <file>`, not by reading the config.

---

## 5. Infrastructure integration gates

These are the 13 tests that skip without real services. **They are mandatory in CI.**

```bash
pnpm ops:up      # mongo (replica set) + redis + minio

JB_REQUIRE_INTEGRATION=1 \
MONGO_URL='mongodb://127.0.0.1:27017/jagoo_local?directConnection=true' \
REDIS_URL='redis://127.0.0.1:6379/15' \
pnpm --filter @jagoo/backend exec vitest run \
  src/adapters/outbound/mongo/mongo.integration.spec.ts \
  src/adapters/outbound/mongo/federation.integration.spec.ts \
  src/adapters/outbound/redis/redis.integration.spec.ts
```

PowerShell:

```powershell
$env:JB_REQUIRE_INTEGRATION = '1'
$env:MONGO_URL = 'mongodb://127.0.0.1:27017/jagoo_local?directConnection=true'
$env:REDIS_URL = 'redis://127.0.0.1:6379/15'
pnpm --filter @jagoo/backend exec vitest run src/adapters/outbound/mongo src/adapters/outbound/redis
```

| Gate                  | Proves                                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| **VP-02**             | Pipeline steps 16 (project) and 17 (witness) are **atomic with respect to each other** — a real multi-document transaction rolls both back together. A projected envelope missing from the Merkle log is a transparency failure. |
| **P1-G6**             | Tagged cache invalidation. No keyspace `SCAN` per write — that is a load amplifier that gets worse exactly as the instance gets busier, and it is what v1 did. |
| **FG-05**             | Deduplication is a **unique database index** on `(content_id, direction)`, proven by concurrent insertion — not a read-then-write. v1's catch was unreachable because the index was never declared. |
| **T1.33**             | Atomic Redis Lua counters. Read-modify-write and `INCR`-then-`PEXPIRE` are both forbidden.                 |

### `JB_REQUIRE_INTEGRATION=1` is not optional decoration

Without it, a missing or misspelled URL makes the suite **skip** and report green while running
nothing. With it, a missing URL is a failure. This is asserted by
`src/testing/integration-env.spec.ts`.

### Two Mongo traps these tests hit first

- `?directConnection=true`, never `?replicaSet=rs0`, when connecting from the host. With
  `replicaSet`, the driver discovers the sole member as `mongo:27017`, cannot resolve it, and never
  completes server selection — observed as `Hook timed out in 10000ms` with no mention of DNS or of
  Mongo.
- **Mongo must be a replica set even single-node.** Step 16/17 atomicity needs multi-document
  transactions. `ops/docker-compose.yml` initialises `rs0` automatically.

---

## 6. ★ The federation gate — FG-01 … FG-10

Federation is the project's **primary goal**, so this runs as its **own blocking CI job**. Burying
it inside the general test job would let a green summary hide it being skipped.

```bash
pnpm --filter @jagoo/sdk build                                  # consumers use built output
pnpm --filter @jagoo/backend exec vitest run src/federation      # FG-01 … FG-10

pnpm --filter @jagoo/backend exec vitest run \
  src/core/domain/federation \
  src/composition/federation.config.spec.ts \
  src/adapters/inbound/http/federation-discovery.spec.ts
```

Two independent stacks, real `nice-grpc` servers on loopback, real Ed25519 signatures, and the real
19-step pipeline on **both** sides.

| Gate  | Proves                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------- |
| FG-01 | TOFU admission — a stranger is admitted at `PROBATION`, not rejected and not trusted                          |
| FG-02 | Vouch-based promotion and demotion                                                                            |
| FG-03 | `Deliver` client-streaming with per-peer per-class quota and `backpressure_hint_ms`                           |
| FG-04 | Reconnect **automatically backfills** from the durable cursor before opening the live stream                  |
| FG-05 | Dedupe is a unique index (also §5, against real Mongo)                                                        |
| FG-06 | STH gossip and fork detection                                                                                 |
| FG-07 | An **outbound-only** node federates fully in both directions over connections it opened                       |
| FG-08 | Resumable `Backfill` closes an exact gap with no duplicates                                                   |
| FG-09 | Directory exchange omits `BLOCKED` peers rather than labelling them                                           |
| FG-10 | A relayed tree-head observation is verified as belonging to the peer it names before it can `BLOCK` anything  |

### Four invariants these tests exist to hold

- **A peer's bytes are never re-encoded.** The gRPC layer uses a passthrough codec. The canonical
  decoder establishes canonicality by re-encoding and comparing, so a ts-proto round trip in the
  adapter would silently *repair* a non-canonical envelope from an untrusted peer, which would then
  validate — the v1 signature-confusion bug arriving over the network, past the exact gate built to
  foreclose it.
- **Trust affects quota only, never verification.** Inbound envelopes re-run all 19 steps. A
  `TRUSTED` peer's forged envelope is rejected exactly as a stranger's is.
- **An envelope is never relayed back to its sender.** Content dedupe makes the loop terminate; it
  does not make it free.
- **An identifier must be derivable by any node from the signed bytes.** Anything keyed on the local
  node's server id is wrong the moment a peer projects the same envelope. Before deriving an ID,
  ask: *would a different node, given only these bytes, compute the same value?*

### The live two-node run

The automated gate proves the logic; the containers prove the **deployment**. Both are required.

```bash
pnpm ops:two-node
curl http://localhost:3001/v1/federation/peers     # each lists the other by public key
curl http://localhost:3001/v1/federation/sth
curl http://localhost:3001/v1/federation/alerts
pnpm ops:two-node:down
```

Manual acceptance worth doing once: publish a post on node-a and watch it appear on node-b. Then
stop node-b, publish more, and start it again — `Backfill` closes the gap.

---

## 7. `smoke:local` — dependency-free acceptance

```bash
pnpm smoke:local
```

One command, no Docker, no database. It runs the complete write path end to end:

1. Certify a Forum key (a self-validating key certificate).
2. Authenticate — challenge → signed response → session.
3. Acquire a **blind credential** — the node issues without learning which member it issued to.
4. Create a community.
5. Publish a **real signed post** through `POST /v1/envelopes`.
6. Read back its projection from the frozen read API.
7. Read back its **inclusion proof** against the Merkle log.

If this passes, the envelope contract, the pipeline, anti-abuse, projections, the witness log and
the read API are all coherent with each other.

Add realistic demo data to a running node with:

```bash
pnpm seed:demo -- --url=http://127.0.0.1:3000
```

---

## 8. The ISP / blackout gate — TG-01 … TG-10

Two harnesses, both required. *The in-process suite proves the logic; only the container proves the
deployment.*

```bash
pnpm --filter @jagoo/backend exec vitest run src/transport/isp.e2e.spec.ts   # every commit
pnpm ops:isp && pnpm gate:isp && pnpm ops:isp:down                            # artefact gate
```

| Gate  | Proves                                                                                     |
| ----- | -------------------------------------------------------------------------------------------- |
| TG-01 | Two uplinks bind outbound connections to the **correct source IP** per peer                 |
| TG-02 | With `GLOBAL` blocked, two nodes on one simulated ASN still federate over `ISP_LOCAL`       |
| TG-03 | The path selector **prefers `ISP_LOCAL` over `NATIONAL`**, and the per-scope metric confirms it |
| TG-04 | A bridge merges two isolated ASN islands; a post on island A reaches island B               |
| TG-05 | A class-0 broadcast crosses the bridge **while a bulk backlog is queued**                   |
| TG-06 | Killing uplink A re-establishes affected paths on B within 30 s, with zero loss             |
| TG-07 | `Backfill` after an uplink switch closes the gap exactly, no duplicates                     |
| TG-08 | An outbound-only node behind simulated CGNAT federates fully                                |
| TG-09 | A cold client with only the seed list connects on `ISP_LOCAL` with `GLOBAL` blocked         |
| TG-10 | Current scope is visible in the client UI and updates within 30 s of a change               |

### Why TG-03 asserts on a non-zero counter, not on an absent one

If the sender selected a path and never reported the outcome back, the per-scope counters would stay
at zero and the gate would pass **vacuously on an empty snapshot**. So it asserts non-zero
`ISP_LOCAL` attempts, not merely the absence of `NATIONAL` ones.

### Why the container gate runs commands *inside* the topology

The island networks are `internal: true`, so Docker publishes no host ports for them. The first
version of this gate drove the stack from the host and was quietly asserting the opposite of what
the topology exists to claim. Adding a management network would have fixed the symptom and destroyed
the premise — the nodes would have regained egress and a route to each other. So every HTTP call is
`docker exec <container> node -e fetch(...)` against the node's own loopback.

Path selection also prefers the narrowest working scope **continuously, not on failure**. Code that
only runs during a blackout fails during a blackout.

---

## 9. Contract and codegen gates

```bash
pnpm proto:lint      # buf lint
pnpm proto:breaking  # buf breaking --against the main branch
pnpm proto:gen       # regenerate TS / Rust / Python bindings + domain tables
pnpm proto:check     # regenerate and DIFF — fails on hand-edited generated code
```

`proto/jagoo/v1/` is the **source of truth**. `registry.yaml` maps each domain string to its plane,
body type, priority class, idempotency, scope kind, credit cost, anti-abuse gates and permission,
and generates into all three languages. Hand-maintained duplicates in any language are forbidden.

`proto:check` (P0-G5) exists because a hand edit to generated code otherwise survives silently until
someone else regenerates. CI additionally runs `git diff --exit-code` after it.

Contracts in `Plans/02`–`Plans/06` are **frozen**. Changing one requires a version bump and a
decision record in `Code Implementation/` — never an in-place edit.

---

## 10. Blocking CI gates

Never disable one of these to get a build green. Each exists because it caught a real, expensive v1
bug.

| Gate                                                            | CI job       | Phase |
| ---------------------------------------------------------------- | ------------ | ----- |
| ★ **Cross-language canonical vectors** — TS ≡ Rust ≡ Python      | `vectors`    | P0    |
| Registry codegen regenerate-and-diff                             | `contracts`  | P0    |
| Import-boundary lint **probes** (core purity, signer boundary)   | `build`      | P0    |
| Unknown version / unknown domain rejection                       | `build`      | P0    |
| Real-Mongo/Redis adapter gates (VP-02, P1-G6, FG-05, T1.33)      | `build`      | P1    |
| ★ **Two-node federation suite FG-01…FG-10**                      | `federation` | P2    |
| Network-isolation ISP suite                                      | —            | P3    |
| Build-without-Reticulum suite                                    | —            | P6    |

CI starts a Mongo replica set and Redis for the adapter gates, and runs the federation suite as a
**separate job on purpose** — it is the project's primary goal, and a green summary must not be able
to hide it being skipped.

---

## 11. Definition of done, by work type

A change is not done because it compiles. It is done when its category's evidence exists.

| Work type                      | Done means                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| Contract (proto, registry row) | Compiles in three languages, codegen diff clean, a fixture exercises it                      |
| Pipeline step                  | Pure function, unit-tested in isolation, **every error path reachable by a test**            |
| Domain handler                 | validate + authorize + project implemented and registered, **zero core changes required**    |
| Read endpoint                  | Cursor pagination, `provenance` block, integration test against a real database               |
| Adapter                        | Implements its port, production impl **plus** in-memory double, integration test              |
| Transport                      | Satisfies the `Transport` port, class filter enforced, no app-layer branch on its ID          |
| Client screen                  | Renders offline from cache, signature status visible, a11y-labelled, Bangla strings present   |
| Requirement                    | At least one automated test cites its ID (e.g. `NFR-M08`, `FD-05`, `VP-02`, `TP-11`)          |
| Phase                          | Every gate criterion passes **in CI**, not by hand                                            |

Requirement IDs are the link between the frozen specification and the implementation. Cite them in
test names — that is what makes a gate's purpose survive the person who wrote it.

---

## 12. Quick reference

```bash
# sanity
pnpm vectors                                                   # ★ TS ≡ Rust ≡ Python
pnpm test                                                      # all workspaces
pnpm lint && pnpm typecheck && pnpm build
pnpm smoke:local                                               # dependency-free end-to-end

# single test
pnpm --filter @jagoo/backend  exec vitest run <path>
pnpm --filter @jagoo/backend  exec vitest run -t "<name>"
pnpm --filter @jagoo/frontend exec jest <path>

# gates
pnpm --filter @jagoo/backend exec vitest run src/federation     # ★ FG-01…FG-10
pnpm --filter @jagoo/backend exec vitest run src/transport      # TG-01…TG-10 in-process
pnpm ops:isp && pnpm gate:isp                                   # TG container gate
pnpm test:relay                                                 # Reticulum relay (Python)
pnpm proto:check                                                # codegen drift

# contracts and infra
pnpm ops:up                                                     # mongo + redis + minio
pnpm ops:two-node                                               # live federation
just check                                                      # lint · typecheck · test · proto · vectors
```
