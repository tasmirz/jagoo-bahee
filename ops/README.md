# Node Operations

## Local Infrastructure

Run `pnpm local:up` to build and start the node, independent audit log, single-node Mongo
replica set, Redis, and MinIO. Discover the node and its auxiliary services at
`GET http://localhost:3000/health`, check dependency readiness at
`GET http://localhost:3000/health/ready`, inspect logs with
`pnpm local:logs`, and stop the stack with `pnpm local:down`.

For host-side development, `pnpm ops:up` starts only infrastructure and
`pnpm dev:backend` starts the node. Run `pnpm dev:audit-log` in another terminal when testing
client-side proof forwarding. Local development may omit infrastructure URLs and use
deterministic in-memory adapters. Production deliberately refuses those fallbacks.
Run `pnpm smoke:local` for an automated dependency-free signed round trip. With any node
running on port 3000, `pnpm seed:demo -- --url=http://127.0.0.1:3000` creates a certified
identity, a `welcome` community, and a signed post that appears in `/v1/feed`.

## Production Configuration

Set `NODE_ENV=production` and provide:

| Variable                                    | Purpose                                                |
| ------------------------------------------- | ------------------------------------------------------ |
| `MONGO_URL`, `MONGO_DB`                     | Replica-set connection and database                    |
| `REDIS_URL`                                 | Credits, nullifiers, auth revocation, and tagged cache |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`     | S3/MinIO object storage                                |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`            | Object-store credentials                               |
| `BLOB_FILESYSTEM_ROOT`                     | Absolute local-blob path used instead of S3            |
| `PUBLIC_BASE_URL`                          | Public node URL used in filesystem upload links        |
| `NODE_SIGNING_SEED`                         | Base64 32-byte persistent node identity                |
| `POW_SECRET`                                | Base64 32-byte stateless challenge key                 |
| `AUTH_ACCESS_SECRET`, `AUTH_REFRESH_SECRET` | Distinct base64 token keys                             |
| `CREDENTIAL_RSA_JWK`                        | Base64 JSON private RSA JWK for blind credentials      |
| `TRUSTED_PROXY_HOPS`                        | Trusted rightmost proxy count; `0` ignores XFF         |
| `REQUEST_LIMIT_PER_MINUTE`                  | Per-address request ceiling; defaults to `300`         |
| `REGISTRATIONS_OPEN`                       | Initial new-identity policy; defaults to `true`        |
| `ADMIN_KEYS`                               | Comma-separated `jbk1...` IDs or hex keys for operators |
| `CORS_ORIGINS`                             | Comma-separated browser origins; native clients unaffected |
| `NODE_LOCAL_URLS`                          | Comma-separated LAN addresses advertised by `/health`     |
| `AUDIT_LOG_SERVICES`                       | Audit log `host:port` values advertised to clients         |
| `MCAPTCHA_SERVICES`                        | mCaptcha `host:port` values advertised to clients          |
| `FEDERATION_SERVICES`                      | Connected peer endpoints listed by `/federations`          |

### Federation (P2)

Federation is **off unless configured** (AR-12). A node with none of these set behaves exactly as a
single instance.

| Variable                          | Purpose                                                                       |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `FEDERATION_GRPC_LISTEN`          | `host:port` for the inbound gRPC server. **Omit for outbound-only** (FD-12).  |
| `FEDERATION_ENDPOINTS`            | `SCOPE=uri`, comma separated — this node's own addresses, one per scope       |
| `FEDERATION_PEERS`                | `base64key@SCOPE=uri[;SCOPE=uri][#TRUST]`, comma separated                    |
| `FEDERATION_OUTBOUND_ONLY`        | `true` to advertise nothing even with a listen address                        |
| `FEDERATION_DRAIN_INTERVAL_MS`    | Outbox drain cadence; defaults to `1000`                                      |
| `FEDERATION_GOSSIP_INTERVAL_MS`   | STH gossip and directory exchange cadence; defaults to `300000` (FD-08)       |

**A peer is its KEY, never its URL** (FD-02). The address is mutable metadata — a peer that changes
domain keeps its identity, its history and its trust. Get a peer's key from its
`GET /.well-known/jagoo-bahee` (`serverKey`, base64).

**Scope is declared, never guessed.** `FEDERATION_ENDPOINTS` requires an explicit scope per address
because FD-17 depends on a node knowing which of its own addresses is reachable from where, and
inferring it from an IP range is wrong for exactly the CGNAT and multi-homed cases this system serves.
List every scope, not just the public one — that is how a client on the same ISP learns the ISP-local
address *before* the gateway drops.

**`#TRUST` is an operator override**, honoured above every derived rule. Leave it off in normal
operation: FD-01 exists so that an allowlist is never the only path to federate, and TOFU admits new
peers at `PROBATION` where they earn reach through vouches or seven clean days.

**Outbound-only is the default for a home or community node.** With no `FEDERATION_GRPC_LISTEN`, the
node binds no port, advertises no address, and still federates fully in both directions — `Deliver`
and `StreamActivities` both run over connections it opened (FD-11). No port forwarding, no UPnP.

Two nodes that federate for real:

```powershell
pnpm ops:two-node          # node-a :3001 / gRPC :8451, node-b :3002 / gRPC :8452
                           # separate databases, each listing the other by key
Invoke-RestMethod http://localhost:3001/v1/federation/peers
Invoke-RestMethod http://localhost:3001/v1/federation/alerts
pnpm ops:two-node:down
```

Federation state — the direction ledger, peer directory, outbox and cursors — is **derived**, like
every other projection. Only the envelope store is backup-critical.

The service variables accept comma-separated HTTP(S) URLs or bare `host:port` values. The
independent audit log listens on port 3100 in the local Compose stack and persists its
append-only hash chain in the `audit-log-data` volume.

Generate the five cryptographic values with:

```powershell
pnpm --silent --filter @jagoo/backend secrets:generate |
  Out-File -Encoding utf8 .env.production
```

`.env.production` is ignored by Git. Move these values into the deployment secret manager,
restrict access, and back them up; changing node or credential keys on restart breaks stable
identity or outstanding credentials. The values embedded in `docker-compose.yml` are local
demo credentials only.

The machine-readable OpenAPI export is served at `/docs-json`. The protobuf files in
`proto/jagoo/v1/` remain the canonical write-contract documentation.

## Verification and Recovery

CI starts Mongo and Redis and runs the real VP-02, P1-G6, cache, and FD-05 federation-ledger
integration gates, and runs FG-01…FG-10 as a separate blocking job.
With those services running locally, execute the same focused checks:

```powershell
$env:JB_REQUIRE_INTEGRATION = '1'
$env:MONGO_URL = 'mongodb://127.0.0.1:27017/jagoo_local?directConnection=true'
$env:REDIS_URL = 'redis://127.0.0.1:6379/15'
pnpm --filter @jagoo/backend exec vitest run `
  src/adapters/outbound/mongo/mongo.integration.spec.ts `
  src/adapters/outbound/redis/redis.integration.spec.ts
```

Two details in that Mongo URL are load-bearing. `directConnection=true` is required from the
host because the replica set advertises its member as `mongo:27017`, a name that only resolves
inside the Compose network — with `?replicaSet=rs0` the driver discards the URL in favour of
that unresolvable address and hangs rather than failing. Transactions still work, because the
server remains a replica-set member. `JB_REQUIRE_INTEGRATION=1` makes a missing or misspelled
URL abort the run instead of skipping the suite, so the gate cannot report green while
executing nothing.

The envelope log is the backup-critical dataset. Rebuild derived state with:

```bash
pnpm --filter @jagoo/backend rebuild-projections
```

The command refuses an in-memory runtime and replays accepted envelopes without re-spending
anti-abuse state. Back up node signing and credential keys alongside the envelope database.
