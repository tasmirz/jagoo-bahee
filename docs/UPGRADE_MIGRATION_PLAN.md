# Jagoo Bahee Audited Upgrade, Migration, and Refactor Plan

This plan is based on a full repository crawl of the current Next.js frontend, NestJS backend, DTOs, schemas, services, controllers, tests, Docker compose file, and build configuration.

## Audit Date

2026-05-12

## Implementation Review Update

Reviewed the first implementation pass and corrected the issues that were clear from the code:

- [x] `/users/by-public-key/:publicKey` is no longer shadowed by `/users/:id`.
- [x] Post/comment create now derive `authorId` from `req.user.id` and only reject conflicting legacy actor fields.
- [x] Post/comment moderation routes now derive `moderatorId` from `req.user.id`.
- [x] Post/comment moderation service methods reject actions when the target content does not belong to the supplied subreddit.
- [x] Message replies now reject users who are not participants in the parent conversation.
- [x] Message send/reply now reject blocked user pairs.
- [x] Post/comment create now recompute the canonical payload hash and reject mismatched `contentHash` values.
- [x] Backend and frontend production builds pass after the review fixes.

Still not implemented in this pass:

- [ ] Generalized portable `AuditReceipt` objects for all writes.
- [ ] Append-only signed `ModerationEvent` model.
- [ ] Third-party audit backend.
- [ ] Federation module and signed activity exchange.
- [ ] Full permission service replacing `SubredditRbacGuard`.

## Build Baseline

- [x] Backend production build passes with `pnpm build`.
- [x] Frontend production build passes with `pnpm build`.
- [x] Frontend currently exposes these app routes:
  - `/`
  - `/auth`
  - `/admin`
  - `/profile`
  - `/settings`
  - `/settings/comments`
  - `/subreddits`
  - `/subreddits/create`
  - `/r/[name]`
  - `/r/[name]/create`
  - `/r/[name]/settings`
  - `/p/[id]`
  - `/u/[publicKey]`
- [x] Docker compose currently starts only MongoDB, Redis, and mCaptcha.
- [x] MinIO is configured in backend code but missing from `docker-compose.yml`.
- [x] No audit-service backend exists yet.
- [x] No federation module exists yet.
- [x] Message backend exists, but message frontend routes do not exist.

## Current Backend Inventory

### Implemented Modules

- [x] `auth`: challenge, proof-of-work, signature login, JWT issue.
- [x] `users`: profile, follow/unfollow, save/unsave, block/unblock, feed preferences.
- [x] `subreddits`: create/list/get/update/delete, join/leave, kick/ban/unban, moderators, mod logs, bans.
- [x] `subreddit-members`: member list, status updates, ban, role changes.
- [x] `posts`: create/list/get/update/delete, vote, mod approve/remove/lock/pin/flag, verification, audit trail, comments.
- [x] `comments`: create/get/update/delete, vote, mod approve/remove/collapse/flag.
- [x] `votes`: unified post/comment vote model with uniqueness.
- [x] `moderation`: mod logs, server acknowledgements, reports schema, server public key endpoint.
- [x] `attachments`: MinIO-backed upload URL, confirmation, download, delete, list.
- [x] `notifications`: create/list/read/unread/delete.
- [x] `messages`: send/reply/list/read/delete.
- [x] `awards`: award types and awards.
- [x] `redis`: Redis client used for comment/vote rate limits and membership cache.

### Existing Cryptographic Features

- [x] Login uses secp256k1 signatures over server challenges.
- [x] Posts require `contentHash` and `userSignature`.
- [x] Comments require `contentHash` and `userSignature`.
- [x] Backend verifies post/comment user signatures using stored auth public keys.
- [x] Backend creates `ServerAcknowledgement` records for post/comment creation.
- [x] Backend signs acknowledgements with `SERVER_PRIVATE_KEY_HEX` if configured.
- [x] `/moderation/server-public-key` returns server key id and public key.
- [x] `/posts/:id/verify` returns post hash/signature/acknowledgements.
- [x] `/posts/:id/audit-trail` returns post, acknowledgements, and subreddit mod logs.

### Backend Problems Found

- [x] JWT identity field is inconsistent:
  - `AuthService` signs JWT as `{ id, abac }`.
  - Some controllers/services use `req.user.id`.
  - `messages`, `notifications`, and `awards` controllers use `req.user.userId`, which will be undefined.
- [ ] `ModLogSchema` requires `moderatorSignature`, but many moderation flows create logs with `''` or no real signature.
- [ ] Comment moderation remove/collapse/flag endpoints do not verify moderator signatures.
- [ ] Some post moderation actions create unsigned mod logs except remove.
- [ ] Subreddit member status and role updates accept `moderatorSignature` but do not verify it.
- [x] `SubredditRbacGuard` resolves subreddit id from route params incorrectly for post/comment moderation routes, where `:id` is the content id, not subreddit id.
- [x] `SubredditsController.update` uses `SubredditRbacGuard` without `JwtAuthGuard`, so `req.user` may be missing.
- [x] `SubredditsController.remove` is unauthenticated and can delete communities by id.
- [x] `SubredditsController.check-name/:name` is declared after `:id`, so it can be shadowed by `@Get(':id')`.
- [x] `join` increments `memberCount` even when an existing member joins again.
- [x] `leave` deletes membership records, which weakens moderation/member audit history.
- [x] Ban with `deleteContent` directly bulk-updates posts/comments and sets `statusFlags: 1`, which appears to leave content active instead of removed.
- [ ] Server signing key is ephemeral if `SERVER_PRIVATE_KEY_HEX` is absent, making old server receipts unverifiable after restart.
- [x] `signature.util.ts` logs public keys, signatures, payloads, and Mongo buffer internals to console.
- [ ] Post/comment canonical payloads are hand-built with `JSON.stringify`; there is no shared canonicalization contract.
- [ ] Post/comment update flows mutate content without requiring new user signatures or creating version receipts.
- [ ] Author delete for comments does not create server acknowledgement.
- [ ] Post author delete can accept no deletion signature and still remove content.
- [ ] `ServerAcknowledgement` only supports `post` and `comment`, not moderation events, attachments, messages, or federation events.
- [ ] `Report` schema exists but there are no report endpoints.
- [ ] `interfaces/models.interface.ts` is stale ERD-style documentation and diverges from actual Mongoose schemas.
- [ ] DTOs expose client-supplied `authorId`/`moderatorId` in many places even though backend should derive actors from JWT.
- [ ] Heavy use of `any` and direct collection access bypasses service contracts and type safety.

## Current Frontend Inventory

### Implemented UI

- [x] Navbar with home, communities, profile, settings, login/logout.
- [x] Home feed loads `/posts`.
- [x] Community list loads `/subreddits`.
- [x] Community creation.
- [x] Community detail with create-post and limited mod remove.
- [x] Community settings page exists.
- [x] Post detail with comments and comment creation.
- [x] Auth page with BIP39 mnemonic, proof-of-work, mCaptcha integration.
- [x] Profile page.
- [x] Public user page.
- [x] User settings and comment settings placeholder.
- [x] Admin page stub.
- [x] Vote hook exists.
- [x] WebSocket manager exists, but backend has no WebSocket gateway.

### Frontend Problems Found

- [ ] Navigation misses implemented backend features:
  - messages
  - notifications
  - saved content
  - follows/blocks
  - awards
  - attachments/media uploads
  - moderation logs
  - member/ban management
  - audit verification
- [ ] Admin page is a stub and treats every authenticated user as admin.
- [x] No frontend route exists for `/messages`.
- [x] No frontend route exists for `/notifications`.
- [ ] No frontend receipt/export/proof UI exists.
- [ ] No UI consumes `/posts/:id/verify` or `/posts/:id/audit-trail`.
- [ ] Voting UI is not integrated into feed/post/comment cards.
- [ ] Post creation supports text only despite backend DTO supporting link/image/video/crosspost.
- [ ] Attachment upload UI is missing despite backend attachment service.
- [ ] Awards UI is missing despite backend award service.
- [ ] Community moderation UI is incomplete.
- [ ] Design is inconsistent:
  - mixed variables, Tailwind utilities, and non-existent DaisyUI-like classes such as `base-200`.
  - rounded cards and spacing vary by page.
  - loading/error/empty states are inconsistent.
- [x] Auth stores private keys in `sessionStorage`, but `AuthPage` also writes `auth:privateKey` to `localStorage`, contradicting the helper comment.
- [x] Frontend has duplicate `.js` crypto/auth files next to TypeScript files.
- [x] Frontend has both `package-lock.json` and `pnpm-lock.yaml`.
- [x] `backend/frontend/src/app/...` contains duplicate old frontend pages and should be removed or clearly archived.
- [x] `websocket.ts` points at `/ws`, but backend has no WebSocket gateway.

## Product Target

Jagoo Bahee should become a pseudonymous, Reddit-like, federated discussion platform with:

- usable community/feed/post/comment UX,
- key-based identity,
- cryptographically verifiable content receipts,
- append-only moderation proofs,
- public verification endpoints,
- optional third-party proof hosting,
- federation between independently operated servers,
- and messaging/chat exposed through a real UI.

## Migration Rules

- [ ] Do not destructively remove existing data paths until replacement receipts/events exist.
- [ ] Backend must derive actor identity from JWT, not from client-supplied `authorId`, `moderatorId`, or `senderId`.
- [ ] Every write that changes user content or moderation state must produce an auditable event.
- [ ] Server private key must be persistent and required outside development.
- [ ] Existing unsigned legacy records must be marked as legacy/unverifiable, not silently treated as verified.
- [ ] Frontend permissions must be display hints only; backend guards/services must enforce all permissions.
- [ ] Federation work must start with signed server identity and signed activities before remote UI polish.

## Phase 0: Stabilize Current Repo

### Todo

- [x] Remove or archive duplicate `backend/frontend/` pages.
- [x] Pick one frontend lockfile; keep `pnpm-lock.yaml`, remove `package-lock.json` if pnpm remains the project standard.
- [x] Add MinIO to `docker-compose.yml` or remove MinIO dependency from local default path.
- [ ] Add `.env.example` requirements for `SERVER_PRIVATE_KEY_HEX`, Mongo, Redis, MinIO, mCaptcha, frontend origin, and public server URL.
- [x] Replace sensitive console logging in crypto/auth paths with structured non-secret diagnostics.
- [x] Normalize JWT user access to `req.user.id` everywhere.
- [x] Fix unauthenticated dangerous routes:
  - [x] Protect subreddit delete.
  - [x] Add `JwtAuthGuard` before `SubredditRbacGuard` where missing.
  - [x] Reorder `check-name/:name` before `:id`.
- [ ] Add a backend `me/permissions` or community permission endpoint so UI does not infer permissions.

### Acceptance Checks

- [x] Backend build passes.
- [x] Frontend build passes.
- [ ] Existing auth, community creation, post creation, and comment creation still work.
- [ ] No secret/public-key/signature debug dumps remain in normal logs.

## Phase 1: UX Feature Repair

### Todo

- [ ] Create a consistent app shell:
  - [ ] Desktop nav: Feed, Communities, Create, Messages, Notifications, Moderation, Audit, Profile.
  - [ ] Mobile nav/drawer.
  - [ ] Auth-aware user menu with public key identity.
- [ ] Build shared UI primitives:
  - [ ] Button styles.
  - [ ] Form field styles.
  - [ ] Status badges.
  - [ ] Empty states.
  - [ ] Loading skeletons.
  - [ ] Error callouts.
- [ ] Upgrade home feed:
  - [ ] Sort controls.
  - [ ] Community filter.
  - [ ] Vote buttons.
  - [ ] Save button.
  - [ ] Award button placeholder wired when awards UI lands.
  - [ ] Audit badge.
- [ ] Upgrade post detail:
  - [ ] Vote controls.
  - [ ] Save/share controls.
  - [ ] Audit panel using existing `/posts/:id/verify`.
  - [ ] Audit trail panel using existing `/posts/:id/audit-trail`.
  - [ ] Moderator controls based on backend permission result.
- [ ] Upgrade comment UI:
  - [ ] Nested comment rendering.
  - [ ] Reply composer.
  - [ ] Vote controls.
  - [ ] Removed/flagged/locked states.
- [ ] Upgrade community UI:
  - [ ] Member count correctness.
  - [ ] Join/leave state.
  - [ ] Rules panel.
  - [ ] Moderators link.
  - [ ] Mod logs link.
  - [ ] Ban/member management link.
- [ ] Upgrade post creation:
  - [ ] Text posts.
  - [ ] Link posts.
  - [ ] Attachment-backed image/video posts after MinIO compose is fixed.
  - [ ] Visible local receipt after successful creation.
- [ ] Upgrade settings/profile:
  - [ ] Identity/public key section.
  - [ ] Local receipt vault section.
  - [ ] Feed preferences wired to backend.
  - [ ] Blocked users UI.
  - [ ] Saved content UI.
- [ ] Replace admin stub with real dashboard shell:
  - [ ] Server public key.
  - [ ] Recent mod logs.
  - [ ] Report queue placeholder until report endpoints exist.
  - [ ] Federation status placeholder until federation module exists.

### Acceptance Checks

- [ ] A signed-out user can browse public content and sees clear auth prompts for writes.
- [ ] A signed-in user can navigate to all implemented backend features that have safe APIs.
- [ ] UI no longer contains fake admin authorization.
- [ ] UI no longer links to unsupported WebSocket behavior.

## Phase 2: Identity, DTO, and Permission Refactor

### Todo

- [ ] Replace client-supplied actor fields:
  - [ ] `CreatePostDto.authorId` becomes backend-derived.
  - [ ] `CreateCommentDto.authorId` becomes backend-derived.
  - [ ] `PostModBaseDto.moderatorId` becomes backend-derived.
  - [ ] `CommentModBaseDto.moderatorId` becomes backend-derived.
  - [ ] Message sender id becomes backend-derived.
- [ ] Define common actor context:
  - [ ] `authId`
  - [ ] `userId`
  - [ ] `publicKey`
  - [ ] `globalFlags`
- [ ] Centralize permission checks:
  - [ ] Global admin/mod flags.
  - [ ] Community owner.
  - [ ] Community moderator.
  - [ ] Approved contributor.
  - [ ] Banned/muted state.
- [ ] Replace fragile `SubredditRbacGuard` with action-specific permission service.
- [ ] Add permission endpoints:
  - [ ] `GET /subreddits/:id/permissions/me`
  - [ ] `GET /posts/:id/permissions/me`
  - [ ] `GET /comments/:id/permissions/me`
- [ ] Fix member count idempotency for join/leave.
- [ ] Keep membership records append-only or status-based instead of deleting on leave.

### Acceptance Checks

- [ ] Direct API calls cannot impersonate authors/moderators/senders.
- [ ] Moderation routes check the target content's actual subreddit.
- [ ] Banned users cannot post, comment, vote, or message where prohibited.

## Phase 3: Canonical Receipts and Content Verification

### Todo

- [ ] Create shared canonical payload builder for:
  - [ ] post create
  - [ ] post edit
  - [ ] post delete
  - [ ] comment create
  - [ ] comment edit
  - [ ] comment delete
  - [ ] message send if chat receipts are included
- [ ] Store canonical payload or canonical payload hash with each signed event.
- [ ] Replace ad hoc `JSON.stringify` contracts with deterministic canonical JSON.
- [ ] Define `Receipt` schema:
  - [ ] `receiptVersion`
  - [ ] `serverId`
  - [ ] `serverBaseUrl`
  - [ ] `contentType`
  - [ ] `contentId`
  - [ ] `action`
  - [ ] `canonicalPayload`
  - [ ] `contentHash`
  - [ ] `userPublicKey`
  - [ ] `userSignature`
  - [ ] `serverKeyId`
  - [ ] `serverSignature`
  - [ ] `createdAt`
- [ ] Return receipt from post create.
- [ ] Return receipt from comment create.
- [ ] Add receipt endpoints:
  - [ ] `GET /audit/receipts/content/:type/:id`
  - [ ] `POST /audit/receipts/verify`
  - [ ] `POST /audit/signatures/verify`
  - [ ] `GET /audit/server-key`
- [ ] Add frontend receipt vault:
  - [ ] Save receipts locally.
  - [ ] Export receipt JSON.
  - [ ] Verify pasted receipt.
  - [ ] Show receipt state on post/comment pages.

### Acceptance Checks

- [ ] Tampered content fails verification.
- [ ] Tampered user signature fails verification.
- [ ] Tampered server signature fails verification.
- [ ] Legacy content is clearly marked as legacy/unverifiable.

## Phase 4: Append-Only Moderation Audit

### Todo

- [ ] Replace `ModLog` with or migrate to `ModerationEvent`.
- [ ] Moderation event fields:
  - [ ] `eventId`
  - [ ] `eventVersion`
  - [ ] `subredditId`
  - [ ] `actorAuthId`
  - [ ] `actorPublicKey`
  - [ ] `action`
  - [ ] `targetType`
  - [ ] `targetId`
  - [ ] `reason`
  - [ ] `previousStateHash`
  - [ ] `newStateHash`
  - [ ] `moderatorSignature`
  - [ ] `serverSignature`
  - [ ] `createdAt`
- [ ] Require moderator signatures for every moderation action or define a server-attested admin emergency action type.
- [ ] Add server acknowledgement for moderation events.
- [ ] Do not hard-delete posts/comments/subreddits through normal moderation.
- [ ] Add restore actions for posts/comments.
- [ ] Add report endpoints:
  - [ ] `POST /reports`
  - [ ] `GET /reports`
  - [ ] `PATCH /reports/:id`
- [ ] Add frontend moderation dashboard:
  - [ ] Reports.
  - [ ] Removed content.
  - [ ] Bans.
  - [ ] Members.
  - [ ] Moderators.
  - [ ] Signed event details.

### Acceptance Checks

- [ ] Every moderation state change has a signed event.
- [ ] Moderation event history remains visible after content is removed.
- [ ] Bulk content removal creates per-content audit events or a signed batch event with verifiable members.

## Phase 5: Third-Party Audit Service

### Todo

- [ ] Add `audit-service/` as separate backend.
- [ ] Add audit service to `docker-compose.yml`.
- [ ] Audit service schemas:
  - [ ] submitted receipt
  - [ ] verification result
  - [ ] server identity cache
  - [ ] submission timestamp
- [ ] Audit service endpoints:
  - [ ] `POST /receipts`
  - [ ] `POST /receipts/verify`
  - [ ] `GET /receipts/:id`
  - [ ] `GET /lookup/content-hash/:hash`
  - [ ] `GET /lookup/server/:serverId`
  - [ ] `GET /lookup/user/:publicKey`
- [ ] Main frontend:
  - [ ] Upload local receipt to audit service.
  - [ ] Show third-party verification URL.
  - [ ] Verify public proof page.

### Acceptance Checks

- [ ] Main server cannot mutate third-party submitted proofs.
- [ ] Anyone can reproduce verification from public receipt data.
- [ ] Invalid receipts are stored as failed or rejected with clear reason.

## Phase 6: Federation

### Todo

- [ ] Add `FederationModule`.
- [ ] Define persistent server identity:
  - [ ] `serverId`
  - [ ] `baseUrl`
  - [ ] `publicKey`
  - [ ] `keyId`
  - [ ] `software`
  - [ ] `version`
  - [ ] `capabilities`
- [ ] Add discovery endpoints:
  - [ ] `GET /.well-known/jagoo-bahee`
  - [ ] `GET /.well-known/nodeinfo`
  - [ ] `GET /nodeinfo/2.1`
- [ ] Add remote server registry:
  - [ ] `POST /federation/servers`
  - [ ] `GET /federation/servers`
  - [ ] `PATCH /federation/servers/:id`
- [ ] Define signed activity envelope:
  - [ ] `activityId`
  - [ ] `type`
  - [ ] `actorServerId`
  - [ ] `object`
  - [ ] `objectHash`
  - [ ] `createdAt`
  - [ ] `signature`
- [ ] Add inbox/outbox:
  - [ ] `POST /federation/inbox`
  - [ ] `GET /federation/outbox`
- [ ] Emit activities for:
  - [ ] community created/updated
  - [ ] post created/edited/removed/restored
  - [ ] comment created/edited/removed/restored
  - [ ] moderation event created
- [ ] Store remote provenance on remote objects.
- [ ] Add frontend federation admin screen.

### Acceptance Checks

- [ ] Two local Jagoo Bahee servers can exchange a signed post-created activity.
- [ ] Invalid remote signatures are rejected.
- [ ] Remote content is visibly marked with server provenance.

## Phase 7: Chat and Messaging UI

### Todo

- [x] Fix message controller identity bug from `req.user.userId` to resolved user id.
- [ ] Decide whether messages are pseudonymous server-visible DMs or encrypted messages.
- [x] Add message signature verification.
- [ ] Add conversation grouping:
  - [ ] `conversationId`
  - [ ] participants
  - [ ] last message
  - [ ] unread count
- [x] Enforce blocks in message send/reply.
- [ ] Add frontend routes:
  - [x] `/messages`
  - [x] `/messages/new`
  - [x] `/messages/[conversationId]`
- [ ] Add navigation unread badge.
- [ ] Add signed message receipt only if it does not falsely imply privacy.

### Acceptance Checks

- [ ] User can send a message to another user by username/public key.
- [x] User can reply in a conversation.
- [ ] Read/unread state works.
- [x] Blocked users cannot message blockers.

## Phase 8: Tests and Documentation

### Todo

- [ ] Backend unit tests:
  - [ ] canonical JSON
  - [ ] user signature verification
  - [ ] server signature verification
  - [ ] permission service
  - [ ] moderation event builder
- [ ] Backend e2e tests:
  - [ ] auth
  - [ ] post receipt
  - [ ] comment receipt
  - [ ] moderation deny paths
  - [ ] moderation event creation
  - [ ] third-party receipt submission
  - [ ] federation inbox rejection
- [ ] Frontend checks:
  - [ ] route smoke tests
  - [ ] auth flow smoke
  - [ ] receipt UI smoke
  - [ ] messages UI smoke
- [ ] Docs:
  - [ ] local development
  - [ ] server key persistence
  - [ ] audit model
  - [ ] moderation model
  - [ ] federation protocol
  - [ ] deployment

## Immediate Implementation Order

1. Stabilize dangerous backend identity/guard issues.
2. Repair app shell/navigation and expose existing backend features.
3. Add post/comment audit UI using existing verify/audit endpoints.
4. Normalize actor DTOs and permission service.
5. Standardize receipts and content verification.
6. Build append-only moderation events.
7. Add message UI after identity bug is fixed.
8. Add third-party audit service.
9. Add federation discovery and signed inbox/outbox.

## Files Requiring Early Attention

- `backend/src/auth/auth.service.ts`
- `backend/src/common/signature.util.ts`
- `backend/src/common/server-sign.util.ts`
- `backend/src/subreddits/subreddits.controller.ts`
- `backend/src/subreddits/subreddits.service.ts`
- `backend/src/subreddits/guards/subreddit-rbac.guard.ts`
- `backend/src/subreddits/subreddit-members.service.ts`
- `backend/src/posts/posts.controller.ts`
- `backend/src/posts/posts.service.ts`
- `backend/src/comments/comments.controller.ts`
- `backend/src/comments/comments.service.ts`
- `backend/src/messages/messages.controller.ts`
- `backend/src/notifications/notifications.controller.ts`
- `backend/src/awards/awards.controller.ts`
- `frontend/src/components/navbar.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/p/[id]/page.tsx`
- `frontend/src/app/r/[name]/page.tsx`
- `frontend/src/app/admin/page.tsx`
- `frontend/src/lib/auth.ts`
- `docker-compose.yml`
