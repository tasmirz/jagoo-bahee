# 02 — Core Contracts

> **Frozen before P1.** The envelope is the single most important contract in the system; everything else is downstream of it. Changes after freeze require a version bump, never an in-place edit.

---

## 1. Canonical encoding

**Requirement EN-01 — deterministic protobuf.** The signed bytes are protobuf serialised with:
- fields in strictly ascending field number,
- default/zero values omitted entirely,
- no unknown fields retained or re-emitted,
- `string` fields NFC-normalised before encoding,
- **no `float`/`double` anywhere** in a signed structure (integers and strings only).

**Requirement EN-02 — exactly one accepted form per version.** Fallback chains, "try the legacy shape too", and multi-shape acceptance are **forbidden**. A verifier that cannot parse a version rejects it; it never guesses.

**Requirement EN-03 — content ID.**
```
content_id = "jb1" + base32-nopad-lowercase( SHA-256( canonical_bytes_of_fields_1..12 ) )
```
Excludes the signature, so the ID is stable across re-signing. Globally identical on every node, forever.

**Requirement EN-04 — cross-language equality.** TypeScript, Rust, and Python implementations MUST produce byte-identical canonical encodings for a shared fixture set. This is a CI gate, not a convention.

---

## 2. `proto/jagoo/v1/envelope.proto`

```protobuf
syntax = "proto3";
package jagoo.v1;

// ─── The universal signed unit ────────────────────────────────────────────
message Envelope {
  uint32    version       = 1;   // MUST be 1. Unknown → hard reject.
  Plane     plane         = 2;   // FORUM | SIGNAL — inside the signature
  string    domain        = 3;   // e.g. "jb:post:create:v1"
  bytes     author_key    = 4;   // raw public key; identity IS this value
  KeyAlg    key_alg       = 5;
  string    parent        = 6;   // content_id of parent, "" if none
  string    scope         = 7;   // community_id (FORUM) | channel_id (SIGNAL) | ""
  int64     created_at_ms = 8;
  bytes     nonce         = 9;   // 16 bytes
  Priority  priority      = 10;
  bytes     body          = 11;  // serialized typed body
  AntiAbuse anti_abuse    = 12;  // may be empty on constrained transports
  bytes     signature     = 13;  // over canonical bytes of fields 1..12
}

enum Plane {
  PLANE_UNSPECIFIED = 0;
  FORUM             = 1;   // anonymous / pseudonymous
  SIGNAL            = 2;   // identified
}

enum KeyAlg {
  KEY_ALG_UNSPECIFIED = 0;
  ED25519             = 1;   // default for all per-message signing
  ML_DSA_44           = 2;   // certificates only — too large for constrained links
  FALCON_512          = 3;   // reserved
}

enum Priority {
  PRIORITY_UNSPECIFIED = 0;
  BROADCAST            = 1;  // class 0 — emergency, key revocation
  DIRECT               = 2;  // class 1 — messages
  CHECKIN              = 3;  // class 2 — safe-status, resource reports
  BULK                 = 4;  // class 3 — posts, comments, votes, media
}

message AntiAbuse {
  bytes  credential = 1;   // unblinded membership token (FORUM)
  bytes  nullifier  = 2;   // H(domain ‖ epoch ‖ secret) (FORUM)
  uint32 epoch      = 3;
  bytes  pow        = 4;   // Argon2id proof, when demanded
}
```

### 2.1 Why `plane` is a signed field

It is the enforcement mechanism for `SEP-02`. Because the plane byte is covered by the signature, a Signal-plane signature cannot be lifted and replayed as a Forum-plane one, and vice versa. Combined with the registry (§4) mapping each domain to exactly one plane, cross-plane confusion is structurally impossible rather than merely checked.

### 2.2 Field notes

| Field | Constraint |
|---|---|
| `domain` | MUST exist in the registry and its plane MUST equal `plane` |
| `author_key` | 32 B for Ed25519. MUST have a valid unrevoked `KeyCertificate` at `created_at_ms` |
| `scope` | community ID for FORUM content, channel ID for SIGNAL content, `""` for identity/global |
| `created_at_ms` | within `[now − max_age, now + max_skew]`; defaults 7 days / 10 minutes |
| `nonce` | 16 random bytes. Required on all non-idempotent domains |
| `priority` | MUST match the domain's declared class in the registry |
| `anti_abuse` | MAY be empty when arriving over `MESH` or `RETICULUM`; the receiving node applies transport-appropriate limits instead |

---

## 3. Receipts and transparency

```protobuf
message Receipt {
  string content_id      = 1;
  string server_id       = 2;   // server key fingerprint, NOT a URL
  bytes  server_key      = 3;
  int64  accepted_at_ms  = 4;
  uint64 log_index       = 5;
  SignedTreeHead sth     = 6;
  repeated bytes inclusion_proof = 7;
  bytes  server_signature = 8;
}

message SignedTreeHead {
  bytes  server_key   = 1;
  uint64 tree_size    = 2;
  bytes  root_hash    = 3;
  int64  timestamp_ms = 4;
  bytes  signature    = 5;
}
```

**Requirement TL-01:** Every accepted envelope's `content_id` is appended as a leaf to a per-instance append-only Merkle tree (RFC 6962 structure).
**Requirement TL-02:** An `STH` is published at least every 60 seconds and on demand.
**Requirement TL-03:** Every `Receipt` carries an inclusion proof (⌈log₂ n⌉ hashes) — small enough for a client to store offline as durable proof of publication.
**Requirement TL-04:** The node MUST serve consistency proofs between any two tree sizes, so retroactive deletion or reordering is **detectable**.
**Requirement TL-05:** Tree heads gossip between federated peers (`05-CONTRACTS-FEDERATION.md` §4). A node that forks its log is caught by its peers, not by trusting the node itself.
**Requirement TL-06:** Log storage MUST be append-only. Rewriting a whole file per submission is both a tamper vector and an O(n) DoS vector.

---

## 4. Domain registry

The registry is a **generated artefact** (`proto/jagoo/v1/registry.yaml` → code in every language). It is the only place a domain is defined, and it is what makes the system Open/Closed: adding a feature adds a row, never a branch in the ingress pipeline.

```yaml
# proto/jagoo/v1/registry.yaml — schema
- domain:      "jb:post:create:v1"
  plane:       FORUM
  body:        "jagoo.v1.PostCreate"
  priority:    BULK
  idempotent:  true            # false ⇒ nonce required, replay-checked
  scope_kind:  COMMUNITY       # COMMUNITY | CHANNEL | NONE
  key_algs:    [ED25519]
  max_bytes:   65536
  credit_cost: 10
  requires:    [CREDENTIAL, NULLIFIER]   # anti-abuse gates
  permission:  "post.create"
```

**Requirement RG-01:** A domain not present in the registry is rejected with `UNKNOWN_DOMAIN`. There is no dynamic or implicit domain.
**Requirement RG-02:** The registry is generated into each language. Hand-maintained duplicates are forbidden.
**Requirement RG-03:** Adding a feature MUST NOT require modifying ingress, projection dispatch, signing, verification, or receipt code. If it does, the abstraction has failed and must be fixed rather than worked around.

Per-plane registry contents live in `03-CONTRACTS-FORUM.md` §2 and `04-CONTRACTS-SIGNAL.md` §5.

---

## 5. Validation pipeline (normative order)

Every envelope, from every transport, passes exactly these steps in exactly this order.

```
 1. SIZE          reject if > transport limit — checked on RAW BYTES, pre-parse
 2. PARSE         deterministic protobuf decode; reject unknown fields
 3. VERSION       reject unknown version
 4. DOMAIN        must exist in the registry
 5. PLANE         registry plane must equal envelope plane        → PLANE_MISMATCH
 6. ALG POLICY    key_alg permitted for this domain and priority
 7. PRIORITY      priority must equal the registry's declared class
 8. CLOCK         created_at_ms within [now − max_age, now + max_skew]
 9. SIGNATURE     verify over canonical bytes of fields 1..12
10. CERTIFICATE   author key has a valid, unrevoked certificate at created_at_ms
11. DEDUPE        content_id not already present — atomic, unique index
12. REPLAY        for non-idempotent domains, (author_key, nonce) unseen
13. ANTI-ABUSE    credential / nullifier / PoW / credits
14. AUTHORISE     domain-specific permission check against projection
15. BODY VALIDATE domain-specific field constraints
16. APPLY         project into read model (transactional)
17. WITNESS       append content_id to Merkle log (same transaction as 16)
18. RECEIPT       sign and return
19. FANOUT        enqueue for federation + transport relay per priority
```

**Requirement VP-01:** Steps 1–12 MUST perform **no database writes**, so a flood of invalid envelopes cannot cause write amplification.
**Requirement VP-02:** Steps 16 and 17 MUST be atomic with respect to each other. A projected envelope missing from the log is a transparency failure.
**Requirement VP-03:** Each step is an independently unit-testable function. The pipeline is composed from them, not written as one procedure.

---

## 6. Error contract

```protobuf
message EnvelopeError {
  ErrorCode code   = 1;
  string    detail = 2;
  string    field  = 3;   // offending field path, when applicable
  int64     retry_after_ms = 4;
  PowChallenge challenge   = 5;   // present on INSUFFICIENT_CREDITS / RATE_LIMITED
}
```

| Code | Meaning | Retryable |
|---|---|---|
| `UNKNOWN_VERSION` | Envelope version unsupported | no |
| `UNKNOWN_DOMAIN` | Domain absent from registry | no |
| `PLANE_MISMATCH` | Domain's plane ≠ envelope's plane | no |
| `MALFORMED` | Deterministic decode failed | no |
| `ALG_NOT_PERMITTED` | `key_alg` disallowed for this domain/priority | no |
| `PRIORITY_MISMATCH` | Priority ≠ registry class | no |
| `CLOCK_SKEW` | `created_at_ms` outside window | re-sign |
| `BAD_SIGNATURE` | Verification failed | no |
| `NO_CERTIFICATE` | Author key uncertified | after certifying |
| `KEY_REVOKED` | Key revoked before `created_at_ms` | no |
| `DUPLICATE` | Already accepted — **original receipt returned** | no |
| `REPLAY` | `(author_key, nonce)` already seen | no |
| `INSUFFICIENT_CREDITS` | Balance too low | after PoW redemption |
| `NULLIFIER_SPENT` | Epoch quota exhausted | next epoch |
| `CREDENTIAL_INVALID` | Blind credential failed verification | re-obtain |
| `FORBIDDEN` | Permission check failed | no |
| `BODY_INVALID` | Domain-specific validation failed | no |
| `TOO_LARGE` | Exceeds the transport limit for its class | no |
| `RATE_LIMITED` | Connection-layer limit | after `retry_after_ms` |
| `TRANSPORT_UNSUPPORTED` | Priority class not carried by this transport | use another transport |

**Requirement ER-01:** `DUPLICATE` MUST return the original `Receipt`, making retry safe and idempotent.
**Requirement ER-02:** Error responses MUST NOT reveal whether a key exists, what a user's other content is, or any cross-plane information.

---

## 7. Identifier scheme

| Kind | Format | Example | Stable across nodes |
|---|---|---|---|
| Identity (either plane) | `jbk1` + base32(pubkey) | `jbk1qy2f8x…` | **Yes** |
| Channel | `jbc1` + base32(channel signing key) | `jbc1a4f7m…` | **Yes** |
| Content | `jb1` + base32(sha256(envelope)) | `jb1h7k3m9p…` | **Yes** |
| Community | `<name>@<origin_fp>` | `dhaka-relief@jbs1a4f…` | **Yes** |
| Server | `jbs1` + base32(server pubkey) | `jbs1a4f7…` | **Yes** |
| Storage row | database primary key | — | **No — never signed, never federated** |

**Requirement ID-01:** No signed structure and no federated payload may contain a database row ID. Row IDs are a local storage detail only.

> This was the specific defect that made v1 federation impossible: `authorId` and `subredditId` were signed as Mongo ObjectIds, which a remote node can neither resolve nor verify.

---

## 8. Anti-abuse primitives

The hard constraint: **rate limiting must work against an anonymous user**, because requiring identity for spam control hands the adversary a censorship lever.

```protobuf
message PowChallenge {
  string challenge   = 1;   // HMAC(server_secret, key ‖ window) — stateless, not stored
  string algorithm   = 2;   // "argon2id"
  uint32 memory_kib  = 3;   // scaled by live system pressure
  uint32 iterations  = 4;
  uint32 parallelism = 5;
  bytes  bound_to    = 6;   // author key — work is non-transferable
  int64  expires_at_ms = 7;
}
```

| Layer | Mechanism | Defeats |
|---|---|---|
| L1 | Per-verified-IP and per-/24 token bucket | Naive floods |
| L2 | **Argon2id** PoW, pressure-scaled, key-bound | GPU/ASIC farms, cheap parallelism |
| L3 | Credit token bucket, refilled by time and PoW | Sustained scripted abuse |
| L4 | Blind-signed credential (FORUM) | Sybil account farms |
| L5 | Epoch nullifier (FORUM) | Multi-account posting by one person |
| L6 | Subscription consent (SIGNAL) | Unsolicited broadcast |
| L7 | Peer trust level bounds federated inbound quota | Hostile instances |

**Requirement AB-01:** `User-Agent` MUST NOT appear in any rate-limit, credit, or throttle subject.
**Requirement AB-02:** `X-Forwarded-For` MUST be parsed with a configured trusted-proxy hop count or CIDR set. Trust-everything proxy configuration is forbidden.
**Requirement AB-03:** All counter and balance mutations MUST be atomic — one Redis Lua script per operation. Read-modify-write and `INCR`-then-`PEXPIRE` are both forbidden.
**Requirement AB-04:** PoW MUST be memory-hard and bound to the requesting key. Challenge issuance MUST be stateless (HMAC-derived) so issuing challenges cannot exhaust server memory.
**Requirement AB-05:** Every signed payload carries domain separation; non-idempotent actions carry a nonce.
**Requirement AB-06:** Token classes MUST use separate signing keys and assert their type. A refresh token MUST NOT authenticate as an access token.
**Requirement AB-07:** Rate-limiter unavailability MUST fail closed in production.
**Requirement AB-08:** Check-in and safety-status actions cost **zero** credits and require no credential. In a disaster, telling people you are alive must never be rate-limited.

```typescript
interface CreditLedger {
  consume(subject: CreditSubject, cost: number): Promise<CreditStatus>;  // atomic
  status(subject: CreditSubject): Promise<CreditStatus>;
  issueChallenge(subject: CreditSubject): Promise<PowChallenge>;         // stateless
  redeem(subject: CreditSubject, solution: PowSolution): Promise<CreditStatus>;
}

type CreditSubject =
  | { kind: "identity"; keyId: string }
  | { kind: "nullifier"; nullifier: string; epoch: number }
  | { kind: "network"; verifiedIp: string; subnet: string };   // NO user-agent
```

---

## 9. Priority classes and size budgets

| Class | Contents | Size budget | IP | Mesh | Reticulum |
|---|---|---|---|---|---|
| **0 BROADCAST** | Emergency broadcast, key revocation | **≤ 512 B** | ✓ | ✓ flood | ✓ flood |
| **1 DIRECT** | Messages (both planes) | ≤ 1 KB | ✓ | ✓ routed | ✓ routed |
| **2 CHECKIN** | Check-in, resource report, missing person | ≤ 512 B | ✓ | ✓ flood | ✓ flood |
| **3 BULK** | Posts, comments, votes, media, moderation | unbounded | ✓ | opportunistic | ✗ **rejected** |

**Requirement PC-01:** Class 0–2 envelopes MUST fit their budget **after** encoding, including signature and anti-abuse fields. Enforced at construction with a typed error, not discovered at send time.
**Requirement PC-02:** Class 3 MUST be rejected by the Reticulum adapter with `TRANSPORT_UNSUPPORTED`.
**Requirement PC-03:** Outbound queues are ordered by priority class first, then FIFO. A queued emergency broadcast overtakes 500 queued votes.

---

## 10. The single write endpoint

```
POST /v1/envelopes
Content-Type: application/x-protobuf   (application/json mapping also accepted)

Body: Envelope, or { envelopes: [...] } for batch

200 → Receipt
202 → { status: "accepted_unwitnessed" }        // accepted, log append pending
409 → { code: "DUPLICATE", receipt: Receipt }   // idempotent replay
4xx → EnvelopeError
```

**Requirement WE-01:** This is the **only** endpoint in the system that writes content. Every mutation — a post, a vote, a ban, a broadcast, a message, a key revocation — goes through it.
**Requirement WE-02:** No feature may add a write route. If a feature seems to need one, the registry or body schema is wrong.
**Requirement WE-03:** Batch requests MUST NOT mix planes (`SEP-07`).
