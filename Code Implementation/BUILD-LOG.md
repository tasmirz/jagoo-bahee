# Build Log

> **Read this first at the start of every session.** Append-only, newest entry at the bottom of each
> phase section. Its purpose is that the same mistake is never made twice.
>
> **Entry format.** Every work block gets one entry. Be specific about failures — a vague "fixed a bug"
> teaches nothing next session. Record the *symptom*, the *root cause*, and the *rule learned*, because
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

| # | Rule | Earned from |
|---|---|---|
| L-01 | Never hand-edit generated code. Fix the generator or the `.proto` and regenerate. | AR-10 — CI regenerates and diffs, so a hand edit fails the build later, not sooner |
| L-02 | A test that asserts against a hardcoded expected hash must have that hash produced by a *different* implementation than the one under test. Otherwise it tests that the code agrees with itself. | The entire point of the cross-language vector gate |
| L-03 | Mongo multi-document transactions require a replica set, even single-node. A standalone `mongod` fails at pipeline step 16/17 with a confusing "Transaction numbers are only allowed on a replica set member" error. | ADR-001 |
| L-04 | `pnpm` + React Native needs `node-linker=hoisted` in `.npmrc`, or Metro fails to resolve symlinked workspace packages. | Monorepo scaffold |
| L-05 | Before adding *any* branch, check whether the registry, a port, or a handler should carry that decision instead. Every domain switch and transport-ID check in this codebase is a defect by definition. | AR-05, NFR-M02, NFR-M03 |
| L-06 | Nest's `createNestApplication()` defaults to Express no matter what `main.ts` uses. On this Fastify-only node that surfaces as a confusing missing-module error — pass `new FastifyAdapter()` explicitly in every spec. | backend skeleton |
| L-07 | `expo export` builds every platform in the project's list by default and will demand `react-native-web`. Constrain it to `--platform ios --platform android`; web is a P5 target (ADR-003 §6), not a missing dependency. | frontend skeleton |
| L-08 | Never exclude specs from the tsconfig the IDE and `typecheck` use — test code then goes unchecked and everything still looks green. Exclude them only in `tsconfig.build.json`. Verify with `tsc --listFiles`. | backend skeleton |
| L-09 | **ESLint flat config does not merge a rule's options across blocks — the last matching block wins outright.** A later, broader block silently erased the AR-01 import restrictions on `core/domain`, so P0-G6 was false while the config looked right. Declare pattern sets once, spread them into every block that applies, most specific LAST. Verify with `eslint --print-config <file>`. | P0-G6 |
| L-10 | A healthcheck must not depend on something that depends on the healthcheck. Gating Mongo's health on `isWritablePrimary` deadlocked against `rs.initiate()`. Health = "is it listening"; readiness guarantees belong on a one-shot init job plus `service_completed_successfully`. | ops stack |
| L-11 | A lint rule, a gate, or a healthcheck that is only *configured* is not verified. Each one here is now exercised by a test that makes it fail on purpose — that is the only way to notice when it stops working. | P0-G6, ops |
| L-12 | **A package-boundary change must be probed from every consumer with a real import.** Node, Metro and Vite use three different resolvers. Fixing the backend left the frontend equally broken, and both failed with a message naming the module rather than the mechanism. The legacy `moduleResolution: "Node"`/Expo default ignores `exports` maps entirely; Metro needs `unstable_enablePackageExports`. | sdk interop |
| L-13 | Never locate a file by counting `../` from `import.meta.url`. It works until the output layout changes depth, then silently reads the wrong path. Walk up to a marker file (`pnpm-workspace.yaml`) instead. | sdk interop |

---

## P0 — Contracts & Skeleton

### 2026-07-29 — Repository grasp, foundation docs, toolchain          [P0]

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

### 2026-07-29 — backend/ and frontend/ workspace skeletons          [P0]

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
- **L-08** — Excluding specs in the *same* tsconfig the IDE and `typecheck` use means test code is never
  type-checked, and the mistake is invisible because everything still passes. Exclude specs only in a
  separate `tsconfig.build.json` that the compiler uses. Confirm coverage with `tsc --listFiles` rather
  than assuming — a green `typecheck` over a file set that omits the file proves nothing.

**Next:** T0.14–T0.17 — the cross-language vector gate. `tools/vectors/run-gate.mjs` does not exist and
`@jagoo/sdk` has no test files, so `pnpm vectors` and root `pnpm test` are both red. Per
`P0-SKELETON-PLAN.md` §8 this is step 6 and blocks the remaining backend work (step 7). Note L-02 when
writing the fixtures: expected bytes must come from a different implementation than the one asserting.

---

### 2026-07-29 — P0 complete: all seven exit gates green          [P0]

**Built:**
- **T0.14 · the cross-language gate.** `tools/vectors/run-gate.mjs` runs the TypeScript,
  Rust and Python dumps over the shared fixture set and diffs them *pairwise* — it never
  trusts `expected.json`, because a committed expectation can be regenerated by a mistake
  whereas three independent implementations agreeing requires the same mistake three times.
  `--update` is manual and never runs in CI (L-02). Added `packages/sdk-ts/src/vectors/`
  (`fixtures.ts`, `dump.ts`) and generated `tools/vectors/expected.json`.
- **T0.15–T0.17 · the three regressions**, in TypeScript (36 tests) and Rust (6 tests),
  alongside the existing Python suite (22 tests). `field-omission.spec.ts` carries the full
  account of the v1 bug and adds a truncation probe — there must be no prefix of the
  canonical bytes that a signature over the full bytes also validates.
- **T0.19 · ports.** Every port from `Plans/07` §2 as an abstract class (DI token *and*
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

**Verified:** `pnpm vectors` → *3 implementations agree on 16 vectors, P0-G1 PASS* ·
`cargo test -p jb-core` 6/6 · `pytest tools/vectors` 22/22 · `pnpm test` 67 (sdk 36,
backend 30, frontend 1) · `lint` 4/4 · `typecheck` 5/5 · `build` 4/4 · `proto:check` in
sync · Mongo `rs0` reaches PRIMARY and a **real two-collection transaction commits**.

**Broke — three latent defects, each found only because something was made to fail on purpose:**
1. **P0-G6 was false.** The import-boundary lint did not fail on `core/domain` importing
   `mongodb`, `@nestjs/common`, or an adapter. Root cause: ESLint flat config *replaces* a
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
  U+09DF YYA are Unicode *composition exclusions*: NFC does not recompose base + nukta, so
  a precomposed `ড়` normalises DOWN to two code points and costs **6 bytes, not 3**. These
  are high-frequency letters. Any class 0–2 size budget (SIG-26: broadcast ≤ 512 B) sized
  at "3 bytes per visible character" under-counts ordinary Bangla — a broadcast that fits
  in the lab and is rejected at construction in the field. TypeScript, Rust and Python all
  agree on 31 / 6 / 3; the behaviour is now asserted in both TS and Python.

**Next:** P1, starting with the validation pipeline steps 1–12 as pure functions (T1.1),
which slot directly onto `accept.ts`. The `@jagoo/sdk` consumption blocker is **resolved** —
see the entry below.

---

### 2026-07-29 — module interop: backend and frontend can both consume `@jagoo/sdk`   [P0]

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
   *also* unresolvable from `frontend/` — Expo's `tsconfig.base` sets the node10 resolver,
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
  probe *every* consumer with a real import before calling it done.

**Next:** unchanged — P1 pipeline steps 1–12 (T1.1). Nothing now blocks the backend from
using `canonicalBytes`/`contentId`.

---

<!-- Append new entries above this line, newest last within each phase section. -->

## P1 — Core Node & Forum Plane

*(not started)*

## P2 — Federation ★ PRIMARY

*(not started)*
