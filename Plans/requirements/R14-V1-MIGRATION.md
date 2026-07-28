# R14 — v1 → v2 Migration Map

## 1. Write operations → envelope domains

Every v1 write endpoint maps to a domain on the single write endpoint `POST /v1/envelopes`.

| v1 endpoint | v2 domain | Plane |
|---|---|---|
| `POST /posts` | `jb:post:create:v1` | FORUM |
| `PATCH /posts/{id}` | `jb:post:update:v1` | FORUM |
| `DELETE /posts/{id}` | `jb:post:delete:v1` | FORUM |
| `POST /posts/{id}/vote`, `POST /votes` | `jb:vote:cast:v1` | FORUM |
| `POST /posts/{id}/mod/{approve,remove,restore,lock,unlock,pin,unpin,flag,unflag}` | `jb:mod:action:v1` (verb) | FORUM |
| `POST /comments` | `jb:comment:create:v1` | FORUM |
| `PATCH /comments/{id}` | `jb:comment:update:v1` | FORUM |
| `DELETE /comments/{id}` | `jb:comment:delete:v1` | FORUM |
| `POST /comments/{id}/mod/{approve,remove,collapse,uncollapse,flag,unflag}` | `jb:mod:action:v1` (verb) | FORUM |
| `POST /comments/{id}/vote` | `jb:vote:cast:v1` | FORUM |
| `POST /subreddits` | `jb:community:create:v1` | FORUM |
| `PUT /subreddits/{id}` | `jb:community:update:v1` | FORUM |
| `DELETE /subreddits/{id}` | `jb:community:archive:v1` | FORUM |
| `POST /subreddits/{id}/join` | `jb:membership:join:v1` | FORUM |
| `POST /subreddits/{id}/leave` | `jb:membership:leave:v1` | FORUM |
| `POST /subreddits/{id}/ban`, `/kick`, `DELETE /ban/{userId}` | `jb:mod:action:v1` (BAN / KICK / UNBAN) | FORUM |
| `POST\|DELETE /subreddits/{id}/moderators*` | `jb:role:assign:v1` / `jb:role:revoke:v1` | FORUM |
| `POST /subreddits/{sid}/members`, `PATCH`, `DELETE`, `/ban`, `/role` | membership + mod + role domains | FORUM |
| `POST /messages`, `POST /messages/reply` | `jb:message:forum:v1` | FORUM |
| `DELETE /messages/{id}` | `jb:message:forum:v1` (tombstone body) | FORUM |
| `PATCH /messages/read` | local state — no envelope | — |
| `POST /moderation/reports` | `jb:report:create:v1` | FORUM |
| `PUT /moderation/reports/{id}` | `jb:report:resolve:v1` | FORUM |
| `DELETE /moderation/reports/{id}` | `jb:report:resolve:v1` (DISMISSED) | FORUM |
| `POST /roles`, `PUT /roles/{id}`, `DELETE /roles/{id}` | `jb:role:define:v1` | FORUM |
| `POST /roles/{rid}/assign/{uid}` | `jb:role:assign:v1` | FORUM |
| `DELETE /roles/{rid}/revoke/{uid}` | `jb:role:revoke:v1` | FORUM |
| `POST /awards` | `jb:award:give:v1` | FORUM |
| `POST\|PATCH\|DELETE /awards/types*` | `jb:award:type:v1` | FORUM |
| `POST /attachments`, `/confirm`, `/confirm-upload`, `PUT /attachments/{id}` | `jb:attachment:claim:v1` | FORUM |
| `DELETE /attachments/{id}`, `/by-key/{key}` | `jb:attachment:claim:v1` (tombstone) | FORUM |
| `PATCH /users/me/profile` | `jb:profile:update:v1` | FORUM |
| `POST /users/me/create` | `jb:key:certify:v1` | FORUM |
| `POST /users/me/follow\|unfollow/{id}` | `jb:social:follow:v1` | FORUM |
| `POST /users/me/block\|unblock/{id}` | `jb:social:block:v1` | FORUM |
| `POST /users/me/save\|unsave` | `jb:social:save:v1` | FORUM |
| `POST /users/me/feed-preferences` | `jb:prefs:feed:v1` | FORUM |
| `POST /notifications`, `PATCH /notifications/read\|unread`, `DELETE` | local state — derived projection | — |
| `PATCH /admin/users/{id}/ban\|unban` | `jb:mod:action:v1` (global scope) | FORUM |
| `PATCH /admin/users/{id}/global-role` | `jb:role:assign:v1` (global scope) | FORUM |
| `POST\|PATCH\|DELETE /admin/federation/servers*` | `jb:server:vouch:v1` | — |
| `PUT /admin/security/config` | admin config — no envelope | — |
| `POST\|DELETE /admin/security/ip-blocks*` | admin config — no envelope | — |

## 2. Read operations

| v1 endpoint | v2 endpoint |
|---|---|
| `GET /posts` | `GET /v1/feed` |
| `GET /posts/{id}` | `GET /v1/posts/:contentId` |
| `GET /posts/{id}/comments` | `GET /v1/posts/:contentId/comments` |
| `GET /posts/{id}/audit-trail` | `GET /v1/posts/:contentId/audit` |
| `GET /posts/{id}/verify` | `GET /v1/receipts/:contentId` |
| `GET /comments/{id}` | `GET /v1/comments/:contentId` |
| `GET /subreddits` | `GET /v1/communities` |
| `GET /subreddits/{id}` | `GET /v1/communities/:id` |
| `GET /subreddits/check-name/{name}` | `GET /v1/communities/name-available/:name` |
| `GET /subreddits/{id}/members` | `GET /v1/communities/:id/members` |
| `GET /subreddits/{id}/moderators` | `GET /v1/communities/:id/moderators` |
| `GET /subreddits/{id}/bans` | `GET /v1/communities/:id/bans` |
| `GET /subreddits/{id}/modlogs` | `GET /v1/communities/:id/modlog` |
| `GET /subreddits/{id}/is-moderator` | `GET /v1/communities/:id/members?key=` |
| `GET /moderation/subreddits/{id}/reports` | `GET /v1/communities/:id/reports` |
| `GET /roles/subreddit/{name}` | `GET /v1/communities/:id/roles` |
| `GET /users/{id}`, `/users/{username}` | `GET /v1/identities/:keyId`, `/v1/identities/by-name/:username` |
| `GET /users/me/profile` | `GET /v1/me/profile` |
| `GET /users/me/subreddits` | `GET /v1/me/communities` |
| `GET /users/me/feed-preferences` | `GET /v1/me/preferences` |
| `GET /notifications` | `GET /v1/me/notifications` |
| `GET /messages` | `GET /v1/me/messages` |
| `GET /awards/types`, `/awards/target/{type}/{id}` | `GET /v1/awards/types`, `/v1/awards/target/:kind/:id` |
| `GET /audit/receipts/{id}` | `GET /v1/receipts/:contentId` |
| `GET /audit/server-key`, `/moderation/server-public-key` | `GET /v1/server/identity` |
| `GET /api-credits`, `POST /api-credits/challenge`, `/redeem` | `GET /v1/credits`, `POST /v1/credits/challenge`, `/redeem` |
| `GET /auth/challenge`, `POST /auth`, `GET /auth/refresh`, `POST /auth/logout` | `/v1/auth/*` |
| `GET /health/live`, `/health/ready` | unchanged |
| `GET /.well-known/*`, `/nodeinfo/2.1` | unchanged, extended with scoped endpoints |

## 3. Mechanisms replaced

Feature preserved, implementation strengthened.

| v1 mechanism | Problem | v2 replacement |
|---|---|---|
| Dual canonical form with fallback acceptance | **Signature confusion** — a text-post signature validated a post with attacker-chosen url and attachments | One canonical form per version; hard reject on unknown version |
| `createProofHash = SHA256(userId\|postId\|serverKeyId)` | All inputs public; proves nothing, presented as verification | Merkle inclusion proof against a signed tree head |
| `audit-service` flat JSON file | No tamper evidence; O(n) full rewrite per submission | Append-only Merkle log with gossiped STHs |
| ObjectIds in signed payloads | Meaningless off-instance; **blocks federation entirely** | Public keys and content hashes |
| Two divergent JSON canonicalizers | Cross-language verification would disagree | Deterministic protobuf, one implementation, cross-language vectors |
| Admin-only federation allowlist | Volunteer relays cannot join during a shutdown | TOFU + web-of-trust with quota-by-trust |
| `federationactivities` with no unique index | Dedupe was a read-then-write race; the 11000 catch was unreachable | Unique index on `(content_id, direction)` |
| Federation outbox with no delivery | Nothing was ever sent; inbound was never projected | gRPC delivery queue + inbound projection |
| Server acknowledgements | Server-only attestation, unverifiable history | `Receipt` with inclusion proof |
| SHA-256 PoW, difficulty 3–4 | Milliseconds of work; no real cost | Argon2id, pressure-scaled, key-bound |
| Read-modify-write credit ledger | A concurrent burst cost 1 credit total | Atomic Redis Lua token bucket |
| `INCR` + separate `PEXPIRE` | Crash between them left a TTL-less key locking the subject out permanently | Single atomic script |
| UA + XFF in the rate-limit subject | One header rotation reset all limits and credits | Verified IP + subnet, or authenticated identity |
| Any-JWT-accepted guard | The 7-day refresh token authenticated as an access token everywhere | Typed claims, separate signing keys per class |
| Private key in `sessionStorage` | XSS meant permanent, unrevocable identity theft | Worker-isolated signer + revocation |
| Plaintext DMs | Server seizure exposed every conversation | E2EE with hybrid PQ key agreement |
| `delPattern` Redis SCAN per write | Self-DoS growing with keyspace size | Tagged cache keys |
| No-op WebSocket manager | No realtime at all | SSE stream + mesh push |
| Empty `syncVotes` / `syncPosts` SW stubs | "Offline-first" was not true | Real outbox drain |
| Build-time-baked API origin | One blocked domain killed everything | Multi-homeserver racing + static export |
| Moderator signature with no nonce | Replayable forever, on any instance | Nonce + domain separation + expiry |
| Four overlapping browser crypto libraries | Bundle bloat and two secp implementations | One WASM crypto module |
| Single identity for everything | Publishing under a real name would deanonymise forum history | Two decoupled identity planes |

## 4. Data migration

**There is no automated v1 → v2 data migration.** v2 is a rebuild, and v1 content cannot be carried forward with its signatures intact because:

1. v1 signatures cover ObjectId-based payloads that have no v2 equivalent.
2. v1 keys are secp256k1 from a BIP-32 path; v2 identities are Ed25519 from BIP85.
3. v1's dual canonical form means some v1 signatures are ambiguous by construction.

| ID | Approach |
|---|---|
| MIG-01 | v1 content MAY be imported as **`legacy: true`** projections with no signature claim and a visible "unverified, imported from v1" marker |
| MIG-02 | v1 users create fresh v2 identities. Username reservation MAY be offered by having the v1 key sign a claim over the new v2 key, recorded as a `legacy_link` attestation |
| MIG-03 | Community names and settings MAY be imported by an operator, re-signed under the operator's v2 key, attributed as such |
| MIG-04 | No v1 signature is ever presented in v2 as verified |

**MIG-05:** Given the hackathon timeline and that v1 is not in production use, the recommended path is **no migration** — start clean, and keep v1 running read-only if any content needs preserving.
