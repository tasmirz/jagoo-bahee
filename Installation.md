# Installation

End-to-end setup for **Jagoo Bahee v2** — a federated, censorship-resistant community platform.

This document takes you from a clean machine to a running node, a running app, two federating
nodes, and the optional resilience transports (Tor, ISP bridging, LoRa/Reticulum). Every command
here is run from the **repository root** unless stated otherwise.

Pick the path that matches what you need:

| I want to…                                          | Go to                                     | Needs Docker |
| --------------------------------------------------- | ----------------------------------------- | ------------ |
| Prove the whole system works in ~2 minutes          | [§2 Quick start](#2-quick-start-no-docker) | no           |
| Develop with data that survives a restart            | [§4 Durable local stack](#4-durable-local-stack)  | yes  |
| Run the mobile app against my node                   | [§5 Frontend](#5-frontend--the-expo-client) | no          |
| See federation actually work                         | [§7 Two nodes](#7-two-federating-nodes)   | yes          |
| Exercise the blackout / ISP-island path              | [§8 ISP harness](#8-isp-island-and-bridging-harness) | yes |
| Publish my node past a national firewall             | [§9 Tor](#9-publishing-a-node-over-tor)   | no           |
| Run the LoRa / packet-radio relay                    | [§10 Reticulum](#10-reticulum--lora-relay-optional) | no |

---

## 1. Prerequisites

### 1.1 Required for everything

| Tool        | Version    | Check                | Notes                                              |
| ----------- | ---------- | -------------------- | -------------------------------------------------- |
| **Node.js** | ≥ 20.11.0  | `node -v`            | Enforced by the root `engines` field                |
| **pnpm**    | ≥ 9 (9.15.4 pinned) | `pnpm -v`   | `corepack enable && corepack prepare pnpm@9.15.4 --activate` |
| **git**     | any        | `git --version`      |                                                     |

The repo is a **pnpm workspace** with `node-linker=hoisted` (see `.npmrc`). That is not a style
choice — Metro, the React Native bundler, cannot resolve symlinked pnpm stores. Do not switch it
to the default isolated linker.

### 1.2 Required to run the cross-language gate

The project's highest-value CI gate compares three independent implementations of canonical
encoding byte-for-byte. Running it needs all three toolchains:

| Tool       | Version | Install                                                                    |
| ---------- | ------- | -------------------------------------------------------------------------- |
| **Rust**   | stable  | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh -s -- -y --profile minimal --no-modify-path`, then add `~/.cargo/bin` to `PATH` |
| **Python** | ≥ 3.12  | plus `pip install pytest`                                                   |

> **Do not "temporarily" cut the vector gate down to two languages** if `cargo` is missing.
> Install Rust. A two-language agreement proves nothing about the third.

### 1.3 Required for the durable stack

**Docker Desktop** (or Docker Engine + Compose v2). Verify with `docker compose version`.

### 1.4 Optional

| Tool                 | For                                            |
| -------------------- | ---------------------------------------------- |
| `just`               | Convenience recipes (`justfile`); everything has a `pnpm` equivalent |
| Android Studio + SDK + **NDK 26.1.10909125** | Native Android crypto & Reticulum modules |
| Xcode                | Native iOS builds (macOS only)                 |
| `buf`                | Vendored as a dev dependency — no separate install |
| `bore`               | `just publish-all`, exposing a local node over a tunnel |
| Tor                  | Installed automatically by `ops/tor/setup-*` scripts |

---

## 2. Quick start (no Docker)

The fastest proof that the system is intact. It uses in-memory adapters, so it needs no database
at all.

```bash
git clone <repo-url> jagoo-bahee
cd jagoo-bahee
pnpm install --frozen-lockfile
pnpm smoke:local
```

`smoke:local` performs a complete signed round trip with zero infrastructure: it certifies a key,
authenticates, acquires a blind credential, creates a community, publishes a signed post, then
reads back its projection and its inclusion proof. If that passes, your toolchain is correct.

Then start a node:

```bash
pnpm dev:backend           # NestJS on http://127.0.0.1:3000, watch mode
```

In a second terminal, add realistic signed demo data:

```bash
pnpm seed:demo -- --url=http://127.0.0.1:3000
```

Check what you got:

```bash
curl http://127.0.0.1:3000/health/ready
```

```jsonc
// {"checks":{"database":"in-memory", ...}}   ← heap only; data dies with the process
// {"checks":{"database":"mongo",     ...}}   ← durable (see §4)
```

**The in-memory node is intentionally ephemeral.** It reports `ready`, serves every route, and
loses every community, post and Merkle head on restart. That is correct behaviour for the
dependency-free path, and it is the single most common source of "my data disappeared" — see §4.

---

## 3. Full workspace build

```bash
pnpm install --frozen-lockfile   # workspace install
pnpm proto:gen                   # regenerate TS / Rust / Python bindings from proto/
pnpm build                       # turborepo task graph: sdk → backend → audit-log → frontend
```

Or, with `just`:

```bash
just setup                       # install (node + rust + python + docker images) → proto-gen → build
```

### 3.1 Why `@jagoo/sdk` must be built first

`packages/sdk-ts` ships a **dual build** and every consumer resolves it differently:

| Consumer                      | Resolves via             | Gets       |
| ----------------------------- | ------------------------ | ---------- |
| `backend/` (NestJS, CommonJS) | `require` condition      | `dist/cjs` |
| `frontend/` (Expo, Metro)     | `react-native` condition | `dist/esm` |
| `pnpm vectors` (plain node)   | `import` condition       | `dist/esm` |

Metro **cannot bundle the sdk's TypeScript source** (it does not remap TS-ESM `./x.js` specifiers
to `./x.ts`), which is why `dev` depends on `^build`. If you are actively editing the sdk, run a
watcher alongside your dev server:

```bash
pnpm --filter @jagoo/sdk exec tsc -w
```

If you ever see `Unexpected token 'export'` at require time from the backend, the nested
`dist/cjs/package.json` type marker is missing — rebuild the sdk rather than editing the exports
map.

---

## 4. Durable local stack

Two ways to get persistence. Choose one.

### 4.1 Everything in Docker (simplest)

```bash
pnpm local:up                      # node + audit-log + mongo(rs0) + redis + minio, built & waited on
curl http://localhost:3000/health/ready
pnpm seed:demo -- --url=http://127.0.0.1:3000
pnpm local:logs                    # follow
pnpm local:down                    # stop
```

Ports: node `3000`, independent audit log `3100`, Mongo `27017`, Redis `6379`, MinIO `9000`
(console `9001`).

### 4.2 Infrastructure in Docker, node on the host (best for development)

```bash
pnpm ops:up                        # mongo (single-node replica set) + redis + minio only
```

Then create `backend/.env` — **this step is not optional if you want durability**:

```bash
cp backend/.env.example backend/.env
pnpm --filter @jagoo/backend secrets:generate   # paste the four values into backend/.env
pnpm dev:backend
```

Confirm you are actually on Mongo:

```bash
curl http://127.0.0.1:3000/health/ready
# expect: {"checks":{"database":"ok"|"mongo","cache":"ok","blob":"s3","witness":"ok"}}
```

#### Two traps that will otherwise cost you an hour

**`?directConnection=true` is mandatory from the host.** `mongo-init` initiates the replica set
with member host `mongo:27017`, which only resolves inside the Compose network. With
`?replicaSet=rs0` the driver discards your seed in favour of that advertised name, cannot resolve
it, and **server selection hangs with no error at all** — the caller just stops. Transactions are
unaffected; the server is a replica-set member however the client reached it.

```
MONGO_URL=mongodb://127.0.0.1:27017/jagoo?directConnection=true
```

**Setting `MONGO_URL` makes `NODE_SIGNING_SEED` mandatory.** The node refuses to boot without it,
correctly: a durable node that regenerates its identity on every start signs a Merkle log it can
no longer be shown to have signed. `AUTH_ACCESS_SECRET` / `AUTH_REFRESH_SECRET` are technically
optional, but leaving them unset means a fresh random HMAC key per boot, so every session dies on
restart — which presents to a user as *exactly the same symptom as data loss*. Pin them.

### 4.3 Environment reference

`backend/.env` is gitignored and loaded by `backend/src/composition/load-env.ts`, which resolves
relative to `__dirname`, not `process.cwd()` — so it works no matter where the process was
launched from. **Real environment variables always win over the file**, so Docker Compose, CI and
the two-node harness are unaffected by your local `.env`.

| Variable                                    | Purpose                                                    |
| ------------------------------------------- | ---------------------------------------------------------- |
| `MONGO_URL`, `MONGO_DB`                     | Replica-set connection and database                        |
| `REDIS_URL`                                 | Credits, nullifiers, auth revocation, tagged cache         |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`     | S3/MinIO object storage                                    |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`            | Object-store credentials                                   |
| `S3_PUBLIC_ENDPOINT`                        | Host used **only** for presigning, when clients reach MinIO at a different address |
| `BLOB_FILESYSTEM_ROOT`                      | Absolute local-blob path used instead of S3                |
| `PUBLIC_BASE_URL`                           | Public node URL embedded in filesystem upload links        |
| `NODE_SIGNING_SEED`                         | Base64 32-byte persistent node identity — **required with `MONGO_URL`** |
| `POW_SECRET`                                | Base64 32-byte stateless challenge key                     |
| `AUTH_ACCESS_SECRET`, `AUTH_REFRESH_SECRET` | Distinct base64 token keys                                 |
| `CREDENTIAL_RSA_JWK`                        | Base64 JSON private RSA JWK for blind credentials          |
| `TRUSTED_PROXY_HOPS`                        | Trusted rightmost proxy count; `0` ignores `X-Forwarded-For`|
| `REQUEST_LIMIT_PER_MINUTE`                  | Per-address request ceiling; default `300`                 |
| `REGISTRATIONS_OPEN`                        | Initial new-identity policy; default `true`                |
| `ADMIN_KEYS`                                | Comma-separated `jbk1…` IDs or hex keys for operators      |
| `CORS_ORIGINS`                              | Browser origins; native clients unaffected                 |
| `NODE_LOCAL_URLS`                           | LAN addresses advertised by `GET /health`                  |
| `AUDIT_LOG_SERVICES`, `MCAPTCHA_SERVICES`, `FEDERATION_SERVICES` | Auxiliary service addresses advertised to clients |
| `PORT`                                      | HTTP port; default `3000`                                  |

Federation variables are in §7.2. Generate the cryptographic values with:

```bash
pnpm --filter @jagoo/backend secrets:generate
```

Never reuse the placeholder values in `.env.example` or the demo credentials embedded in
`ops/docker-compose.yml`.

### 4.4 Rebuilding projections

Projections are **derived state**. Only the envelope store is backup-critical. If a projection is
suspect, drop it and rebuild from the envelope log:

```bash
pnpm --filter @jagoo/backend rebuild-projections
```

The rebuild must be byte-identical. If it is not, that is a defect in a domain handler, never a
reason to start backing up projections.

---

## 5. Frontend — the Expo client

```bash
cp frontend/.env.example frontend/.env      # optional; the app can be pointed at a node at runtime
pnpm dev:frontend                           # expo start --dev-client
```

**Use a development client, not Expo Go.** The app contains local native modules
(`frontend/modules/jagoo-crypto`, `frontend/modules/jagoo-rns`) that Expo Go cannot load. In Expo
Go you get a JavaScript crypto fallback — that is expected, and it is *not* evidence of native
execution.

Build and install a development client:

```bash
pnpm --filter @jagoo/frontend android      # or: just android
pnpm --filter @jagoo/frontend ios          # macOS + Xcode only
```

`just android` additionally repairs a half-downloaded NDK: React Native 0.76 pins
**NDK 26.1.10909125**, and a partial SDK download leaves the directory present without
`source.properties`, which fails Gradle evaluation with a confusing message.

### 5.1 Pointing the app at your node

On first run the app asks for a home server and stores it on-device. Enter the address shown by
`GET /health`:

| Client                | Address                                       |
| --------------------- | --------------------------------------------- |
| Android emulator      | `http://10.0.2.2:3000`                        |
| iOS simulator         | `http://127.0.0.1:3000`                       |
| Physical phone on LAN | `http://192.168.x.y:3000` (your machine's LAN IP) |
| Over Tor              | the `http://….onion` URL from §9              |

Or pre-seed it for development in `frontend/.env`:

```
EXPO_PUBLIC_NODE_URL=http://10.0.2.2:3000
# EXPO_PUBLIC_TOR_NODE_URL=http://….onion
# EXPO_PUBLIC_NODE_TRANSPORT=tor
```

The app then discovers the audit-log, mCaptcha and blob endpoints from `/health`, and keeps signed
acknowledgement certificates for every envelope it submits. Discovery can be overridden manually
in **Network & services** — manual overrides win over discovery and persist.

### 5.2 Exposing a local node to a physical phone

If the phone is not on your LAN, tunnel **all four services**, not just the node:

```bash
just publish-all              # 3000/3100/7000/9000 → bore.pub:41800..41803
just publish-all 52000        # move the whole block if one of those ports is taken
```

The recipe writes `ops/service-map.json` from the same arithmetic that opens the tunnels, prints
the `S3_PUBLIC_ENDPOINT` value to set, and prints the home-server address to type into the app.

Two things it is working around:

**Publishing only `:3000` makes the app look broken.** The node is reachable, so discovery
succeeds, but every address it advertises for the auxiliary services points at `127.0.0.1` —
which, evaluated on a phone, is the phone.

**The remote ports are deliberately not the local ones.** `bore.pub` is a shared public relay and
`3000` / `9000` are among the most contended ports on it. Requesting them usually fails, and it
fails **per tunnel** — the normal outcome is three services up, one refused, and a client that
misbehaves in a way with no obvious connection to the port that was denied. An uncommon contiguous
block makes all four succeed or fail together. The node has always supported an arbitrary
`localPort → publicPort` map; equal ports were only ever a convenience of the example file.

**Uploads additionally need `S3_PUBLIC_ENDPOINT` set to whatever the blob port maps to** — e.g.
`http://bore.pub:41803` — in `backend/.env`, **and the node restarted**. SigV4 signs the host, so
a presigned URL is only valid for the host it was signed for and the client cannot repair it.

`ops/service-map.json` is gitignored and regenerated by the recipe. Hand-edit it (from
`ops/service-map.json.example`) only for a fixed deployment — a real DNS name or a router
port-forward — where no tunnel is involved.

### 5.3 Native crypto parity (Android)

Android uses a synchronous local Expo module for primitives; Node, iOS, tests and vectors use the
portable JS backend. Both must produce identical results, asserted by the on-device parity suite
(`frontend/src/crypto/parity.test.ts`). Install the development client before expecting native
execution.

---

## 6. Verifying the installation

```bash
pnpm lint            # includes import-boundary rules (core purity, signer boundary)
pnpm typecheck
pnpm test            # every workspace
pnpm build
pnpm proto:lint
pnpm proto:check     # regenerate and diff — fails on hand-edited generated code
pnpm vectors         # ★ TS ≡ Rust ≡ Python, byte-identical
pnpm smoke:local
```

See **[Testing.md](Testing.md)** for what each of these actually proves and how to run a single
test.

---

## 7. Two federating nodes

Federation is the project's primary goal. This brings up two genuinely independent nodes with
separate databases.

### 7.1 The prebuilt harness

```bash
pnpm ops:two-node
```

| Node   | HTTP   | Federation gRPC | Database    |
| ------ | ------ | --------------- | ----------- |
| node-a | `:3001` | `:8451`        | independent |
| node-b | `:3002` | `:8452`        | independent |

```bash
curl http://localhost:3001/v1/federation/peers      # each lists the other, by public key
curl http://localhost:3001/v1/federation/sth        # signed tree head
curl http://localhost:3001/v1/federation/alerts     # transparency findings
pnpm ops:two-node:down
```

A post published on one appears — re-verified and re-projected, never trusted — on the other
within a drain interval. Stop node-b, publish more, start it again: `Backfill` closes the gap from
a durable cursor.

### 7.2 Configuring federation on your own node

**Federation is off unless configured.** A node with none of these set behaves exactly as a single
instance.

| Variable                        | Purpose                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| `FEDERATION_GRPC_LISTEN`        | `host:port` for the inbound gRPC server. **Omit for outbound-only.**     |
| `FEDERATION_ENDPOINTS`          | `SCOPE=uri`, comma separated — this node's own addresses, one per scope  |
| `FEDERATION_PEERS`              | `base64key@SCOPE=uri[;SCOPE=uri][#TRUST]`, comma separated               |
| `FEDERATION_OUTBOUND_ONLY`      | `true` to advertise nothing even with a listen address                   |
| `FEDERATION_DRAIN_INTERVAL_MS`  | Outbox drain cadence; default `1000`                                     |
| `FEDERATION_GOSSIP_INTERVAL_MS` | STH gossip and directory exchange cadence; default `300000`              |

Three things to know before you configure it:

- **A peer is its KEY, never its URL.** The address is mutable metadata; a peer that changes domain
  keeps its identity, its history and its trust. Get a peer's key from its
  `GET /.well-known/jagoo-bahee` (`serverKey`, base64).
- **Scope is declared, never guessed.** List *every* scope you are reachable on, not just the
  public one — that is how a client on the same ISP learns your ISP-local address *before* the
  gateway drops.
- **Outbound-only is the default for a home or community node, and is not degraded.** With no
  `FEDERATION_GRPC_LISTEN` the node binds no port and advertises no address, yet federates fully in
  both directions: `Deliver` is client-streaming and `StreamActivities` is caller-initiated, so
  both run over connections the node itself opened. No port forwarding, no UPnP.

`#TRUST` is an operator override honoured above every derived rule. Leave it off in normal
operation — new peers are admitted by TOFU at `PROBATION` and earn reach through vouches or seven
clean days.

---

## 8. ISP-island and bridging harness

Simulates a national-blackout topology: two isolated ISP islands and one multi-homed bridge node.

```bash
pnpm ops:isp            # jb-a1, jb-a2 (island A) · jb-b1 (island B) · jb-bridge (both)
pnpm gate:isp           # drives the TG-01…TG-06 container gate
pnpm ops:isp:logs
pnpm ops:isp:down
```

```
   network: isp-a (internal, asn 64501)      network: isp-b (internal, asn 64502)
   ┌───────────────────────┐                 ┌───────────────────────┐
   │  node-a1     node-a2  │                 │        node-b1        │
   └───────────┬───────────┘                 └───────────┬───────────┘
               │                                         │
               └───────────────┐         ┌───────────────┘
                               ▼         ▼
                        ┌────────────────────────┐
                        │  jb-bridge             │
                        │  eth0 → isp-a (64501)  │
                        │  eth1 → isp-b (64502)  │
                        └────────────────────────┘
```

The island networks are `internal: true`, so Docker publishes **no host ports** for them. Every
request in the gate is therefore issued *inside* the topology via `docker exec` against the node's
own loopback. That is deliberate: adding a management network would fix the symptom and destroy
the premise — the nodes would regain egress and a route to each other, so cutting the exchange
would no longer isolate anything.

Cutting the exchange is `docker network disconnect`. No privileged containers, no host network
changes, no physical multi-ISP setup.

---

## 9. Publishing a node over Tor

With the backend listening on `127.0.0.1:3000` and `GET /health` responding:

```bash
sudo bash ops/tor/setup-linux.sh                    # or: pnpm tor:linux
```

```powershell
pnpm tor:windows                                    # elevated PowerShell
```

The scripts are idempotent. They install Tor with the detected package manager, write a drop-in
config, restart the service, and print the `http://….onion` address. Options:

```bash
sudo bash ops/tor/setup-linux.sh --backend-port 3000 --virtual-port 80
```

```powershell
.\ops\tor\setup-windows.ps1 -TorExe C:\Tor\tor.exe -BackendPort 3000
```

Enter the printed onion URL in the app and select **Embedded Tor**. Tor provides end-to-end onion
authentication and encryption, so no public TLS proxy is needed. Key backup and custom ports are
in [ops/tor/README.md](ops/tor/README.md).

---

## 10. Reticulum / LoRa relay (optional)

The Reticulum adapter is an **optional transport behind a port**. The system ships complete with it
absent from the build — never make it a dependency.

The Python sidecar owns all RNS imports and radio state; the Nest process talks to it over a local
bridge and starts with Reticulum **disabled**. A missing or crashed relay degrades only that
transport and cannot affect ingress, federation, or HTTP.

```bash
cd services/relay
pip install -e .          # or: pip install -r requirements as declared in pyproject.toml
python -m jagoo_relay.daemon --help
```

Run its tests from the root:

```bash
pnpm test:relay           # python -m pytest services/relay -q
```

Node-side status is at `GET /v1/admin/reticulum`. Hardware configuration (RNode, TCPInterface,
LoRa parameters) is in
[Code Implementation/RETICULUM-RNODE-GUIDE.md](Code%20Implementation/RETICULUM-RNODE-GUIDE.md).

---

## 11. `just` shortcuts

`just` wraps the common flows and works on Linux, macOS and Windows PowerShell.

```bash
just                # list every recipe
just setup          # install (node/rust/python/docker) → proto-gen → build
just dev            # ops-up, backend in background, frontend interactive
just logs           # follow the background backend log
just ps             # background process + docker status
just kill           # stop backend and infrastructure
just check          # lint · typecheck · test · proto-check · vectors
just reset          # wipe volumes, clean artefacts, reinstall  (destructive)
just android        # repair NDK if needed, then expo run:android
just publish-all    # tunnel all four services; writes ops/service-map.json
just publish-all 52000   # same, on a different remote port block
```

---

## 12. Troubleshooting

| Symptom                                                              | Cause and fix                                                                                                   |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| "My communities and posts disappear on restart"                       | The node is on in-memory adapters. Check `/health/ready`; create `backend/.env` per §4.2.                        |
| Backend hangs on startup with no error, Mongo is clearly running      | `MONGO_URL` uses `?replicaSet=rs0` from the host. Use `?directConnection=true`.                                  |
| "Every login is invalidated after I restart the backend"              | `AUTH_ACCESS_SECRET` / `AUTH_REFRESH_SECRET` unset → fresh random key per boot. Pin them.                        |
| Node refuses to boot after setting `MONGO_URL`                        | `NODE_SIGNING_SEED` missing. This refusal is correct. Run `secrets:generate`.                                    |
| `Unexpected token 'export'` from the backend at require time          | sdk `dist/cjs/package.json` type marker missing → `pnpm --filter @jagoo/sdk build`.                              |
| Metro cannot resolve `@jagoo/sdk`                                     | sdk not built. Metro bundles `dist/esm`, never the TS source. Build it, or run `tsc -w`.                         |
| Metro resolves the wrong sdk build                                    | The `react-native` condition must stay **first** in each `exports` entry — condition order is priority order.    |
| `pnpm vectors` fails with "cargo: command not found"                  | Install Rust (§1.2). Do not reduce the gate to two languages.                                                    |
| Native crypto falls back to JS on Android                             | You are in Expo Go. Build the development client (§5).                                                           |
| Gradle fails evaluating the NDK                                       | Partial NDK download. `just android` repairs `ndk;26.1.10909125` automatically.                                  |
| `expo export` fails                                                   | The client exports native platforms only: `expo export --platform ios --platform android`. Web is not a target.  |
| App reachable over a tunnel but uploads/audit fail                    | Only `:3000` was tunnelled. Use `just publish-all` and set `S3_PUBLIC_ENDPOINT` (§5.2).                          |
| `bore` exits with "port already in use" / the relay refuses a port    | That remote port is taken on the shared relay. Move the whole block: `just publish-all 52000`. Never request `3000`/`9000` on `bore.pub`. |
| Some services work over the tunnel and one does not                   | A per-tunnel port refusal. Check every `bore` line started; `just publish-all` keeps the four ports contiguous so they succeed or fail together. |
| Uploads fail with `SignatureDoesNotMatch` over a tunnel               | `S3_PUBLIC_ENDPOINT` missing, stale, or not matching the blob port in `ops/service-map.json` — and it needs a node **restart** to take effect. |
| `bore.pub:12001:9000` appears as a service address                    | Fastify's `request.hostname` may include a port; already stripped in discovery — regenerate `ops/service-map.json`. |
| Mongo/Redis integration tests silently skip                           | They gate on `MONGO_URL`/`REDIS_URL`. Export them, plus `JB_REQUIRE_INTEGRATION=1` to make a typo fail loudly.   |

---

## 13. Where to read next

| Question                          | Document                                                       |
| --------------------------------- | -------------------------------------------------------------- |
| What does each test prove?        | [Testing.md](Testing.md)                                       |
| How does the whole system work?   | [README.md](README.md)                                         |
| Node operations and production    | [ops/README.md](ops/README.md)                                 |
| Frozen contracts                  | `Plans/00`–`Plans/13`                                          |
| What was built and why            | `Code Implementation/BUILD-LOG.md`, `Code Implementation/ADR-*`|
