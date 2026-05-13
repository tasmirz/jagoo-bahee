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
  - [ ] future `/federation/inbox`: remote server id + IP bucket.
- [x] Add account creation quotas per IP/user-agent/public-key.
- [ ] Add subnet-aware account creation quotas for deployments behind trusted proxies.
- [x] Persist used challenge ids until expiry.
- [x] Fail route-specific abuse buckets closed in production if Redis is unavailable.
- [ ] Add proof-of-work difficulty controls by abuse level.

Partial implementation notes:

- Global throttling is Redis-backed and horizontally safe.
- Used challenge IDs are persisted through Redis `setIfAbsent`.
- Route-specific buckets and account swarm quotas are not implemented yet.
- Route-specific buckets are implemented by `AbuseRateLimiterService`.
- Subnet buckets, adaptive difficulty, and federation inbox buckets remain open.

Acceptance:

- Increasing backend replicas does not multiply request limits.
- Replayed challenge tokens are rejected.
- Account swarm creation is capped by IP/subnet and CAPTCHA policy.

## Phase 2: Attachment Hardening

- [x] Validate declared file size against server policy before presign.
- [ ] Enforce MinIO object size limit through bucket/proxy policy.
- [x] On confirm, verify actual size is within limit.
- [ ] Compute server-side content hash after upload.
- [ ] Verify client signature over `{ownerId, contentHash, sizeBytes, mimeType}`.
- [x] Reject metadata changes after confirmation except controlled attachment binding.
- [ ] Hide original filenames from public metadata unless user explicitly opts in.

Implementation notes:

- `AttachmentsService.createUploadUrl` rejects declared oversized uploads.
- `AttachmentsService.confirmUpload` checks MinIO `HeadObject` size before confirming.
- Server-side hash and signed attachment proof are still missing.

Acceptance:

- Oversized upload cannot be confirmed.
- Attachment proof hash is server-computed.
- Users cannot mutate another user's attachment metadata.

## Phase 3: Audit Receipts

- [ ] Create `AuditReceipt` schema:
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
- [ ] Return `{ data, receipt }` from post/comment/message/moderation writes.
- [ ] Add verification endpoints:
  - `GET /audit/server-key`
  - `GET /audit/receipts/:id`
  - `GET /audit/subjects/:type/:id/receipts`
  - `POST /audit/verify-receipt`
  - `POST /audit/verify-signature`
- [ ] Mark old records as `legacy_unverifiable`.

Partial implementation notes:

- Current post proof JSON export/download and paste/drop verification exist through `/posts/:id/verify`, `/posts/proofs/verify`, `/p/[id]`, and `/audit/verify`.
- This is not the full portable `AuditReceipt` design yet; the schema and generalized `/audit/*` endpoints remain open.

Acceptance:

- Tampering with payload, hash, user signature, or server signature fails verification.
- Users can export receipt JSON from the frontend.

## Phase 4: Append-Only Moderation

- [ ] Add `ModerationEvent` with previous/new state hashes.
- [ ] Replace mutable-only mod logs with append-only signed events.
- [ ] Require moderator signatures for every moderation action.
- [ ] Add restore actions for posts/comments.
- [ ] Bulk ban content removal must create either individual events or a signed batch event with every target hash.
- [ ] Deny empty `moderatorSignature` in moderation event creation.

Partial implementation notes:

- Post remove and several subreddit moderation paths now require moderator signatures.
- Member status update and some mod-log creation paths can still write empty signatures, so this phase is not complete.

Acceptance:

- Every remove/restore/ban/unban/role-change produces a verifiable event.
- Deleting DB rows is detectable by missing hash-chain links.

## Phase 5: Frontend Key And XSS Hardening

- [ ] Add strict Content Security Policy.
- [ ] Remove long-lived JWT from localStorage; use memory plus HttpOnly cookie where possible.
- [ ] Move private-key operations behind WebCrypto non-exportable keys where possible.
- [ ] Sanitize all markdown and remote-rendered content.
- [ ] Add dependency review for browser crypto and markdown/rendering packages.

Partial implementation notes:

- Private keys are held in `sessionStorage`, not long-lived `localStorage`.
- JWT is still in `localStorage`.
- Tiptap rendering/HTML paths need sanitization before this phase can be marked complete.

Acceptance:

- Injected markdown cannot execute script.
- Private keys are not persisted in localStorage.

## Phase 6: Federation Security Gate

Before implementing federation:

- [ ] Define canonical JSON specification and test vectors.
- [ ] Define server identity document under `/.well-known/jagoo-bahee`.
- [x] Add admin-only remote server registry with explicit status field.
- [x] Reject local/private/non-HTTP federation registry URLs before future discovery.
- [ ] Add SSRF protection for discovery:
  - [ ] block private IP ranges,
  - [ ] block link-local ranges,
  - [ ] block non-HTTP(S),
  - [ ] cap redirects,
  - [ ] cap response size.
- [ ] Add activity idempotency table.
- [ ] Add replay window and clock skew rules.
- [ ] Add remote key rotation policy.
- [ ] Add federation inbox body size and rate limits.

Partial implementation notes:

- Admin-only federation server registry CRUD exists under `/admin/federation/servers`.
- Admin registry URL validation blocks credentials, paths, localhost, and private IP literals.
- The public federation protocol, DNS resolution checks, discovery fetcher, inbox/outbox, replay table, and canonical test vectors are not implemented.

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
- [ ] Mongo replica set or managed Mongo.
- [ ] Shared persistent `SERVER_PRIVATE_KEY_HEX` across all replicas.
- [ ] Shared `JWT_SECRET` across all replicas.
- [ ] Object storage with quotas/lifecycle policies.
- [x] Disable host-published Mongo/Redis/MinIO/mCaptcha ports in the horizontal scale override.

Implementation notes:

- Scaling scaffolding and Redis-backed rate limiting are done.
- The checked compose command requires shared `JWT_SECRET` and `SERVER_PRIVATE_KEY_HEX`, but production secret management is still an operator requirement, so those remain unchecked.
- `docker-compose.scale.yml` resets database/cache/object-storage/admin challenge ports and only publishes HAProxy `8080` and frontend `6001`.

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
- [x] Unit: production startup validation rejects missing production secrets.
- [x] Unit: community permission cache/summary behavior is covered.
- [x] Unit: server proof hash signing rejects tampered proof subjects.
- [x] Unit: subreddit member status bit positions remain stable across merges.
- [x] E2E: anonymous attachment CRUD is forbidden.
- [ ] E2E: old JWT after ABAC revoke cannot perform admin actions once token revocation exists.
- [ ] E2E: post/comment edit requires fresh signature.
- [ ] E2E: mod action without signature is rejected.
- [ ] E2E: receipt verification rejects tampered payloads.
- [ ] E2E: message blocked user cannot send/reply.
- [ ] Load: account creation throttle.
- [ ] Load: attachment upload-url throttle.
- [ ] Federation: SSRF discovery denylist.
- [ ] Federation: replayed activity rejected.

Latest verification:

- `pnpm --dir backend build` passes.
- `pnpm --dir frontend build` passes.
- `pnpm --dir backend test` passes: 12 suites, 26 tests.
- `pnpm --dir backend test:e2e` passes: 2 suites, 4 tests.
