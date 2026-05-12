# Federation Test Scenario

This is the security-first scenario to use when federation is implemented. The current repository does not yet contain federation endpoints, so this document defines the required local topology, fixtures, and acceptance tests.

## Goals

- Run two independent Jagoo Bahee servers locally.
- Give each server separate Mongo, Redis, MinIO, and server signing keys.
- Exchange signed federation activities.
- Verify replay, forgery, SSRF, and rate-limit defenses.

## Local Topology

Node A:

- API: `http://localhost:6100`
- frontend: `http://localhost:6101`
- Mongo: `mongo-a`
- Redis: `redis-a`
- MinIO: `minio-a`
- `SERVER_PRIVATE_KEY_HEX=A...`

Node B:

- API: `http://localhost:6200`
- frontend: `http://localhost:6201`
- Mongo: `mongo-b`
- Redis: `redis-b`
- MinIO: `minio-b`
- `SERVER_PRIVATE_KEY_HEX=B...`

## Required Federation Endpoints

Discovery:

- `GET /.well-known/jagoo-bahee`
- `GET /.well-known/nodeinfo`
- `GET /nodeinfo/2.1`

Federation:

- `POST /federation/servers`
- `GET /federation/servers`
- `PATCH /federation/servers/:id`
- `POST /federation/inbox`
- `GET /federation/outbox`

## Required Activity Envelope

```json
{
  "activityId": "uuid-or-content-addressed-id",
  "type": "post.created",
  "actorServerId": "server-id",
  "actorKeyId": "server-key-id",
  "object": {},
  "objectHash": "sha256-hex",
  "createdAt": "2026-05-12T00:00:00.000Z",
  "signature": "base64"
}
```

## Happy-Path Test

1. Start Node A and Node B with separate databases and keys.
2. Register Node B on Node A.
3. Register Node A on Node B.
4. On Node A, create community `r/fedtest`.
5. On Node A, create a signed post in `r/fedtest`.
6. Node A emits `post.created` to outbox.
7. Node B pulls or receives activity at `/federation/inbox`.
8. Node B verifies:
   - remote server is registered,
   - server key id is known,
   - object hash matches canonical object,
   - signature matches activity envelope,
   - activity id has not been seen.
9. Node B stores remote post with provenance.
10. Node B UI marks content as remote and verified.

Acceptance:

- Remote post appears on Node B.
- Verification state is visible.
- Re-running delivery is idempotent.

## Negative Security Tests

Replay:

- Send the same `activityId` twice.
- Expected: second delivery returns idempotent accepted/no-op or rejected duplicate; no duplicate content.

Forged signature:

- Modify `object.title` but keep original signature.
- Expected: reject with deterministic verification error.

Hash mismatch:

- Keep signature valid over envelope but set wrong `objectHash`.
- Expected: reject before storing.

Unknown server:

- Send a validly signed activity from an unregistered server.
- Expected: reject or quarantine based on policy.

Key rotation abuse:

- Rotate remote key without signed rotation event.
- Expected: reject new-key activities until rotation is approved.

SSRF discovery:

- Try to register:
  - `http://127.0.0.1:27017`
  - `http://169.254.169.254`
  - `file:///etc/passwd`
  - `http://10.0.0.1`
- Expected: reject all.

Oversized inbox:

- Submit activity body above configured limit.
- Expected: reject with `413`.

Future timestamp:

- Submit activity with `createdAt` far in the future.
- Expected: reject.

Expired timestamp:

- Submit old activity outside replay window.
- Expected: reject unless already stored as an idempotent duplicate.

Remote moderation:

- Node A removes post with signed `moderation.event.created`.
- Node B receives event.
- Expected: Node B marks remote post removed and stores moderation provenance.

Moderation laundering:

- Node A sends removed content without the corresponding moderation event.
- Expected: Node B preserves prior removal state or quarantines conflict.

## Horizontal Scaling Federation Test

Run Node A with three backend replicas behind the local HAProxy backend load balancer:

```bash
JWT_SECRET=dev-a-jwt \
SERVER_PRIVATE_KEY_HEX=<node_a_64_hex_private_key> \
PUBLIC_SERVER_URL=http://localhost:8080 \
docker compose -f docker-compose.yml -f docker-compose.scale.yml up --build --scale backend=3
```

Expected:

- `/health/ready` succeeds through the load balancer.
- Server key id is identical regardless of replica.
- Replayed federation activity is rejected consistently by all replicas.
- Rate limits are not multiplied by replica count once Redis throttler storage is implemented.

## Test Data To Keep

- Node A server public key and key id.
- Node B server public key and key id.
- Valid `post.created` fixture.
- Tampered `post.created` fixture.
- Replayed activity fixture.
- SSRF registration fixture set.

## Blockers Before Running This End-To-End

- Federation module does not exist yet.
- Shared canonical JSON implementation does not exist yet.
- Redis-backed throttler storage is not implemented yet.
- Third-party receipt upload service does not exist yet.
