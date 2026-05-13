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
- [x] Backend runtime health checks pass with Mongo, Redis, and MinIO from Docker Compose.
- [x] Frontend runtime starts and responds on `http://localhost:6001`.

Still not implemented in this pass:

- [x] Generalized portable `AuditReceipt` objects for all writes.
- [x] Append-only signed `ModerationEvent` model.
- [x] Third-party audit backend.
- [x] Initial federation module and signed inbox/outbox activity exchange.
- [x] Full permission service replacing `SubredditRbacGuard`.

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
- [x] MinIO is configured in backend code and present in `docker-compose.yml`.
- [x] No audit-service backend exists yet.
- [x] Federation module exists with discovery, nodeinfo, approved-server listing, inbox, and outbox.
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
- [x] `ModLogService` rejects missing moderator signatures for human moderation events.
- [x] Comment moderation remove/collapse/flag endpoints verify moderator signatures.
- [x] Post moderation actions verify moderator signatures before creating mod logs.
- [x] Subreddit member status and role updates verify moderator signatures.
- [x] `SubredditRbacGuard` resolves subreddit id from route params incorrectly for post/comment moderation routes, where `:id` is the content id, not subreddit id.
- [x] `SubredditsController.update` uses `SubredditRbacGuard` without `JwtAuthGuard`, so `req.user` may be missing.
- [x] `SubredditsController.remove` is unauthenticated and can delete communities by id.
- [x] `SubredditsController.check-name/:name` is declared after `:id`, so it can be shadowed by `@Get(':id')`.
- [x] `join` increments `memberCount` even when an existing member joins again.
- [x] `leave` deletes membership records, which weakens moderation/member audit history.
- [x] Ban with `deleteContent` directly bulk-updates posts/comments and sets `statusFlags: 1`, which appears to leave content active instead of removed.
- [x] Production startup fails if `SERVER_PRIVATE_KEY_HEX` is absent.
- [x] `signature.util.ts` logs public keys, signatures, payloads, and Mongo buffer internals to console.
- [x] Post/comment canonical payloads are hand-built with `JSON.stringify`; there is no shared canonicalization contract.
- [x] Post/comment update flows require fresh user signatures for content edits.
- [x] Author delete for comments creates server acknowledgement.
- [x] Post author delete requires a deletion signature.
- [x] `ServerAcknowledgement` only supports `post` and `comment`, not moderation events, attachments, messages, or federation events.
- [x] Report endpoints exist under `/reports` and `/moderation/reports`.
- [x] `interfaces/models.interface.ts` is stale ERD-style documentation and diverges from actual Mongoose schemas.
- [x] DTOs expose client-supplied `authorId`/`moderatorId` in many places even though backend should derive actors from JWT.
- [x] Heavy use of `any` and direct collection access bypasses service contracts and type safety.

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

- [x] Navigation misses implemented backend features:
  - messages
  - notifications
  - saved content
  - follows/blocks
  - awards
  - attachments/media uploads
  - moderation logs
  - member/ban management
  - audit verification
- [x] Admin page calls guarded `/admin/*` APIs and shows access-denied when backend admin checks fail.
- [x] No frontend route exists for `/messages`.
- [x] No frontend route exists for `/notifications`.
- [x] Frontend receipt/proof vault UI exists under `/acknowledgements` and audit verification under `/audit/verify`.
- [x] Post detail UI consumes verification/audit paths.
- [x] Voting UI is integrated into post cards and comments.
- [x] Post creation supports text only despite backend DTO supporting link/image/video/crosspost.
- [x] Attachment upload UI exists through the post editor/file uploader.
- [x] Awards UI exists under `/awards` and award modal components.
- [x] Community moderation UI includes reports, mod logs, members, moderators, roles, queue, banned, and settings pages.
- [x] Design is inconsistent:
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

- [x] Do not destructively remove existing data paths until replacement receipts/events exist.
- [x] Backend derives actor identity from JWT for current post/comment/message/moderation routes and rejects conflicting legacy actor fields.
- [x] Every write that changes user content or moderation state must produce an auditable event.
- [x] Server private key must be persistent and is required in production.
- [x] Existing unsigned legacy records must be marked as legacy/unverifiable, not silently treated as verified.
- [x] Frontend permissions are display hints only; backend guards/services enforce current permissions.
- [x] Federation work starts with signed server identity and signed activities.

## Phase 0: Stabilize Current Repo

### Todo

- [x] Remove or archive duplicate `backend/frontend/` pages.
- [x] Pick one frontend lockfile; keep `pnpm-lock.yaml`, remove `package-lock.json` if pnpm remains the project standard.
- [x] Add MinIO to `docker-compose.yml` or remove MinIO dependency from local default path.
- [x] Add `.env.example` requirements for `SERVER_PRIVATE_KEY_HEX`, Mongo, Redis, MinIO, mCaptcha, frontend origin, and public server URL.
- [x] Replace sensitive console logging in crypto/auth paths with structured non-secret diagnostics.
- [x] Normalize JWT user access to `req.user.id` everywhere.
- [x] Fix unauthenticated dangerous routes:
  - [x] Protect subreddit delete.
  - [x] Add `JwtAuthGuard` before `SubredditRbacGuard` where missing.
  - [x] Reorder `check-name/:name` before `:id`.
- [x] Add a backend `me/permissions` or community permission endpoint so UI does not infer permissions.

### Acceptance Checks

- [x] Backend build passes.
- [x] Frontend build passes.
- [x] Existing auth, community creation, post creation, and comment creation still work.
- [x] No secret/public-key/signature debug dumps remain in normal logs.

## Phase 1: UX Feature Repair

### Todo

- [x] Create a consistent app shell:
  - [x] Desktop nav: Feed, Communities, Create, Messages, Notifications, Moderation, Audit, Profile.
  - [x] Mobile nav/drawer.
  - [x] Auth-aware user menu with public key identity.
- [x] Build shared UI primitives:
  - [x] Button styles.
  - [x] Form field styles.
  - [x] Status badges.
  - [x] Empty states.
  - [x] Loading skeletons.
  - [x] Error callouts.
- [x] Upgrade home feed:
  - [x] Sort controls.
  - [x] Community filter.
  - [x] Vote buttons.
  - [x] Save button.
  - [x] Award button placeholder wired when awards UI lands.
  - [x] Audit badge.
- [x] Upgrade post detail:
  - [x] Vote controls.
  - [x] Save/share controls.
  - [x] Audit panel using existing `/posts/:id/verify`.
  - [x] Audit trail panel using existing `/posts/:id/audit-trail`.
  - [x] Moderator controls based on backend permission result.
- [x] Upgrade comment UI:
  - [x] Nested comment rendering.
  - [x] Reply composer.
  - [x] Vote controls.
  - [x] Removed/flagged/locked states.
- [x] Upgrade community UI:
  - [x] Member count correctness.
  - [x] Join/leave state.
  - [x] Rules panel.
  - [x] Moderators link.
  - [x] Mod logs link.
  - [x] Ban/member management link.
- [x] Upgrade post creation:
  - [x] Text posts.
  - [x] Link posts.
  - [x] Attachment-backed image/video posts after MinIO compose is fixed.
  - [x] Visible local receipt after successful creation.
- [x] Upgrade settings/profile:
  - [x] Identity/public key section.
  - [x] Local receipt vault section.
  - [x] Feed preferences wired to backend.
  - [x] Blocked users UI.
  - [x] Saved content UI.
- [x] Replace admin stub with real dashboard shell:
  - [x] Server public key.
  - [x] Recent mod logs.
  - [x] Report queue placeholder until report endpoints exist.
  - [x] Federation status placeholder until federation module exists.

### Acceptance Checks

- [x] A signed-out user can browse public content and sees clear auth prompts for writes.
- [x] A signed-in user can navigate to all implemented backend features that have safe APIs.
- [x] UI no longer contains fake admin authorization.
- [x] UI no longer links to unsupported WebSocket behavior.

## Phase 2: Identity, DTO, and Permission Refactor

### Todo

- [x] Replace client-supplied actor fields:
  - [x] `CreatePostDto.authorId` becomes backend-derived.
  - [x] `CreateCommentDto.authorId` becomes backend-derived.
  - [x] `PostModBaseDto.moderatorId` becomes backend-derived.
  - [x] `CommentModBaseDto.moderatorId` becomes backend-derived.
  - [x] Message sender id becomes backend-derived.
- [x] Define common actor context:
  - [x] `authId`
  - [x] `userId`
  - [x] `publicKey`
  - [x] `globalFlags`
- [x] Centralize permission checks:
  - [x] Global admin/mod flags.
  - [x] Community owner.
  - [x] Community moderator.
  - [x] Approved contributor.
  - [x] Banned/muted state.
- [x] Replace fragile `SubredditRbacGuard` with action-specific permission service.
- [x] Add permission endpoints:
  - [x] `GET /subreddits/:id/permissions/me`
  - [x] `GET /posts/:id/permissions/me`
  - [x] `GET /comments/:id/permissions/me`
- [x] Fix member count idempotency for join/leave.
- [x] Keep membership records append-only or status-based instead of deleting on leave.

### Acceptance Checks

- [x] Direct API calls cannot impersonate authors/moderators/senders.
- [x] Moderation routes check the target content's actual subreddit.
- [x] Banned users cannot post, comment, vote, or message where prohibited.

## Phase 3: Canonical Receipts and Content Verification

### Todo

- [x] Create shared canonical payload builder for:
  - [x] post create
  - [x] post edit
  - [x] post delete
  - [x] comment create
  - [x] comment edit
  - [x] comment delete
  - [x] message send if chat receipts are included
- [x] Store canonical payload or canonical payload hash with each signed event.
- [x] Replace ad hoc `JSON.stringify` contracts with deterministic canonical JSON.
- [x] Define `Receipt` schema:
  - [x] `receiptVersion`
  - [x] `serverId`
  - [x] `serverBaseUrl`
  - [x] `contentType`
  - [x] `contentId`
  - [x] `action`
  - [x] `canonicalPayload`
  - [x] `contentHash`
  - [x] `userPublicKey`
  - [x] `userSignature`
  - [x] `serverKeyId`
  - [x] `serverSignature`
  - [x] `createdAt`
- [x] Return receipt from post create.
- [x] Return receipt from comment create.
- [x] Add receipt endpoints:
  - [x] `GET /audit/receipts/content/:type/:id`
  - [x] `POST /audit/receipts/verify`
  - [x] `POST /audit/signatures/verify`
  - [x] `GET /audit/server-key`
- [x] Add frontend receipt vault:
  - [x] Save receipts locally.
  - [x] Export receipt JSON.
  - [x] Verify pasted receipt.
  - [x] Show receipt state on post/comment pages.

### Acceptance Checks

- [x] Tampered content fails verification.
- [x] Tampered user signature fails verification.
- [x] Tampered server signature fails verification.
- [x] Legacy content is clearly marked as legacy/unverifiable.

## Phase 4: Append-Only Moderation Audit

### Todo

- [x] Replace `ModLog` with or migrate to `ModerationEvent`.
- [x] Moderation event fields:
  - [x] `eventId`
  - [x] `eventVersion`
  - [x] `subredditId`
  - [x] `actorAuthId`
  - [x] `actorPublicKey`
  - [x] `action`
  - [x] `targetType`
  - [x] `targetId`
  - [x] `reason`
  - [x] `previousStateHash`
  - [x] `newStateHash`
  - [x] `moderatorSignature`
  - [x] `serverSignature`
  - [x] `createdAt`
- [x] Require moderator signatures for every moderation action or define a server-attested admin emergency action type.
- [x] Add server acknowledgement for moderation events.
- [x] Do not hard-delete posts/comments/subreddits through normal moderation.
- [x] Add restore actions for posts/comments.
- [x] Add report endpoints:
  - [x] `POST /reports`
  - [x] `GET /reports`
  - [x] `PATCH /reports/:id`
- [x] Add frontend moderation dashboard:
  - [x] Reports.
  - [x] Removed content.
  - [x] Bans.
  - [x] Members.
  - [x] Moderators.
  - [x] Signed event details.

### Acceptance Checks

- [x] Every moderation state change has a signed event.
- [x] Moderation event history remains visible after content is removed.
- [x] Bulk content removal creates per-content audit events or a signed batch event with verifiable members.

## Phase 5: Third-Party Audit Service

### Todo

- [x] Add `audit-service/` as separate backend.
- [x] Add audit service to `docker-compose.yml`.
- [x] Audit service schemas:
  - [x] submitted receipt
  - [x] verification result
  - [x] server identity cache
  - [x] submission timestamp
- [x] Audit service endpoints:
  - [x] `POST /receipts`
  - [x] `POST /receipts/verify`
  - [x] `GET /receipts/:id`
  - [x] `GET /lookup/content-hash/:hash`
  - [x] `GET /lookup/server/:serverId`
  - [x] `GET /lookup/user/:publicKey`
- [x] Main frontend:
  - [x] Upload local receipt to audit service.
  - [x] Show third-party verification URL.
  - [x] Verify public proof page.

### Acceptance Checks

- [x] Main server cannot mutate third-party submitted proofs.
- [x] Anyone can reproduce verification from public receipt data.
- [x] Invalid receipts are stored as failed or rejected with clear reason.

## Phase 6: Federation

### Todo

- [x] Add `FederationModule`.
- [x] Define persistent server identity:
  - [x] `serverId`
  - [x] `baseUrl`
  - [x] `publicKey`
  - [x] `keyId`
  - [x] `software`
  - [x] `version`
  - [x] `capabilities`
- [x] Add discovery endpoints:
  - [x] `GET /.well-known/jagoo-bahee`
  - [x] `GET /.well-known/nodeinfo`
  - [x] `GET /nodeinfo/2.1`
- [x] Add remote server registry:
  - [x] `POST /admin/federation/servers`
  - [x] `GET /federation/servers`
  - [x] `PATCH /admin/federation/servers/:id`
- [x] Define signed activity envelope:
  - [x] `activityId`
  - [x] `type`
  - [x] `actorServerId`
  - [x] `object`
  - [x] `objectHash`
  - [x] `createdAt`
  - [x] `signature`
- [x] Add inbox/outbox:
  - [x] `POST /federation/inbox`
  - [x] `GET /federation/outbox`
- [x] Emit activities for:
  - [x] community created/updated
  - [x] post created/edited/removed/restored
  - [x] comment created/edited/removed/restored
  - [x] moderation event created
- [x] Store remote provenance on remote objects.
- [x] Add frontend federation admin screen.

### Acceptance Checks

- [x] Two local Jagoo Bahee servers can exchange a signed post-created activity.
- [x] Invalid remote signatures are rejected.
- [x] Remote content is visibly marked with server provenance.

## Phase 7: Chat and Messaging UI

### Todo

- [x] Fix message controller identity bug from `req.user.userId` to resolved user id.
- [x] Decide whether messages are pseudonymous server-visible DMs or encrypted messages.
- [x] Add message signature verification.
- [x] Add conversation grouping:
  - [x] `conversationId`
  - [x] participants
  - [x] last message
  - [x] unread count
- [x] Enforce blocks in message send/reply.
- [x] Add frontend routes:
  - [x] `/messages`
  - [x] `/messages/new`
  - [x] `/messages/[conversationId]`
- [x] Add navigation unread badge.
- [x] Add signed message receipt only if it does not falsely imply privacy.

### Acceptance Checks

- [x] User can send a message to another user by username/public key.
- [x] User can reply in a conversation.
- [x] Read/unread state works.
- [x] Blocked users cannot message blockers.

## Phase 8: Tests and Documentation

### Todo

- [x] Backend unit tests:
  - [x] canonical JSON
  - [x] user signature verification
  - [x] server signature verification
  - [x] permission service
  - [x] moderation event builder
- [x] Backend e2e tests:
  - [x] auth
  - [x] post receipt
  - [x] comment receipt
  - [x] moderation deny paths
  - [x] moderation event creation
  - [x] third-party receipt submission
  - [x] federation inbox rejection
- [x] Frontend checks:
  - [x] route smoke tests
  - [x] auth flow smoke
  - [x] receipt UI smoke
  - [x] messages UI smoke
- [x] Docs:
  - [x] local development
  - [x] server key persistence
  - [x] audit model
  - [x] moderation model
  - [x] federation protocol
  - [x] deployment

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
