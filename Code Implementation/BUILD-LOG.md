# Build Log

> **Read this first at the start of every session.** Append-only, newest entry at the bottom of each
> phase section. Its purpose is that the same mistake is never made twice.
>
> **Entry format.** Every work block gets one entry. Be specific about failures — a vague "fixed a bug"
> teaches nothing next session. Record the _symptom_, the _root cause_, and the _rule learned_, because
> the rule is the only part that transfers.

```
### <date> — <short title>            [<phase>]
**Built:**    what landed, with file paths and requirement IDs
**Verified:** the command that proves it, and its result
**Broke:**    what failed, the symptom, the root cause
**Learned:**  the rule that stops it recurring — this is the part that matters
**Next:**     the immediate next action
```

---

## Standing lessons

Rules earned the hard way. Violating one of these has already cost time.

| #    | Rule                                                                                                                                                                                                                                                                                                                                                                                                       | Earned from                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| L-01 | Never hand-edit generated code. Fix the generator or the `.proto` and regenerate.                                                                                                                                                                                                                                                                                                                          | AR-10 — CI regenerates and diffs, so a hand edit fails the build later, not sooner |
| L-02 | A test that asserts against a hardcoded expected hash must have that hash produced by a _different_ implementation than the one under test. Otherwise it tests that the code agrees with itself.                                                                                                                                                                                                           | The entire point of the cross-language vector gate                                 |
| L-03 | Mongo multi-document transactions require a replica set, even single-node. A standalone `mongod` fails at pipeline step 16/17 with a confusing "Transaction numbers are only allowed on a replica set member" error.                                                                                                                                                                                       | ADR-001                                                                            |
| L-04 | `pnpm` + React Native needs `node-linker=hoisted` in `.npmrc`, or Metro fails to resolve symlinked workspace packages.                                                                                                                                                                                                                                                                                     | Monorepo scaffold                                                                  |
| L-05 | Before adding _any_ branch, check whether the registry, a port, or a handler should carry that decision instead. Every domain switch and transport-ID check in this codebase is a defect by definition.                                                                                                                                                                                                    | AR-05, NFR-M02, NFR-M03                                                            |
| L-06 | Nest's `createNestApplication()` defaults to Express no matter what `main.ts` uses. On this Fastify-only node that surfaces as a confusing missing-module error — pass `new FastifyAdapter()` explicitly in every spec.                                                                                                                                                                                    | backend skeleton                                                                   |
| L-07 | `expo export` builds every platform in the project's list by default and will demand `react-native-web`. Constrain it to `--platform ios --platform android`; web is a P5 target (ADR-003 §6), not a missing dependency.                                                                                                                                                                                   | frontend skeleton                                                                  |
| L-08 | Never exclude specs from the tsconfig the IDE and `typecheck` use — test code then goes unchecked and everything still looks green. Exclude them only in `tsconfig.build.json`. Verify with `tsc --listFiles`.                                                                                                                                                                                             | backend skeleton                                                                   |
| L-09 | **ESLint flat config does not merge a rule's options across blocks — the last matching block wins outright.** A later, broader block silently erased the AR-01 import restrictions on `core/domain`, so P0-G6 was false while the config looked right. Declare pattern sets once, spread them into every block that applies, most specific LAST. Verify with `eslint --print-config <file>`.               | P0-G6                                                                              |
| L-10 | A healthcheck must not depend on something that depends on the healthcheck. Gating Mongo's health on `isWritablePrimary` deadlocked against `rs.initiate()`. Health = "is it listening"; readiness guarantees belong on a one-shot init job plus `service_completed_successfully`.                                                                                                                         | ops stack                                                                          |
| L-11 | A lint rule, a gate, or a healthcheck that is only _configured_ is not verified. Each one here is now exercised by a test that makes it fail on purpose — that is the only way to notice when it stops working.                                                                                                                                                                                            | P0-G6, ops                                                                         |
| L-12 | **A package-boundary change must be probed from every consumer with a real import.** Node, Metro and Vite use three different resolvers. Fixing the backend left the frontend equally broken, and both failed with a message naming the module rather than the mechanism. The legacy `moduleResolution: "Node"`/Expo default ignores `exports` maps entirely; Metro needs `unstable_enablePackageExports`. | sdk interop                                                                        |
| L-13 | Never locate a file by counting `../` from `import.meta.url`. It works until the output layout changes depth, then silently reads the wrong path. Walk up to a marker file (`pnpm-workspace.yaml`) instead.                                                                                                                                                                                                | sdk interop                                                                        |
| L-14 | Prove a proof system over a SWEEP of sizes, not one example. Both Merkle bugs returned correct answers for the tree shapes a hand-picked case would have used, and failed only at specific ones. Iterate every size in a range for anything recursive.                                                                                                                                                     | T1.5                                                                               |
| L-15 | Under vitest, Nest DI cannot rely on `emitDecoratorMetadata` — esbuild does not emit it, so dependencies arrive as `undefined` with no wiring-time error. Inject explicitly with `@Inject(TOKEN)` (ADR-002).                                                                                                                                                                                               | T1.7                                                                               |
| L-17 | **An identifier derived from the LOCAL node cannot be stable across nodes.** Any projection keyed on `nodeSigner.serverId` is wrong the first time a peer projects the same envelope. Before deriving an ID, ask: would a different node, given only these bytes, compute the same value? If not, it is a row ID wearing a better name (ID-01).                                                            | ADR-010, found by the P2 two-node gate on its first run                            |
| L-18 | **A one-node test suite cannot see a two-node bug, and it will look green while the feature is broken.** The community-origin defect passed 230 single-node tests. Whenever a phase adds a second participant, the gate for that phase must instantiate two genuinely independent stacks — separate stores, keys, and logs — because sharing any of them reproduces the false green it exists to prevent. | FG-03                                                                              |
| L-19 | **A port whose consumers need different halves must be split, or the composition root cannot construct it.** `FederationOut` carrying both `enqueue` and `backfillFrom` made the outbox depend on the pipeline while the pipeline depended on the outbox. Interface Segregation is not tidiness here — the cycle is a hard build failure, and narrowing the port removed it.                                | P2 wiring                                                                          |
| L-20 | **A green in-process gate does not mean the deployed artefact runs.** FG-01…FG-10 passed while the production Docker image could not boot: `@bufbuild/protobuf` was a *runtime* dependency of generated sdk code but declared nowhere, resolved only by hoisting from the ROOT dev tree, and `pnpm install --prod` drops it. Run the real image, not just the test harness, before claiming a phase.       | `pnpm ops:two-node`                                                                |
| L-21 | **An identifier defaulted to `''` becomes one shared database row.** `exchangeDirectory` returned `serverId: ''`; every peer a directory named upserted onto `_id: ''`, producing one document with one node's key and another's endpoints — which then poisoned FD-10's observation relay into a FALSE FORK BLOCK. Never persist an entity whose identity field is empty; discard it and say why.        | container run                                                                      |
| L-22 | **Any check that can BLOCK a peer must verify the claim belongs to that peer.** FD-10 relays tree heads labelled by the RELAYER. Without matching `sth.serverKey` to the peer it is attributed to, any peer could get any other blocked by relaying a mislabelled head — and BLOCKED needs an operator to lift, so a false positive is a long-tailed denial of service.                                   | container run                                                                      |
| L-23 | **Node-local secrets cannot gate federated content.** Proof of work, credits, blind credentials and nullifiers are each keyed to ONE node by design. A proof minted for A is meaningless on B, so re-charging on arrival makes every gated domain unfederatable. Admission cost is charged at origin; the receiver's protection is the per-peer quota (ADR-011).                                          | container run                                                                      |
| L-24 | **Two stores answering the same question is one store too many, and the wrong one wins.** Peer tree heads lived in a durable ledger AND a per-process `Map` behind `verifyPeerSth`; the in-process copy was authoritative, so fork detection reset on every restart. When you find state duplicated, delete a copy — do not sync them.                                                                    | Stage 0                                                                            |
| L-25 | **A verification badge with a default state is a lie with a uniform on.** `Seal`'s `state` defaulted to `'synced'`, so every badge in the app claimed "verified" while `verifyProvenance` had zero call sites. Make the honest value impossible to omit: no default, and the compiler names every caller that was asserting without checking.                                                              | Stage 0                                                                            |
| L-26 | **Two limits enforced in sequence are not two limits.** Checking the envelope bucket, spending it, then checking the byte bucket converts a byte breach into an envelope breach and tells the peer the wrong thing to do about it. Allowances that are jointly binding must be decided and spent in one atomic step.                                                                                      | Stage 0                                                                            |

| L-27 | **A phase marked ✅ without a gate that fails on purpose is a claim, not a fact.** `Plans/12-FRONTEND-UX-COVERAGE-PLAN.md` declared Phases 0–8 "implemented and validated" — the monoliths it said were split were 2000+ line files, the ~80-route tree didn't exist, the ~40 shared components numbered 12. Nothing ever asserted the plan's own claims against the tree, so a green summary hid the gap for an entire session's worth of prior work. L-11 was about a lint rule; this is the same defect one layer up, in a planning document instead of a config file. | PF-FRONTEND-UX-REBUILD |
| L-27 | **A durability default that fails open reads as data loss, and reports itself `ready` while doing it.** `MONGO_URL` unset silently selected the in-memory doubles, and nothing loaded a `.env`, so `just dev` started Docker and then ignored it for months. Any adapter choice that trades durability for convenience must be visible at `/health/ready` and reachable by config the default dev command actually loads. | dev environment, reported as "communities disappear between logins"                |


---

## P0 — Contracts & Skeleton

### 2026-07-29 — Repository grasp, foundation docs, toolchain [P0]

**Built:**

- Read all 29 specification documents in `Plans/` and `Code Implementation/P0-P2-IMPLEMENTATION-PLAN.md`.
  No source code existed prior to this session — the repo was specification-only.
- `CLAUDE.md` — the standing instruction file: goal priority, architecture in one pass, coding rules
  (hexagonal boundaries, the four bans, SOLID mapping), frontend quality bar, working protocol,
  definition of done, and the list of decisions that look reasonable but are wrong in this system.
- `Code Implementation/BUILD-LOG.md` — this file.
- `Code Implementation/ADR-001-DATABASE.md` — MongoDB + Redis, decided by the user; trade-offs and
  required mitigations recorded.
- `Code Implementation/ADR-002-NESTJS-HEXAGONAL.md` — how ports & adapters map onto NestJS DI without
  letting framework decorators leak into `core/domain`.
- `Code Implementation/ADR-003-STACK-DEVIATIONS.md` — every deliberate divergence from the frozen Plans,
  written down so none of them is a silent cut.

**Verified:** `cargo 1.97.1`, `rustc 1.97.1`, `pnpm 9.15.4`, `node v20.19.6`, `Docker 29.1.3`,
`Python 3.14.0` all present. `~/.cargo/bin` added to the persistent user PATH.

**Broke:** `winget` is unavailable on this machine, so the documented Rust install path does not work.
Root cause: Windows 11 IoT Enterprise LTSC ships without the App Installer package.

**Learned:** Install Rust here by downloading `rustup-init.exe` directly from `static.rust-lang.org` and
running it with `-y --profile minimal --no-modify-path`, then adding `~/.cargo/bin` to the user PATH
explicitly. Do not assume `winget` exists on LTSC/IoT Windows images.

**Next:** Scaffold the monorepo root, then `proto/jagoo/v1/*.proto` + `registry.yaml` (T0.1–T0.6).

---

### 2026-07-29 — backend/ and frontend/ workspace skeletons [P0]

**Built:**

- `backend/` — the NestJS node as its own workspace package (`@jagoo/backend`). `package.json`,
  `tsconfig.json` (CommonJS + decorator metadata, extends `tsconfig.base.json`), `nest-cli.json`,
  `vitest.config.ts`, `src/main.ts` on the Fastify adapter per ADR-002, and the full hexagonal tree:
  `src/core/{domain,ports,app}`, `src/adapters/{inbound,outbound}`, `src/features`, `src/composition`,
  `src/cli`. Each directory carries a placeholder `index.ts` stating what belongs there and which
  requirement governs it, so the layout is self-documenting before any logic lands.
- `backend/src/composition/app.module.ts` — the composition root, empty. **T0.18** partially: it boots.
- `backend/src/composition/app.module.spec.ts` — asserts the empty node boots (T0.18 acceptance).
- `frontend/` — the Expo app as its own workspace package (`@jagoo/frontend`). `package.json`,
  `app.json` (expo-router plugin, typed routes, `newArchEnabled`), `babel.config.js`, `jest.config.js`
  (jest-expo preset), `tsconfig.json`, an Expo Router shell in `app/`, and
  `src/{signer,data,verify,i18n,theme}` with the same self-documenting placeholders.
- `frontend/app/index.test.tsx` — renders the root screen with no network.
- Fixed a pre-existing lint error in `packages/sdk-ts/src/signer/plane-signer.ts` (type-only import).

**Verified:** `pnpm install` clean · `pnpm lint` 4/4 · `pnpm typecheck` 5/5 · `pnpm build` 4/4 ·
`@jagoo/backend test` 1 passed · `@jagoo/frontend test` 1 passed · built node boots and serves
(`node backend/dist/main.js` → 404 on `/`, correct for a node with no routes registered).

**Broke:**

1. `pnpm build` failed at `@jagoo/frontend` — `expo export` defaults to including web and demands
   `react-native-web`, which is deliberately not a dependency. Fixed by pinning the build script to
   `expo export --platform ios --platform android`.
2. The backend boot spec failed with a missing-Express error. Root cause: `createNestApplication()`
   defaults to the Express adapter regardless of what `main.ts` uses, and only `@nestjs/platform-fastify`
   is installed. Fixed by passing `new FastifyAdapter()` explicitly in the spec.
3. `@nestjs/testing` was missing — it is not pulled in by `@nestjs/core`.
4. `backend/tsconfig.json` excluded `**/*.spec.ts`, so specs were typechecked by **nothing** — `pnpm
typecheck` skipped them and the IDE treated them as orphan files outside any project. Fixed with the
   standard Nest split: `tsconfig.json` includes specs (IDE + `typecheck`), `tsconfig.build.json`
   excludes them, and `nest-cli.json` points the build at the latter. Verified both ways — the spec now
   appears in `tsc --listFiles` and `dist/` still contains no spec output.

**Learned:**

- **L-06** — The HTTP adapter is chosen per-application, not per-project. A Nest test that calls
  `createNestApplication()` without arguments silently asks for Express, so on a Fastify-only node the
  failure surfaces as a confusing missing-module error. Always pass the adapter explicitly in specs.
- **L-07** — `expo export` targets every platform in the project's platform list by default. On a
  native-only project this turns into a demand for `react-native-web`. Constrain the export explicitly
  rather than installing a web renderer that is not a P0–P2 target (ADR-003 §6 keeps web at P5).
- **L-08** — Excluding specs in the _same_ tsconfig the IDE and `typecheck` use means test code is never
  type-checked, and the mistake is invisible because everything still passes. Exclude specs only in a
  separate `tsconfig.build.json` that the compiler uses. Confirm coverage with `tsc --listFiles` rather
  than assuming — a green `typecheck` over a file set that omits the file proves nothing.

**Next:** T0.14–T0.17 — the cross-language vector gate. `tools/vectors/run-gate.mjs` does not exist and
`@jagoo/sdk` has no test files, so `pnpm vectors` and root `pnpm test` are both red. Per
`P0-SKELETON-PLAN.md` §8 this is step 6 and blocks the remaining backend work (step 7). Note L-02 when
writing the fixtures: expected bytes must come from a different implementation than the one asserting.

---

### 2026-07-29 — P0 complete: all seven exit gates green [P0]

**Built:**

- **T0.14 · the cross-language gate.** `tools/vectors/run-gate.mjs` runs the TypeScript,
  Rust and Python dumps over the shared fixture set and diffs them _pairwise_ — it never
  trusts `expected.json`, because a committed expectation can be regenerated by a mistake
  whereas three independent implementations agreeing requires the same mistake three times.
  `--update` is manual and never runs in CI (L-02). Added `packages/sdk-ts/src/vectors/`
  (`fixtures.ts`, `dump.ts`) and generated `tools/vectors/expected.json`.
- **T0.15–T0.17 · the three regressions**, in TypeScript (36 tests) and Rust (6 tests),
  alongside the existing Python suite (22 tests). `field-omission.spec.ts` carries the full
  account of the v1 bug and adds a truncation probe — there must be no prefix of the
  canonical bytes that a signature over the full bytes also validates.
- **T0.19 · ports.** Every port from `Plans/07` §2 as an abstract class (DI token _and_
  type contract, ADR-002), plus an in-memory double for each (AR-03). The projection double
  implements real rollback, so a handler that writes then throws fails its unit test
  instead of corrupting production.
- **T0.21 · `DomainRegistry` + `DomainHandler`.** Registration is fail-fast on duplicates.
  `domain-registry.spec.ts` registers `jb:throwaway:test:v1` — a domain the core has never
  heard of — and dispatches through it with zero core changes.
- **T0.22 / P0-G7 · `accept.ts`.** Steps 3–5 (VERSION, DOMAIN, PLANE) as three pure
  functions; 16 tests, every error path reachable, including that ordering is part of the
  contract and that the rejection detail does not leak the registry contents (ER-02).
- **Typed rejection contract** — all 20 codes from `Plans/02` §6.
- **`ops/docker-compose.yml`** + `ops/node.Dockerfile`, and **`.github/workflows/ci.yml`**
  running every P0 gate as blocking.
- Installed the Rust toolchain (1.97.1). It was **absent** on this machine — the first log
  entry's "cargo 1.97.1 verified" was recorded on a different (Windows) host.

**Verified:** `pnpm vectors` → _3 implementations agree on 16 vectors, P0-G1 PASS_ ·
`cargo test -p jb-core` 6/6 · `pytest tools/vectors` 22/22 · `pnpm test` 67 (sdk 36,
backend 30, frontend 1) · `lint` 4/4 · `typecheck` 5/5 · `build` 4/4 · `proto:check` in
sync · Mongo `rs0` reaches PRIMARY and a **real two-collection transaction commits**.

**Broke — three latent defects, each found only because something was made to fail on purpose:**

1. **P0-G6 was false.** The import-boundary lint did not fail on `core/domain` importing
   `mongodb`, `@nestjs/common`, or an adapter. Root cause: ESLint flat config _replaces_ a
   rule's options rather than merging them, and the broad `SG-01` block matching
   `backend/src/**` came last, wiping out every AR-01 pattern. `eslint --print-config`
   showed the effective rule contained only the signer patterns. The `new Date()`
   restriction was being clobbered the same way. Fixed compositionally — patterns declared
   once, spread into each block, most specific last.
2. **`pnpm ops:up` produced a Mongo with no replica set.** The script named services
   explicitly and so never ran `mongo-init`; the very trap L-03 exists to warn about.
   Then the fix exposed a second bug: gating Mongo's healthcheck on `isWritablePrimary`
   deadlocks against `rs.initiate()`, and the init container died with `ECONNREFUSED`.
3. **A wrong Bangla byte-count assertion in the Python suite** (28, actual 31), with a
   comment claiming 6 code points where there are 10.

**Learned:**

- **L-09**, **L-10**, **L-11** in the table above.
- **The Bangla finding is a real design input, not a typo.** U+09DC RRA, U+09DD RHA and
  U+09DF YYA are Unicode _composition exclusions_: NFC does not recompose base + nukta, so
  a precomposed `ড়` normalises DOWN to two code points and costs **6 bytes, not 3**. These
  are high-frequency letters. Any class 0–2 size budget (SIG-26: broadcast ≤ 512 B) sized
  at "3 bytes per visible character" under-counts ordinary Bangla — a broadcast that fits
  in the lab and is rejected at construction in the field. TypeScript, Rust and Python all
  agree on 31 / 6 / 3; the behaviour is now asserted in both TS and Python.

**Next:** P1, starting with the validation pipeline steps 1–12 as pure functions (T1.1),
which slot directly onto `accept.ts`. The `@jagoo/sdk` consumption blocker is **resolved** —
see the entry below.

---

### 2026-07-29 — module interop: backend and frontend can both consume `@jagoo/sdk` [P0]

**Built:**

- **`@jagoo/sdk` now ships a dual build.** `tsconfig.build.json` → `dist/esm` (ESM),
  `tsconfig.cjs.json` → `dist/cjs` (CommonJS, `verbatimModuleSyntax: false`, `src/vectors/**`
  excluded because `import.meta` has no CJS equivalent). `scripts/finalize-dual-build.mjs`
  writes the nested `package.json` `type` markers — without them Node reads `dist/cjs/*.js`
  as ESM (root is `"type": "module"`) and throws `Unexpected token 'export'` at require time.
- **A subpath `exports` map with three conditions**, one per consumer: `require` → `dist/cjs`
  for NestJS, `import` → `dist/esm` for the vector gate, `react-native` → `dist/esm` for
  Metro. `react-native` is listed FIRST because condition order is priority order.
- **`backend/`** moved to `module`/`moduleResolution: "node16"`. It has no `"type"` field, so
  it still emits CommonJS for Nest's decorators.
- **`frontend/`** moved to `moduleResolution: "bundler"` and gained `metro.config.js` with
  `unstable_enablePackageExports` plus explicit `unstable_conditionNames` and monorepo
  `watchFolders`/`nodeModulesPaths`.
- **`frontend/src/verify/`** now has its first real implementation — `computeContentId` /
  `contentIdMatches` over the sdk, which is exactly the on-device verification the design
  requires (never trust a wire-supplied `content_id`).
- **Two permanent gates**, because none of this is self-announcing when it regresses:
  `backend/src/sdk-interop.spec.ts` (3 tests) and `frontend/src/verify/verify.test.ts`
  (4 tests). Both assert against the shared `tools/vectors/expected.json`, so they fail if a
  client ever drifts from the canonical form the rest of the network agreed on.
- `turbo.json`: `dev` now `dependsOn: ["^build"]`, since both dev servers consume built sdk
  output.

**Verified:** backend `require('@jagoo/sdk/core')` returns
`080110011a166a623a6d656d626572736869703a6c656176653a763128015004` /
`jb1gpj3sbylq5weqle6234hgjszosmskkr4m75wjuyabsjw2lcg33fa` — **byte-identical to the
`minimal` fixture** and to Rust and Python. Metro bundles the sdk (916–919 modules, up from
~900). Clean-tree run: lint 4/4 · typecheck 5/5 · build 4/4 · tests 74 (sdk 36, backend 33,
frontend 5) · `pnpm vectors` P0-G1 PASS · cargo 6 · pytest 22 · `proto:check` in sync.

**Broke:**

1. **The frontend had the identical bug and would have shipped undetected.** I nearly
   declared victory after fixing the backend. Probing Metro showed `@jagoo/sdk/core` was
   _also_ unresolvable from `frontend/` — Expo's `tsconfig.base` sets the node10 resolver,
   and Metro in SDK 52 does not read `exports` maps unless told to.
2. **Metro cannot bundle the sdk's TypeScript source.** Pointing the `react-native`
   condition at `src/` failed with `Unable to resolve module ./canonical.js` — Metro does
   not remap TypeScript-ESM `.js` specifiers to `.ts` the way tsc and Vite do. Repointed at
   `dist/esm`; the cost is that an sdk edit needs a rebuild before the app sees it.
3. **Two depth-fragile fixture paths broke** the moment output moved to `dist/esm/`.
   `new URL('../../../../tools/...', import.meta.url)` had been correct from both
   `src/vectors/` and the old flat `dist/vectors/` by coincidence — four levels in each —
   and started reading `packages/tools/vectors/...` at five. Replaced with an upward walk
   for `pnpm-workspace.yaml`.

**Learned:**

- **L-12** and **L-13** in the table above.
- **Fixing an interop problem for one consumer proves nothing about the others.** Three
  consumers, three resolvers, three different failure modes — and each failed with a message
  that named the module rather than the mechanism. When a package-boundary change lands,
  probe _every_ consumer with a real import before calling it done.

**Next:** unchanged — P1 pipeline steps 1–12 (T1.1). Nothing now blocks the backend from
using `canonicalBytes`/`contentId`.

---

<!-- Append new entries above this line, newest last within each phase section. -->

## P1 — Core Node & Forum Plane

### 2026-07-29 — the pipeline spine: an envelope goes in, a verifiable receipt comes out [P1]

**Built:** (plan and gate status in `P1-CORE-NODE-PLAN.md` §6)

- **Deterministic decoder** (`packages/sdk-ts/src/core/decode.ts`) — pipeline step 2. Rather
  than restating the five canonical rules inside the decoder, where they would drift from
  the encoder's copy, it decodes and then **re-encodes and compares bytes**. One check
  covers field order, omitted zeros, minimal varints, unknown fields, NFC and trailing
  data. 15 tests, each a _different_ byte string meaning the same thing — every one of
  which v1 would have accepted.
- **Pipeline steps 1–15** as pure functions in `core/domain/pipeline/`. Steps 1, 6, 7 and 13
  read policy from the generated registry row rather than branching on the domain string,
  which is what makes P1-G11 hold.
- **`DomainRegistry` joined to `DOMAIN_SPECS`.** Registering a handler for a domain the
  contract does not define, or with a plane the contract disagrees with, throws at bootstrap
  (RG-01, SEP-02).
- **`IngressPipeline`** — the 19 steps composed, nothing implemented inline.
- **`LocalMerkleLog`** + RFC 6962 maths in `core/domain/merkle.ts`. Inclusion _and_
  consistency, with tests that detect an altered historical leaf and a dropped one.
- **`POST /v1/envelopes`** — the single write route — plus read endpoints with cursor
  pagination, `provenance` blocks, STH and inclusion proof. Composition root binds all 19
  ports.
- Feature handlers: post, comment (threaded by content ID, depth precomputed), vote
  (re-vote replaces rather than accumulates).

**Verified:** 149 workspace tests (sdk 51, backend 93, frontend 5) · Rust 6 · Python 22 ·
`pnpm vectors` P0-G1 PASS · lint 4/4 · typecheck 5/5 · build 4/4 · `proto:check` in sync.
The HTTP suite runs against a **real Nest app on Fastify through the actual composition
root**, so an unbound port fails the test rather than surfacing in production.

**Broke:**

1. **My `verifyConsistency` was wrong** — the RFC 6962 generator was right but the verifier
   was a different algorithm. Then `verifyInclusion` failed too: `inclusionPath` emits the
   DEEPEST sibling first, and the verifier consumed the path top-down. Both were caught only
   because the tests sweep _every_ (leaf, size) and (old, new) pair up to 33/24 rather than
   spot-checking one tree.
2. **DI silently returned `undefined`** for every controller dependency. Root cause: vitest
   compiles through esbuild, which does not support `emitDecoratorMetadata`, so Nest had no
   constructor types to infer from. ADR-002 already prescribed the fix — explicit
   `@Inject(TOKEN)` — so the code was wrong, not the ADR.
3. **The import-boundary lint caught me violating AR-01.** `test-harness.ts` was placed in
   `core/app/` and imports adapters. The rule fired, and the file moved to `src/testing/`
   rather than the rule being relaxed. Exactly the value P0-G6 was fixed to provide.

**Learned:**

- **L-14** — Prove a proof system over a SWEEP, not an example. Both Merkle bugs produced
  correct results for the tree sizes a hand-picked case would have used; they only failed at
  specific shapes. For anything recursive and structural, iterate every size in a range.
- **L-15** — Under vitest, Nest DI must not rely on `emitDecoratorMetadata`. Inject
  explicitly, or dependencies arrive as `undefined` with no error at wiring time.
- A test harness is not core code. If it wires adapters it belongs outside `core/`, and the
  boundary lint will tell you so.

**Next:** T1.3/T1.4 — the Mongo adapters, behind the ports already in place, then T1.6
`rebuild-projections` to make P1-G3 real. The in-memory projection double already implements
true rollback, so the transactional contract the Mongo adapter must honour is already
pinned by tests.

---

### 2026-07-29 — P1 audit: production node complete, client foundations complete [P1]

**Verified inherited work:** all 30 Forum handlers are registered and exercised through the
real pipeline. The audit rejected the prior session's completion claim because Mongo/Redis,
rebuild, auth, anti-abuse, most reads, and the client were still absent.

**Built and corrected:**

- Mongo envelope/projection/Merkle/nonce adapters with shared transactions, persisted compact
  Merkle frontier, dense leaf indices, original receipts, and a byte-identical projection rebuild CLI.
- Redis atomic credits/nullifiers/nonces and tagged cache; stateless key-bound Argon2id; RSA blind
  credentials; trusted-proxy subject derivation; production fail-closed startup.
- Key-bound one-use auth, separate access/refresh signing keys, refresh revocation, ML-DSA-44
  certificate enforcement, non-retroactive revocation, rotation standing, and owner-authorized
  courier-published duress revocation (ADR-006).
- Homogeneous batch ingress, full frozen Forum read table with cursor pagination and offline
  provenance, SSE, derived notifications, fail-open label preflight, readiness probes, and
  hash/MIME/size-bound object claims.
- Expo foundations: scrypt/XChaCha-wrapped SecureStore mnemonic, per-context signer, certificates,
  duress export, native Argon2, offline AsyncStorage/TanStack data, Bangla/English strings, offline
  receipt verification, and X25519 + ML-KEM-768 + ChaCha20-Poly1305 Forum DM encryption.

**Security defects found during audit:**

1. Any certified third party could forge a duress revocation. The body had no owner authorization.
2. PQ certificate fields were optional in the handler despite AUTH-13.
3. Attachment claims never checked that the confirmed blob matched the signed claim.
4. React Native Argon2 would UTF-8-transform arbitrary challenge bytes; both sides now hash the
   challenge's hex representation.
5. The vector gate compared LF output against CRLF checkout bytes on Windows. It now normalizes
   only line endings; canonical envelope bytes remain unchanged.

**Verified:** proto lint/check; 3-language vectors (16); lint; typecheck; build; 195 tests pass
(SDK 54, backend 136, frontend 5). Three production-adapter integration tests are committed but
skipped locally because Docker Desktop was unavailable. The Redis test is the real P1-G6
50-concurrent/10-credit gate; the Mongo test forces a three-store transaction rollback.

**Remaining:** RN feature screens and audit UI. They are intentionally not improvised without the
requested design brief, so P1-G1 and ADR-003's screen-test replacement for P1-G2/P1-G10 remain open.

---

### 2026-07-29 — P1 parity audit: green routes were not complete features [P1]

**Found and corrected:**

- Mongo projection reads inside a transaction did not carry its session. `AsyncLocalStorage` now
  gives every handler read-your-writes semantics, and the real-Mongo rollback test asserts it.
- Accepted posts discarded polls, crossposts, flags, moderation state, and award/reply counters.
  Votes changed scores but not author karma; default roles were never assigned; member policy was
  not enforced for votes, awards, or reports. These projections and authorisation paths now retain
  and enforce the frozen contract.
- Feed/search routes existed but ignored documented sort, timeframe, depth, membership, status, and
  result-kind inputs. They now implement those behaviors, including identity/comment search and
  blocked-author filtering.
- Refresh tokens were reusable and only returned in JSON. They now rotate and use an HttpOnly,
  SameSite cookie; attachment tickets require an access token; production can no longer fall back
  to volatile blob storage.
- `proto:check` checked only registry outputs despite claiming to regenerate protobuf bindings. It
  now runs Buf into an isolated temporary tree and byte-compares the entire generated TypeScript
  file set.
- Local notifications are identity-scoped; read/delete overrides remain private. Cache entries are
  origin-scoped, signer-derived secrets are zeroed promptly, and Forum panic wipes Forum cache
  without creating future cross-plane coupling.

**Gate hardening:** CI now starts a transaction-capable Mongo replica set and Redis, then runs the
VP-02, P1-G6, and tagged-cache integration tests explicitly. Unit suites remain isolated from that
shared state.

**Verified:** 203 workspace tests pass (SDK 54, backend 142, frontend 7); the three infrastructure
tests skip locally because Docker Desktop is unavailable but are mandatory in CI. Lint, typecheck,
native Expo export, backend build, Buf lint, full generated-code diff, and all 16 cross-language
vectors pass. `git diff --check` is clean.

**Still open:** visual RN feature screens and the audit view. The required product design brief has
not been supplied, so P1-G1 and ADR-003's screen-based G2/G10 replacement remain honestly red.

---

### 2026-07-29 — P1 frozen-catalogue audit corrected the completion boundary [P1]

**Finding:** the preceding audits completed the explicit T1 core-node spine, but incorrectly treated
that task list as the whole P1 catalogue. `SYSTEM-REQUIREMENTS.md` remains authoritative and also
requires administration/configuration, full attachment management, operational observability and
documentation gates, moderation appeals, runtime network limiting, and the complete client surface.

**Corrected:** added `P1-REQUIREMENTS-AUDIT.md`, changed the plan and architecture status from
"production node complete" to "core-node spine complete", and downgraded P1-G4/G5 until the tested
trusted-proxy helper is bound to a real request limiter/IP-block path. Added production secret
generation and `ops/README.md` covering durable dependencies, required secrets, integration gates,
projection recovery, and backup-critical state.

**Verified:** secret generation emits five valid assignments, including a complete private RSA JWK.
Lint, typecheck, 203 workspace tests, native Expo/backend builds, Buf lint, full generated-code drift,
and all 16 three-language vectors pass. Three Mongo/Redis integration tests remain unexecuted locally:
the Docker client is installed, but its Desktop Linux engine is not running.

**Next:** finish the nonvisual rows in the audit matrix. Visual RN work remains blocked on the
requested product design brief and must not be improvised.

---

### 2026-07-29 — P1 design authority supplied; RN and runtime closure started [P1]

**Design:** persisted the approved `Plans/design.md` direction and supplied visual reference in
`.impeccable.md`: federated, unstoppable, anonymous; calm and private; Ember Forum space strictly
separate from Signal messaging. Implemented light/dark tokens, Poppins/JetBrains typography, Reach
Pill, Seal, five-tab shell, responsive feed/post/thread/audit, communities, full composer states,
encrypted inbox, profile, search, and a P1 feature-destination registry spanning identity through
operations. The registry and ambient trust shell have integration tests.

**Capability closure:** completed authenticated attachment list/get/download/delete with ownership
checks; added global CSP, framing, referrer, permissions, and content-type headers. Bound the
trusted-proxy parser to an atomic Redis request limiter/IP-block decision path. User-Agent is not an
input, untrusted XFF cannot rotate buckets, the limiter receives no Forum key, and Redis failure
closes rather than bypasses.

**Bundle correction:** the first native export exposed barrel imports pulling every font weight and
icon family. Direct imports reduced assets from 83 to 35, modules from about 1,095 to 1,000, and each
Hermes bundle from 3.24 MB to 2.91 MB.

**Verified:** lint and typecheck pass; 208 workspace tests pass (SDK 54, backend 144, frontend 10)
with three infrastructure tests skipped locally; backend and both native Expo exports build.

**Still open:** authenticated admin/IP-block CRUD, durable operator configuration, observability,
remaining platform gates, real API/signing integration for all RN destinations, deeper per-feature
screen tests, and local Mongo/Redis execution. P2 remains untouched.

---

### 2026-07-29 — P1 closure: operator surface, live client path, and reproducible acceptance [P1]

**Closed:** bound trusted-proxy subjects to a global fail-closed request limiter and authenticated
IP-block path; added durable runtime security configuration, aggregate-only observability, admin
summary/metrics/feature inspection, security headers, and machine-readable OpenAPI. Attachment
staging now binds owner, hash, MIME, and size before a signed claim; list/get/download/delete and a
containment-safe filesystem blob adapter complete the small-node storage path.

**Client:** implemented the approved Ember/Signal design system and responsive Expo shell, with
feed, post, audit, communities, composer, inbox, profile, search, and 14 reachable P1 feature
destinations. Forum recovery/import/unlock/register is on-device; registration now solves the
certificate PoW, obtains a blind credential, and signed post publication uses a real community
scope and returns the transparency receipt.

**Runtime acceptance:** added `seed:demo` and `smoke:local`. The smoke test performs the whole
certificate → auth → credential → community → signed post → receipt → feed path against the actual
Nest composition without external services. This uncovered and fixed three real integration bugs:
the seed omitted certificate PoW, development used a non-protocol credential double, and the
published post omitted its community scope. A fresh credit subject now covers the registry's
largest valid operation.

**Repository:** removed tracked macOS metadata, an empty abandoned directory, and the root Cargo
build output. Cargo output now lives in ignored `.cache/`; root manifests, `packages/`, `crates/`,
`proto/`, `tools/`, and the hoisted pnpm `node_modules/` remain intentionally at monorepo level.
`README.md`, `AGENTS.md`, operations guidance, the P1 plan, and the requirements audit now describe
the same startup and completion boundary.

**External acceptance:** Mongo/Redis integration tests remain mandatory in CI but were not rerun
locally after Docker work was explicitly stopped. Raspberry Pi memory/nightly endurance gates need
their target environment. P2 remains untouched.

**Verified final baseline:** 227 workspace tests pass (SDK 54, backend 149, frontend 24), with the
three real-infrastructure tests skipped; lint, typecheck, Android/iOS Expo export, backend build,
generated-contract drift, and all 16 three-language vectors pass. A built development node reached
ready state and served a security-header-protected OpenAPI document with 65 paths. `git diff --check`
is clean.

---

## P2 — Federation ★ PRIMARY

### 2026-07-29 — portable acknowledgements, service discovery, and client proof vault

- Added root `/health` discovery for the node's requested/local addresses, audit-log services,
  mCaptcha services, and evidence endpoints; `/federations` reports configured peer reachability.
- Standardised an SDK-verifiable audit certificate containing the exact envelope request packet
  and the existing signed transparency receipt. `/verify` checks it and `/status` reports
  `online`, reasoned `hidden`, unexplained `deleted`, or `unknown_server`.
- Added the independently runnable `services/audit-log` workspace with append-only, hash-chained
  JSONL persistence, idempotent retries, conflict rejection, and its own verification boundary.
- Replaced the Expo demo bootstrap with persisted home-node onboarding, live service discovery,
  real feed/community/search/post reads, a local proof vault, direct third-party forwarding, and
  responsive network/proof screens following `Plans/design.md`.
- Acceptance is covered by SDK-backed HTTP tests, audit-service tests, Expo onboarding/shell
  tests, and the normal lint/typecheck gates. See ADR-009.

---

### 2026-07-29 — P2 complete: two independent instances exchange, verify, and project content [P2]

**Built:** T2.1–T2.16, the whole catalogue. `P2-FEDERATION-PLAN.md` §4 holds the gate table.

- **SDK** — `signer/federation-signing.ts`. Length-prefixed signing bytes for `AnnounceRequest`,
  `AnnounceResponse`, `ServerVouch`, `TreeHeadExchange`, `DirectoryExchange`, plus a
  method-bound per-call auth token. 11 tests, every one of them a pair of payloads a
  concatenating encoder would render identically.
- **Pure domain** — `core/domain/federation/{trust,announce,backoff,quota,stream-filter}.ts`.
  The whole `Plans/05` §3 promotion table, the handshake checks, the retry schedule, the
  token bucket, and the FG-10 plane guard, as functions of their arguments. 51 tests,
  including "7 days clean promotes to NORMAL" as a unit test rather than a seven-day one.
- **Ports** — `network.port.ts` gains five trust levels, a richer `PeerRecord`,
  `FederationSender`, `FederationLedger`, `FederationOutbox`, `PeerQuotaLimiter` and
  `IngressOrigin`; `alerts.port.ts` is new.
- **App** — `FederationInbox` (announce/TOFU, deliver, quota, select, fork detection),
  `FederationOutboxService` (fanout, drain, backoff, dead-letter), `FederationSync`
  (handshake, backfill, live pull, gossip, directory).
- **Adapters** — `nice-grpc` server and client over the generated `FederationDefinition`
  (ADR-007), the ADR-008 §1 passthrough codec, per-call peer authentication over metadata,
  Mongo ledger/directory/outbox, Redis Lua quota buckets and durable alerts, in-memory
  doubles for all of it.
- **HTTP** — `/.well-known/jagoo-bahee`, `/.well-known/nodeinfo`, `/nodeinfo/2.1`,
  `/v1/federation/{peers,sth,directory,alerts}`.
- **Client** — the network screen now reads the real peer directory, showing trust and
  reachability as WORDS as well as colour, narrowest scope first, in Bangla and English,
  rendered from cache when the request fails.
- **Ops/CI** — `pnpm ops:two-node` brings up two nodes with separate databases, real gRPC
  on 8444, and each listing the other by key. A dedicated blocking CI job runs FG-01…FG-10.

**Verified:** lint 5/5 · typecheck 6/6 · build 5/5 · **356 workspace tests pass** (backend
257, sdk 65, frontend 32, audit-log 2) with 3 real-infrastructure tests skipped locally ·
`pnpm vectors` 3 implementations agree on 16 vectors · `proto:check` in sync · `buf lint`
clean · `pnpm smoke:local` passes · `git diff --check` clean. **Zero rows added to
`registry.yaml` and zero edits under `proto/`** — `proto:check` staying clean is the proof
the freeze held.

**Broke — one real defect, found by the gate on its first run:**

1. **A federated community was unmoderatable, and it looked fine.** `CommunityCreateHandler`
   computed `communityId(name, this.nodeSigner.serverId)` — the **projecting** node. So B
   stored A's community as `dhaka_relief@jbs1<B>` while every post's `scope` said
   `@jbs1<A>`. Posts still landed (their handler tolerates a missing community, because
   federation legitimately delivers a post before its community), so the feed looked
   correct; every moderation action failed with `community is not known here`, and every
   membership and permission check on B resolved against a document no envelope refers to.
   This is ID-01 arriving through a different door than v1's Mongo ObjectIds, and **230
   single-node tests could not see it** — with one node, "the projecting node" and "the
   origin node" are the same node. Fixed by threading origin through the `HandlerContext`
   CLAUDE.md §4.3 always documented; see **ADR-010**, which also records the multi-hop
   limitation and the v2 contract change that removes it.
2. **The composition root would not construct.** `FederationOut` carried both `enqueue`
   (which the pipeline needs) and `backfillFrom` (which needs the pipeline). Narrowing the
   port to step-19 fanout and moving catch-up to `FederationSync` removed the cycle — an
   Interface Segregation violation that manifested as a hard build failure rather than as
   an aesthetic complaint.
3. **nice-grpc's derived request/response types are unusable with ts-proto.**
   `TsProtoMessageIn` resolves `fromPartial<I extends Exact<DeepPartial<T>, I>>` through
   `Parameters<>`, which collapses the generic to its own constraint and produces
   intersections like `string[] & { [x: string]: never }` that no value satisfies. The
   runtime is entirely fine. Stated the contract once in `federation.contract.ts` in the
   generated message types, and cast at the two lines where the type systems meet, rather
   than scattering `as never` through the adapter.

**Learned:** **L-17**, **L-18**, **L-19** in the table above.

**Deferred, deliberately, with owners:** persisting `verifyPeerSth`'s in-process `Map`
inside `LocalMerkleLog`/`MongoMerkleLog` (the Mongo *ledger* persists peer heads and is what
production uses; the witness log's copy is still per-process). Multi-hop community origin
(ADR-010). Both are recorded in `P2-FEDERATION-PLAN.md` §5.

**Next:** P3 — ISP availability and bridging. `T3.11 BridgeRelay` is the phase that must not
ship before ADR-010's contract fix, because relay is exactly where the delivering peer stops
being the origin.

---

### 2026-07-29 — running the real image found four things the green gate could not [P2]

FG-01…FG-10 were passing. `pnpm ops:two-node` then failed at every stage in turn, and each
failure was real.

**1. The production image could not boot.** `Error: Cannot find module '@bufbuild/protobuf/wire'`.
The generated sdk imports it at RUNTIME, but it was declared nowhere — resolved only by hoisting
from the root's dev tree, which `pnpm install --prod` correctly drops. Every in-process test and
every host-side `node backend/dist/main.js` run had hidden it. Declared as a real dependency of
`@jagoo/sdk`. **L-20.**

**2. A junk peer record, from one defaulted field.** `GrpcFederationSender.exchangeDirectory`
returned `serverId: ''`. `FederationSync.exchangeDirectories` upserted it, so every peer a
directory named collapsed onto `_id: ''` — one document holding one node's key beside another
node's endpoints. Fixed by deriving the id from the key (FD-02), discarding records that cannot be
named, and skipping this node's own record. **L-21.**

**3. That junk record then made two honest nodes block each other.** FD-10 relays observations
labelled by the RELAYER, so the mismatched record fed node-a its own tree head under node-b's key.
Sizes coincided, roots did not, and each node recorded a fork against the other — `BLOCKED`, which
only an operator can lift. `observePeerSth` now discards a head whose `serverKey` does not match
the peer it is attributed to. This is a security fix, not a tidy-up: without it any peer can get
any other peer blocked. **L-22.**

**4. No gated domain could federate at all.** With delivery finally working, every envelope was
rejected on arrival — `INSUFFICIENT_CREDITS: valid proof of work required`, then
`NO_CERTIFICATE` for everything that depended on the certificate that had just been refused. The
proof was valid; it was minted against node A's `POW_SECRET`, and node B has its own. Every
anti-abuse gate is keyed to one node BY DESIGN, so this is structural: re-charging on arrival
makes 29 of 30 Forum rows unfederatable. Admission cost is now charged at origin, and the
receiver's protection is the per-peer per-class quota P2 built for exactly this
(**ADR-011**). **L-23.**

Two smaller fixes on the way through: the gRPC service returned `UNKNOWN: Unknown server error
occurred` when refusing a blocked peer, so the sender's outbox treated a permanent refusal as
transient and retried forever — the streaming paths now return the typed status. And `seed:demo`
reported a bare `HTTP 404` with no indication of which of its dozen calls failed, and used a
hardcoded nullifier salt that made it single-use per epoch.

**Verified after the fixes, in containers:** two nodes, separate databases, mutual handshake at
`TRUSTED`; a seeded post on node-a projected on node-b; the community keyed
`welcome@jbs12bfl…` — **node-a's** server id — on both, which is ADR-010 working in a real
deployment. Then node-b stopped, nine envelopes published on node-a and held in the durable
outbox, node-b restarted: 12/12 envelopes on both nodes, 12 inbound ledger rows, zero dead
letters, zero duplicates.

**Learned:** **L-20** through **L-23**. The general form: *the gate proves the logic; only the
artefact proves the deployment.* Every one of these four sat behind a boundary the in-process
harness does not cross — packaging, a second database, a third party's relayed claim, and two
nodes with different secrets.

---

### 2026-07-29 — Stage 0: closing what P2 left open, before P4 starts [P2 → P4]

Four items carried from `P2-FEDERATION-PLAN.md` §5 and the client audit. Three of the six §5
items are P3-owned (multi-hop community origin, federation TLS, per-hop cost accounting) and
stay deferred with their owners recorded.

**Built:**

- **Peer tree heads have one home.** `WitnessLog.verifyPeerSth` is **removed** from the port
  and all three implementations. It kept peer heads in a per-process `Map` while
  `FederationLedger` already persisted them durably, and `FederationInbox.observePeerSth`
  consulted both — with the in-process copy deciding. The comparison now happens once,
  against the ledger. Dead `checkPeerGrowth` went with it.
- **FD-05 vouches actually circulate.** They were stored, weighed by `evaluateTrust` and
  enforced, but nothing could create or receive one — `recordVouch` had no callers.
  `AnnounceResponse.vouches` now carries the answering node's own assertions (capped at 64),
  `FederationSync.handshake` ingests them, and `POST /v1/admin/federation/vouches` (ADM-11)
  is the operator action that mints one. `recordVouch` verifies the signature before storing.
- **FD-15's byte grant is enforced.** `Quota.bytes_per_min` was granted in every handshake and
  never spent. `consumePair` in the domain and one four-key Lua script in Redis now decide and
  spend the envelope and byte buckets together, all or nothing, with the BR-04 reservation
  applied to bytes as well as counts.
- **The client verifies before it claims.** `sealStateFor` maps a provenance block to a Seal
  state; `FeedPost.provenance` and `NodeComment.provenance` carry the full block rather than a
  five-field subset that omitted everything verification needs; the proof vault recomputes
  `verifyAuditCertificate` instead of asserting. `Seal` gained an `unsigned` state and lost its
  default.

**Verified:** lint 5/5 · typecheck 6/6 · build 5/5 · **374 workspace tests pass** (backend 268,
sdk 65, frontend 39, audit-log 2) with 13 real-infrastructure tests skipped locally ·
`pnpm vectors` 3 implementations agree on 16 vectors · `proto:check` in sync and `git diff`
clean on all generated output · `pnpm smoke:local` passes · FG-01…FG-10 unchanged and green.
Baseline before this block was 356 tests.

**Broke:**

1. **`MongoMerkleLog.verifyPeerSth` stored the new head BEFORE comparing**, so a forked head
   presented twice reported `CONSISTENT` on the second call. `LocalMerkleLog` did not have the
   bug, which is exactly how two implementations of one rule drift. Fixed by deleting both.
2. **A test premise of mine was simply wrong** — I asserted a refusal at 30 s of a 10/min rate,
   which refills 5 tokens and is therefore allowed. Rewritten against a 1 s window, where the
   gain is real but still short of the cost, which is the case the assertion was actually about.
3. **The frontend suite failed once and then passed 4/4 runs** on the same tree — a cold-cache
   first-run flake in `app/__tests__/index.test.tsx`, not a regression. Recorded rather than
   waved away; the Stage 1 restructure rewrites that suite and should not inherit it.

**Learned:** **L-24**, **L-25**, **L-26** above. Each of the three backend items was the same
shape: a mechanism fully built, wired at one end only, and green because nothing asserted the
other end. The vouch loop existed as storage plus evaluation with no ingress; the byte quota as
a grant with no spend; peer heads as a durable store nothing read. A test that makes the gate
fail on purpose is what distinguishes these from working code — the FD-05 test was run against
a deliberately disabled gossip path and observed to fail before being kept.

**Next:** Stage 1 — the client restructure (real `expo-router` routes, `main.tsx` split, i18n,
accessibility), which P4's Signal surfaces depend on.

---

### 2026-07-29 — Production frontend foundation and complete route pass

The Expo client now uses Expo Router as the application boundary instead of a monolithic
in-memory screen switcher. The root owns crash recovery, safe-area handling, persisted
appearance, query state, node discovery and connection state; tabs and deep links are real
routes. Forum, connectivity, capabilities and communities are grouped by product domain, while
design tokens, primitives and scene composition live in a documented design-system package.

**Built:**

- A five-destination native tab shell plus post, audit, community, capability, search, network
  and proof-vault routes, all safe-area aware and deep-linkable.
- A responsive field-forum visual system with semantic light/dark tokens, Poppins and JetBrains
  Mono typography, accessible touch targets, restrained motion and a two-colour native app icon.
- Live community detail, authenticated messaging/notifications, signed vote and signed reply
  actions, optimistic rollback, retry/empty/offline states, and audit-certificate forwarding to
  the node-advertised ALS.
- A resilient application provider, error boundary, persisted home-node and theme preferences,
  request cancellation/timeouts, cache fallback and debounced discovery/search.
- Expo SDK 52 dependency alignment and additive Metro workspace watching so monorepo packages
  remain resolvable on Android and iOS.

**Verified:** frontend lint, typecheck and 39 Jest tests pass; Expo Doctor reports 18/18 checks;
production `expo export` succeeds for Android (1,078 modules) and iOS (1,130 modules), producing
3.79 MB Hermes bundles for each platform. Export emits only upstream `@noble/hashes` subpath
fallback warnings.

---

### 2026-07-29 — Later-stage reconciliation before P4 [Stage 1 → P4]

**Built:** Recorded the previously missing `CLIENT-RESTRUCTURE-PLAN.md` against the implementation,
created `P4-SIGNAL-PLAN.md`, and accepted ADR-012 before introducing Signal state. The handoff's
authoritative boundary is now explicit: Stage 0 and the client restructure are complete; P4, P5 and
P6 remain. The existing Bangla catalogue is not counted as a completed localisation pass until the
new Signal and offline routes consume it.

**Verified:** the Stage 1 frontend evidence was rerun on the post-restructure tree: lint and
typecheck pass, 39/39 Jest tests pass, Expo Doctor reports 18/18, and Android/iOS production export
succeeds.

**Broke:** Documentation claimed the next action was to write the client plan after the client had
already shipped, while `CLAUDE.md` still described Signal as nonexistent. The root cause was doing
the implementation block without first materialising its phase plan.

**Learned:** A completed implementation without an updated phase boundary is indistinguishable from
untracked partial work to the next session. Reconcile the checklist before extending the system.

**Next:** P4 steps 1–3: plane-aware certificates, isolated Signal signer, channel lifecycle.

---

### 2026-07-29 — Stages 2–4 complete: Signal, offline mesh and optional Reticulum [P4 → P6]

The Claude handoff named three later stages but none had a reconciled implementation status.
`P4-SIGNAL-PLAN.md`, `P5-OFFLINE-MESH-PLAN.md` and `P6-RETICULUM-PLAN.md` now carry their
gate-to-test evidence and are closed at the software gate.

**P4 — Signal plane:**

- Added a genuinely isolated Signal certificate/revocation store and SecureStore signer vault,
  independent panic wipe, identified channel lifecycle, QR verification, confusable-name warning,
  sequence gaps, severity policy, revocation-in-place and separate Signal SSE/federation paths.
- Added crisis check-ins, missing-person and resource projections, cached map/list UI, offline
  prekeys, locally verified prekey signatures/expiry, hybrid X25519 + ML-KEM session initiation,
  symmetric ratchet primitives, monotonic counters, recipient receipts, ciphertext-only
  projections and bounded sender-key groups.
- Added explicit, privacy-labelled push opt-in. `jb:channel:subscribe:v1` is a signed local-only
  registry row with `federate: false`, so provider tokens cannot enter federation.

**P5 — durable offline and local mesh:**

- Every Forum and Signal publish path queues the exact final signed bytes before network send.
  The outbox survives restart, recovers `sending` rows, drains by priority, deduplicates by content
  ID, forwards receipts to ALS and isolates a permanent rejection instead of stranding the queue.
- Added native host-candidate WebRTC with QR offer/answer exchange, matching nonce fingerprints,
  65 KiB bounded frames, Bloom reconciliation, automatic missing-envelope transfer, hop/TTL
  limits, per-peer quotas and full signature/certificate/revocation verification before storage
  or relay. Mesh remains explicit opt-in.
- Added independently verified `.jbpack` import/export, certificate pre-positioning, cached Signal
  inbox/prekeys, resource-use controls whose battery/data-saver values alter the real probe
  cadence, and the complete offline relay route.

**P6 — optional Reticulum:**

- Added the isolated Python `services/relay` sidecar, checked-in generated bridge bindings,
  fragmentation with per-frame and whole-envelope integrity, timeout reassembly, SQLite-WAL
  store-and-forward, a no-radio TCP transport and the optional actual RNS boundary.
- Added the Nest `ReticulumTransport`/fanout adapter behind ports and configuration. It auto-feeds
  inbound envelopes through the ordinary ingress pipeline, rejects `BULK` locally, applies RPC
  deadlines, starts disabled and never sits on HTTP acknowledgement.
- Added administrator-authenticated, JSON-safe telemetry for interfaces, paths, RSSI, SNR,
  byte counters and queue depth, rendered in the existing Admin workspace.
- Added English/Bangla operator instructions, real Reticulum TCPInterface examples and an
  RNodeInterface configuration/safety guide.

**Verified on the final tree:**

- `pnpm lint` — 5/5 tasks pass.
- `pnpm typecheck` — 6/6 tasks pass.
- `pnpm build` — 5/5 tasks pass; Expo exports Android and iOS Hermes bundles (5.22 MB each).
- `pnpm test` — **406 workspace tests pass**: backend 283, SDK 66, frontend 55, ALS 2.
  Thirteen Mongo/Redis integration tests remain skipped without their external services.
- `pnpm test:relay` — 6/6 Python relay tests pass, including gRPC, TCP disconnect/resume,
  fragmentation/reassembly and typed `BULK` rejection.
- `pnpm proto:lint`, `pnpm proto:check`, `pnpm vectors`, `pnpm smoke:local` and Expo dependency
  compatibility checks pass. The registry is 49 domains: 30 Forum and 19 Signal.
- `git diff --check` reports no whitespace errors. Git prints only the repository's existing
  Windows line-ending conversion warnings.

**Broke, and the gates caught it:**

1. The async gRPC server used the synchronous `context.is_active()` API, crashing `Receive`.
   The stream now follows `grpc.aio` cancellation semantics.
2. The Reticulum client initially used the remote fanout hash as its local receive filter, which
   would silently discard all inbound packets. Receive now subscribes to the sidecar's announced
   local destination; a regression test fixes the distinction.
3. Exporting the native mesh screen from the general connectivity barrel eagerly loaded
   `react-native-webrtc` in ordinary routes and broke Jest without a native module. The mesh route
   retains a deliberate native-only lazy boundary.
4. The completed Signal registry made an old “Forum-only build” assertion false. The config gate
   now proves dual-plane default and explicit Signal-only operation.
5. The first mesh implementation displayed battery/data-saver controls without consuming their
   values, and generated Bloom summaries without transferring the computed difference. Both are
   now wired to behavior and asserted.
6. A dynamic notification import kept the native provider out of ordinary Jest startup, but the
   Expo TypeScript module target rejected that syntax. The explicit opt-in path now uses Metro's
   deferred `require`, preserving lazy native loading while passing lint, typecheck and all 55
   frontend tests.

**Not claimed:** no LoRa board was available, so an on-air RNode drill was not run. This environment
also cannot prove camera QR exchange, provider push delivery or WebRTC transfer between two
physical devices; the native code, contracts, automated policy gates and Android/iOS production
exports pass, and the exact device drills are documented. The software exit gates are complete
without turning those unrun hardware exercises into fictional evidence.

---

### 2026-07-30 — B1–B4 complete: shared crypto seam and Android acceleration

The client no longer has competing crypto call paths. `@jagoo/sdk` owns one synchronous,
primitive-only `CryptoBackend`; the portable Noble/Scure adapter remains the Node, iOS, test and
vector implementation, while an autolinked Android Expo module supplies the same contract through
Bouncy Castle 1.83. Signed formats, BIP-39/BIP-32/BIP-85 rules and identity policy remain in the
shared TypeScript byte authority.

**Built:**

- Routed SDK content IDs, evidence, blind credentials, Ed25519, X25519, AEAD, ML-KEM, ML-DSA,
  Signal ratchets and BIP-85 through the backend seam. Production direct Noble, Scure and
  `react-native-argon2` imports are forbidden; a test creates a violating file and requires ESLint
  to reject it with `CRYPTO-01`.
- Added shared BIP-39 and hardened BIP-32 implementations plus reference-parity regressions.
- Added `frontend/modules/jagoo-crypto`, exposing synchronous Expo `Function` primitives for
  SHA-2, HMAC, HKDF, PBKDF2, scrypt, Argon2id, Ed25519, X25519, ChaCha20-Poly1305,
  XChaCha20-Poly1305, ML-KEM-768 and ML-DSA-44.
- Installed the native backend before application/signer evaluation with an intentional JS
  fallback for iOS, Expo Go and Jest. Frontend vault KDF/AEAD, prekeys and proof-of-work use the
  seam.
- Cached one BIP-39 root seed per unlocked Forum/Signal signer, returned only copies, and zeroed
  the cache and wrapping key on lock, panic and replacement. A regression proves repeated signing
  makes exactly one PBKDF2 call per plane.
- Added an explicit 18-check Operations diagnostic comparing the Android backend byte-for-byte
  with JS, including cross-verification and KEM decapsulation. Accepted ADR-017 and closed the
  B1–B4 implementation plan.

**Verified on the final tree:**

- `pnpm install --frozen-lockfile`, workspace lint (5/5 tasks) and typecheck (6/6 tasks) pass.
- `pnpm test` passes **561 tests**: backend 431, SDK 71, frontend 57 and ALS 2. Thirteen external
  Mongo/Redis integration tests remain skipped.
- The SDK dual build passes; `pnpm vectors` confirms TypeScript, Rust and Python agree on all
  16 vectors and `expected.json`.
- Expo autolinking resolves both `expo-modules-core` 2.2.3 and local `jagoo-crypto`.
- `:jagoo-crypto:testDebugUnitTest :jagoo-crypto:assembleDebug` passes all four Kotlin/JUnit tests
  and produces the AAR. The tests include exact portable-backend KDF, AEAD, ML-KEM and deterministic
  ML-DSA vectors.
- A clean generated Expo Android project assembles a full multi-ABI debug APK: 606 Gradle tasks,
  `BUILD SUCCESSFUL` in 17m32s. The workstation's incomplete NDK 26.1 installation was bypassed in
  this disposable harness with the already-installed NDK 27.1; repository native source was not
  patched around the machine defect.
- Production Expo export passes for Android (1,664 modules) and iOS (1,665 modules), producing
  5.2 MB Hermes bundles. Metro emits only the existing upstream Noble package-export fallbacks.
- Expo Doctor passes 17/18 checks. Its sole remaining check is React Native Directory metadata:
  `react-native-webrtc` is listed as untested on New Architecture, while the private `@jagoo/sdk`
  and its WebRTC config plugin have no public-directory metadata. The full Android compile passes;
  the warning is retained rather than hidden with exclusions.

**Broke, and the gates caught it:**

1. Registering the JS default only through the crypto barrel left direct core imports without a
   backend. Splitting backend state from adapter bootstrap removed the cycle and made direct SDK
   entry points safe.
2. The first native pass used an obsolete Expo `Constant`, returned from expression-body `try`
   blocks, and called an instance ML-KEM method statically. Kotlin compilation caught all three.
3. `app.json` forced Kotlin 1.9.24 while React Native 0.76.9 supplies 1.9.25, selecting an
   incompatible Compose compiler. The app now pins 1.9.25, which Expo Modules Core maps to
   Compose 1.5.15.
4. Bouncy Castle 1.79 generated valid but non-identical ML-DSA signatures. Pinning 1.83 and using
   its byte-oriented signer with the FIPS pure-mode prefix and zero `rnd` restored the portable
   deterministic wire bytes.
5. The first Unicode parity fixture had expected values generated from mojibake. Regenerating the
   fixture from the literal `Jagoo Bahee · জাগো বাহে · ADR-017` made the encoding boundary explicit.
6. Expo Doctor rejected a direct `expo-modules-core` app dependency. The adapter now consumes
   Expo's public re-export and the redundant dependency is gone.

**Not claimed:** no physical Android device was attached, so the Operations screen's 18-check
runtime suite has not been executed on hardware. The AAR tests, autolinking, complete debug APK and
production bundles pass; the exact device drill remains in `NATIVE-CRYPTO-PLAN.md` and must retain
the Android model/API plus a result screenshot as release evidence.


### 2026-07-30 — Frontend UI/UX rebuild: design system, feed/post/vote/comment core, composer  [PF]

**Built:**

- `frontend/src/design-system/{layout,forms,sheet,feedback,list,motion}.tsx` (new) plus a rewritten
  `trust.tsx` (Seal/ReachPill moved out of `components.tsx`, extended with `CostRing`,
  `TransportTag`, `ModerationTombstone`, `LabelBanner`, `Fingerprint`, `PlaneBoundaryNotice`,
  `QueueStatus`, `OutboxBadge`). `tokens.ts` gained `useResponsive`/`useSemanticSpacing`
  (breakpoint-aware spacing, Plan 12 §9.1/§9.2) and `maxFontScale` (a font-scale ceiling per type
  role — sizes are unchanged from `design.md` §2, only the ceiling is new).
- Native deps: `react-native-reanimated`, `react-native-gesture-handler`, `expo-image`,
  `expo-image-picker`, `expo-haptics`, `react-native-markdown-display` (`babel.config.js`,
  `app.json` updated; root layout wrapped in `GestureHandlerRootView`).
- Backend additive viewer reads: `myVote`/`saved` on `/v1/feed`, `/v1/posts/:id`,
  `/v1/posts/:id/comments`, `/v1/comments/:id`; `joined` on `/v1/communities/:id`; new
  `GET /v1/me/votes|follows|blocks` (`backend/src/adapters/inbound/http/forum-read.controller.ts`).
  Every field is optional and only appears with a valid bearer token — unauthenticated responses
  are byte-identical to before. No proto/envelope/registry change.
- Navigation: `TABS` (design-system/components.tsx) is now the single source of truth for the tab
  bar, consumed by both `BottomNavigation` and `(tabs)/_layout.tsx` — it no longer exists twice.
  Root `Stack` uses `slide_from_right` + `gestureEnabled`; Create is a modal route (`/composer`)
  opened from every tab, not a persistent tab screen. All 7 pushed Signal screens and
  `mesh-screen.tsx` gained a real back control (`AppHeader.onBack`) — several had none before, and
  `mesh-screen.tsx` had the Reach Pill wired as its back button.
- New feature code: `features/feed` (paginated `useInfiniteFeed` + `FeedScreen`), `features/posts`
  (canonical `PostCard`, `VoteButtons` with real optimistic `useMutation` off the new `myVote`
  field, `PostDetailScreen` with markdown body and a real action sheet), `features/comments`
  (`buildCommentTree` + recursive `CommentNode`, replacing the old flat `depth * 16px` fake
  nesting), `features/composer` (community-picker bottom sheet, kind tabs filtered by community
  settings, an `expo-image-picker` media flow replacing the raw `jb1…` ID textarea, draft
  persistence, queue-aware submit), `features/communities` (`CommunityScreen` with a real FAB and
  real join/leave state, consolidated `CommunitiesScreen` with Joined/Discover), `features/profile`
  (`YouScreen` replacing the 14-row capability catalogue for its two most-used rows, `SavedScreen`),
  `features/notifications` (real all/unread filtering and mark-read backed by the existing
  client-local `LocalNotificationState` — the backend has no read-state endpoint by design).
- Deleted: the broken duplicate `CommunityCreateScreen` in `forum/screens.tsx` (completely
  unstyled `TextInput`s, five `console.log`s), the superseded `FeedScreen`/`PostDetailScreen`/
  `CommunitiesScreen`/`ComposeScreen`/`ProfileScreen`/`CommunityDetailScreen`, and the
  `src/theme`/`src/ui` deprecated re-export shims (`forum/screens.tsx`: 2063 → ~610 lines).

**Verified:** `pnpm --filter @jagoo/frontend {lint,typecheck,test}` — 0 errors, 19/19 suites,
71/71 tests; `pnpm --filter @jagoo/backend exec vitest run` — 431/444 passing, 13 skipped (no
Mongo/Redis, as documented); root `pnpm test` — 6/6 workspace tasks pass; `expo export --platform
ios --platform android` — both bundle at 6.69 MB; `expo-doctor` — 17/18 (same baseline as before,
plus `react-native-markdown-display` newly flagged unmaintained-but-untested — retained rather
than hidden with an exclusion, per the existing project convention for `react-native-webrtc`).

**Broke:** none of the above — every fix landed with lint/typecheck/test green before moving on.
The `signal-features.spec.ts` MS-06 failure seen on one `vitest run` was confirmed pre-existing and
flaky (reproduces on `main` before this work, passes on rerun); not touched by this change.

**Learned:** see L-27. Also: Expo Router's typed-routes file (`.expo/types/router.d.ts`) is
Metro-generated, not hand-maintained — a route that type-errors as unassignable the moment its file
is created is usually a stale generated-types problem, not a real bug; `expo export` regenerates it.

**Next — explicitly not done in this pass, scoped out for time, not silently dropped:**

- Governance (mod queue/reports/roles/log UI beyond what already existed), full Signal-plane
  parity with the new design system (screens still use the legacy `AppHeader`/`Screen` primitives,
  functionally intact but not visually rebuilt), and the operator console are unchanged from
  before this session other than the Signal back-button fix.
- `app/settings/*` (the dedicated appearance/feed/identity/security tree Plan 12 §3.3 describes)
  was not built; theme/language/identity/proofs still route through the existing `feature/[id]`
  workspace as an interim stopgap from the new "You" screen.
- i18n: the new screens still hardcode English, same as the screens they replaced — the `src/i18n`
  catalogue was not grown to cover them, and no lint rule yet fails a bare JSX string literal.
- A full manual device pass (TalkBack/VoiceOver, 1.3× text, reduced motion/transparency, light+dark,
  offline-with-node-stopped) was not performed — only automated lint/typecheck/test/export.
- Attachment thumbnails in `PostCard`/`PostDetailScreen` render a placeholder icon, not the actual
  image — resolving a signed attachment claim to a viewable URL needs an authenticated
  `/v1/attachments/:id/download` round trip not yet wired into the feed render path.

---

## Post-P2 — Durable local development

**Reported as:** "communities and posts I created are gone when I log in with another account."

**Actually:** not an account-scoping bug and not a Docker volume bug. The backend had never
connected to Docker Mongo at all. `/health/ready` returned
`{"database":"in-memory","cache":"in-memory","blob":"in-memory"}`, and `jb-mongo` had no `jagoo`
database after months of use — only `admin`, `config`, `local`. Every envelope had been living in
the Node process heap and dying with it.

Three things had to line up for this to stay invisible:

1. `MONGO_URL` is opt-in by design (`composition/app.module.ts`) — correct for unit tests and for
   the dependency-free `smoke:local` gate, which must keep working with no infrastructure.
2. Nothing in `backend/` loaded a `.env`. There was no `dotenv` import and no `ConfigModule`, so
   configuration could only arrive from the shell.
3. `justfile`'s `dev` recipe starts `ops-up` and then launches the backend with no environment,
   so the one command a developer runs brings up Mongo and then ignores it.

The node reported `ready` throughout, which is why this survived so long.

**Built:**

- `backend/src/composition/load-env.ts` — side-effect module, imported first by `main.ts` and by
  `cli/rebuild-projections.ts`. Absent `.env`, behaviour is unchanged.
- `backend/.env.example`, committed, documenting the two traps below.
- `backend/.env`, gitignored, with secrets from `pnpm --filter @jagoo/backend secrets:generate`.

**Two traps the example file now names explicitly:**

- **`?directConnection=true` is mandatory from the host.** `mongo-init` initiates rs0 with member
  host `mongo:27017`, which resolves only inside the compose network. With `?replicaSet=rs0` the
  driver discards the seed in favour of that advertised name, cannot resolve it, and server
  selection hangs with no error — the caller just stops. Transactions are unaffected; the server is
  a replica-set member however the client reached it. (Already L-16 in `docker-compose.yml`, which
  is missing from the standing-lessons table above.)
- **Setting `MONGO_URL` makes `NODE_SIGNING_SEED` mandatory** — the node refuses to boot without
  it, correctly: a durable node that regenerates its identity each start signs a Merkle log it can
  no longer be shown to have signed. `AUTH_*_SECRET` are optional but must be pinned too, or every
  session dies on restart, which presents to a user as exactly the same symptom.

**Resolution anchors to `__dirname`, not `process.cwd()`.** The justfile launches the backend from
a detached `cmd.exe` whose cwd is the repository root, so dotenv's default would have found
nothing — reintroducing the same bug, on Windows only, via `just dev`. Verified by starting the
built output with cwd set to the repository root.

`override` stays false, so Compose, CI and the two-node harness are unaffected by a developer
`.env` that finds its way into an image.

**Verified:**

- `/health/ready` → `{"database":"ok","cache":"ok","blob":"s3","witness":"ok"}`.
- `jagoo` database created in `jb-mongo` with `envelopes`, `merkle_leaves`, `merkle_state`,
  `federation_ledger`, `federation_outbox`, `federation_peers`, `ingress_nonces`.
- Seeded a community and post, killed the process, started a cold one: 5 envelopes, 5 Merkle
  leaves, and `GET /v1/communities` served the community from Mongo with an empty heap.
- Backend suite 432 passed / 13 skipped; `pnpm smoke:local` still passes on in-memory adapters,
  and the Mongo/Redis integration tests still skip, because vitest does not import `load-env`.
- `typecheck` clean; `lint` 0 errors.

**Not claimed:** the five `no-console` warnings in `features/forum/community/community.handlers.ts`
are pre-existing debug logging, untouched here. The Mongo/Redis integration tests were not run —
they still gate on `MONGO_URL` being exported into the test environment, which this change
deliberately does not do.

---

## Post-P2 — Reachable auxiliary services

**Problem:** discovery could advertise audit-log and mCaptcha addresses which were true only from
the node's own network. Blob storage was not advertised at all, and a phone could not repair a
presigned S3 URL by changing its host because SigV4 signs that host.

**Built:**

- Added the `BLOB` service kind, optional `ops/service-map.json` port-map loader, and `/health`
  advertisement for audit logs, mCaptcha and blob storage.
- Added `S3_PUBLIC_ENDPOINT`; it creates a second S3 client used only for presigning, leaving
  node-to-MinIO traffic on `S3_ENDPOINT`.
- Added client-side service address resolution and persistent manual overrides in Network &
  services. Overrides win over discovery and are intentionally absent from onboarding.
- Added `just publish-all`, which tunnels node, audit, mCaptcha and blob ports together.
- Corrected Fastify 4 compatibility: `request.hostname` may include a port, so discovery strips it
  before replacing a local service host. This prevents invalid `bore.pub:12001:9000` addresses.
- Made the signer-coverage gate depend on registry ownership instead of a stale fixed domain count.

**Verified:**

- 44 focused backend tests for service-map parsing, discovery advertisement and public-host S3
  presigning pass.
- Full frontend suite: 23 suites / 116 tests pass.
- Full backend suite: 38 suites / 476 tests pass; 3 infrastructure suites / 13 tests remain
  intentionally skipped.
- `pnpm vectors`, `pnpm lint` (0 errors), `pnpm typecheck`, and `pnpm proto:check` pass.
- Android `:jagoo-rns:compileDebugKotlin` passes after applying Chaquopy to the Expo library module
  and declaring its ABI filters.

**Not claimed:** a full Android APK assembly can take longer than this runner's five-minute cap on
its first Chaquopy package build. The Kotlin/native bridge compilation succeeded; installation and
BLE/RNode physical acceptance remain device-side work.

