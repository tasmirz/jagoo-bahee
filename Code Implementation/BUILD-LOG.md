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


---

## Post-P2 — Session persistence, sign-in/sign-out, and the blank home feed

**Problem:** four client defects reported from a real device build, all in the same launch path.

1. The home feed rendered its sort chips and nothing else, while the query was returning posts.
2. Refreshing was a "Refresh content" text button above the first row, swapped for a progress
   banner while fetching. The pull gesture did nothing.
3. A signed-in device came back from a cold start signed out. Every signed action failed with
   "Unlock your Forum identity first" while the feed still drew.
4. There was no sign-out, and pasting a correct recovery phrase ran the registration flow —
   producing a second local profile for one identity every time.

**Root causes:**

- **(1)** `FeedScreen` wrapped its `InfiniteList` in `ContentColumn`, which is height-auto. A
  `FlatList` with `flex: 1` inside a height-auto parent measures to zero. The list was mounted
  and had data; it had no height. `ContentColumn` now takes `fill`, and only list screens set it
  — a `flex: 1` child inside `Page`'s `ScrollView` would clamp to the viewport and stop scrolling.
- **(2)** `InfiniteList` never passed `refreshControl` to its `FlatList`, so the platform gesture
  was never wired. Replaced with `RefreshControl`, which also restores the spinner's platform
  placement and accessibility semantics.
- **(3)** `activeSigner`, `activeAccessToken` and `activeCredential` are module state in
  `src/signer/index.ts`. The vault is on disk; the session was not, and nothing ever reopened it.
  Added `restoreForumSession`, called once from `AppProvider`'s launch effect: it unlocks a
  device-lock vault, reuses the stored blind credential, and mints a token from a signed
  challenge. A password-protected vault fails to unlock silently — by design — and the route
  shows the new sign-in screen.
- **(4)** `WelcomeFlow` minted a random `vaultId` per mount and the restore branch went straight
  to the registration step. Split "sign in" out of "register": `authenticateForumIdentity` does
  challenge → sign → `/v1/auth` and nothing else, and `signInForumIdentity` only falls back to
  full registration when the node does not know the key. A restored phrase whose `identityId`
  matches a stored profile is re-imported into *that* vault, and the temporary one is deleted.

**Also built:** `signOutForumIdentity` (locks, keeps the vault, records the choice in
`jb.forum.signed-out.v1` so a cold start does not silently undo it), a `SignInScreen` with unlock
and recovery-phrase paths, a confirmed **Sign out** row in You, and `session` / `refreshSession` /
`signOut` on the app context. `BootstrapRoute` now gates on the vault state instead of on the
presence of a home node, with `session === null` meaning "restore has not answered yet".

**Lesson (L-…):** a home node is not a session. Gating the app on "is a server configured"
looked correct for the entire life of P1 because the only way to have a server configured was to
have just registered — the two states were created in the same breath and diverged only after
the first process exit, which no test covered.

**Lesson:** `flex: 1` in RN is not "fill the screen", it is "take a share of the parent's free
space". A height-auto ancestor has none, so a virtualized list silently becomes 0 px tall and
looks exactly like an empty query result. `src/design-system/list.test.tsx` now asserts both
directions of the `fill` contract.

**Verified:**

- Frontend suite: 27 suites / 129 tests pass, including three new bootstrap-gating tests
  (loading vs. sign-in vs. tabs) and four new design-system layout/refresh tests.
- `tsc --noEmit` clean; `eslint app src` 0 errors (35 pre-existing `no-console` warnings).
- `./gradlew assembleRelease` produces an installable release APK, signed with the same debug
  keystore the project already uses for release, so it upgrades an existing install in place.

**Not claimed:** no backend change was needed or made, so the backend suite and `pnpm vectors`
were not re-run. Device acceptance of the sign-out → sign-in loop against a live node is
device-side work.

### Release APK: `--entry-file` is relativized on Windows, and Metro resolves it elsewhere

The first `./gradlew assembleRelease` of this repo failed in `createBundleReleaseJsAndAssets`
with `Unable to resolve module ./../node_modules/expo-router/entry.js from
D:\CODE\JRA-Hackathon\untitled/.` — a path one directory above the repository. Debug builds
never caught it because a debug build does not bundle; it loads from the dev server.

`Os.cliPath` in the React Native Gradle plugin rewrites every path argument as relative to
`react.root` **only when `isWindows()`** — POSIX gets absolute paths and never reaches this.
`root` is `frontend/`, so the plugin emitted `../node_modules/expo-router/entry.js`, which is
correct from `frontend/`. But `@expo/metro-config` deliberately moves Metro's
`unstable_serverRoot` up to the workspace root for monorepo support, and `export:embed`
resolves `--entry-file` with `relativeTo: "server"`. Two different roots, one relative path.

Fixed in `frontend/android/app/build.gradle` by re-stating the entry as an absolute path
through `extraPackagerArgs`, which the plugin appends after its own arguments so it wins.
Verified first by running `export:embed` by hand with an absolute entry from `frontend/`
(2067 modules bundled) before touching the build file.

**Lesson:** an OS-conditional path rewrite inside a build plugin is invisible in review and in
CI when CI is Linux. The failure names a plausible-looking path, so the instinct is to go
looking for a missing dependency rather than for two disagreeing definitions of "root".

### Signal contacts survive the blackout: the address book, not the index, is the source of truth

**Problem.** Discovering someone in the Signal index and being able to message them later were
the same operation. `searchSignalDirectory` was a bare `fetch` with no cache, so with the index
unreachable the "Discover people" list was empty and there was no way back to a person you had
already found. Worse, a contact was only ever persisted as a *side effect* — of tapping Follow,
or of having sent a message once — and the saved record held `displayName`, `rnsPublicKey` and
`lxmfDestinationHash` but **not** the identity key or the transport binding signature. So even
the contacts that did survive were unverifiable: the device had an address it could not prove
belonged to the person whose name was printed next to it.

That is the whole failure mode this system exists to avoid, in miniature. Knowing a name is not
knowing an identity, and during a shutdown the index is exactly the thing that is gone.

**Built.**

- `features/signal/contact-identity.ts` — `verifySignalIdentity`, pure, no I/O, no clock. Two
  checks: `identityId(identityKey)` must equal the claimed ID, and the LXMF destination must
  carry the identity's own `jb:signal:lxmf-binding:v1` signature. The binding is the part that
  matters — without it a compromised index can serve a real name and codename pointing at a
  destination it controls, and every message "to Amina" arrives at the adversary.
- `features/signal/directory.ts` — every profile the index ever returns is cached, merged by
  identity, never evicted for age, capped only by count (least-recently-*seen* drops). Search
  falls back to the cache and the result reports `source` and `refreshedAtMs`. With an empty
  cache the network error is raised rather than dressed up as "no results".
- `features/signal/contacts.ts` — v3 records carry `identityKey`, `transportBindingSignature`
  and `verifiedAtMs`. v2 records migrate in as `source: 'legacy'`, `verifiedAtMs: null` rather
  than being dropped. Added `saveSignalContactFromDirectory` (verify-then-save),
  `deleteSignalContact`, `markSignalContactMessaged`, `findSignalContact`.
- `rns-screen.tsx` — an explicit **Save contact** action, a cached-directory banner with age, a
  per-contact verified/unverified line, Remove, and a re-verification gate before every send.

**Decision: an unverifiable profile is savable, but only on an explicit acknowledgement.**
Refusing outright would mean an index that does not yet publish binding material makes its own
users permanently unreachable. The dialog is the user's call; `verifiedAtMs` stays `null` and
both the contact row and the send path keep saying so. Silently saving it would have been the
trap — the record would look identical to a proven one.

**Decision: re-verify at send, not only at save.** The save-time check proves the index was
honest then. The send-time check proves the local store has not been altered since, which is a
cheaper target for an adversary than the index is, and costs one signature verification.

**Lesson (L-…):** a cache added "for offline" is not offline support if the thing it caches is
not self-authenticating. The old contact record would have made the UI work during a blackout
and made it work *wrongly* — an address with no way to check it is worse than no address,
because it looks like knowledge. The fields that make a record verifiable have to be saved at
the same moment the record is, because the server that could supply them later is precisely the
one that will be missing.

**Verified:**

- Frontend suite: 28 suites / 142 tests pass, including 9 new contact tests (verification,
  tamper rejection, explicit-unverified save, follow/save-date preservation on re-save, v2
  migration) and 5 new directory tests (cache-on-success, cache fallback with notice, error on
  empty cache, offline field matching parity, TP-06 no-eviction).
- `tsc --noEmit` clean; `eslint app src` 0 errors (35 pre-existing `no-console` warnings).

**Not claimed:** no backend change was needed — `/v1/signal/directory` already returned
`identityKey` and `transportBindingSignature`; the client simply discarded them. The backend
suite and `pnpm vectors` were therefore not re-run. `rns-screen.tsx` remains hardcoded English
like the rest of the Signal screens; routing it through i18n is separate outstanding work.

### "Epoch expired" on comment: the client compared the node's clock against its own

**Symptom.** Commenting intermittently failed with an expiry error quoting an epoch-millisecond
timestamp. Intermittent per user, not per attempt — for an affected device every retry failed
identically.

**Cause.** `/v1/credits/challenge` returns `expiresAtMs`, an absolute instant on the ISSUING
NODE's clock (`clock.nowMs() + ttlMs`, ttl 5 min). `solvePow` compared it against the device's
`Date.now()`. Those are two unsynchronised clocks. A device running more than 5 minutes fast
therefore read a challenge minted milliseconds earlier as already expired, threw before even
attempting the Argon2 solve, and did so deterministically — the offset is constant, so retrying
could never help.

It presented as a comment bug because comments do not carry PoW themselves
(`jb:comment:create:v1` requires `[CREDENTIAL, NULLIFIER]`). `publishForumAction` calls
`registerForumIdentity` when `activeCredential` is missing, and *that* solves a PoW challenge.
So the failure appeared only when the cached credential was gone — hence "sometimes".

**Fix.** A client can honestly measure a duration on its own clock; it cannot compare instants
across two. `PowChallenge` now carries `issuedAtMs`, published as `serverNowMs`, so the client
computes remaining life as `(expiresAtMs − serverNowMs) − elapsedSinceReceipt`. Device skew
cancels out entirely. When a node publishes no `serverNowMs`, the client no longer guesses: the
node re-checks expiry at verification and is the only party that can do it correctly.

Also removed the four `console.log`s that were printing challenge material during this
investigation.

**Lesson (L-…):** an absolute timestamp crossing a trust boundary is a clock-domain conversion,
and every one of them is a bug until the receiving side is given the sender's clock to
subtract. `expiresAtMs` looked self-describing, which is exactly why nobody noticed it was
meaningless without a reference instant. The test suite missed it because both existing PoW
fixtures used `expiresAtMs: 1_900_000_000_000` — a year-2030 constant chosen to dodge the
expiry branch, so the branch had no coverage at all.

Related: a device more than 10 minutes fast also trips pipeline step 8 (CLOCK, `maxSkewMs`),
so every envelope it signs is rejected as future-dated. Same root cause, different symptom, not
addressed here.

**Verified:**

- `frontend`: 28 suites / 145 tests (3 new PoW tests — solves under a 45-minute-fast device
  clock, refuses a challenge genuinely held past its lifetime, defers to the node when
  `serverNowMs` is absent).
- `backend`: 38 files / 478 tests pass, 3 files skipped without Mongo/Redis; 1 new test asserts
  the issuing clock is published. `eslint src` 0 errors.

**Pre-existing, NOT introduced here, and currently breaking `pnpm typecheck` for the backend:**
`backend/src/composition/load-env.ts:29` passes `quiet: true` to dotenv, which exists only in
dotenv 17+. `backend/package.json` asks for `^17.4.2` but the hoisted install resolves 16.4.7.
It is the sole typecheck error. Left alone because fixing it means changing dependency
resolution, which is a separate decision.

### Moderation audit trail, community governance log, and the mod queue

**Three defects, one theme: the record existed but was not usable.**

1. **A mod log row carried `target: "jb1qh2…"` and nothing else.** That satisfies MOD-09's
   wording — "actor, verb, target, reason, timestamp" — and defeats its purpose. Nobody
   auditing the log can tell what was removed without resolving every ID by hand, and a
   member action's target is a raw 64-char hex key. "Every censorship action is evidence"
   (VIS-06) only holds if the evidence is legible.
2. **`CommunityUpdateHandler` overwrote the community row in place.** Who enabled
   require-post-approval, when the rules text changed, who flipped the community private —
   none of it left a trace. These are governance levers, not preferences: enabling
   require-post-approval changes what every future post does. That is a moderation act with
   more reach than removing one post, and it was the one leaving no record.
3. **MOD-08 (mod queue) had no read surface at all,** and `requirePostApproval` was inert —
   stored, projected, never read by anything.

**Built.**

- `shared/target-summary.ts` — `resolveTargetSummary` renders a post/comment/identity target
  into title, excerpt, author key, author display name, parent post and content state.
- `ModEventDoc.targetSummary` — captured in `project()` BEFORE the verb is applied.
- `community/community-audit.projection.ts` — a second per-community hash chain with its own
  head row, recording `create` / `update` / `archive` with a field-level before→after diff.
- `GET /v1/communities/:id/queue` and `GET /v1/communities/:id/audit`.

**Decision: the summary is a SNAPSHOT, not a read-time join.** Resolving the target when the
log is read shows what the post says *now*. An audit trail has to show what the moderator
acted on *then* — a post edited after removal would otherwise silently rewrite the record of
the decision. This stays rebuildable (P1-G3) because `ProjectionRebuilder` replays in
log-index order, so re-projecting a ModAction sees the target exactly as it was.

**Decision: `targetSummary` is deliberately NOT in `modChainHash`.** Two reasons. The chained
field is `target`, a content ID, and the target's own signed envelope remains the authority on
what it said — the summary is always re-derivable, and a tombstoned row is never deleted, so
the comparison stays possible. And changing `modChainHash`'s inputs would change every
existing chain hash, altering a working tamper-evidence primitive to commit to a denormalised
copy of something the chain already covers. The community audit chain DOES commit to its
`changes` list, because there no separate signed object holds those values.

**Decision: the queue is a worklist, not a gate (MOD-01).** Nothing in it withholds anything.
Every post listed is already published, projected, receipted and federated; it appears in the
feed and resolves by direct link. `requirePostApproval` decides what a moderator is *asked to
look at*. Making approval a precondition would put a server between an author and their own
signature, and withheld approval is indistinguishable from a network error. The feed filter
was deliberately left alone.

Queue ordering is reported-first, then **oldest**-first. A queue sorted newest-first starves
exactly the items that have waited longest.

**Lesson (L-…):** a requirement written as a field list gets implemented as a field list. MOD-09
says "actor, verb, target, reason, timestamp" and the projection has all five, so it read as
done for the whole life of P1 — the acceptance criterion never asked whether a human could act
on the result. When a requirement names an audience ("public mod log"), the test should be
whether that audience can use it, not whether the columns exist.

**Verified:** backend 39 files / 490 tests pass (12 new), 3 skipped without Mongo/Redis;
`eslint src` 0 errors; typecheck clean apart from the pre-existing `load-env.ts` dotenv error.

### Client: action timeouts, and the Signal identity screen

**Spinners that never resolve.** Offline is the default assumption, and a request over a dying
uplink does not reject — it hangs. Screens tracked only `busy`, so the spinner ran forever and
the user could not tell a slow server from a dead one. `hooks/use-async-action.ts` adds a
fourth state between running and settled: **late**. Past 12 s the progress bar becomes a
decision — Keep waiting, or Cancel (which aborts via `AbortSignal`, already honoured by
`data/request.ts` on both the direct and Tor paths). `design-system` gained `ActionProgress`.

Cancel is honest about what it can undo: it aborts the in-flight request, never unmakes a
signed envelope. Once bytes are signed the author has published and the outbox may still
deliver. Cancel means "stop making me wait", never "that never happened" — anything else is a
client-side approval gate wearing a friendlier name.

**A leak the tests caught.** The elapsed-time ticker was cleared in `finally`, which never runs
for a promise that never settles — precisely the case the hook exists for. It now lives in the
same ref as the late timer and is cleared by cancel and unmount. Found because the suite needed
`--forceExit`; it no longer does.

**Signal identity screen.** "Create Signal identity" sat beside "Unlock", both enabled whenever
the passphrase was ≥ 8 characters, whether or not a vault existed — a returning user could
press Create, a new user could press Unlock, and the restore field appeared under a heading
contradicting the buttons above it. Now one `VaultStage` (`setup` / `locked` / `unlocked`)
selects one of three extracted components, so only the correct next step is on screen.

**Optional passphrase and optional recovery salt (both, per the user's call).** The vault
passphrase may now be empty — but not 1–7 characters, which looks like protection and is not.
The BIP-39 recovery passphrase (the "25th word") is exposed as a folded-away advanced field and
threaded through create, unlock AND restore.

That last point mattered: `unlockSignalIdentity` never passed a recovery passphrase, so
exposing the field without fixing unlock would have let people create identities they could
never open. Worse, every salt is "valid" — a mistyped one derives a different identity
*silently*. The vault now stores `seedCheck`, an HKDF output over the derived seed under its own
info label, so a wrong salt is refused instead of silently accepted. Optional, so vaults created
before it still unlock.

**Uniform design.** All nine Signal screens used the deprecated `AppHeader` + `Screen` pair
while the rest of the app had migrated to sticky `PageHeader` + `Page`. The Signal headers
scrolled away and content ignored the responsive content column. All nine migrated;
`SignalScreenProps.mode` is now required, which every route already passed.

**Verified:** frontend 29 suites / 151 tests pass (6 new for the action runner); typecheck
clean; `eslint app src` 0 errors (32 pre-existing `no-console` warnings).

**Not done in this block:** the timeout runner is wired into the Signal identity screen only;
the other Signal screens and the Forum flows still use their local `busy` booleans. `rns-screen`
and the Signal screens remain hardcoded English rather than going through i18n.

### Signal screens: the header swap was not the design problem

The previous block migrated the Signal screens from the deprecated `AppHeader`/`Screen` pair
to `PageHeader`/`Page`, and reported the design as uniform. It was not, and the user said so
again. The header was one layer; everything INSIDE the screens was still bespoke.

**What was actually wrong.** `features/signal/` used 8 of the design system's ~40 components
and reimplemented the rest locally:

| Local | Should have been | Consequence |
| --- | --- | --- |
| `function Field` + raw `TextInput` | `TextField` / `TextAreaField` / `PasswordField` | Different label weight, border and focus treatment from the same field on a Forum screen; **no reveal control on the vault passphrase** |
| raw `TextInput` × 5 in `rns-screen` | same | as above, with no label element at all |
| `styles.card` / `alert` / `hero` / `lifecycle` | `Card` | Four different card paddings and radii on one screen |
| `styles.row` / `rowCompact` / `homeActionRow` | `Row` | Three gap values for the same visual construct |
| `styles.fingerprint` | `Fingerprint` | Lost the grouping, `selectable`, and the a11y label carrying the full key |
| `SectionHeader` + local `open` state | `Disclosure` | A fold that looked nothing like every other fold |

**Done.** `Field` is now a thin adapter that dispatches to the three shared field components,
so all 34 call sites render uniformly without 34 edits — and no call site can pick the wrong
one. `rns-screen`'s five raw inputs are gone. Ad-hoc containers now use `Card` and `Row`; the
recovery-salt fold uses `Disclosure`; the channel signing key uses `Fingerprint`.
`screens.tsx` dropped from 30 local style keys to 21, and `rns-screen.tsx` from 9 to 5 — what
remains is genuine layout (map, avatars, action rail) rather than restated design tokens.

`PasswordField` bringing a show/hide control is not cosmetic: typing a long passphrase blind
on a phone keyboard is how people get locked out of a vault whose only other key is 24 words
on paper.

Two spots were double-padding once they moved inside `Card`, which already supplies padding,
border, radius and gap — `styles.alert` and `styles.lifecycle` were restating all four. Both
now hold only what is genuinely local (the severity-coloured edge, list spacing).

**Lesson (L-…):** "migrate the screen to the new layout primitives" is not the same as "make
the screen uniform", and finishing the first while claiming the second is how a design system
ends up with 40 components and a feature directory that uses 8. The check that would have
caught it is mechanical and was not run: count the design-system imports in a feature against
the local `StyleSheet.create` keys. A feature with more local style keys than shared component
imports has reimplemented the design system, whatever its header says.

**Verified:** frontend 29 suites / 151 tests pass; `tsc --noEmit` clean; `eslint app src`
0 errors (32 pre-existing `no-console` warnings). No raw `TextInput` remains anywhere under
`features/signal/`.

### `just android` failed for three stacked reasons, and the first error named none of them

Reported as: `Android sdkmanager was not found at .../cmdline-tools/latest/bin/sdkmanager`.
That message was true and irrelevant — the machine's SDK was fine.

**1. The NDK guard checked its tools before checking its condition.** The recipe exists to
repair a partially-downloaded NDK 26.1.10909125 (a directory present without
`source.properties`, which Gradle then fails on obscurely). It required `sdkmanager` up front,
then checked the NDK. But `sdkmanager` lives in `cmdline-tools`, which **Android Studio does
not install by default** — a perfectly working Studio SDK has a complete NDK and no
`cmdline-tools` directory at all. So the guard blocked the exact configuration that needed no
repair. Reordered: check the NDK marker first, and only reach for `sdkmanager` when there is
something to fix. The POSIX branches now share one private `_android-ndk` recipe instead of
two copies of the same one-liner.

**2. Gradle ran under JDK 25.** `JAVA_HOME` was empty, so Gradle used whatever `java` was on
PATH — OpenJDK 25.0.1 — while Gradle 8.10.2 + AGP 8.x require 17. The failure reads:

```
Error resolving plugin [id: 'com.facebook.react.settings']
> 25.0.1
```

which names the plugin and prints the Java version as a bare number with no label, so it reads
as a plugin-resolution problem. JDK 17 was already installed. `just android` on macOS now
selects it via `/usr/libexec/java_home -v 17` and fails with an explicit message if absent,
rather than inheriting the invoking shell's toolchain.

**3. `frontend/android/` was stale and predates the `with-jagoo-rns` config plugin.**
`modules/jagoo-rns/android/build.gradle` applies `com.chaquo.python`, whose classpath is
injected into the generated project by `plugins/with-jagoo-rns.js`. That directory is
gitignored and generated, and `expo run:android` only prebuilds when it is missing — so the
checked-out tree had a project built before the plugin existed, and the plugin was never
resolvable:

```
A problem occurred evaluating project ':jagoo-rns'.
> Plugin with id 'com.chaquo.python' not found.
```

Fixed by `expo prebuild --clean --platform android`. Verified afterwards that the classpath,
the `https://chaquo.com/maven` repository, and the `rns==1.4.2` / `lxmf==1.1.0` pip block all
landed in the regenerated files.

**Lesson (L-…):** a precondition check must be ordered by what it is actually protecting, not
by what it happens to use. Checking the tool before the condition inverts the dependency —
the tool is only needed on the failure path, so demanding it unconditionally turns an optional
repair into a hard requirement, and the error message then describes the tool rather than the
thing that was wrong.

**Second lesson:** a generated, gitignored directory is a cache, and a config plugin only
takes effect when that cache is rebuilt. Any change to `plugins/*.js` needs
`expo prebuild --clean` to be observable — so "the plugin is correct" and "the build works"
are independent claims. The earlier build-log entry recording a Windows `--entry-file` fix
made **directly** in `frontend/android/app/build.gradle` has the same defect from the other
side: that edit is not in git and is destroyed by the next prebuild. It should be a config
plugin; it currently is not, and the regenerated tree does not contain it.

**Verified:** `just --evaluate` parses; `_android-ndk` stays out of `just --list`; the NDK
guard passes on a Studio-installed SDK with no `cmdline-tools`; prebuild regenerated the
Chaquopy wiring. `./gradlew app:assembleDebug` under JDK 17 → **BUILD SUCCESSFUL in 29m 35s**,
802 tasks, producing a 126 MB `app-debug.apk`.

That first-build duration is the Chaquopy Python 3.11 runtime plus `rns`/`lxmf` wheels, and it
is why the earlier entry's five-minute CI cap could never have covered this path. Budget ~30
minutes for a cold Android build and treat any CI timeout below that as a false signal, not a
regression.

**Not claimed:** the APK has not been installed or launched on a device or emulator, so
nothing here is evidence about runtime behaviour of the RNS module, BLE/RNode, or the Signal
screens — that remains device-side work.

### Four device-reported defects, two of which were the same bug wearing different clothes

Reported: image upload "maybe" broken; the connection indicator claiming "same network"
wrongly; a community the person created showing **Join** again after a relaunch; and the
design still not uniform.

**(i) and (iii) are one cause: the session was not authenticated, and nothing said so.**

Two independent failures compounded:

*Cache.* `/v1/communities/:id` returns `joined` only for an authenticated caller; anonymously
it returns the same row WITHOUT that field. The React Query key was `[..., path, viewer]`
where `viewer` was a boolean meaning "should I send auth headers" — a property of the CALL,
not of the ANSWER. On a cold start the launch restore is still in flight when the first
screens mount, so the anonymous answer is what lands. The URL never changed, so nothing
refetched. Every viewer field — `joined`, `myVote`, `saved` — stayed at its anonymous default
for the rest of the session. Fixed by adding `forumViewerId()` (a public identity ID, never
the bearer token) to every viewer-scoped key, so authenticating is a key change and the
refetch happens by construction rather than by remembering to invalidate.

*Retry.* `restoreForumSession` gets ONE attempt at launch, and on a phone it usually runs
before the radio has settled. When `signInForumIdentity` failed, `authenticated` stayed false
forever — `refreshSession` only re-READ the vault state, it never re-attempted sign-in, and
nothing else called it. Now re-attempted on every foreground and whenever connectivity
returns, followed by a query invalidation.

The symptoms never used the word "signed out", which is why this read as three separate bugs.
An unauthenticated read does not fail — it silently degrades to its anonymous shape, so a
community renders "Join" and `uploadAndClaimForumAttachment` throws "Register and
authenticate this Forum identity first" from `forumSessionRequest`.

**(ii) the node claimed LAN because nothing measured it.** `IMPLICIT_UPLINK` declared every
scope including `LAN`; the default probe config has no targets; `probeUplink` marks an
unmeasurable scope reachable (correct on its own — a scope with no target must not decay to
false); `currentScope()` returns the NARROWEST live scope. `LAN` is narrowest, so it won by
assumption, and the client rendered "Same network — Only this local network. Nothing you post
leaves this building yet." to someone publishing over the internet.

Every link in that chain is individually defensible, which is why it survived review. The fix
is at the one point where the direction matters: an over-claimed WIDE scope over-promises
reach and the next send corrects it; an under-claimed NARROW scope tells someone their post is
contained when it is being published, and nothing ever corrects it. `LAN` must now be earned —
declared in `UPLINKS`, or proven by a probe target that answers. `/v1/transport/scope` also
gained `measured`, so a client can distinguish a probed claim from an assumed one.

**(iv) uniform design, second pass.** The previous block fixed `features/signal/`. Nine more
screens were still off-pattern: three on the deprecated `AppHeader`, six hand-rolling
`IconButton + h2` inside a bordered `View` — two of those with inline style objects rather
than tokens. All nine now use `PageHeader`, including its `subtitle`, `reach` and back-spacer
props, which is what several were re-implementing by hand. `mode` was threaded into four
screens and their route wrappers and is now required rather than optional, since a frosted
header with the wrong theme is visibly broken.

**Lesson (L-…):** a cache key must describe the ANSWER, not the REQUEST. `viewer: true` said
what the client intended to send; it could not distinguish the response that came back with a
viewer's fields from the one that came back without them. Any key that omits an input the
server varies its response on is a cache that serves the wrong body — and the window where it
goes wrong is launch, which is exactly when nobody is watching.

**Second lesson:** a one-shot restore on a mobile client is a coin flip. Anything attempted
once at launch — sign-in, discovery, a token refresh — must also be attempted on foreground
and on reconnect, because the launch attempt races the radio and loses often.

**Verified:** frontend 30 suites / 155 tests (4 new viewer-cache-key tests); backend 40 files
/ 493 tests, 3 skipped without Mongo/Redis (3 new implicit-uplink tests); typecheck clean both
sides apart from the pre-existing `load-env.ts` dotenv error; `eslint` 0 errors both sides.

**Not claimed:** none of this has been re-run on a device. The four fixes are pinned by unit
tests and by the compiler, but "upload works" and "the indicator now reads correctly" are
device observations that have not been repeated since the change.

## Post-P2 — Client repair: splash, servers, advertisement, link scope, Signal onboarding

Five device-reported defects. Four share one shape: **a value the client displayed was
assumed rather than measured, or a capability the backend already had was unreachable from
the UI.** Almost nothing here needed new backend capability — the directory search, the QR
scanner, the contact store, `removeIdentityProfile` and the probe adapter all existed and
were wired to nothing a user could reach.

**(i) the splash had three different faces.** The OS splash drew the app icon; the font gate
in `app/_layout.tsx` drew the icon and the name; `AppLoading` then replaced both with a 32 pt
abstract ring and a pulsing `WorkProgress` bar. One `SplashScreen` component now serves all
three, taking raw colours rather than an `AppPalette` because the font gate runs before
`AppProvider` exists and has no palette. The bar is gone on purpose: it covers indeterminate
work — session restore can sit on a dead link for a full HTTP timeout — and a
determinate-looking bar over that misreports progress.

**(ii) "not advertised" was three unrelated faults wearing one label.** `AUDIT_LOG_SERVICES`
was set only on the `node` compose service, never in `backend/.env`, never in `.env.example`,
and never on `node-a`/`node-b` — so under `pnpm dev:backend` the audit log did not exist as
far as any client was concerned, and every certificate the app tried to store-and-forward was
a silent no-op over an empty array. mCaptcha was worse: `MCAPTCHA_SERVICES` is assigned
nowhere in the repository, there is no container, no verifier and no solver. It is a reserved
slot, and "not advertised" was the only truthful output it could ever produce — so the row now
states the mechanism the node actually uses (argon2id PoW plus blind credentials) instead of
reporting an absent optional extra as a broken dependency.

The third fault was real and would have broken mCaptcha even on a node that advertised one:
`registerForumIdentity(baseUrl, auditServices, mcaptchaServices = [])` — and **not one of its
seven call sites passed the third argument**. The default made it a type-checked lie. Fixed by
configuring the services once beside `configureAuditIssueReporting` rather than threading a
second array through thirty publishing signatures that have no interest in it.

**(iii) the network indicator answered a different question than the one it asked.** TP-20
requires the client to show which scope it is currently connected on — the client-to-node
LINK. `/v1/transport/scope` reported `UplinkManager.currentScope()`, the node's own onward
reach, and **the controller never read the request**: no `req.ip`, no `X-Forwarded-For`. "Is
this phone on the same network as this server?" was computed nowhere in the codebase.

Underneath that, the value was also constant. `transport.runtime.ts` gated the probe loop on
`config.configured` (`uplinks.length > 0`), which `backend/.env` never satisfies, so
`probeAll()` had no production caller; `configured-uplinks.ts` seeds every uplink `UP` with
every declared scope `live`, so that initial optimistic map was permanent. `currentScope()` =
`narrowest([ISP_LOCAL, NATIONAL, GLOBAL])`, invariant. Before `4d16c3d` the list included
`LAN`, which is exactly the reported symptom — that commit changed the constant without making
the value dynamic, which is why the same bug was reported twice.

Now: a pure `classifyLink(callerAddress, nodeAddresses)` in `core/domain/transport/`, fed by
the caller address the anti-abuse interceptor already derives (shared `callerAddress`, so the
rate limiter and the indicator cannot disagree about who is calling); the pill renders the
link, the sheet shows the node's reach separately; `measured` — which the node had been
sending and the client had been discarding — now renders as "assumed" in words, not a tint;
and the probe loop is gated on having probe targets rather than on `UPLINKS`.

**(iv) servers could be added but never removed.** `removeIdentityProfile` had existed since
profiles did and was called from nothing but its own test, so the only way to change server
was `disconnectHomeNode` — a wipe-and-restart presented as a settings action. Now: per-row
delete with vault destruction as a *separate* checkbox (forgetting an address is reversible by
typing it again; destroying a vault is only reversible with 24 words), switching by tapping a
row, and the add flow relabelled and given `identityProfiles` so restoring a known phrase stops
writing a duplicate vault. The outbox needed no fix — each record already carries the `baseUrl`
it was signed for — but removal now counts and reports what it discards.

**(v) a username required a radio.** `SignalDirectoryProfileHandler.validate` hard-required
`rns_public_key`, `lxmf_destination_hash` and `transport_binding_sig`. The destination hash can
only come from a running Reticulum stack, and RNS is an Android-development-build feature — so
**nobody on iOS could be found by name at all**, while the directory search that finds people
and the IP messaging that reaches them need no radio whatsoever. The binding is now optional
(all three absent, or all three present and verifying — partial stays rejected, because a
destination nobody signed for routes to a lie). Strictly a loosening: every previously valid
profile still validates. `SignalDirectoryProfile` appears nowhere in `Plans/04`, having been
added post-freeze as a registry row, so this is a defect fix and not a frozen-contract change.

The client verifier had to move in lockstep. `verifySignalIdentity` treated an absent binding
as a verification failure, which after the loosening would have marked *nearly every* profile
unverified — and a warning that fires on the normal case is one people learn to click past,
including on the day it is real.

`display_name` is now the handle, first-come per node via the `nameSkeleton` that had been
computed and stored on every row since the projection existed and never once read. Uniqueness
is node-local by construction and cannot be otherwise without a naming authority this project
rejects, so every surface shows the handle beside its fingerprint. The Mongo index is
deliberately **not** unique: `authorize` decides uniqueness against the replayed log, and a
second differently-ordered arbiter is how `rebuild-projections` starts failing on data the log
says is valid.

**(vi) messaging was two disjoint halves, neither usable.** IP sessions took a recipient as 64
hexadecimal characters (`recipient.length !== 64`) and labelled threads by content-ID prefix;
LXMF had real people, search and verification badges but only sent over a mesh most devices
cannot run. A contact saved in one could not be selected in the other, and reaching a first
message took eleven steps. Signal identity creation now happens in onboarding (two independent
mnemonics, separate SecureStore roots, nothing persisting them together — ADR-012 constrains
storage and linkage, not sequencing), followed by a username step. A `PeoplePicker` replaces
the hex field with saved contacts, federated directory search and a QR scan. The QR generator
and scanner were lifted from mesh pairing, where they already worked and had simply never been
pointed at an identity. The in-person verification screen no longer asks someone to *type* a
base64 fingerprint next to a camera the app already knows how to open.

The Signal recovery phrase is deferred, not skipped: two 24-word grids back to back is how
people stop reading either, and the Forum phrase is the one that must land. `markSignalBackupOwed`
records the debt so the prompt returns, and it clears only once the words have actually been on
screen — not when the card was dismissed, because dismissing is what people do to a prompt they
intend to ignore. `revealSignalRecoveryPhrase` re-derives from the vault rather than holding the
mnemonic in memory for the session, which would be a strictly larger secret held strictly longer
to save one prompt.

**Lesson (L-…):** an optional positional parameter with a safe-looking default is not a
default, it is a silent failure mode. `mcaptchaServices = []` type-checked at seven call sites
that all omitted it and produced a confident, wrong answer at every one. When a value has
exactly one correct source, configure it once at the seam where that source is known — the way
the audit services already were — rather than asking thirty signatures to carry it.

**Second lesson:** when a displayed value and a measured value answer different questions, the
bug survives being fixed. The LAN indicator was reported, diagnosed, and "fixed" in `4d16c3d`
by removing `LAN` from the assumable list — which changed the constant from `LAN` to
`ISP_LOCAL` and left it a constant. Ask what question the UI string makes a claim about, then
check whether anything computes *that*.

**Verified:** `pnpm vectors` → 3 implementations agree on 16 vectors, `expected.json` matches;
`proto:check` in sync (50 domains); backend 41 files / **513 passing**, 3 files skipped without
Mongo/Redis, including the P0-G6 import-boundary gate and FG-01…FG-10; frontend 32 suites /
**172 passing**; `pnpm lint` 0 errors both sides; typecheck clean both sides.

**Not claimed:** none of this has been run on a device. In particular the network indicator's
whole point is that it now differs between a phone on the node's Wi-Fi and the same phone on
cellular, and that is a two-network observation no unit test can stand in for — the previous
attempt at this bug was also green on unit tests and shipped still wrong. The Signal onboarding
path (create identity, register, authenticate, publish prekeys, claim username) has been
exercised only by the compiler and by the handler tests behind it, not end to end against a
running node.

---

## Uniform design, third pass — spacing gets exactly one owner per axis

**Reported:** "the UI is broken in many places", with the Signal tab as the example — its
heading, its buttons and its status banners sat flush against both edges of the phone while the
cards beside them were inset, and the header sat far lower than the design.

**Root cause: the inset was split between the shell and its children, on both axes.**

*Horizontally.* `Page` applied no gutter at all. Instead `StatusBanner`, `SectionHeader`,
`PostCard` and `SkeletonPostCard` each carried their own `marginHorizontal: spacing.md`, on the
assumption that their page had none — while `Button`, `Row`, `EmptyState` and every plain `Text`
carried nothing. Both halves of that arrangement are individually reasonable and they cannot
coexist: any screen mixing the two families gets two different left edges. `features/signal/`
mixed them on every screen, which is why it looked the worst; `mesh-screen.tsx` had no
horizontal inset of its own anywhere and leaned entirely on the banner's.

*Vertically.* `PageHeader` adds `insets.top` — it has to, because it is a sticky frosted surface
that must extend under the status bar rather than start below it. `AppScene` wrapped every route
in a `SafeAreaView` with `edges={['top', 'left', 'right']}`. Every screen using both paid the
notch twice, ~47pt on a modern phone.

**Fix.** One owner per axis. `Page` reads `useGutter()` (16 / 24 / 32 by breakpoint — it was
already there as `useSemanticSpacing().screenInline`, with no callers), applies it once, and
stacks its direct children with a `gap`; every shared component became gutter-free. A screen
whose child owns the scroll container passes `gutter={false}` and `InfiniteList` applies the same
`useGutter()` number to its content container, so a card in a list and a heading above it still
line up. `AppScene` now defaults to `edges={['left', 'right']}`; the two onboarding routes, which
have no `PageHeader` and draw their own full-bleed hero, opt back into `top`.

**Also in this pass.** Eight screens still on the deprecated `Screen` shell moved to `Page`,
which removed three more hand-rolled copies of the 760pt reading measure and two more hand-rolled
headers. Two screens were rendering *bare* `TextInput`s with a single `marginBottom` and no
border, background, placeholder colour or minimum height — `CommunityCreateScreen` (the copy in
`features/forum/screens.tsx`) and `EditPostScreen`; both now use `design-system/forms`. The
post-detail screen was one flat `gap: spacing.sm` run in which the title had exactly as much air
above it as the vote row, so nothing marked where the post ended and the tools began; it is now
an article block, a bordered action bar, and a comments section. `EditPostScreen`'s body editor
was an uncontrolled `defaultValue` that captured whatever had arrived at mount — usually nothing
— so a slow fetch left it blank and "Save changes" would have published that blank. Comment
indent went from 8 × 16pt to 6 × 12pt: 128pt of a 320pt phone was disappearing before the left
rail and the page gutter, which wrapped Bangla body text two or three words to the line.

**Gate:** `src/design-system/gutter.test.tsx`. Per §7.4 it asserts the failing shape as well as
the passing one — re-adding `marginHorizontal` to `StatusBanner` was confirmed to fail it — and
it covers both axes: the page insets its column, a `gutter={false}` page does not, `InfiniteList`
picks the inset up, the shared children carry none, and `AppScene` does not claim `top` unless
asked.

**Lesson (L-…):** when two layers can each supply a value, neither will consistently, and the
result looks like "some screens are broken" rather than like one bug. Name the owner in the
component's own doc comment and put a test on it, because the next person adding a screen will
otherwise copy whichever neighbour they happened to open.

**Verified:** `pnpm vectors` → 3 implementations agree on 16 vectors; `pnpm test` → 6/6 tasks,
frontend 31 suites / 163 tests (8 new gutter tests), backend 40 files / 3 skipped without
Mongo/Redis, SDK 13, audit-log 1; `pnpm lint` → 0 errors workspace-wide; `pnpm typecheck` clean
apart from the pre-existing `load-env.ts` dotenv error.

**Not claimed:** not re-run on a device. Every change here is a layout constant or a shell swap
pinned by the compiler and by `gutter.test.tsx`; "it looks right on the phone" has not been
re-observed since the change.


---

## 2026-07-31 — Four reported client faults: joined state, sign-out, the link pill, the require cycle

**Reported:** joining a community still offered "Join"; sign-out logged
`The action 'POP_TO_TOP' was not handled by any navigator` and did not sign out; the network
indicator read "Unknown route" and "Same network" at the same time; Metro warned about a
require cycle in `features/signal`; and publishing a Signal profile failed with
`rns_public_key must be 64 bytes`.

### 1. `/v1/me/*` was read anonymously (the "joined" bug)

`useNodeDocument` attaches the bearer token **only** when the call passes `{ viewer: true }`.
`/v1/me/communities` and `/v1/me/saved` did not pass it. On the node those two routes go
through `actor()` — the strict form, which throws 401 — not `optionalActor()`, so the answer
was always 401, `OfflineApi` fell back to the empty cache, and `joinedIds` was permanently
empty. Every community in the directory therefore rendered as unjoined, and Saved rendered as
empty for someone with saved items. One missing option, two screens, and no error anywhere:
an empty list is what "success with nothing in it" looks like too.

`/v1/communities/:id` was already correct, which is why the community page's own Join/Leave
button worked while the list beside it did not — the two disagreed and both looked plausible.

**Gate:** `src/data/viewer-scoped-reads.test.ts` parses every `useNodeDocument(...)` call in
`frontend/src` with a balanced-paren scanner and fails if any `/v1/me/` path omits
`viewer: true`. Per §7.4 it also asserts the scanner flags a hand-written violating call and
passes a compliant one, plus a control that it matches any calls at all — a source scanner
that silently matched nothing would pass for ever.

### 2. Sign-out was three imperative steps and only one of them was reliable

`(tabs)/profile.tsx` did `signOut()` → `router.dismissAll()` → `router.replace('/')`.
`dismissAll()` dispatches `POP_TO_TOP` at the root navigator; from inside `(tabs)`, the root
stack's FIRST route, `StackRouter` returns null for it and React Native logs the unhandled
action. What was left deciding whether the person was actually signed out was `replace('/')`
resolving against `app/index.tsx` rather than `app/(tabs)/index.tsx` — route resolution as a
security boundary.

**Fix:** the gate is declarative and shared. `src/application/session-gate.tsx` holds the
whole decision (`useSessionGate`); `app/index.tsx` and `app/(tabs)/_layout.tsx` both render
it. Signing out is now a state change: the vault locks, `session` flips, and the tabs stop
rendering on the next paint. No navigation, so nothing depends on an action reaching a
navigator that can handle it — and a locked vault can no longer sit behind the tabs by any
route at all, which is the invariant `app/index.tsx` already claimed to hold.

### 3. `shared-subnet` was unreachable in production while its unit test passed

`classifyLink` compares the caller's address against `ServiceDirectory.localAddresses()`.
That directory publishes **URLs** — `http://192.168.1.20:3000` — because its other consumer
is the client's dial list. `normaliseAddress` only understood bare addresses, so a URL fell
through to its `includes(':')` branch and came back verbatim; `subnetOf` then turned it into
`http://192.168.1.20:3000::/64`, which cannot equal a caller's `192.168.1.0/24`. The
`shared-subnet` branch was therefore dead in every real deployment, and a phone on the same
Wi-Fi as the node read "Nearby network" or "Unknown route" beside a sheet reporting the
node's own reach as LAN — "Same network". Two labels, one screen, contradicting each other.

Every existing test in `link-scope.spec.ts` hands the function hand-written bare IPs, so the
gate was green on input production never supplies. `normaliseAddress` now reduces any of
URL / authority / bracketed IPv6 / host:port / bare address to an IP, and returns `''` for a
hostname — an unresolved name is not evidence of a shared segment, and the file's own
asymmetry rule says absent evidence must never become the narrow answer.

`callerAddress` also tried `request.raw.socket.remoteAddress` alone whenever it was merely
present; an unparseable or torn-down socket made the whole classification "unknown" while
`request.ip` held the answer. It now tries both in order of directness.

**Gate:** `link-scope.spec.ts` gains the production shape (URLs on both IPv4 and IPv6), a
no-false-positive case on a different segment, a hostname-only case, and a table for
`normaliseAddress` covering every written form plus the things that are not addresses.

### 4. `signal/index.ts → rns-screen.tsx → signal/index.ts`

`rns-screen.tsx` imported its twelve neighbours from the barrel that re-exports it. Fixed by
importing `./contacts`, `./directory` and `./rns` directly.

### 5. `rns_public_key must be 64 bytes` — NOT reproduced, guard added

Traced end to end and could not reproduce it against this tree. `publishSignalDirectoryProfile`
attaches the LXMF binding all-or-nothing, and the derived key is 64 bytes
(X25519 32 ‖ Ed25519 32 — confirmed by running the derivation against the JS backend); the
onboarding username step attaches no binding at all, and the node has accepted an absent
binding since a8e017f. So a partial or short binding cannot come from this code.

What was added is a client-side precondition that names the observed lengths and says the
username can be published without a mesh address, because the node's answer to a wrong-length
key is a protocol error shown to someone who was typing a username. If it recurs, the message
now says which field and how long it actually was.

**Also:** `react-native-svg` was only ever present as an auto-installed **peer** of
`react-native-qrcode-svg`, at 15.15.5 against Expo SDK 52's 15.8.0. A native module that two
screens render (mesh pairing and the Signal identity card) must be a declared dependency at
the SDK's version, or the resolved version is whatever the lockfile happens to produce.
Declared at 15.8.0; `expo install --check` is clean. **This needs a native rebuild** of the
Android dev client to take effect.

**Lesson (L-…):** three of these five were one shape — a value that only differs in
production. `viewer: true` is absent only when signed in; `localAddresses()` returns URLs only
outside the test; `POP_TO_TOP` is unhandled only from the first root route. Each had a green
test beside it, written against the input the author had in hand. When a function's inputs
come from two different producers, the test has to take them from BOTH producers, not from a
literal.

**Verified:** `pnpm vectors` → 3 implementations agree on 16 vectors, `expected.json` matches;
`pnpm lint` → 0 errors workspace-wide; frontend 34 suites / 183 tests; backend 41 files /
517 tests with 3 files and 13 tests skipped without Mongo/Redis; frontend `tsc --noEmit`
clean; backend `tsc --noEmit` clean apart from the pre-existing `load-env.ts` dotenv error.
One backend run showed a single failure that did not reproduce across two subsequent full
runs — the federation FD-16 case asserts over ~24 s of wall clock and is timing-sensitive.

**Not claimed:** not re-run on a device. The `rns_public_key` report is not closed — it was
not reproduced, only instrumented.

---

## 2026-07-31 — "Declare identified channel: author key is not certified"

**Reported:** Broadcast channels → create/publish → *Declare identified channel* failed with
`could not publish: author key is not certified`.

**Root cause: a channel signs with its own key, and nothing ever certified that key.**

Pipeline step 10 requires the envelope's author key to hold a certificate valid at
`created_at_ms`. `registerSignalIdentity` publishes `jb:key:certify:signal:v1` for the
**device** key. A channel signs with a per-channel derived key — Plans/01 §4,
`m/83696968'/21'/c'`, "an org may run several channels" — which reaches the node having never
been seen. So `jb:channel:declare:v1` was rejected, and so would every `jb:channel:update`,
`:rotate`, `:retire` and `jb:broadcast:emit`/`:revoke` have been after it, because all of
those are signed by the channel key too. Only the first one was reachable, so it was the only
one reported.

`jb:key:certify:signal:v1` is the bootstrap exception for exactly this case
(`requires_certificate: false`, ADR-004) and is safe for a channel for the same reason it is
safe for a device: `SignalKeyCertifyHandler` re-establishes everything step 10 would have
checked — the certificate is ABOUT the key that signed the envelope, the Ed25519
self-signature verifies, and the ML-DSA-44 attestation verifies. It had simply never been
pointed at a channel: `SecureSignalSigner.certificateBody()` hardcoded `{ kind: 'device' }`,
so certifying a channel was not merely unimplemented, it was unexpressible.

**Fix.** `certificateBody(ctx)` takes a context, defaulting to `device` so
`registerSignalIdentity` is byte-for-byte unchanged. `declareSignalChannel` and
`rotateOwnedSignalChannel` publish the channel key's own certificate first, through the new
`certifySignalChannelKey`. Two proofs of work, because a PoW challenge is bound to one author
key and the certificate is signed by the channel key — declaring a channel is documented as
"one-time, expensive" (Plans/04 §5). Certifying the replacement key *before* the rotation also
means KY-04 has no window where the channel cannot publish at all.

A private `certificatePqKeyPair(ctx)` now serves both `certificateBody` and
`channelPqPublicKey`. They must name the same ML-DSA key or a channel has two post-quantum
identities: subscribers verify against `ChannelDeclare.pq_key`, the node stores the
certificate's. No registry, proto or wire change — the contract already had a domain for this.

**Why the backend suite was green.** `signalHarness()` seeds a certificate for `AUTHOR_KEY`
and then declares a channel whose `signing_key` **is** `AUTHOR_KEY`. In the test the channel
key and the certified key are the same key — the one arrangement the real client never
produces. This is the L-… shape from the previous entry again, for the third time: a test
written against the input the author had in hand rather than the input production supplies.

**Gates.** `frontend/src/signer/channel-certificate.test.ts` — the channel certificate is
about the channel key, its attestation and self-signature verify, and its `pq_key` equals
`channelPqPublicKey`; per §7.4 it also asserts the failing shape, that the DEVICE certificate
is *not* about the channel key, which is the sequence that produced the error.
`signal-features.spec.ts` gains the two halves on the node side: a declaration by an
uncertified key is rejected and projects nothing, and the identical declaration is accepted
once that key holds a certificate.

**Raised, not built: routing this over Reticulum.** The report asked for channel
create/publish to go over Reticulum rather than the node. Left undone deliberately, and the
reasoning is recorded here rather than in chat:

- The feature must not choose a transport at all — that is the Liskov ban in §5.2 and the
  reason path selection lives in the transport layer. "Send channel declarations over the
  mesh" is a path-selection policy, not a property of the broadcast feature.
- A declaration is BULK and up to 16 KiB; its ML-DSA key alone is 1312 B and the certificate
  that must precede it is ~3.9 KiB. That is many minutes of LoRa airtime for one envelope,
  which is why Plans/04 §5 classes it BULK and not BROADCAST. The 512 B class-0 envelope that
  genuinely belongs on the radio is `jb:broadcast:emit:v1`.
- It cannot be Reticulum-only in any case: the declaration has to reach a node to be
  projected, searchable, subscribable and receipted, and the key certificate has to arrive
  ahead of it or step 10 rejects the declaration wherever it lands.
- The client has no outbound transport port. `offline/outbox.ts` has exactly one submitter,
  `defaultSubmit` → `POST /v1/envelopes`, and `ClientTransport` is `'direct' | 'tor'` — both
  IP. `features/signal/rns-broadcast.ts` is inbound admission only. Making any envelope
  mesh-deliverable means adding a `Transport` port to the outbox and an LXMF adapter behind
  it, which is P5/P6 work (AR-12: Reticulum is an optional adapter and must never become a
  dependency), not an edit to this screen.

**Verified:** frontend 35 suites / 186 tests; `signal-features.spec.ts` 13 tests; frontend and
backend `tsc --noEmit` clean apart from the pre-existing `load-env.ts` dotenv error; `pnpm
lint` 0 errors workspace-wide.

**Not claimed:** not exercised on a device, and not exercised end to end against a running
node — the certify-then-declare sequence is asserted in two halves (the client produces an
acceptable certificate; the node accepts a declaration once the key is certified), not as one
live round trip.

---

## 2026-07-31 — Signal plane unusable after a cold start; own broadcasts invisible

**Reported:** emitting a broadcast did not work, subscribers did not receive broadcasts, and
sending a message failed with *"signal identity is not there, unlock it first"*.

### 1. The Signal vault had no launch restore at all

`activeSigner` in `signer/signal.ts` is module state and starts every launch empty. The Forum
plane has always had `restoreForumSession`, called on launch, on foreground and on reconnect.
The Signal plane had **nothing** — `unlockSignalIdentity` was only ever called by hand, from
the Signal identity screen.

So after any process death — a reload, a swipe-away, an OS kill — every Signal action threw
`Unlock your Signal identity first`, which is one string from one guard in
`publishSignalEnvelope`. Sending a message, emitting a broadcast, declaring a channel and
publishing prekeys all pass through it. That is why this arrived as three separate bug
reports: each surface named its own failure and none of them said "signed out", and the only
way back was to find Signal → "Your identity and code" and unlock manually, which nothing on
the failing screens told you.

`restoreSignalSession(baseUrl, auditServices)` mirrors the Forum one: reopen the vault,
authenticate, and — because a certificate is the precondition for authenticating at all —
re-certify once if authentication fails against a node that has never seen the key. It tries
**the empty passphrase and only the empty passphrase**, so a device-lock vault reopens
silently and a passphrase- or salt-protected vault stays shut. Wired into the launch effect
and into the existing foreground/reconnect `attempt`.

The other half: onboarding creates BOTH vaults from one protection choice (`welcome-flow.tsx`
passes the same password and salt to `createSignalIdentity` deliberately), so for anyone who
set a password the silent path can never help. `SignInScreen.finish` now also tries the Signal
vault with the secret already in hand. That is not plane linkage — no record associates the
two identities, nothing is published together, no key material crosses, and a wrong guess just
leaves the vault locked. It is one person entering one secret they already chose for both.

### 2. The author of a channel could not see their own broadcasts

There is no server-side subscription table, by design: during a shutdown a list of who follows
which channel is a list of targets. Broadcasts flood and `subscriptionAllows` filters locally.
The consequence nobody had closed is that **nothing** enters the Signal inbox until a local
follow matches it — and declaring a channel created no follow. So the author emitted a
broadcast, went to look for it, and found an empty inbox: the one person who must be able to
confirm the message went out was the one person who could not see it.

`SignalStudioScreen` now saves `defaultSubscription(channelId)` when a declaration succeeds.
Local record, same as any other follow, never sent anywhere.

### 3. Ruled out: the class size budget

Worth recording because it was the obvious suspect and it is wrong. `jb:broadcast:emit:v1`
carries `max_bytes: 512` in the registry, `sealEnvelope` already enforces `spec.maxBytes`, and
the node enforces `min(maxBytes, CLASS_SIZE_BUDGET[BROADCAST])` — the same 512. Measured
against the real encoder: 290 B for an empty broadcast, 342 B with a Bangla headline, 425 B
with a Bangla headline and detail, 413 B with a 120-character ASCII headline. Real Bangla
content fits with room to spare, so no size fix was made and none is needed.

**Gate:** `frontend/src/signer/signal-session-restore.test.ts` — no vault reports
not-configured rather than inventing a session; a device-lock vault reopens as the SAME
identity after the signer is dropped; and, per §7.4 as the failing half, a
passphrase-protected vault stays locked. Its scrypt stub is cheap but still a function of the
passphrase, because a constant stub would make the third case pass for the wrong reason — the
vault would open with any secret at all.

**Lesson (L-…):** the two planes are deliberately independent, and that independence silently
became "one of them has a session lifecycle and the other does not". When a subsystem is
duplicated for isolation, every lifecycle hook the original has is a checklist item for the
copy — `restoreForumSession` had four call sites and its Signal counterpart had zero.

**Verified:** frontend 36 suites / 189 tests; `tsc --noEmit` clean; `pnpm lint` 0 errors
workspace-wide.

**Not claimed:** the broadcast-emit and subscriber reports were not reproduced with an error
message in hand. Both are explained by the missing restore (`publishSignalBroadcast` goes
through the same guard that produced the message-sending error the user did quote) and by the
missing self-follow, and the size hypothesis was measured and rejected — but neither was
observed failing and then observed passing.

**Also, unrelated cause, now resolved:** the `RNSVGLinearGradient` redbox on the Signal
identity screen was not a code fault. `react-native-svg` had been declared a direct dependency
earlier the same day and Gradle had built an APK containing `SvgPackage`, but that APK was
never installed — the device was still running a 02:35 build. The install had been failing
because the shell's default JDK is 25, which cannot resolve `com.facebook.react.settings`;
building with the installed JDK 17 works. Worth pinning `JAVA_HOME` in the shell profile.

---

## 2026-07-31 — Private messages were copied to audit logs; a stale token was never refreshed

**Reported:** "Start encrypted session" answered *Could not send — access token is invalid*,
and messages should not be sent to the audit log service.

### 1. Every DIRECT envelope was being copied to every advertised audit log

`createAuditCertificate` embeds the ENTIRE request body — the complete signed envelope — in
`request.body_base64`. That is deliberate and correct: it is what makes a node's refusal to
publish provable rather than deniable. `outbox.deliver` then POSTed that certificate to every
service in `record.auditServices`, for every envelope, with no distinction by class.

For a `SignalSessionInit` or `SignalMessage` that envelope carries `recipient_key` in the
clear, wrapped in an envelope carrying the sender's identified Signal key and a timestamp. So
starting a conversation handed every advertised audit log a timestamped edge in a social
graph, on the plane whose entire premise is that the speaker is identifiable. This project
already refuses to build that structure server-side — "a list of who follows which channel is
a list of targets" — and shipping it to a third party is strictly worse. A message nobody else
can read also has no censorship claim to prove, so nothing is lost by withholding it.

`auditServicesFor(record)` returns `[]` for `Priority.DIRECT` and `record.auditServices`
otherwise. Keyed on the priority CLASS, not a list of domains: DIRECT is exactly "addressed to
one recipient, end-to-end encrypted" (Plans/04 §5), so a future private domain inherits this
instead of needing someone to remember. Placed in `deliver` because that is the single
chokepoint every envelope passes through — putting it in each `publishSignal*` helper would be
one forgotten call site away from leaking again. The certificate is still written to local
storage; only the copies are withheld.

**Gate:** two halves in `outbox.test.ts` — a DIRECT envelope produces no POST to the audit
service and `auditCopies === 0` while still being stored locally, AND a BULK forum post still
produces exactly one. Without the second, the test would pass just as well if forwarding were
broken outright.

### 2. A rejected access token was never refreshed

Access tokens are HMACed with `AUTH_ACCESS_SECRET`; a node started without one mints a fresh
random key per boot (`backend/.env.example` says so), so every node restart invalidates every
outstanding token. Nothing recovered from that. The vault stayed unlocked, `activeAccessToken`
stayed set, and the only code that mints a token runs when there is NO token — so every
guarded read answered `access token is invalid` for ever. Re-authenticating needs nothing from
the person: it is a signature over a challenge with a key already held unlocked.

`signalSessionRequest` and `forumSessionRequest` now clear the token and re-authenticate once
on that specific rejection, then retry. Exactly once — a node that rejects a freshly minted
token is saying something real (uncertified, revoked) and that must surface rather than spin.

### 3. …and the message had actually been sent

The reported error was not even the send's. `send()` ends with `await refresh()`, and
`refresh()` also runs on a 10-second interval; both wrote into `notice`, the same state the
send outcome uses, rendered under the heading **"Could not send"**. So a message that was
signed, queued and receipted announced itself for a fraction of a second and was then
overwritten by whatever the inbox poll happened to hit. `refresh` now writes to its own
`readError`, rendered as "Inbox may be out of date" with a warning tone, because a stale inbox
is the ordinary state offline and is not a claim about a message you just sent.

**Lesson (L-…):** two states rendered through one variable is the same defect as two layers
owning one value (the gutter entry above) — the later writer wins and the symptom is attached
to the wrong action. A success and a background failure must not share a channel, and a banner
whose title is a guess from `notice.startsWith('Encrypted')` is the tell.

**Verified:** frontend 36 suites / 191 tests; `tsc --noEmit` clean; `pnpm lint` 0 errors
workspace-wide.

**Not claimed:** not re-run on the device. Whether the node's token was stale for the reason
above (no `backend/.env`, so `AUTH_ACCESS_SECRET` is regenerated per boot) was inferred from
configuration, not observed in a log.

---

## 2026-07-31 — Signal studio: channel is a choice, not a 56-character paste

**Reported:** "Emit to publish. Signal Studio > Broadcast the channel id is a text box rather
than a dropdown, so fix it."

**The field was free text for a value with a small closed set of valid answers.** Both the
Broadcast and Retract tabs asked you to type a channel ID — `jbc1` plus 52 base32 characters.
One wrong character came back as `channel is not known here`; a right-looking one for a
channel this vault has no key for came back from the SIGNER as `channel signing key is not
present in this vault`, which is not a sentence anyone should have to read to learn they
picked the wrong channel.

**`Select` now exists in the design system.** `SelectField` was already there with **zero**
callers, because it is only the closed state — a chevron and an `onPress` — so every screen
needing one choice from a known list reached for a free-text `Field` instead. `Select` is the
whole control: trigger, options, selection state. Options expand INLINE rather than in a modal
or a native picker, so it behaves identically from a 320 pt phone to a tablet in split screen,
needs no platform branch, and cannot be the thing that fails when everything else is failing.
Selection carries a check glyph as well as a tint (NFR-A06) and rows clear 44 pt.

**Where the list comes from, and why not from the node.** `SecureSignalSigner.ownedChannelIds`
exposes the vault's channel map — IDs only, no key material leaves the signer. That set, not
`/v1/signal/channels`, is authoritative: `contextSeed` throws for anything absent from it, so
offering a channel the node knows but this device cannot sign for would offer a choice that
always fails. The node's list supplies human names and nothing else, and a channel with no row
is still offered labelled by ID — a channel operator during a blackout is precisely who must
still be able to publish.

**Two things fixed alongside, because the picker made them derivable.**

- *Sequence.* It defaulted to `"1"` for ever, so the first emit worked and every later one was
  denied with `broadcast sequence must increase monotonically`. The selected channel row
  carries `lastSequence`; the field is now prefilled with the next value and stays editable
  for a deliberate gap.
- *The button.* "Emit broadcast" → "Publish broadcast", and it is disabled with no channel
  chosen rather than failing on tap.

**Gate:** `src/design-system/select.test.tsx` — the placeholder shows until something is
chosen and the LABEL after; choosing reports the VALUE, not the label, and closes the list;
exactly one checkmark marks the selected row; and an empty list says so instead of rendering a
dead control. That last case is the one a screen-local implementation would have skipped, and
it is the state a new device is in.

**Lesson (L-…):** a design-system component with zero callers is not "available", it is
unfinished. `SelectField` looked like the app had a select control, so nobody wrote one — and
the gap showed up as a free-text field for an opaque identifier, three screens away from the
component that was supposed to prevent exactly that.

**Verified:** frontend 37 suites / 195 tests; `tsc --noEmit` clean; `pnpm lint` 0 errors
workspace-wide.

**Not claimed:** not re-run on the device — the picker's behaviour is asserted by
`select.test.tsx` against the real component, but the studio screen itself has no render test.

---

## 2026-07-31 — Signal broadcast: publish/receive redesigned around what a person came for

**Reported:** "one should only be allowed to publish in the channels they created, and the
user experience is very bad for broadcast and receive broadcast — streamline, that scattered
cards, make design for people."

### Publishing to a channel you do not own was already impossible

Recorded because it was asked and the answer is layered, not a UI rule. The picker offers only
`SecureSignalSigner.ownedChannelIds` — the vault's channel map. Below that, `contextSeed`
throws `channel signing key is not present in this vault` for anything absent from it, so the
envelope cannot be signed at all. Below THAT, `BroadcastEmitHandler.authorize` denies unless
`channel.currentSigningKey === hex(env.authorKey)`, which holds for a federated peer's
envelope too since it re-runs the same 19 steps. Three independent layers; the UI is the
convenience, not the control.

### "Scattered cards" — the receive side

`SignalHomeScreen` opened with five navigation surfaces and a sentence of product copy before
the first alert: a hero mark plus "Know who is speaking." and a paragraph, a full-width
Messages button, a three-tile rail, a two-button row, and a banner about filters. On a 320 pt
phone that is a full screen of scrolling to answer "is anything wrong?". Then each alert was a
bordered `Card` containing *nested* `StatusBanner`s for a sequence gap and a retraction —
cards inside cards inside a list of cards, with nothing establishing which box was the alert
and which was a note about it. That is the "scattered" reading.

Now the order of the screen is the design:

- **One line that answers the question.** A status strip: "2 critical alerts need you" or
  "No alerts right now", with what it is listening on, and Messages beside it so the other
  reason people open this tab stays one tap away.
- **The alerts.** Straight after, nothing between.
- **Everything else, last.** The three shapes of navigation collapsed into one wrapping grid
  of five equal tiles — they are peers and none of them is why you came.
- **One empty state** instead of an empty state plus a separate filters banner. Which of the
  two reasons applies picks the words AND the action, so a person is told what to do rather
  than shown two boxes and left to work out which is theirs.

`AlertCard` was rebuilt around what a person judges an alert by. It led with
`SEVERITY  #17  14:32:07` — a sequence number and a wall clock to the second, which is
broadcaster bookkeeping — and the headline came third. Now: severity, **channel name** and age
("4m ago") on one quiet meta line, headline dominant, detail under it. The channel name is
newly resolved from `/v1/signal/channels`; a broadcast carries only an ID, and an ID is not
who is speaking, which is the one thing this plane exists to make legible. Gap and retraction
became inline rows on the card's own surface, so the card stays one object. The whole card
opens the channel, which removes the "View channel" button that competed with the only action
that ever matters — acknowledging a critical alert.

### The publish side

`SignalStudioScreen` opened on "Declare" for everyone for ever, so an operator sending their
fourth alert of the night landed on a form for creating a channel they already have. The
landing tab now follows what the device can do: publish when it can sign for something,
declare when it cannot yet. A single owned channel is preselected. Declaring lands on
Broadcast with "\"X\" is live. Write its first broadcast below.", because the reason to
declare a channel is to publish on it.

Its result banner also decided success by `notice.includes('accepted')` — string sniffing, so
rewording a success message silently turned it red, which is exactly what rewording it did.
`notice` is now `{ text, ok }`. Same defect as the messages screen mixing a poll failure into
the send result, two entries above: state that is read as a status has to be stored as one.

**Lesson (L-…):** the fix for "scattered" was not styling, it was ordering. Every block on that
screen was individually reasonable and the screen was unusable, because the sequence encoded
no judgement about why anyone opened it. Ask what question the screen answers, put that first,
and let everything else be below the fold.

**Verified:** frontend 37 suites / 195 tests; `tsc --noEmit` clean; `pnpm lint` 0 errors
workspace-wide.

**Not claimed:** not viewed on a device, and neither screen has a render test — the reordering
is asserted by nothing but review. The new strings are English-only, matching the file's
existing state; these Signal screens are still outside the i18n catalogue and that debt is
unchanged, not increased.

---

## 2026-07-31 — `JagooRns.start` rejected its own caller: a Uint8Array in an untyped map

**Reported:** "Start RNS" and "Start BLE RNode" both failed with
`Call to function 'JagooRns.start' has been rejected — identityPrivateKey is required`.

**The caller was passing it. The module could not see it.**

```kotlin
AsyncFunction("start") { config: Map<String, Any?> ->
  val privateKey = config["identityPrivateKey"] as? ByteArray
    ?: throw IllegalArgumentException("identityPrivateKey is required")
```

Expo converts a JS `Uint8Array` into a Kotlin `ByteArray` only when the signature names the
type to convert toward. Inside `Map<String, Any?>` there is no target type, so the value
arrived as something else, the `as?` cast produced null, and the module raised its own
"required" error against a caller that had supplied exactly that field. The message named the
right field and the wrong cause, which is why it reads as a client bug.

`JagooCryptoModule` never hit this and moves far more bytes across the same bridge, because
every one of its functions declares `ByteArray` parameters directly. Same framework, same JS
value, different signature — the difference is entirely whether the type is written down.

**Fix.** `start(config, identityPrivateKey: ByteArray)` — the key is a declared parameter and
the config map keeps only strings and the interface list, which is what an untyped map does
convert. `RnsBootstrapConfig` no longer carries the key. Nothing past the Kotlin boundary
changed: it still base64-encodes into the JSON that `jagoo_rns.runtime.start` already expects,
and the Python side still checks the 64-byte length itself.

The native copy is now zeroed in a `finally` once the base64 form has been handed on. The
base64 `String` is immutable and survives until GC — unavoidable when the Chaquopy boundary
takes JSON — so it is deliberately the only copy that outlives the call.

**Lesson (L-…):** an untyped `Map<String, Any?>` across a native bridge silently drops the
types the bridge exists to preserve, and the failure surfaces as a validation error inside the
module rather than as a conversion error at the boundary. When a native function takes bytes,
name `ByteArray` in the signature; a config bag is for strings and numbers.

**Verified:** frontend `tsc --noEmit` clean. The Kotlin change requires a native rebuild to
take effect and cannot be exercised by the JS test suite.

**Not claimed:** whether RNS then starts is unproven. This unblocks the argument check only;
the next thing `start` touches is the embedded Python runtime (Chaquopy, `rns==1.4.2`,
`lxmf==1.1.0`), which has never run in this app because nothing has reached it before.

---

## 2026-07-31 — RNS reached Python; messages became a conversation; channels split by ownership

### 1. `No module named jagoo_rns` — Chaquopy packages Python from the APP module only

With the `ByteArray` fix in place `start` finally reached `runtime()`, and Chaquopy could not
import the package. Chaquopy was applied twice: to `:app`, which owns the runtime and the pip
packages, and to `:jagoo-rns`, whose build file explains it is only there to put `Python.java`
on that module's compile classpath. But `jagoo_rns/` lives in the MODULE's
`src/main/python`, and Chaquopy supports Python sources in an application module only. So the
interpreter started with `rns` and `lxmf` on its path and nothing else.

Fixed by pointing the app's source set at the module's directory —
`python.srcDirs += ['../../modules/jagoo-rns/android/src/main/python']` — rather than moving
the Python out of the feature directory. The library module now sets `python.srcDirs = []`,
because a library that also compiles them emits a second `assets/chaquopy/app.imy` that
collides with the app's at merge time. Both edits are mirrored into
`plugins/with-jagoo-rns.js` so a `prebuild` cannot silently drop them.

**Verified by artefact, not by log:** `assets/chaquopy/app.imy` in the installed APK now
contains `jagoo_rns/__init__.py` and `jagoo_rns/runtime.py`.

The interim `"Received 2 arguments but 1 was expected"` was the window between Metro serving
the two-argument JS and Gradle finishing the install — not a defect.

### 2. Messages read as logs because half the conversation was unreadable

A Signal message is sealed to the recipient, so `loadSignalMessages` returns `plaintext: null`
for everything THIS device sent, which the screen rendered literally as "Encrypted message
sent from this device". On top of that it drew two independent flat lists of hairline rows —
sessions and messages — each line labelled `Message 3 · 7/31/2026, 8:12:04 AM`, with no
ordering between the lists and no indication of who spoke. No amount of styling fixes that;
the data had to be joined first.

`features/signal/outgoing.ts` keeps what we sent — content ID, session, counter, plaintext,
recipient. It costs nothing in confidentiality (the device typed it) and it is the only way
our own half of a thread can ever be shown. It is also the record of what has NOT gone out:
the outbox holds opaque signed bytes and cannot know an envelope was a message, so joining on
content ID is what lets a queued message keep its place in the thread marked "Queued" instead
of vanishing until the network returns. Wiped by `clearSignalLocalData` like every other
Signal-plane local record.

The screen is now a conversation list and a thread: ours right on the accent surface, theirs
left on the neutral one, oldest first, time and delivery state (Queued / Sent / Read) as a
word plus a glyph. Conversation rows show a preview and "N waiting to send". Its result banner
also stopped sniffing its own tone from `notice.startsWith('Encrypted')`.

### 3. Channels mixed two different relationships into one list

"Create or publish" was a single primary button doing three jobs, sitting under a search box,
above one list that mixed the channels you speak FOR with the channels you listen TO — so the
screen answered neither "where do I publish?" nor "who else is out there?".

Split into **Your channels** (each row carrying its own "Publish", which opens the studio
already on that channel) and **Discover** (the search and everyone else). Declaring is a
once-per-channel act, so it is the empty state's call to action when you own nothing and a
ghost "Create another channel" when you do — not the primary button for everyone for ever.

**Lesson (L-…):** three of these were the same shape as the entry above — a screen whose
ordering encoded no judgement about why anyone opened it. The other, `srcDirs`, is the
recurring one: a plugin applied in two places where only one of them does the packaging.

**Verified:** frontend 37 suites / 195 tests; `tsc --noEmit` clean; `pnpm lint` 0 errors;
Android `installDebug` succeeded and the Python asset was inspected inside the APK.

**Not claimed:** RNS has still never been observed to START. The import now resolves, which is
strictly further than before; whether `RNS.Reticulum` then initialises on this device is
unknown. `runtime.py` catches its own exceptions and returns `{state: "failed", error}`, so a
failure will surface as text in the banner rather than a crash.

---

## 2026-07-31 — `Read-only file system: 'file:'` — a URI handed to an OS call

**Reported:** Start RNS failed with `read only file system 'file:'`.

**A URI is not a path.** `startSignalRns` built its storage root from
`FileSystem.documentDirectory`, which Expo returns as a URI —
`file:///data/user/0/com.jagoobahee.app/files/` — and passed it through Kotlin to Python
unchanged. `os.makedirs("file:///data/…")` does not recognise a scheme. It sees a RELATIVE
path whose first component is literally `file:`, resolves it against the process working
directory (`/` on Android), and fails with `[Errno 30] Read-only file system: 'file:'`.

That message is why this looked like a permissions problem: it names the root filesystem, for
a directory inside the app's own private storage, which the app can obviously write to.

**Fix.** `fileSystemPath()` in `rns.ts` strips the scheme and percent-decodes, and it is the
single owner of the conversion: JavaScript produces a filesystem path, Python consumes one.
`runtime.py` now *asserts* that shape — `"://" in root or not root.startswith("/")` raises
with the offending value — rather than re-deriving it. A check, not a second owner: a
regression fails loudly at the boundary instead of creating a directory called `file:`
wherever the working directory happens to be.

**Gate:** five cases in `rns.test.ts` — the scheme is stripped, the result is absolute and
scheme-free (the property Python checks), `%20` is decoded rather than reaching the
filesystem, a plain path is unchanged so the conversion is idempotent, and malformed
percent-encoding returns the raw path instead of throwing on the one call that decides
whether the mesh transport can start at all.

**Lesson (L-…):** the same shape as `localAddresses()` returning URLs into `classifyLink` —
a value crossing a boundary in the producer's notation rather than the consumer's, where both
are strings so nothing complains until an OS call does. Three boundaries in this feature have
now failed this way (URI vs path, Uint8Array vs ByteArray, library vs app source set); the
common factor is that every one of them was typed as "string" or "Any" somewhere in the
middle.

**Verified:** frontend 37 suites / 200 tests; `tsc --noEmit` clean; `pnpm lint` 0 errors.

**Not claimed:** RNS still has not been observed to reach `running`. This clears the directory
creation; `RNS.Reticulum(configdir=root)` and the LXMF router have not run yet on this device.

---

## 2026-07-31 — Start RNS killed the process; chats keyed on the wrong thing; a killswitch

### 1. `RNS.panic()` is `os._exit(255)`, and no `except` can see it

Tapping Start RNS closed the app. Not a crash — logcat is unambiguous:

```
09:12:56  libchaquopy_java.so loaded            ← Python started; the srcDirs fix worked
09:13:00  Process com.jagoobahee.app has died: fg TOP
09:13:00  Zygote: Process 5866 exited cleanly (255)
```

`exited cleanly (255)` is `RNS/__init__.py:349`, `def panic(): os._exit(255)`. It is not an
exception, not a signal, and not something `try/except` can intercept, so `runtime.py`'s
handler — written specifically to "avoid Reticulum's process-level panic" — was never
reached. `Reticulum.__init__` calls it at three sites: an unparseable config, a duplicate
interface name, and any interface that fails to construct (`Reticulum.py:1090`), which is the
likely one on Android.

A library embedded in someone else's app does not get to end the process. `_install_host_guards`
replaces `RNS.panic` and `RNS.exit` with raises, so the existing handler turns them into
`{state: "failed", error}`. Reticulum logs the real cause immediately before panicking, so
`RNS.logdest` is switched to `LOG_CALLBACK` into a 40-line ring buffer and the tail is
attached to the error — otherwise the honest report would be "Reticulum aborted" with no
cause, which is barely better than the silent exit.

### 2. Duplicate chats: a conversation is a person, not a session

Every "Start encrypted session" mints a new session ID and the thread list was keyed on it, so
two conversations with one contact produced two identically-named rows. Sessions are a ratchet
detail. `threads` now groups by counterpart key and `activeContact` replaces `activeSession`;
a reply on a fresh session lands in the thread already open. Thread entries are ordered by
TIME rather than by counter, because counters restart per session and ordering by them
interleaves two sessions into nonsense. `send` continues the person's most recent session and
computes the counter from that session alone.

### 3. Deleting a chat, with honest semantics

`deleteSignalChat` erases our stored plaintext for that person and records when. Entries older
than that are hidden; anything newer reappears — silently swallowing a message someone sent
during a shutdown is a far worse failure than a chat coming back. The confirmation says what
it does not reach: the node still holds every envelope and so does the other person's phone.

### 4. Killswitch passphrase

"Panic wipe" is a button, and a button is useless in the situation it exists for: with someone
standing over you demanding the password you cannot reach for a control labelled "destroy
everything". You can comply — so compliance is the destruction. `security/killswitch.ts` holds
a salted scrypt verifier at the same cost as a vault (a stored verifier must not be the cheap
way in), compared in constant time. Both unlock paths — Forum sign-in and the Signal vault —
check it BEFORE attempting the vault, and it wipes both planes.

Two decisions worth defending. It lands on the setup screen rather than reporting a wrong
password: the alternative keeps the coercion going against a device that no longer holds
anything and invites a second, angrier attempt. And it publishes NOTHING — `revokeSignalKey`
and `prepareDuressRevocation` already exist for telling the network, they need a reachable
node, and they are observable by whoever is watching the screen. A killswitch has to work with
the radio off and without announcing itself; conflating the two would make the silent one
impossible.

**Gate:** `security/killswitch.test.ts` covers both directions, and the wrong one is the scary
one — a false negative means a duress passphrase reports "wrong password" and the coercion
continues, a false positive means a typo wipes two identities. Also: inert until armed (so
unlock paths may call it unconditionally), stops matching once removed, and the stored record
does not contain the passphrase. Its scrypt stub is cheap but still a function of the input,
or every assertion would pass for free.

**Verified:** frontend 38 suites / 206 tests; `tsc --noEmit` clean; `pnpm lint` 0 errors.

**Not claimed:** RNS has still never reached `running`. The guard converts a process kill into
a readable failure — it does not make an interface work. The cause will be in the next error
string, and that is the first time this codebase will have seen it.

---

## 2026-07-31 — The mesh fallback required the network it is a fallback for

**Reported:** Start RNS said "network request failed"; and with every device on the same LAN
and the internet disabled, messages stopped passing.

### The code fault

`startSignalRns` awaited `fetchSignalRnsBootstrap` inside a `Promise.all`, so a node that
could not be reached rejected the whole call and the mesh transport never started. Backwards
by construction: LoRa and local Wi-Fi exist for the moment the node is unreachable, so gating
them on an HTTP round trip to the node makes the resilience path available exactly when it is
not needed. It is `Plans` TP-01's rule seen from the other side — "code that only runs during
a blackout fails during a blackout".

What the node supplies is a list of TCP relays and an LXMF propagation node, both
optimisations over the internet. `AutoInterface` discovers peers on the local segment with no
server at all. And on the node this was reproduced against, the endpoint returns
`{"tcpEndpoints":[],"lxmfPropagationDestination":null}` — the blocking call was gating the
radio on an answer containing nothing.

`bootstrapOrCached` now falls back to the last answer this device was given, then to nothing,
and starting proceeds either way. The fetch also moved from bare `fetch` to `networkRequest`,
so a Tor-configured client does not silently open a direct connection on the one call in the
mesh path that touches the internet.

**Gate:** three cases in `rns.test.ts` — the node's answer is used and cached, an unreachable
node falls back to the cache, and with no cache it returns empty rather than throwing.

### The reported symptom was NOT this, and the diagnosis is worth keeping

Both complaints had one cause, and it was environmental:

```
Mac (node):  192.168.0.123/24   → 192.168.0.0/24
Phone:       192.168.2.167/24   → 192.168.2.0/24
adb shell ping 192.168.0.123 →  100% packet loss
macOS firewall: disabled
```

Two different subnets. "Connected to the same Wi-Fi" was a guest network, a second SSID, or a
mesh extender running its own DHCP — with the uplink cut there is nothing to route between
them. Messages queue in the outbox (visible now, as "waiting to send") because the node is
genuinely unreachable, and RNS could not fetch its bootstrap for the same reason.

Worth noting the earlier `classifyLink` fix reports this correctly: caller `192.168.2.167`
against published `http://192.168.0.123:3000` normalises to `192.168.0.123`, `/24` subnets
differ, so the answer is `private-range` → "Nearby network" rather than "Same network". The
indicator would have said so.

**Lesson (L-…):** a test rig has to be verified, not assumed. Two devices "on the same Wi-Fi"
were on different segments for an entire debugging session, and every symptom it produced
looked like an application bug. `adb shell ping` from the device under test answers in one
second what an hour of reading code cannot.

**Verified:** frontend 38 suites / 209 tests; `tsc --noEmit` clean; `pnpm lint` 0 errors.

**Not claimed:** RNS still has not been observed to reach `running`, and now cannot be until
the two devices share a segment — `AutoInterface` is link-local multicast and does not cross
subnets either.

---

## 2026-07-31 — The RNode radio aborts by design; chat history existed only online

### 1. `RNodeInterface` panics from its constructor when its imports are missing

The panic guard from the previous entry did its job and produced the first real diagnostic
this feature has ever had:

```
RNS/Reticulum.py:1041   _synthesize_interface → RNodeInterface(...)
RNS/Interfaces/Android/RNodeInterface.py:411   RNS.panic()
```

Line 411 is the `else` of `importlib.util.find_spec('usbserial4a') != None`. The Android
RNodeInterface needs `usbserial4a` for the serial line and `jnius` for the Android APIs, and
when either is absent it calls `RNS.panic()` **from `__init__`** — so a missing Python package
does not fail the interface, it ends the process. Chaquopy installs `rns` and `lxmf` only, so
every "Start BLE RNode" on this build was a guaranteed abort that took the working interfaces
down with it.

`_missing_rnode_requirements()` now asks first and reports the interface as `unavailable` with
what is missing, instead of declaring it in the config. Not fixed by adding the two packages:
Reticulum is the lowest-priority transport here and an optional adapter by design (AR-12), and
pulling in two more native-adjacent dependencies on the chance they compile under Chaquopy
trades a clear "no radio support in this build" for a probable build break.

The runtime has always returned a per-interface `{kind, state, detail}` report and the screen
rendered none of it, which is why "Start BLE RNode" looked like it did nothing. It is now
shown, so a build without radio support says so instead of requiring a traceback to discover.

### 2. Chat history existed only while the network did

`loadSignalMessages` decrypts on every read and had no cache, so with the node unreachable it
returned nothing — in an app whose entire premise is that the network is what fails. Worse,
`threads` was derived from `sessions`, which come from the node, so the chat LIST was empty
offline even though this device held the plaintext of everything it had sent and had queued
messages in the outbox with nowhere to appear.

- `cacheSignalMessages` / `loadCachedSignalMessages` persist the decrypted history and are the
  fallback when the read fails. The plaintext is already on the device the moment it is
  decrypted, so writing it down changes nothing about who can read it. The write MERGES rather
  than overwrites: the node returns the last 100, and replacing would shrink the cache every
  time the network worked — the opposite of its purpose.
- `threads` now also derives conversations from local outgoing records, so a chat exists
  because we wrote in it, with no session from the node at all.

**Lesson (L-…):** "offline is the default assumption" was satisfied one layer too low. The
inbox had a cache and the messages did not, and the list that indexes both was built from the
server's model — so two of three layers being offline-capable still produced an empty screen.
A cache is only load-bearing if everything between it and the pixels is too.

**Verified:** frontend 38 suites / 209 tests; `tsc --noEmit` clean; `pnpm lint` 0 errors.

**Not claimed:** RNS still has not reached `running`. The RNode path is now correctly reported
as unsupported rather than fatal; whether plain "Start RNS" (AutoInterface) comes up has not
been observed, and it cannot carry traffic between the two devices until they share a subnet.
