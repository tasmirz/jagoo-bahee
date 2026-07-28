# R8 — Media, Awards & Notifications

## 1. Attachments & media

Plane: **FORUM** (Signal attachments are encrypted, see [R6](R6-MESSAGING.md) MSG-24).

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| ATT-01 | Presigned upload URL (S3 / MinIO) | ✓ | P1 |
| ATT-02 | Upload confirmation | ✓ | P1 |
| ATT-03 | List / get / update / delete | ✓ | P1 |
| ATT-04 | Delete by storage key | ✓ | P1 |
| ATT-05 | Download endpoint with presigned redirect | ✓ | P1 |
| ATT-06 | MIME, size, dimensions, duration metadata | ✓ | P1 |
| ATT-07 | Max upload size enforcement | ✓ | P1 |
| ATT-08 | Ownership and confirmation checks before attaching to content | ✓ | P1 |
| ATT-09 | Attachment access authorisation | ✓ | P1 |
| ATT-10 | Scan status field | ✓ | P1 |
| ATT-11 | **Content SHA-256 in the signed claim** — binds the blob to the signature | ✗ | P1 |
| ATT-12 | Alt text field | — | P1 |
| ATT-13 | Low-bandwidth mode: thumbnails only, opt-in full media | — | P5 |
| ATT-14 | Attachment kinds: image, video, audio, document, other | ✓ | P1 |

### ATT-11 rationale

v1 signed only the attachment **ID**, not its content. A server could swap the stored blob and every signature would still verify. Putting the content hash inside the signed `AttachmentClaim` binds the bytes to the author's signature, so substitution is detectable client-side.

### Two-step upload flow

```
1. POST /v1/attachments/upload-url   → presigned ticket        (non-envelope)
2. PUT  <presigned url>              → blob to object storage  (direct)
3. POST /v1/attachments/confirm      → server verifies size/mime (non-envelope)
4. POST /v1/envelopes                → AttachmentClaim, signed, with content hash
5. reference the claim's content_id from a PostCreate / CommentCreate
```

**ATT-15:** Steps 1–3 are non-envelope operations because they move bytes, not statements. Step 4 is the signed statement *"I, this key, claim this blob with this hash."*

## 2. Awards

Plane: **FORUM**.

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| AWD-01 | Award type definition: slug, name, icon, cost, active | ✓ | P1 |
| AWD-02 | Award type CRUD (admin-gated) | ✓ | P1 |
| AWD-03 | Give award to a post or comment | ✓ | P1 |
| AWD-04 | Anonymous awards | ✓ | P1 |
| AWD-05 | Award message (≤ 200 chars) | ✓ | P1 |
| AWD-06 | List awards for a target | ✓ | P1 |
| AWD-07 | Awards page | ✓ | P1 |
| AWD-08 | Award count on content | ✓ | P1 |

**AWD-09:** Anonymous awards MUST NOT be deanonymisable from the projection. The giver key is in the signed envelope but the projection stores only an anonymity flag; the read API never exposes the giver for anonymous awards.

## 3. Notifications

| ID | Requirement | Plane | v1 | Phase |
|---|---|---|---|---|
| NOT-01 | Create, list, mark read / unread, delete | FORUM | ✓ | P1 |
| NOT-02 | Types: reply, mention, award, mod action, follow | FORUM | ✓ | P1 |
| NOT-03 | Web push via service worker | both | ✓ | P1 |
| NOT-04 | Notification page with unread badge | FORUM | ✓ | P1 |
| NOT-05 | Notifications derived as a side effect of projections, not authored | FORUM | — | P1 |
| NOT-06 | **Emergency broadcast alerts use a separate channel** from ordinary notifications | SIGNAL | — | P4 |
| NOT-07 | Per-plane notification separation — no cross-plane notification | both | — | P4 |
| NOT-08 | Push token registration is opt-in and per plane | both | — | P4 |

### NOT-05 note

Notifications are the one projection with no corresponding envelope domain. They are computed by `DomainHandler.afterCommit()` hooks — a reply projection emits a notification for the parent author. This keeps them out of the federated wire format, where they would be noise, and makes them fully rebuildable.

## 4. Storage requirements

| ID | Requirement |
|---|---|
| ATT-16 | Object storage is behind a `BlobStore` port; S3/MinIO is one adapter |
| ATT-17 | A node MUST be able to run with local-filesystem blob storage for small deployments (Raspberry Pi target, `NFR-F06`) |
| ATT-18 | Attachments are **not** federated by default. Peers receive the claim with its hash and fetch the blob lazily from the origin, or skip it. |
| ATT-19 | An attachment whose blob is unavailable MUST render as a placeholder with its alt text, never as a broken page |

**ATT-18 rationale:** federating blobs would multiply storage across every peer and saturate constrained links. The signed claim travels; the bytes are fetched on demand and verified against the hash on arrival.
