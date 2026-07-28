# Node Operations

## Local Infrastructure

Run `pnpm ops:up` to start the single-node Mongo replica set, Redis, and MinIO. The replica
set is required for atomic envelope/projection/Merkle transactions. Check readiness at
`GET /health/ready`; stop and remove the stack with `pnpm ops:down`.

Start the service with `pnpm dev:backend`. Local development may omit infrastructure URLs
and use deterministic in-memory adapters. Production deliberately refuses those fallbacks.

## Production Configuration

Set `NODE_ENV=production` and provide:

| Variable                                    | Purpose                                                |
| ------------------------------------------- | ------------------------------------------------------ |
| `MONGO_URL`, `MONGO_DB`                     | Replica-set connection and database                    |
| `REDIS_URL`                                 | Credits, nullifiers, auth revocation, and tagged cache |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`     | S3/MinIO object storage                                |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY`            | Object-store credentials                               |
| `NODE_SIGNING_SEED`                         | Base64 32-byte persistent node identity                |
| `POW_SECRET`                                | Base64 32-byte stateless challenge key                 |
| `AUTH_ACCESS_SECRET`, `AUTH_REFRESH_SECRET` | Distinct base64 token keys                             |
| `CREDENTIAL_RSA_JWK`                        | Base64 JSON private RSA JWK for blind credentials      |

Generate the five cryptographic values with:

```powershell
pnpm --silent --filter @jagoo/backend secrets:generate |
  Out-File -Encoding utf8 .env.production
```

`.env.production` is ignored by Git. Move these values into the deployment secret manager,
restrict access, and back them up; changing node or credential keys on restart breaks stable
identity or outstanding credentials. The values embedded in `docker-compose.yml` are local
demo credentials only.

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
