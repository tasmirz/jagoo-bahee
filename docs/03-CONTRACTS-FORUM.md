# 03 — Forum Plane Contracts (Plane A, anonymous)

> **Frozen before P1.** Carries forward every v1 forum feature. Feature IDs reference `SYSTEM-REQUIREMENTS.md` §11.

---

## 1. `proto/jagoo/v1/forum.proto`

```protobuf
syntax = "proto3";
package jagoo.v1;

// ── Posts ─────────────────────────────────────────────────────────────────
message PostCreate {
  string   title           = 1;   // ≤ 300 chars
  PostKind kind            = 2;
  string   body_markdown   = 3;
  string   url             = 4;
  repeated string attachments = 5;   // content_ids of AttachmentClaim
  Poll     poll            = 6;
  string   crosspost_of    = 7;      // content_id
  string   flair           = 8;
  ContentFlags flags       = 9;
}
enum PostKind { POST_KIND_UNSPECIFIED=0; TEXT=1; LINK=2; IMAGE=3; VIDEO=4; POLL=5; CROSSPOST=6; }
message Poll { string question=1; repeated string options=2; bool multiple=3; int64 closes_at_ms=4; }
message ContentFlags { bool nsfw=1; bool spoiler=2; bool oc=3; }

message PostUpdate { string target=1; string body_markdown=2; string flair=3; ContentFlags flags=4; }
message PostDelete { string target=1; string reason=2; }

// ── Comments ──────────────────────────────────────────────────────────────
message CommentCreate { string post=1; string parent_comment=2; string body_markdown=3; repeated string attachments=4; }
message CommentUpdate { string target=1; string body_markdown=2; }
message CommentDelete { string target=1; string reason=2; }

// ── Votes ─────────────────────────────────────────────────────────────────
message VoteCast { string target=1; TargetKind target_kind=2; int32 value=3; }   // -1 | 0 | +1
enum TargetKind { TARGET_KIND_UNSPECIFIED=0; POST=1; COMMENT=2; IDENTITY=3; COMMUNITY=4; MESSAGE=5; }

// ── Communities ───────────────────────────────────────────────────────────
message CommunityCreate {
  string name=1; string title=2; string description=3; string rules_markdown=4;
  Theme theme=5; CommunitySettings settings=6; bool is_private=7; bool is_nsfw=8;
}
message Theme { string primary=1; string accent=2; string background=3; string foreground=4; }
message CommunitySettings {
  bool  allow_text_posts=1; bool allow_link_posts=2;
  bool  allow_image_posts=3; bool allow_video_posts=4;
  bool  require_post_approval=5; bool allow_crossposts=6;
  int32 minimum_karma_to_post=7; int32 minimum_account_age_days=8;
}
message CommunityUpdate  { string target=1; CommunityCreate patch=2; }
message CommunityArchive { string target=1; bool archived=2; }

message MembershipJoin  { string community=1; }
message MembershipLeave { string community=1; }

// ── Moderation ────────────────────────────────────────────────────────────
message ModAction {
  ModVerb    verb          = 1;
  string     target        = 2;   // content_id or key_id
  TargetKind target_kind   = 3;
  string     reason        = 4;
  int64      expires_at_ms = 5;   // temporary bans/mutes
}
enum ModVerb {
  MOD_VERB_UNSPECIFIED=0;
  APPROVE=1; REMOVE=2; RESTORE=3;
  LOCK=4; UNLOCK=5; PIN=6; UNPIN=7;
  FLAG=8; UNFLAG=9; COLLAPSE=10; UNCOLLAPSE=11;
  BAN=12; UNBAN=13; MUTE=14; UNMUTE=15; KICK=16;
}

message ReportCreate  { string target=1; TargetKind target_kind=2; ReportReason reason=3; string detail=4; }
enum ReportReason {
  REPORT_REASON_UNSPECIFIED=0; SPAM=1; HARASSMENT=2; HATE=3; VIOLENCE=4;
  MISINFORMATION=5; SEXUAL_CONTENT=6; SELF_HARM=7; ILLEGAL=8; RULE_VIOLATION=9; OTHER=10;
}
message ReportResolve { string target=1; ReportStatus status=2; ModVerb action_taken=3; string note=4; }
enum ReportStatus { REPORT_STATUS_UNSPECIFIED=0; PENDING=1; REVIEWED=2; RESOLVED=3; DISMISSED=4; }

// ── Roles ─────────────────────────────────────────────────────────────────
message RoleDefine { string community=1; string name=2; uint64 permission_mask=3; bool is_default=4; }
message RoleAssign { string community=1; bytes subject_key=2; string role=3; }
message RoleRevoke { string community=1; bytes subject_key=2; string role=3; }

// ── Social & profile ──────────────────────────────────────────────────────
message ProfileUpdate   { string display_name=1; string bio=2; string avatar=3; string banner=4; }
message FollowIdentity  { bytes subject_key=1; bool follow=2; }
message BlockIdentity   { bytes subject_key=1; bool block=2; string reason=3; }
message SaveContent     { string target=1; TargetKind target_kind=2; bool save=3; string collection=4; }
message FeedPreferences {
  SortMode default_sort=1; Timeframe default_timeframe=2;
  bool show_nsfw=3; bool blur_nsfw=4; LayoutMode layout=5;
  repeated string favourite_communities=6; repeated bytes hidden_keys=7;
}
enum SortMode   { SORT_MODE_UNSPECIFIED=0; HOT=1; NEW=2; TOP=3; CONTROVERSIAL=4; RISING=5; }
enum Timeframe  { TIMEFRAME_UNSPECIFIED=0; HOUR=1; DAY=2; WEEK=3; MONTH=4; YEAR=5; ALL=6; }
enum LayoutMode { LAYOUT_MODE_UNSPECIFIED=0; CARD=1; CLASSIC=2; COMPACT=3; }

// ── Awards ────────────────────────────────────────────────────────────────
message AwardGive       { string target=1; TargetKind target_kind=2; string award_type=3; bool anonymous=4; string message=5; }
message AwardTypeDefine { string slug=1; string name=2; string icon=3; int32 cost=4; bool active=5; }

// ── Attachments ───────────────────────────────────────────────────────────
message AttachmentClaim {
  string storage_key=1; bytes content_sha256=2; string mime=3; uint64 size_bytes=4;
  uint32 width=5; uint32 height=6; uint32 duration_ms=7; string alt_text=8;
}

// ── Pseudonymous DMs (Plane A) ────────────────────────────────────────────
// Same engine as Signal-plane messaging (04 §4), different identity provider.
message ForumMessageSend {
  bytes  recipient_key    = 1;
  bytes  kem_ciphertext   = 2;   // ML-KEM-768, first message of a session
  bytes  ephemeral_x25519 = 3;
  bytes  ciphertext       = 4;   // ChaCha20-Poly1305
  string thread           = 5;
  uint32 ratchet_index    = 6;
}

// ── Labels (moderation attestation) ───────────────────────────────────────
message Label {
  string  target       = 1;
  Verdict verdict      = 2;
  repeated string categories = 3;
  uint32  confidence_pct = 4;
  string  model_id     = 5;   // "claude-haiku-4-5" | "human:mod"
  repeated string reasons = 6;
  bool    appealable   = 7;
}
enum Verdict { VERDICT_UNSPECIFIED=0; OK=1; REVIEW=2; RESTRICT=3; DANGEROUS=4; }
```

---

## 2. Forum domain registry

All rows have `plane: FORUM`, `priority: BULK` unless noted.

| `domain` | Body | Idempotent | Scope | Cost | Gates | Permission |
|---|---|---|---|---|---|---|
| `jb:post:create:v1` | `PostCreate` | yes | COMMUNITY | 10 | CRED, NULL | `post.create` |
| `jb:post:update:v1` | `PostUpdate` | no | COMMUNITY | 2 | CRED | owner |
| `jb:post:delete:v1` | `PostDelete` | yes | COMMUNITY | 0 | CRED | owner |
| `jb:comment:create:v1` | `CommentCreate` | yes | COMMUNITY | 3 | CRED, NULL | `post.create` |
| `jb:comment:update:v1` | `CommentUpdate` | no | COMMUNITY | 1 | CRED | owner |
| `jb:comment:delete:v1` | `CommentDelete` | yes | COMMUNITY | 0 | CRED | owner |
| `jb:vote:cast:v1` | `VoteCast` | no | COMMUNITY | 1 | CRED | member |
| `jb:community:create:v1` | `CommunityCreate` | yes | NONE | 200 | CRED, NULL, POW | authenticated |
| `jb:community:update:v1` | `CommunityUpdate` | no | COMMUNITY | 5 | CRED | `community.update` |
| `jb:community:archive:v1` | `CommunityArchive` | no | COMMUNITY | 5 | CRED | owner |
| `jb:membership:join:v1` | `MembershipJoin` | yes | COMMUNITY | 1 | CRED | — |
| `jb:membership:leave:v1` | `MembershipLeave` | yes | COMMUNITY | 0 | — | — |
| `jb:mod:action:v1` | `ModAction` | **no** | COMMUNITY | 0 | CRED | per verb |
| `jb:report:create:v1` | `ReportCreate` | yes | COMMUNITY | 2 | CRED, NULL | member |
| `jb:report:resolve:v1` | `ReportResolve` | no | COMMUNITY | 0 | CRED | `report.review` |
| `jb:role:define:v1` | `RoleDefine` | no | COMMUNITY | 5 | CRED | `member.role.update` |
| `jb:role:assign:v1` | `RoleAssign` | no | COMMUNITY | 1 | CRED | `member.role.update` |
| `jb:role:revoke:v1` | `RoleRevoke` | no | COMMUNITY | 1 | CRED | `member.role.update` |
| `jb:profile:update:v1` | `ProfileUpdate` | no | NONE | 2 | CRED | self |
| `jb:social:follow:v1` | `FollowIdentity` | no | NONE | 1 | CRED | self |
| `jb:social:block:v1` | `BlockIdentity` | no | NONE | 0 | CRED | self |
| `jb:social:save:v1` | `SaveContent` | no | NONE | 0 | — | self *(may stay local-only)* |
| `jb:prefs:feed:v1` | `FeedPreferences` | no | NONE | 0 | — | self |
| `jb:award:give:v1` | `AwardGive` | yes | COMMUNITY | 5 | CRED | member |
| `jb:award:type:v1` | `AwardTypeDefine` | no | NONE | 0 | CRED | admin |
| `jb:attachment:claim:v1` | `AttachmentClaim` | yes | NONE | 5 + 1/MB | CRED | authenticated |
| `jb:message:forum:v1` | `ForumMessageSend` | yes | NONE | 2 | CRED | **priority DIRECT** |
| `jb:label:emit:v1` | `Label` | no | COMMUNITY | 0 | — | `label.trust` |

> Gates: `CRED` = blind credential, `NULL` = epoch nullifier, `POW` = proof of work.
> **Requirement FM-01:** `jb:mod:action:v1` is non-idempotent and MUST carry a nonce. v1 moderator signatures had no nonce, expiry, or server binding and were replayable forever on any instance.

---

## 3. Status flag bitmaps (preserved from v1)

Bit positions are **frozen** — they cross federation boundaries and MUST NOT be renumbered.

**Identity flags** (uint64)

| Bit | Meaning | | Bit | Meaning |
|---|---|---|---|---|
| 0 | ACTIVE | | 5 | GLOBAL_ADMIN |
| 1 | BANNED | | 6 | KEY_REVOKED *(new)* |
| 2 | SHADOWBANNED | | 7 | *(reserved)* |
| 3 | VERIFIED | | 8–15 | reserved |
| 4 | GLOBAL_MODERATOR | | 16–31 | instance-local |

**Membership flags** (uint64) — unchanged from v1, one addition

| Bit | Meaning | | Bit | Meaning |
|---|---|---|---|---|
| 0 | MEMBER | | 3 | MODERATOR |
| 1 | MUTED | | 4 | CONTRIBUTOR |
| 2 | BANNED | | 5 | APPROVED_SUBMITTER *(new)* |

**Content flags** (uint64) — unchanged from v1, one addition

| Bit | Meaning | | Bit | Meaning |
|---|---|---|---|---|
| 0 | ACTIVE | | 6 | REMOVED |
| 1 | NSFW | | 7 | FLAGGED |
| 2 | SPOILER | | 8 | APPROVED |
| 3 | PINNED | | 9 | OC |
| 4 | LOCKED | | 10 | COLLAPSED *(comments)* |
| 5 | ARCHIVED | | | |

**Community permission bits** (uint64) — v1 set preserved, extended

| Bit | Permission | | Bit | Permission |
|---|---|---|---|---|
| 0 | `community.read` | | 7 | `post.moderate` |
| 1 | `post.create` | | 8 | `comment.moderate` |
| 2 | `community.update` | | 9 | `modlog.read` |
| 3 | `member.ban` | | 10 | `report.review` |
| 4 | `member.unban` | | 11 | `label.trust` *(new)* |
| 5 | `member.kick` | | 12 | `federation.manage` *(new)* |
| 6 | `member.role.update` | | | |

**Requirement FM-02:** The v1 29-bit `RolePermission` enum is preserved verbatim as the role template set and maps onto `permission_mask` via a documented translation table, so existing role definitions survive migration.

---

## 4. Projections

Derived state, fully rebuildable from the envelope log.

| Collection | Built from | Notes |
|---|---|---|
| `forum_identities` | `KeyCertificate`, `ProfileUpdate`, `KeyRevocation` | karma counters derived from votes |
| `communities` | `CommunityCreate/Update/Archive` | |
| `memberships` | `MembershipJoin/Leave`, `ModAction`, `RoleAssign/Revoke` | status + permission masks |
| `posts` | `PostCreate/Update/Delete`, `ModAction` | |
| `comments` | `CommentCreate/Update/Delete`, `ModAction` | depth precomputed |
| `votes` | `VoteCast` | unique `(author_key, target)` |
| `reports` | `ReportCreate/Resolve` | |
| `mod_events` | `ModAction` | **hash-chained per community** |
| `roles` | `RoleDefine/Assign/Revoke` | |
| `awards` | `AwardGive`, `AwardTypeDefine` | |
| `attachments` | `AttachmentClaim` | |
| `forum_messages` | `ForumMessageSend` | ciphertext only |
| `labels` | `Label` | |
| `saved`, `follows`, `blocks`, `feed_prefs` | corresponding social bodies | |

**Requirement FM-03:** A `rebuild-projections` command MUST reconstruct every collection purely from the envelope store. This is the disaster-recovery and node-migration path.

---

## 5. Read API (Forum plane)

All JSON. All list endpoints use cursor pagination: `?cursor=<opaque>&limit=<1..100>` → `{ items: [...], nextCursor: string | null }`.

Every content object carries a `provenance` block:
```json
{
  "contentId": "jb1h7k3m9p…",
  "plane": "FORUM",
  "authorKey": "jbk1qy2f8x…",
  "keyAlg": "ED25519",
  "signature": "base64…",
  "canonicalBytes": "base64…",
  "receipt": { "logIndex": 48213, "sth": {}, "inclusionProof": [], "serverSignature": "" },
  "labels": [{ "labellerKey": "…", "verdict": "OK", "confidence": 92 }]
}
```

| Method | Path | v1 equivalent |
|---|---|---|
| `GET` | `/v1/feed?sort&timeframe&community&cursor` | `GET /posts` |
| `GET` | `/v1/posts/:contentId` | `GET /posts/{id}` |
| `GET` | `/v1/posts/:contentId/comments?depth&sort` | `GET /posts/{id}/comments` |
| `GET` | `/v1/posts/:contentId/audit` | `GET /posts/{id}/audit-trail` |
| `GET` | `/v1/comments/:contentId` | `GET /comments/{id}` |
| `GET` | `/v1/communities?q&sort` | `GET /subreddits` |
| `GET` | `/v1/communities/:id` | `GET /subreddits/{id}` |
| `GET` | `/v1/communities/name-available/:name` | `GET /subreddits/check-name/{name}` |
| `GET` | `/v1/communities/:id/members?role&status` | `GET /subreddits/{id}/members` |
| `GET` | `/v1/communities/:id/moderators` | `GET /subreddits/{id}/moderators` |
| `GET` | `/v1/communities/:id/bans` | `GET /subreddits/{id}/bans` |
| `GET` | `/v1/communities/:id/modlog` | `GET /subreddits/{id}/modlogs` |
| `GET` | `/v1/communities/:id/reports` | `GET /moderation/subreddits/{id}/reports` |
| `GET` | `/v1/communities/:id/roles` | `GET /roles/subreddit/{name}` |
| `GET` | `/v1/communities/:id/stats` | *(frontend-only in v1)* |
| `GET` | `/v1/identities/:keyId` | `GET /users/{id}` |
| `GET` | `/v1/identities/by-name/:username` | `GET /users/{username}` |
| `GET` | `/v1/me/profile` | `GET /users/me/profile` |
| `GET` | `/v1/me/communities` | `GET /users/me/subreddits` |
| `GET` | `/v1/me/preferences` | `GET /users/me/feed-preferences` |
| `GET` | `/v1/me/saved` | *(frontend-only in v1)* |
| `GET` | `/v1/me/notifications?unread` | `GET /notifications` |
| `GET` | `/v1/me/messages` | `GET /messages` |
| `GET` | `/v1/me/messages/:threadId` | *(derived in v1)* |
| `GET` | `/v1/awards/types` | `GET /awards/types` |
| `GET` | `/v1/awards/target/:kind/:id` | `GET /awards/target/{type}/{id}` |
| `GET` | `/v1/search?q&kind&community` | *(frontend-only in v1)* |
| `GET` | `/v1/labels/:contentId` | **new** |
| `GET` | `/v1/receipts/:contentId` | `GET /audit/receipts/{id}` |
| `GET` | `/v1/log/sth`, `/v1/log/inclusion/:id`, `/v1/log/consistency?from&to` | **new** |
| `GET` | `/v1/events` (SSE) | **new** (v1 had a no-op stub) |

Non-envelope operations (`/v1/auth/*`, `/v1/credits/*`, `/v1/credentials/request`, `/v1/attachments/upload-url`, `/v1/attachments/confirm`, `/v1/labels/preflight`, `/v1/admin/**`, `/health/*`) are unchanged from `SYSTEM-REQUIREMENTS.md` §12.3.

---

## 6. Moderation model — publish-then-attest

**Requirement FM-04:** Server approval MUST NOT be a precondition for publishing. A post is valid the instant its author signs it.

1. Author signs and publishes — live and verifiable immediately.
2. **Labellers** (the instance's LLM, a community's mods, a fact-checking org) asynchronously publish signed `Label` envelopes.
3. Clients subscribe to labellers they trust and filter locally.
4. Labels are additive metadata. Removing a label removes a filter, never the content.

| Property | Pre-publish gate | Publish-then-attest |
|---|---|---|
| Server can silently censor | **Yes** — withheld approval is indistinguishable from a network error | **No** — a missing label is visible; a `RESTRICT` label is signed evidence |
| Works offline / on mesh | No | **Yes** |
| Round trips before publishing | 2 + inference | 0 |
| User can contest | Nothing to point at | Signed label with `reasons[]` and `appealable` |
| Multiple opinions | One gatekeeper | **Yes** — labellers may publicly disagree |

**Requirement FM-05:** The composer SHOULD request an advisory pre-flight label and show warnings *before* publishing — as advice, with publishing always available.
**Requirement FM-06:** Labeller failure MUST fail open. A dead moderation service must never become an outage.
**Requirement FM-07:** Every `ModAction` is a signed envelope in the public mod log, hash-chained to the previous event in that community. A moderator cannot act invisibly.
**Requirement FM-08:** Removal is a **tombstone**. Content ID, author, timestamp, acting moderator, and reason stay publicly visible; only the body is withheld from the default view.
**Requirement FM-09:** Clients ship a default labeller trust set and MUST allow the user to remove any labeller, including the home instance's.
