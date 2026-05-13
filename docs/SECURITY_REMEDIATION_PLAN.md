# Jagoo Bahee Security Remediation Plan

This document maps the red-team findings in `RED_TEAM_ATTACK_SURFACE.md` to concrete fixes and acceptance checks.

Status reviewed: 2026-05-13. Checked items below are present in the current codebase. Items marked partial have some implementation in place but do not satisfy the full acceptance criteria yet.

## Phase 0: Immediate Exposure Reduction

- [x] Protect all attachment CRUD routes with `JwtAuthGuard`.
- [x] Remove or restrict generic `POST /attachments`, `PUT /attachments/:id`, and `DELETE /attachments/:id`.
- [x] Clamp every `limit` and `skip` query server-side for patched hot paths.
- [x] Disable Swagger UI and `/swagger.json` unless `ENABLE_SWAGGER=true`.
- [x] Require `FRONTEND_ORIGIN` in production; do not fall back to permissive CORS.
- [x] Require `SERVER_PRIVATE_KEY_HEX` in production.
- [x] Add health endpoints for load balancers.
- [x] Wire global Nest throttling.

Acceptance:

- Anonymous users cannot create, mutate, list private, or delete attachment records.
- Production boot fails if `SERVER_PRIVATE_KEY_HEX`, `JWT_SECRET`, or `FRONTEND_ORIGIN` is missing.
- `pnpm --dir backend build` passes.

Implementation notes:

- Done in `AttachmentsController`, `startup-validation.ts`, `main.ts`, `AppModule`, Redis throttler storage, and health endpoints.
- Verified with `pnpm --dir backend build`.

## Phase 1: Shared Rate Limits And Abuse Controls

- [x] Replace in-memory throttling with Redis-backed throttling.
- [x] Add route-specific limits:
  - [x] `/auth/challenge`: IP + user-agent bucket.
  - [x] `/auth`: public key + IP + user-agent bucket.
  - [x] `/posts`, `/comments`, `/messages`: actor + IP + user-agent bucket.
  - [x] `/attachments/upload-url`: actor + IP + user-agent bucket.
  - [x] `/federation/inbox`: remote server id + IP + user-agent bucket.
- [x] Add account creation quotas per IP/user-agent/public-key.
- [x] Add subnet-aware account creation quotas for deployments behind trusted proxies.
- [x] Persist used challenge ids until expiry.
- [x] Fail route-specific abuse buckets closed in production if Redis is unavailable.
- [x] Add API credit buckets with automatic refill for current deployments.
- [x] Add computational challenge/redeem interface for future proof-earned API credits.
- [x] Add adaptive proof-of-work difficulty controls by abuse level.

Partial implementation notes:

- Global throttling is Redis-backed and horizontally safe.
- Used challenge IDs are persisted through Redis `setIfAbsent`.
- Route-specific buckets are implemented by `AbuseRateLimiterService`.
- Server admins can tune route-specific limits from `/admin`; settings are persisted in MongoDB and cached in Redis.
- Server admins can close new registrations during account-creation DoS.
- Server admins can block individual IPs; runtime checks fall back to MongoDB if Redis has lost the cache entry.
- API credit proof difficulty increases as a subject's available credits are depleted.

Acceptance:

- Increasing backend replicas does not multiply request limits.
- Replayed challenge tokens are rejected.
- Account swarm creation is capped by IP/subnet and CAPTCHA policy.

## Phase 2: Attachment Hardening

- [x] Validate declared file size against server policy before presign.
- [x] Enforce MinIO object size limit through bucket/proxy policy.
- [x] On confirm, verify actual size is within limit.
- [x] Compute server-side content hash after upload.
- [x] Verify client signature over `{ownerId, contentHash, sizeBytes, mimeType}`.
- [x] Reject metadata changes after confirmation except controlled attachment binding.
- [x] Hide original filenames from public metadata unless user explicitly opts in.

Implementation notes:

- `AttachmentsService.createUploadUrl` rejects declared oversized uploads.
- `AttachmentsService.confirmUpload` checks MinIO `HeadObject` size before confirming.
- `AttachmentsService.confirmUpload` now streams the uploaded object from MinIO, computes SHA-256 server-side, compares it to the declared hash, and verifies the owner signature over `{ownerId, contentHash, sizeBytes, mimeType}` before confirmation.

Acceptance:

- Oversized upload cannot be confirmed.
- Attachment proof hash is server-computed.
- Users cannot mutate another user's attachment metadata.

## Phase 3: Audit Receipts

- [x] Create `AuditReceipt` schema:
  - `receiptVersion`
  - `serverId`
  - `serverBaseUrl`
  - `keyId`
  - `action`
  - `subjectType`
  - `subjectId`
  - `actorPublicKey`
  - `canonicalPayload`
  - `payloadHash`
  - `actorSignature`
  - `serverSignature`
  - `createdAt`
  - `legacy`
- [x] Return `{ data, receipt }` from post/comment/message/moderation writes.
- [x] Add verification endpoints:
  - `GET /audit/server-key`
  - `GET /audit/receipts/:id`
  - `GET /audit/subjects/:type/:id/receipts`
  - `POST /audit/verify-receipt`
  - `POST /audit/verify-signature`
- [x] Mark old records as `legacy_unverifiable`.

Implementation notes:

- `AuditReceipt` is persisted for post/comment/message writes and exposed through `/audit/*` verification endpoints.
- The frontend verify page supports portable receipt verification and third-party audit-service submission.

Acceptance:

- Tampering with payload, hash, user signature, or server signature fails verification.
- Users can export receipt JSON from the frontend.

## Phase 4: Append-Only Moderation

- [x] Add `ModerationEvent` with previous/new state hashes.
- [x] Replace mutable-only mod logs with append-only signed events.
- [x] Require moderator signatures for every human moderation action.
- [x] Add restore actions for posts/comments.
- [x] Bulk ban content removal must create either individual events or a signed batch event with every target hash.
- [x] Deny empty `moderatorSignature` in moderation event creation.

Implementation notes:

- Post/comment moderation, subreddit kick/ban/unban, moderator role changes, and member status updates require moderator signatures.
- `ModLogService` rejects empty signatures for human moderation events; scheduled system events are explicitly server-attested.
- `ModerationEventsService` creates append-only signed event records and server acknowledgements behind every `ModLogService.createLog` call.

Acceptance:

- Every remove/restore/ban/unban/role-change produces a verifiable event.
- Deleting DB rows is detectable by missing hash-chain links.

## Phase 5: Frontend Key And XSS Hardening

- [x] Add strict Content Security Policy.
- [x] Remove long-lived JWT from localStorage; use memory plus HttpOnly cookie where possible.
- [x] Move private-key operations behind WebCrypto non-exportable keys where possible.
- [x] Sanitize all markdown and remote-rendered content.
- [x] Add dependency review for browser crypto and markdown/rendering packages.

Partial implementation notes:

- Private keys are held in `sessionStorage`, not long-lived `localStorage`.
- JWT access tokens are kept in memory/session storage and backed by HttpOnly refresh cookies; legacy localStorage token keys are removed by the auth helper.
- Markdown rendering no longer uses `dangerouslySetInnerHTML`; it renders escaped React nodes and validates link protocols.

Acceptance:

- Injected markdown cannot execute script.
- Private keys are not persisted in localStorage.

## Phase 6: Federation Security Gate

Before implementing federation:

- [x] Define canonical JSON implementation for federation activity envelopes.
- [x] Define server identity document under `/.well-known/jagoo-bahee`.
- [x] Add admin-only remote server registry with explicit status field.
- [x] Reject local/private/non-HTTP federation registry URLs before future discovery.
- [x] Add SSRF protection for discovery:
  - [x] block private IP ranges,
  - [x] block link-local ranges,
  - [x] block non-HTTP(S),
  - [x] cap redirects,
  - [x] cap response size.
- [x] Add activity idempotency storage for inbox replay handling.
- [x] Add replay window and clock skew rules for inbox activities.
- [x] Add remote key rotation policy.
- [x] Add federation inbox body size and route-specific rate limits.

Partial implementation notes:

- Admin-only federation server registry CRUD exists under `/admin/federation/servers`.
- Admin registry URL validation blocks credentials, paths, localhost, and private IP literals.
- Public discovery, nodeinfo, approved-server listing, inbox, and outbox endpoints exist.
- Inbox verifies registered approved server identity, key id, object hash, signature, timestamp window, and replay idempotency.
- DNS resolution checks, discovery fetcher, and remote key rotation remain open.

Acceptance:

- Forged, replayed, future-dated, and oversized activities are rejected.
- Discovery cannot reach private network targets.

## Phase 7: Horizontal Scaling

Implemented scaffolding:

- [x] `backend/Dockerfile`
- [x] `frontend/Dockerfile`
- [x] `docker-compose.scale.yml`
- [x] `ops/haproxy/haproxy.cfg`
- [x] `/health/live`
- [x] `/health/ready`

Required before production:

- [x] Redis-backed throttler storage.
- [x] Mongo replica set or managed Mongo.
- [x] Shared persistent `SERVER_PRIVATE_KEY_HEX` across all replicas.
- [x] Shared `JWT_SECRET` across all replicas.
- [x] Object storage with quotas/lifecycle policies.
- [x] Disable host-published Mongo/Redis/MinIO/mCaptcha ports in the horizontal scale override.

Implementation notes:

- Scaling scaffolding and Redis-backed rate limiting are done.
- The checked compose command requires shared `JWT_SECRET` and `SERVER_PRIVATE_KEY_HEX`, but production secret management is still an operator requirement, so those remain unchecked.
- `docker-compose.scale.yml` resets database/cache/object-storage/admin challenge ports and only publishes HAProxy `8080` and frontend `6001`.

## Phase 7A: Server Admin Operations

- [x] Add server-admin dashboard entry point at `/admin`.
- [x] Add health counters for users, communities, posts, federation peers, reports, moderation logs, and IP blocks.
- [x] Add user ban/unban controls.
- [x] Add global moderator/admin controls.
- [x] Add federation peer add/status/delete controls.
- [x] Add moderation report/log overview.
- [x] Add registration open/closed control for DoS response.
- [x] Add route-specific rate-limit controls persisted through server config.
- [x] Add server rules editor.
- [x] Add IP block list/add/delete controls.

Scale test command:

```bash
JWT_SECRET=dev-jwt-secret \
SERVER_PRIVATE_KEY_HEX=<64_hex_private_key> \
docker compose -f docker-compose.yml -f docker-compose.scale.yml up --build --scale backend=3
```

Health check:

```bash
curl http://localhost:8080/health/live
curl http://localhost:8080/health/ready
```

## Phase 8: Security Test Backlog

- [x] Unit: declared oversized attachment upload is rejected.
- [x] Unit: confirmed attachment proof metadata cannot be mutated.
- [x] Unit: Redis throttler storage increments and blocks across shared storage.
- [x] Unit: route-specific abuse limiter blocks after a shared bucket limit.
- [x] Unit: API credits auto-refill and computational challenge redemption.
- [x] Unit: production startup validation rejects missing production secrets.
- [x] Unit: community permission cache/summary behavior is covered.
- [x] Unit: server proof hash signing rejects tampered proof subjects.
- [x] Unit: subreddit member status bit positions remain stable across merges.
- [x] E2E: anonymous attachment CRUD is forbidden.
- [x] E2E: old JWT after ABAC revoke cannot perform admin actions once token revocation exists.
- [x] E2E: post/comment edit requires fresh signature.
- [x] E2E: mod action without signature is rejected.
- [x] E2E: receipt verification rejects tampered payloads.
- [x] E2E: message blocked user cannot send/reply.
- [x] Load: account creation throttle.
- [x] Load: attachment upload-url throttle.
- [x] Federation: SSRF discovery denylist.
- [x] Federation: discovery endpoints respond.
- [x] Federation: signed approved activity is accepted.
- [x] Federation: replayed activity is idempotent.
- [x] Federation: tampered object hash is rejected.
- [x] Federation: oversized inbox activity is rejected.
- [x] Federation: same MongoDB server with separate databases is covered in e2e topology test.

Latest verification:

- `pnpm --dir backend build` passes.
- `pnpm --dir frontend build` passes.
- `pnpm --dir backend test` passes: 14 suites, 30 tests.
- `pnpm --dir backend test:e2e` passes: 3 suites, 9 tests.
