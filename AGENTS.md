# Repository Guidelines

## Project Structure & Module Organization

This pnpm/Turborepo monorepo contains a hexagonal NestJS service in `backend/`: core logic and
ports live in `src/core/`, integrations in `src/adapters/`, and handlers in `src/features/`.
`frontend/` is an Expo Router app with routes in `app/` and reusable modules in `src/`.
TypeScript encoding, crypto, and signing code belongs in `packages/sdk-ts/`; Rust parity code
is in `crates/jb-core/`. Contracts live in `proto/`, cross-language fixtures in
`tools/vectors/`, and architecture decisions in `Plans/` and `Code Implementation/`.

## Build, Test, and Development Commands

- `pnpm install --frozen-lockfile` installs dependencies (Node 20+, pnpm 9).
- `pnpm dev:backend` starts NestJS in watch mode; `pnpm dev:frontend` starts Expo.
- `pnpm build` builds all workspaces.
- `pnpm lint`, `pnpm typecheck`, and `pnpm test` run the primary CI checks.
- `pnpm proto:lint` validates protobufs; `pnpm proto:gen` regenerates bindings; `pnpm proto:check`
  detects generated-code drift.
- `pnpm vectors` verifies byte-identical behavior across TypeScript, Rust, and Python.
- `pnpm smoke:local` exercises a complete signed publish/read flow without infrastructure.
- `pnpm local:up` builds the complete local node stack; `pnpm ops:up` starts dependencies only.

## Coding Style & Naming Conventions

Use UTF-8, LF endings, and spaces: two-space indentation for TypeScript and proto; four spaces
for Rust and Python. Prettier enforces single quotes, semicolons, trailing commas, and a
100-column width. ESLint enforces domain, adapter, and signer import boundaries.
Use kebab-case filenames (`post-create.handler.ts`), PascalCase for types/classes and React
components, and camelCase for functions and variables. Never hand-edit `src/gen/`; change
`proto/` or its registry and regenerate.

## Testing Guidelines

Vitest covers the SDK and backend; Jest covers Expo; Rust and Python use Cargo test and pytest.
Name colocated TypeScript tests `*.spec.ts` or `*.test.ts(x)`, Python tests `test_*.py`, and Rust
integration tests under `crates/*/tests/`. Include regression tests for behavior changes. Before a
PR, run the primary checks, `pnpm proto:check`, and `pnpm vectors`.

## Commit & Pull Request Guidelines

History mixes Conventional Commit subjects (`feat: ...`) with terse phase labels. Prefer an
imperative subject such as `fix: reject unknown envelope domains`. Keep commits focused. PRs
should explain the approach, link the relevant issue or plan, list verification commands, and
include screenshots for UI changes. Call out contract, migration, or security-boundary effects.

## Security & Configuration

Keep secrets and raw private-key material out of commits, logs, and general modules. Key handling
must remain inside `packages/sdk-ts/src/signer/` or `frontend/src/signer/`. Do not weaken CI gates
or import-boundary rules to make a change pass.
