# Jagoo Bahee

Jagoo Bahee is a federated, censorship-resistant community platform designed to keep useful
Forum functions available on constrained or absent networks.

## Run and test without infrastructure

Requirements: Node.js 20+ and pnpm 9.

```powershell
pnpm install --frozen-lockfile
pnpm smoke:local
pnpm dev:backend
```

In another terminal, add realistic signed demo data and start the app:

```powershell
pnpm seed:demo -- --url=http://127.0.0.1:3000
Copy-Item frontend/.env.example frontend/.env
pnpm dev:frontend
```

On first run, enter the node address shown by `GET /health` (for example,
`192.168.1.20:3000`). The app stores it on-device, discovers audit-log and mCaptcha
endpoints, and keeps signed acknowledgement certificates for every submitted envelope.

The dependency-free node uses in-memory adapters and is intentionally ephemeral. `smoke:local`
automates the complete certificate, authentication, blind credential, community, signed post,
receipt, and feed round trip.

## Run the durable local stack

With Docker Desktop available:

```powershell
pnpm local:up
Invoke-RestMethod http://localhost:3000/health/ready
pnpm seed:demo -- --url=http://127.0.0.1:3000
```

`local:up` builds and starts the backend plus an independent append-only audit log, with a
transaction-capable MongoDB replica set, Redis, and MinIO. The credentials in Compose are
development-only. Use `pnpm local:logs` to
inspect the node and `pnpm local:down` to stop it. For a physical phone, change
the first-run home-server address to the computer's LAN address.

For host-side backend development, run `pnpm ops:up` and `pnpm dev:backend` separately.

## Repository map

- `services/audit-log/` — independent third-party acknowledgement archive
- `backend/` — NestJS core node and HTTP adapters
- `frontend/` — Expo Router React Native client
- `packages/sdk-ts/` — shared TypeScript contracts, signing, and verification
- `crates/jb-core/` — independent Rust parity implementation
- `proto/` — canonical protobuf contracts
- `tools/` — code generation and cross-language vectors
- `ops/` — Compose and deployment material
- `Plans/`, `Code Implementation/` — requirements, ADRs, audit, and build history

The root manifests are intentional monorepo coordination files. `node_modules/`, `.turbo/`,
`.cache/`, `backend/dist/`, and `frontend/dist/` are generated and ignored; they can be
recreated from the lockfiles.

## Verify

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm proto:check
pnpm vectors
pnpm smoke:local
```

Contributor conventions and PR expectations are in [AGENTS.md](AGENTS.md).
