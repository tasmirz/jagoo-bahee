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

_(not started)_
