# Jagoo Bahee Red-Team Attack Surface Report

Audit date: 2026-05-12
Merge re-audit: 2026-05-13
Hardening pass: 2026-05-13

Scope: local codebase review of the NestJS backend, Next.js frontend, Docker compose, cryptographic flows, moderation flows, file uploads, messaging, planned federation, and scaling posture. This is a defensive report for the project owner.

## Current Security Posture

Resolved or partially mitigated in the current tree:

- Attachment CRUD is behind `JwtAuthGuard` and scoped to owner/admin/moderator.
- Production startup requires `JWT_SECRET`, `FRONTEND_ORIGIN`, and persistent `SERVER_PRIVATE_KEY_HEX`.
- Global throttling uses Redis-backed storage, so rate limits are shared across horizontally scaled backend replicas.
- Additional Redis abuse buckets now cover auth challenge, auth submit, account creation, post creation/update, comment creation, message send/reply, and attachment upload-url creation.
- Abuse buckets fail closed in production when Redis is unavailable unless `ABUSE_LIMIT_FAIL_OPEN=true` is explicitly set.
- Scale compose resets host-published Mongo, Redis, MinIO, and mCaptcha ports; only the backend load balancer and frontend are published.
- Federation server registry rejects local/private/non-HTTP origins before future discovery code can fetch them.

## Executive Summary

Jagoo Bahee has the right product goal, but the current implementation is still pre-hardening. The largest risks are not exotic cryptography attacks; they are broken authorization boundaries, unaudited mutable moderation state, weak operational defaults, and resource exhaustion paths.

Highest-risk classes:

- Critical: unauthenticated or weakly authenticated attachment CRUD paths.
- Critical: moderation/admin actions still produce incomplete or unsigned audit evidence.
- High: account creation and authentication can be used for database and CPU exhaustion.
- High: file upload flows allow storage exhaustion and metadata spoofing.
- High: federation, when added, will be vulnerable to replay, SSRF, spam relay, and signature downgrade unless constrained from the start.
- High: horizontal scaling without stable keys and shared rate-limit state invalidates audit receipts and weakens DoS controls.

## 2026-05-13 Dev-Into-Main Merge Findings

`MERGE-001` Member status bit downgrade

- Surface: subreddit membership, voting ban checks, moderator checks, permission cache.
- Finding: dev branch code shifted `BANNED` to bit `1`, conflicting with main's persisted federated contract where `MEMBER=1`, `MUTED=2`, `BANNED=4`, `MODERATOR=8`, and `CONTRIBUTOR=16`.
- Impact: banned users could be treated as normal members, normal members could be treated as banned by some paths, and moderation authority could diverge across instances.
- Remediation applied: restored stable bit positions, restored vote ban checks to bit `4`, and added a regression test for the persisted bit contract.

`MERGE-002` Insecure object-storage CORS default

- Surface: MinIO/S3 bucket CORS provisioning.
- Finding: dev branch bucket bootstrap used wildcard origins, wildcard headers, and allowed `DELETE`.
- Impact: browser upload URLs would be easier to abuse from arbitrary origins and future misrouted delete flows would have broader browser reach.
- Remediation applied: CORS origins now default to `FRONTEND_ORIGIN`/`MINIO_CORS_ALLOWED_ORIGINS`, allowed methods exclude `DELETE`, and allowed headers are constrained to upload-required headers.

`MERGE-003` Debug logging leaked identifiers

- Surface: vote service.
- Finding: dev branch logged voter id, target id, target type, and existing vote state.
- Impact: logs could correlate pseudonymous users and activity.
- Remediation applied: removed merge-introduced vote debug logging.

`MERGE-004` Route collision hid visitable pages

- Surface: Next.js app routes.
- Finding: dev branch added `/messages/[userId]` and `/u/[user]` while main already had `/messages/[conversationId]` and `/u/[publicKey]`.
- Impact: production build failed and user/profile/message pages were not reliably visitable.
- Remediation applied: removed duplicate dynamic routes, fixed the conversation route param, and kept profile aliases routing to `/users/:username`.

`MERGE-005` Dev theme needed isolation

- Surface: frontend theme variables and global UI.
- Finding: dev's green color scheme conflicted with main's default theme.
- Impact: merge could silently replace the main visual contract.
- Remediation applied: stored the dev palette as `fluent-light` and `fluent-dark`; settings can choose the full theme, while the nav only toggles light/dark for the selected family.

## Attack Inventory

### 1. Auth And Account Creation

`AUTH-001` Challenge farming and auth CPU exhaustion

- Surface: `GET /auth/challenge`, `POST /auth`.
- Evidence: challenge is JWT-only, public, and proof-of-work difficulty defaults to `3`; global throttler existed but was not wired before the review pass.
- Attack: request many challenges, solve low-difficulty PoW cheaply, submit many new public keys.
- Impact: unbounded `auths` and `users` growth, username collision retries, Mongo write load, JWT signing load.
- Current mitigation: route-level throttle, Redis global throttle, and Redis abuse buckets for challenge, submit, and account-create.
- Residual risk: proof-of-work difficulty is static and mCaptcha is optional unless configured.

`AUTH-002` mCaptcha can be bypassed by configuration omission

- Surface: `AuthService.authenticate`.
- Evidence: mCaptcha verification only runs if `MCAPTCHA_URL`, `MCAPTCHA_SECRET`, and `MCAPTCHA_SITEKEY` are all set.
- Attack: any deployment missing one variable silently disables CAPTCHA.
- Impact: cheap account creation, voting, messaging, content spam.

`AUTH-003` Stateless challenge replay within JWT lifetime

- Surface: `AuthService.challenge` and `authenticate`.
- Evidence: challenge token is signed but not persisted or consumed.
- Attack: reuse a solved challenge for repeated authentication attempts until expiry.
- Impact: account creation acceleration and replay-friendly auth traffic.

`AUTH-004` JWT revocation gap

- Surface: all JWT-authenticated APIs.
- Evidence: JWTs are accepted without server-side revocation/session table.
- Attack: stolen token remains valid until expiry.
- Impact: content creation, moderation if privileged, messages, attachments.

`AUTH-005` public key identity enumeration

- Surface: `/users/by-public-key/:publicKey`, `/u/[publicKey]`.
- Attack: probe known or leaked public keys to determine account existence.
- Impact: pseudonym correlation.

`AUTH-006` account swarm through distributed IPs

- Surface: `POST /auth`.
- Attack: attacker rotates IPs/proxies and submits many fresh public keys, each solving low-difficulty PoW.
- Current mitigation: per-IP/user-agent/public-key account-create bucket.
- Residual risk: no reputation system, subnet quota, or mandatory CAPTCHA for high-risk deployments.

`AUTH-007` refresh token theft has no server-side kill switch

- Surface: `GET /auth/refresh`, HttpOnly refresh cookie.
- Attack: malware/browser compromise or same-site weakness steals/uses refresh token until expiry.
- Impact: session persistence after user loses control.
- Required defense: persisted session table with refresh token id, rotation, reuse detection, and revocation.

### 2. Authorization And Access Control

`AUTHZ-001` Attachment base CRUD was public

- Surface: `POST /attachments`, `GET /attachments`, `GET /attachments/:id`, `PUT /attachments/:id`, `DELETE /attachments/:id`.
- Evidence: only upload-url, confirm, download, and by-key delete routes have `JwtAuthGuard`.
- Attack: create fake attachment records, enumerate attachment metadata, mutate records, delete records by id.
- Impact: data integrity loss, content reference breakage, privacy leak.
- Status: fixed for current code paths; keep e2e coverage to prevent regression.

`AUTHZ-002` Subreddit member controller likely permits unsafe status changes

- Surface: `subreddit-members` controller/service.
- Evidence: status update and ban methods accept `moderatorSignature` but service does not verify it.
- Attack: if controller guard is weak or misrouted, attacker can alter membership flags or generate unsigned logs.
- Impact: privilege escalation, false bans, audit pollution.

`AUTHZ-003` Global ABAC is trusted from JWT until expiry

- Surface: ABAC checks in guards/services.
- Evidence: JWT embeds `abac`.
- Attack: if ABAC is revoked in DB, old JWT still carries privilege.
- Impact: stale admin/mod access.

`AUTHZ-004` UI admin page is not backend authorization

- Surface: frontend `/admin`.
- Evidence: existing admin page is a stub.
- Attack: users may trust client-side admin display; future endpoints may copy that assumption.
- Impact: privilege confusion.

### 3. Content Integrity And Auditability

`AUDIT-001` Server acknowledgement is not a portable receipt

- Surface: post/comment acknowledgement model.
- Evidence: acknowledgements do not include full canonical payload, server URL, subject type versioning, or verification envelope.
- Attack: server can later dispute context around a hash/signature.
- Impact: weaker user proof, harder third-party verification.

`AUDIT-002` Moderation logs are mutable database rows

- Surface: `ModLog` collection.
- Evidence: normal Mongoose documents with no hash chain or append-only enforcement.
- Attack: admin/DB operator edits/deletes logs.
- Impact: violates the product goal that moderation is auditable and tamper-evident.

`AUDIT-003` Many moderation actions remain unsigned

- Surface: post approve/lock/pin/flag, comment moderation, member status changes.
- Evidence: only selected actions verify moderator signatures.
- Attack: server or compromised moderator session changes state without user-verifiable moderator proof.
- Impact: unverifiable moderation.

`AUDIT-004` post/comment edit flows do not require new signatures

- Surface: `PATCH /posts/:id`, `PATCH /comments/:id`.
- Evidence: update methods mutate content with no new canonical payload hash/signature enforcement.
- Attack: compromised JWT or server-side mutation changes content without a fresh author proof.
- Impact: author can be framed or proof chain breaks.

`AUDIT-005` comment delete has no server acknowledgement

- Surface: `DELETE /comments/:id`.
- Evidence: comment remove by author mutates flags but does not create a server acknowledgement.
- Attack: server can remove comment without giving user proof of deletion action/result.
- Impact: weak dispute path.

`AUDIT-006` ephemeral server key breaks receipt verification

- Surface: `server-sign.util.ts`.
- Evidence: before this review pass, missing `SERVER_PRIVATE_KEY_HEX` generated a random key.
- Attack: restart changes server identity; old acknowledgements fail or become ambiguous.
- Impact: audit collapse after deployment restart.

### 4. Resource Exhaustion And DoS

`DOS-001` Global throttling was configured but not enforced

- Surface: `AppModule`.
- Evidence: `ThrottlerModule` existed but `APP_GUARD` was not registered before this review pass.
- Attack: flood public list/detail endpoints, auth, users, attachments.
- Impact: CPU/DB exhaustion.

`DOS-002` Throttling is not horizontally safe

- Surface: Nest throttler.
- Evidence: default throttler storage is in-process.
- Attack: distribute requests across replicas to multiply rate limits.
- Impact: scaling weakens protection.
- Status: fixed for global throttling and new abuse buckets through Redis-backed state.

`DOS-002B` Redis outage disables abuse controls

- Surface: Redis-backed throttling and abuse buckets.
- Attack: attacker or outage disrupts Redis; if limiter fails open, expensive write routes become unlimited.
- Current mitigation: route-specific abuse limiter fails closed in production by default.
- Residual risk: global throttler behavior during Redis failure should be load-tested before production.

`DOS-003` Unbounded public list queries

- Surface: many list endpoints with `limit` and `skip`.
- Evidence: controllers often accept numeric query values directly; some services do not clamp.
- Attack: request huge limits or deep skips repeatedly.
- Impact: Mongo scan/sort pressure and memory usage.

`DOS-004` Vote race conditions corrupt counters

- Surface: votes service and post/comment counters.
- Evidence: vote state and counter updates are multiple DB operations without transaction.
- Attack: concurrent vote toggles for same user/target.
- Impact: score drift and karma manipulation.

`DOS-005` comment rate limit is per author only and very strict locally

- Surface: comments service Redis key.
- Attack: many accounts bypass per-author limit.
- Impact: spam despite rate limit.

`DOS-006` upload URL creation can exhaust storage/DB

- Surface: `POST /attachments/upload-url`.
- Evidence: accepts declared `sizeBytes`, `mimeType`, filename, and creates DB record before upload.
- Attack: create many unconfirmed records or upload large objects if MinIO policy allows.
- Impact: DB bloat, object storage cost, cleanup load.

`DOS-007` cleanup jobs can become expensive

- Surface: attachment cleanup service.
- Attack: produce many orphan/unconfirmed records to make scheduled cleanup scan/delete repeatedly.
- Impact: background load and storage churn.

`DOS-008` expensive regex/search patterns

- Surface: search/list filters.
- Attack: submit pathological regex-like input where services build Mongo regexes directly.
- Impact: CPU-heavy Mongo scans and latency spikes.
- Current mitigation: subreddit/post suggestion escapes user terms; award type search now escapes and truncates input.

`DOS-009` federation registry pollution

- Surface: admin federation server registry.
- Attack: store thousands of bad/private origins or origins with credentials/path confusion before federation discovery exists.
- Current mitigation: admin-only access plus base URL validation for scheme, credentials, origin-only shape, localhost, and private IP literals.
- Residual risk: DNS rebinding defense must be added when outbound discovery is implemented.

### 5. File Upload And Media Abuse

`FILE-001` unauthenticated attachment record manipulation

- Same root as `AUTHZ-001`.
- Impact: forge metadata, swap attachment ownership, delete records.

`FILE-002` content type and hash are client-controlled

- Surface: attachment upload and confirm.
- Evidence: metadata comes from body or object head; no server hash verification.
- Attack: upload malicious content with benign MIME/hash metadata.
- Impact: unsafe downloads, broken proof model.

`FILE-003` public file flag lacks access model

- Surface: attachment `isPublic`.
- Evidence: access helper allows owner/admin/mod, but public/private semantics are incomplete.
- Attack: private media may later be exposed by future public route logic.
- Impact: privacy failure.

`FILE-004` filename and object key disclosure

- Surface: attachment list/get and presigned URLs.
- Attack: enumerate metadata and infer owner ids, timestamps, original filenames.
- Impact: pseudonym correlation and privacy leak.

### 6. Messaging And Abuse

`MSG-001` message spam by account swarm

- Surface: `POST /messages`.
- Evidence: no message-specific throttling.
- Attack: create many accounts and send DMs to known public keys.
- Impact: inbox DoS and harassment.

`MSG-002` server-visible messages

- Surface: message storage.
- Evidence: content is stored plaintext.
- Attack: DB/operator reads private messages.
- Impact: privacy mismatch if UI implies secure chat.

`MSG-003` conversation enumeration by local user

- Surface: `/messages?limit=100&page=1` and client-side filtering.
- Attack: heavy message lists to reconstruct all conversations.
- Impact: performance and metadata exposure within a valid account.

### 7. Moderation And Governance Abuse

`MOD-001` moderator signature coverage incomplete

- Surface: moderation services.
- Attack: moderator or compromised server performs actions that look legitimate but lack verifiable proof.
- Impact: unverifiable removals/bans.

`MOD-002` ban `deleteContent` is bulk mutation without per-target proof

- Surface: `SubredditsService.banUser`.
- Attack: remove large content sets in one action without individual receipts.
- Impact: users cannot independently verify each removed item.

`MOD-003` mod log target typing is too loose

- Surface: `ModLogService`.
- Attack: create ambiguous logs or logs with missing target ids.
- Impact: poor forensic value.

`MOD-004` member count drift

- Surface: join/leave/kick/ban operations.
- Status: partially fixed.
- Residual attack: concurrent joins/leaves can still race.
- Impact: inaccurate community state.

### 8. Frontend And Client-Side Risks

`FE-001` private key is still extractable by XSS

- Surface: sessionStorage and frontend runtime.
- Evidence: private key is kept in browser storage for signing.
- Attack: XSS or malicious dependency extracts signing key.
- Impact: full identity compromise.

`FE-002` no strong content security policy

- Surface: Next.js app.
- Attack: injected scripts from future markdown/media rendering.
- Impact: key theft and token theft.

`FE-003` auth token stored in localStorage and cookie

- Surface: auth provider and auth response.
- Attack: XSS reads localStorage token even if cookie is HttpOnly.
- Impact: account compromise until JWT expiry.

`FE-004` frontend moderation controls can submit unsigned moderation

- Surface: community page remove button.
- Evidence: UI submits reason and moderatorId in older code paths; backend now derives moderator but remove still expects a signature.
- Attack: broken UX may encourage disabling signature checks later.
- Impact: pressure toward unsafe backend behavior.

`FE-005` markdown rendering XSS

- Surface: markdown/rich post rendering.
- Attack: malicious markdown or embedded HTML/script URLs executes in the app origin.
- Impact: private key theft, JWT theft from localStorage, signed-content forgery.
- Required defense: strict markdown sanitizer, URL protocol allowlist, CSP, and regression tests with hostile markdown fixtures.

`FE-006` dependency supply-chain key theft

- Surface: browser crypto, markdown editor, UI dependencies.
- Attack: compromised dependency exfiltrates sessionStorage private key during signing.
- Impact: permanent pseudonymous identity compromise.
- Required defense: lockfile review, dependency allowlist, Subresource/CSP restrictions where possible, and key handling migration to non-exportable WebCrypto when feasible.

### 9. Docker And Deployment

`OPS-001` Mongo and Redis exposed on host ports in default compose

- Surface: `docker-compose.yml`.
- Attack: local network or misconfigured host exposes DB/cache.
- Impact: total data compromise.
- Status: dev compose still publishes ports for local work; scale compose resets internal service ports and publishes only frontend plus backend load balancer.

`OPS-002` default MinIO credentials

- Surface: compose and config defaults.
- Attack: if exposed, attacker logs into object storage.
- Impact: media exfiltration, deletion, storage abuse.

`OPS-003` Swagger exposed in production

- Surface: `/api`, `/swagger.json`.
- Attack: endpoint discovery.
- Impact: easier exploitation and fuzzing.

`OPS-004` permissive CORS fallback

- Surface: `main.ts`.
- Evidence: if `FRONTEND_ORIGIN` is unset, CORS origin is `true`.
- Attack: malicious sites can call APIs from browsers where tokens are present.
- Impact: cross-site API abuse.
- Status: production validation now requires `FRONTEND_ORIGIN`; dev remains permissive.

`OPS-005` health endpoints can leak topology if expanded carelessly

- Surface: `/health/live`, `/health/ready`.
- Risk: future readiness details should not include secrets or internal URLs.

### 10. Federation-Specific Attack Cases

Federation is not implemented yet, but these are the expected abuse cases that must be designed against before adding it.

`FED-001` unsigned or weakly signed activities

- Attack: remote server submits forged post/comment/moderation events.
- Impact: remote content poisoning.

`FED-002` replayed activities

- Attack: resend old signed activities to duplicate posts, resurrect deleted content, or replay moderation.
- Required defense: activity ids, nonce/timestamp windows, idempotency table.

`FED-003` SSRF through remote discovery

- Attack: register a remote server URL pointing to internal metadata services or private network hosts.
- Impact: server-side request forgery.

`FED-004` federation inbox DoS

- Attack: remote sends large bodies, many signatures, expensive verification payloads.
- Impact: CPU and DB exhaustion.

`FED-005` trust-on-first-use key rotation abuse

- Attack: malicious remote rotates keys to dispute past actions or impersonate prior server.
- Impact: broken provenance.

`FED-006` moderation laundering

- Attack: remote server republishes removed content without carrying original moderation event.
- Impact: local policy bypass.

`FED-007` remote spam amplification

- Attack: one server sends high-volume activities that are fanned out locally.
- Impact: local feeds and DB polluted.

`FED-008` malicious media references

- Attack: remote activities reference huge media, malware, tracking URLs, or private IP URLs.
- Impact: storage/SSRF/privacy risk.

`FED-009` canonicalization mismatch

- Attack: exploit different JSON serialization rules between servers.
- Impact: signature verification confusion.

`FED-010` clock skew and expiry bypass

- Attack: future-dated or old activities avoid replay windows.
- Impact: delayed spam, duplicate events, moderation confusion.

`FED-011` DNS rebinding after registry approval

- Attack: remote host resolves to a public IP during approval, then later resolves to loopback/private IP during fetch.
- Impact: SSRF despite initial URL validation.
- Required defense: resolve and pin IPs per fetch, reject private ranges after DNS resolution, cap redirects, and recheck every redirect target.

`FED-012` remote fanout amplification

- Attack: one accepted remote event triggers notifications, indexing, websocket pushes, and remote re-delivery to other peers.
- Impact: small remote request creates large local work.
- Required defense: per-remote quotas, fanout caps, async queues with backpressure, and quarantine mode.

`FED-013` identity collision across servers

- Attack: remote user/community names collide with local names or trusted remote names.
- Impact: impersonation and moderation confusion.
- Required defense: render remote principals with server-qualified identity and store canonical actor ids.

`FED-014` signature downgrade/version confusion

- Attack: remote sends old activity version with weaker canonicalization or missing fields.
- Impact: bypass of newer verification rules.
- Required defense: versioned envelope schema, strict minimum accepted version, and test vectors.

## Prioritized Risk Table

| ID | Severity | Area | Status |
| --- | --- | --- | --- |
| AUTHZ-001 | Critical | attachments | fixed; keep e2e regression |
| AUDIT-002 | Critical | moderation/audit | open |
| AUDIT-003 | Critical | moderation signatures | open |
| DOS-002 | High | scaling/rate limit | fixed for implemented limits |
| FILE-002 | High | uploads | open |
| OPS-004 | High | CORS | fixed in production validation |
| FED-003 | High | federation | design blocker |
| FED-004 | High | federation | design blocker |
| FE-001 | High | frontend keys | open |
| AUTH-002 | Medium | auth config | open |
| AUTH-006 | Medium | account creation | partially mitigated |
| FE-005 | High | markdown/XSS | open |

## Red-Team Conclusion

The platform should not be exposed to hostile users until these are addressed:

- Keep attachment CRUD locked down and covered by e2e tests.
- Keep rate limiting shared across replicas and tune route-specific abuse buckets.
- Require persistent server signing keys and explicit CORS origins in production.
- Replace mutable moderation logs with append-only signed moderation events.
- Add a federation security gate before writing federation code.
