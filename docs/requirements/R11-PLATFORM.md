# R11 — Platform & Infrastructure

## 1. Node runtime

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| INF-01 | Health live / ready endpoints | ✓ | P1 |
| INF-02 | Redis caching with **tagged-key** invalidation | ✗ (keyspace SCAN per write) | P1 |
| INF-03 | Redis-backed distributed rate limiting via atomic Lua | ✗ | P1 |
| INF-04 | Horizontal scaling behind a load balancer | ✓ | P1 |
| INF-05 | Docker Compose dev and scale profiles | ✓ | P1 |
| INF-06 | Seed script for demo data | ✓ | P1 |
| INF-07 | OpenAPI export for read endpoints; generated proto docs for the write path | ✓ | P1 |
| INF-08 | CSP, HSTS, and security headers | ✓ | P1 |
| INF-09 | Graceful shutdown draining in-flight streams | — | P2 |
| INF-10 | Local-filesystem blob adapter for small deployments | — | P1 |

### INF-02 rationale

v1 called `delPattern` (a full Redis `SCAN`) on **every** post and comment write. Invalidation cost grew with total keyspace size — a self-inflicted load amplifier that gets worse exactly as the instance gets busier. Tagged keys make invalidation O(tags), independent of keyspace.

## 2. Web client

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| INF-11 | Progressive web app with manifest and installability | ✓ | P1 |
| INF-12 | Service worker with offline shell | ✓ | P1 |
| INF-13 | Service worker background sync that **actually syncs** | ✗ (empty stubs) | P5 |
| INF-14 | IndexedDB cache: profiles, verifications, receipts, peer directory, outbox | ✓ partial | P1 / P3 / P5 |
| INF-15 | Bloom filter utility, **used for mesh reconciliation** | ✓ unused | P5 |
| INF-16 | Error boundary and loading skeletons | ✓ | P1 |
| INF-17 | Dark / light theme toggle | ✓ | P1 |
| INF-18 | **Static export build target** | ✗ | P1 |
| INF-19 | Real-time updates via SSE | ✗ (no-op stub) | P1 |
| INF-20 | Separate SSE stream per plane | — | P4 |
| INF-21 | Single crypto module in the bundle | ✗ (four overlapping libs) | P1 |
| INF-22 | Signer in a dedicated worker, one per plane | ✗ | P1 / P4 |

### INF-18 rationale

`NEXT_PUBLIC_API_URL` was baked at build time and the app required its Next.js origin to be reachable. One blocked domain killed everything — the exact failure this project exists to prevent. A static export can be served from IPFS, a mirror, a USB stick, or a peer's laptop, and picks its homeserver at runtime.

## 3. Native client

| ID | Requirement | Phase |
|---|---|---|
| INF-23 | Native app shell wrapping the web client | P5 |
| INF-24 | Platform keystore for key material (Secure Enclave / Android Keystore) | P5 |
| INF-25 | Background mesh discovery and relay | P5 |
| INF-26 | Real BLE carrier | P5 |
| INF-27 | Native alert channel for emergency broadcasts | P5 |
| INF-28 | Battery-aware scheduling | P5 |

## 4. Sidecar services

Each is a separate process behind a port, independently deployable and independently omittable.

| ID | Service | Port | Default when absent | Phase |
|---|---|---|---|---|
| INF-29 | **Labeller** — LLM content labelling | `LabelProvider` | `NullLabeller`, publishing unaffected | P1 |
| INF-30 | **Witness** — remote Merkle transparency log | `WitnessLog` | in-process `LocalMerkleLog` | P1 |
| INF-31 | **Reticulum bridge** — Python RNS daemon | `Transport` | transport unregistered | P6 |

**INF-32:** Every sidecar MUST have a null or in-process default so the node runs with all of them disabled (`AR-12`).

## 5. Build & tooling

| ID | Requirement | Phase |
|---|---|---|
| INF-33 | `proto/` is the single source of truth; TS, Rust, and Python bindings are generated | P0 |
| INF-34 | Regenerate-and-diff CI check catches hand-edited generated code | P0 |
| INF-35 | Cross-language canonical-encoding vector test as a **blocking** CI gate | P0 |
| INF-36 | Import-boundary lint enforcing the hexagonal dependency rule | P0 |
| INF-37 | Bundle-size gate in CI (`NFR-F01`) | P1 |
| INF-38 | WASM-size gate in CI (`NFR-F02`) | P1 |
| INF-39 | Network-namespace test harness for ISP simulation | P3 |
| INF-40 | Two-node federation integration harness | P2 |
| INF-41 | Raspberry Pi 4 acceptance run | P1 onward |
| INF-42 | Dependency audit and SBOM generation | continuous |

## 6. Data stores

| Store | Purpose | Backup-critical |
|---|---|---|
| **Envelope store** | Every accepted envelope, raw bytes plus parsed index | **Yes — the only one** |
| **Merkle log** | Leaf hashes, tree nodes, STH history | Yes |
| Projections | Derived read model | No — rebuildable |
| Redis | Rate limits, credits, nullifiers, cache | No — ephemeral |
| Blob store | Attachment bytes | Yes (or accept loss with placeholders, `ATT-19`) |
| Peer directory | Peer records with scopes | Recommended — pre-positioning matters |

**INF-43:** The envelope store MUST support efficient range iteration by log index; this is what `Backfill` and `rebuild-projections` both depend on.
**INF-44:** Projections MUST be droppable and rebuildable without downtime for reads served from a replica.

## 7. Frontend route inventory

All 42 v1 routes are preserved (`INF-45`). Grouped:

| Group | Routes |
|---|---|
| Core | `/`, `/auth`, `/search`, `/settings`, `/settings/profile`, `/settings/comments` |
| Content | `/posts/create`, `/posts/[id]`, `/posts/[id]/edit`, `/p/[id]` |
| Communities | `/subreddits`, `/subreddits/create`, `/subreddits/list`, `/r/[name]`, `/r/[name]/create`, `/r/[name]/settings`, `/r/[name]/members`, `/r/[name]/modlog`, `/r/[name]/reports`, `/r/[name]/stats` |
| Moderation | `/r/[name]/mod`, `/mod/queue`, `/mod/members`, `/mod/moderators`, `/mod/banned`, `/mod/roles`, `/mod/settings` |
| Identity | `/profile`, `/users/[username]`, `/u/[publicKey]` |
| Social | `/saved`, `/awards`, `/notifications`, `/messages`, `/messages/new`, `/messages/[conversationId]` |
| Audit | `/audit`, `/audit/verify`, `/acknowledgements` |
| Admin | `/admin` |
| Offline | `/offline` |

New in v2 (`INF-46`):

| Group | Routes |
|---|---|
| Signal | `/channels`, `/channels/[id]`, `/channels/create`, `/channels/[id]/verify`, `/broadcasts`, `/broadcasts/[id]`, `/alerts` |
| Crisis | `/checkin`, `/missing`, `/missing/report`, `/resources`, `/map` |
| Network | `/network` (scope, peers, transports, uplinks) |
| Outbox | `/outbox` (pending envelopes and their delivery state) |
