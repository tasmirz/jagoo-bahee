# R3 — Content: Posts, Comments, Votes, Search

Plane: **FORUM** throughout. Contracts: [`../03-CONTRACTS-FORUM.md`](../03-CONTRACTS-FORUM.md)

## 1. Posts

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| PST-01 | Create text, link, image, video, poll, crosspost | ✓ | P1 |
| PST-02 | Title ≤ 300 characters | ✓ | P1 |
| PST-03 | Markdown body with rich editor | ✓ | P1 |
| PST-04 | Multiple attachments with ownership and confirmation checks | ✓ | P1 |
| PST-05 | Poll: question, options, multi-select, close time | ✓ | P1 |
| PST-06 | Flair | ✓ | P1 |
| PST-07 | NSFW / spoiler / OC flags | ✓ | P1 |
| PST-08 | Author signature over the canonical payload | ✓ | P1 |
| PST-09 | **Exactly one canonical form** — no fallback acceptance | ✗ | P0 |
| PST-10 | Content hash verification with no fallback chain | ✗ | P0 |
| PST-11 | Edit own post | ✓ | P1 |
| PST-12 | Delete own post (tombstone, signed) | ✓ | P1 |
| PST-13 | Feed listing: cursor pagination, sort, community filter | ✓ | P1 |
| PST-14 | Sort modes: hot, new, top, controversial, rising | ✓ | P1 |
| PST-15 | Timeframe filter: hour, day, week, month, year, all | ✓ | P1 |
| PST-16 | View, comment, award, upvote, downvote, score counts | ✓ | P1 |
| PST-17 | Infinite scroll | ✓ | P1 |
| PST-18 | Short share link (`/p/[id]`) | ✓ | P1 |
| PST-19 | Client-side signature verification badge | ✓ | P1 |
| PST-20 | Audit trail view with Merkle inclusion proof | ✓ (no proof) | P1 |
| PST-21 | Inclusion proof stored client-side as durable publication evidence | — | P1 |
| PST-22 | Label display with reasons and labeller attribution | — | P1 |
| PST-23 | Offline authoring into the outbox with a final content ID | ✗ | P5 |

### PST-09 rationale

v1 accepted a signature valid over *either* of two canonical forms, the legacy one omitting `url`, `attachmentIds`, and `poll`. A signature the user produced over a plain text post therefore also validated a post carrying an **attacker-chosen URL and arbitrary attachments** — and the verification UI showed a green check on the forgery. Exactly one form per envelope version, hard-rejecting unknown versions, permanently forecloses this class.

## 2. Comments

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| CMT-01 | Create comment on a post | ✓ | P1 |
| CMT-02 | Threaded replies with depth tracking | ✓ | P1 |
| CMT-03 | Comment tree rendering with collapse / expand | ✓ | P1 |
| CMT-04 | Markdown body | ✓ | P1 |
| CMT-05 | Attachments on comments | ✓ | P1 |
| CMT-06 | Edit / delete own comment | ✓ | P1 |
| CMT-07 | Signature and content hash | ✓ | P1 |
| CMT-08 | Vote on comment | ✓ | P1 |
| CMT-09 | Score and reply counts | ✓ | P1 |
| CMT-10 | Per-comment settings page | ✓ | P1 |
| CMT-11 | Offline authoring | ✗ | P5 |

## 3. Votes

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| VOT-01 | Upvote / downvote / clear on posts and comments | ✓ | P1 |
| VOT-02 | One vote per identity per target (unique constraint) | ✓ | P1 |
| VOT-03 | Optimistic UI with rollback on failure | ✓ | P1 |
| VOT-04 | Score aggregation and karma attribution | ✓ | P1 |
| VOT-05 | Offline vote queueing | ✗ (empty stub) | P5 |
| VOT-06 | Vote rate limiting via credential, not identity disclosure | — | P1 |

## 4. Search & discovery

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| SRC-01 | Search posts, comments, communities, identities | ✓ | P1 |
| SRC-02 | Search results page with kind and community filters | ✓ | P1 |
| SRC-03 | Community browse and list pages | ✓ | P1 |
| SRC-04 | Offline search over locally cached content | — | P5 |
| SRC-05 | Geographic filter for broadcasts and resource reports | — | P4 |

## 5. Content flags (frozen bit positions)

These cross federation boundaries and MUST NOT be renumbered.

| Bit | Meaning | | Bit | Meaning |
|---|---|---|---|---|
| 0 | ACTIVE | | 6 | REMOVED |
| 1 | NSFW | | 7 | FLAGGED |
| 2 | SPOILER | | 8 | APPROVED |
| 3 | PINNED | | 9 | OC |
| 4 | LOCKED | | 10 | COLLAPSED *(comments)* |
| 5 | ARCHIVED | | | |

## 6. Projection notes

| Projection | Source domains | Rebuild-critical detail |
|---|---|---|
| `posts` | `post:create/update/delete`, `mod:action` | Counters derived, never authoritative |
| `comments` | `comment:create/update/delete`, `mod:action` | Depth precomputed at projection time |
| `votes` | `vote:cast` | Unique `(author_key, target)`; last-write-wins by `created_at_ms` |

**PST-24 / CMT-12 / VOT-07:** All three projections MUST be fully reconstructible from the envelope log by `rebuild-projections`, matching byte for byte.
