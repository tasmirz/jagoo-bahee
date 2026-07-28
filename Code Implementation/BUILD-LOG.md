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

<!-- Append new entries above this line, newest last within each phase section. -->

## P1 — Core Node & Forum Plane

*(not started)*

## P2 — Federation ★ PRIMARY

*(not started)*
