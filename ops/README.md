# Node Operations

## Local Infrastructure

Run `pnpm local:up` to build and start the node, single-node Mongo replica set, Redis, and
MinIO. Check readiness at `GET http://localhost:3000/health/ready`, inspect logs with
`pnpm local:logs`, and stop the stack with `pnpm local:down`.

For host-side development, `pnpm ops:up` starts only infrastructure and
`pnpm dev:backend` starts the service. Local development may omit infrastructure URLs and
use deterministic in-memory adapters. Production deliberately refuses those fallbacks.
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

CI starts Mongo and Redis and runs the real VP-02, P1-G6, and cache integration gates.
With those services running locally, execute the same focused checks:

```powershell
$env:MONGO_URL = 'mongodb://localhost:27017/?replicaSet=rs0'
$env:REDIS_URL = 'redis://localhost:6379'
pnpm --filter @jagoo/backend exec vitest run `
  src/adapters/outbound/mongo/mongo.integration.spec.ts `
  src/adapters/outbound/redis/redis.integration.spec.ts
```

The envelope log is the backup-critical dataset. Rebuild derived state with:

```bash
pnpm --filter @jagoo/backend rebuild-projections
```

The command refuses an in-memory runtime and replays accepted envelopes without re-spending
anti-abuse state. Back up node signing and credential keys alongside the envelope database.
