# R4 — Communities, Membership & Roles

Plane: **FORUM** throughout. Contracts: [`../03-CONTRACTS-FORUM.md`](../03-CONTRACTS-FORUM.md)

## 1. Communities

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| COM-01 | Create community: name, title, description, rules | ✓ | P1 |
| COM-02 | Name-availability check | ✓ | P1 |
| COM-03 | List / browse / search communities | ✓ | P1 |
| COM-04 | Get by ID and by name | ✓ | P1 |
| COM-05 | Update settings and metadata | ✓ | P1 |
| COM-06 | Archive (tombstone) — replaces hard delete | ✓ | P1 |
| COM-07 | Custom theme: primary, accent, background, foreground | ✓ | P1 |
| COM-08 | Icon and banner attachments | ✓ | P1 |
| COM-09 | Post-type toggles (text / link / image / video) | ✓ | P1 |
| COM-10 | Require-post-approval mode | ✓ | P1 |
| COM-11 | Allow-crossposts toggle | ✓ | P1 |
| COM-12 | Minimum karma to post | ✓ | P1 |
| COM-13 | Minimum account age to post | ✓ | P1 |
| COM-14 | Private and NSFW flags | ✓ | P1 |
| COM-15 | Member count | ✓ | P1 |
| COM-16 | Community statistics page | ✓ | P1 |
| COM-17 | Scheduled community maintenance tasks | ✓ | P1 |
| COM-18 | Permission-cache service | ✓ | P1 |
| COM-19 | **Cross-instance addressing** — `name@origin_fingerprint` | — | P2 |
| COM-20 | Per-community emergency broadcast link to a Signal channel | — | P4 |

### COM-19 rationale

v1 signed `subredditId` as a Mongo ObjectId, which is meaningless on any other node. Community identity must be `<name>@<origin_fp>` so a remote instance can resolve and verify it. Names are not globally unique; the origin fingerprint disambiguates.

## 2. Membership

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| COM-21 | Join / leave | ✓ | P1 |
| COM-22 | Member list with roles and status | ✓ | P1 |
| COM-23 | Ban / unban with reason and expiry | ✓ | P1 |
| COM-24 | Ban list view | ✓ | P1 |
| COM-25 | Kick member | ✓ | P1 |
| COM-26 | Mute / unmute member | ✓ | P1 |
| COM-27 | Add / remove / list moderators | ✓ | P1 |
| COM-28 | `is-moderator` check endpoint | ✓ | P1 |
| COM-29 | Approved-submitter status | — | P1 |

### Membership status flags (frozen)

| Bit | Meaning | | Bit | Meaning |
|---|---|---|---|---|
| 0 | MEMBER | | 3 | MODERATOR |
| 1 | MUTED | | 4 | CONTRIBUTOR |
| 2 | BANNED | | 5 | APPROVED_SUBMITTER *(new)* |

## 3. Roles & permissions

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| ROL-01 | 29-bit role permission enum preserved verbatim as the role template set | ✓ | P1 |
| ROL-02 | Community role bits: member, contributor, moderator, owner | ✓ | P1 |
| ROL-03 | Community permission bits (11 from v1, extended to 14) | ✓ | P1 |
| ROL-04 | Create / update / delete custom roles | ✓ | P1 |
| ROL-05 | Assign / revoke roles | ✓ | P1 |
| ROL-06 | Role management UI | ✓ | P1 |
| ROL-07 | Default role for new members | ✓ | P1 |
| ROL-08 | ABAC guard on protected routes | ✓ | P1 |
| ROL-09 | Permission-resolution helper | ✓ | P1 |
| ROL-10 | Documented translation table from the v1 29-bit enum to `permission_mask` | — | P1 |

### Community permission bits (frozen)

| Bit | Permission | | Bit | Permission |
|---|---|---|---|---|
| 0 | `community.read` | | 7 | `post.moderate` |
| 1 | `post.create` | | 8 | `comment.moderate` |
| 2 | `community.update` | | 9 | `modlog.read` |
| 3 | `member.ban` | | 10 | `report.review` |
| 4 | `member.unban` | | 11 | `label.trust` *(new)* |
| 5 | `member.kick` | | 12 | `federation.manage` *(new)* |
| 6 | `member.role.update` | | 13 | `broadcast.emit` *(new)* |

**ROL-11:** Bit positions are frozen. They are persisted across federated instances and MUST NOT be renumbered.

## 4. Community settings shape (preserved from v1)

```
allow_text_posts          bool
allow_link_posts          bool
allow_image_posts         bool
allow_video_posts         bool
require_post_approval     bool
allow_crossposts          bool
minimum_karma_to_post     int32
minimum_account_age_days  int32
```

**COM-30:** Every v1 setting is preserved with identical semantics. Adding a setting is a body-schema change plus a projection field — never a pipeline change.

## 5. Authorisation model

| ID | Requirement |
|---|---|
| ROL-12 | Permission checks run at pipeline step 14 (`AUTHORISE`), against current projections, after signature verification and before body validation |
| ROL-13 | A `DomainHandler.authorize()` returning `{ allow: false }` produces `FORBIDDEN` with a reason, never a silent drop |
| ROL-14 | Permission resolution MUST be a pure function of (actor key, community, projection snapshot), unit-testable without infrastructure |
| ROL-15 | Global admin/moderator flags from the identity bitmap override community permissions where v1 allowed it, preserving existing behaviour |
