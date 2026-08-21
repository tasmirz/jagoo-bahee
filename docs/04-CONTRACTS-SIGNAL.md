# 04 — Signal Plane Contracts (Plane B, identified)

> **Frozen before P1, implemented in P4.** Subscriber-pattern broadcast plus identified end-to-end messaging. Every envelope here carries `plane: SIGNAL`.

---

## 1. The model in one picture

```
   ┌──────────────┐   ChannelDeclare      ┌───────────────────────┐
   │  Broadcaster │ ────────────────────► │  Federation-wide      │
   │  (identified)│                       │  channel directory    │
   └──────┬───────┘                       └───────────┬───────────┘
          │ BroadcastEmit (seq++)                     │
          ▼                                            ▼
   ┌────────────────────────────────────────────────────────────┐
   │  FLOOD — broadcasts are small and replicate to every node   │
   └───────────────────────────┬────────────────────────────────┘
                               ▼
                  ┌────────────────────────┐
                  │  Subscriber's client    │
                  │  LOCAL subscription list│  ← never leaves the device
                  │  filters what it shows  │
                  └────────────────────────┘
```

**The key design decision: flood-then-filter, not server-side fanout.**

Broadcasts are ≤ 512 bytes and replicate across the federation regardless of who is subscribed. The subscriber's client holds its subscription list **locally** and filters. This buys three things at once:

1. **Subscriber privacy.** The server never learns which channels a person follows. In a context where following an opposition organiser is dangerous, a server-side subscription table is a list of targets.
2. **Blackout delivery.** Flooding works over mesh and Reticulum, where per-subscriber fanout does not.
3. **No fanout amplification.** One broadcast is one object, not N deliveries.

Server-side subscription exists only as an **opt-in** optimisation for push notification, and is explicitly labelled in the UI as revealing the subscription to the server.

---

## 2. `proto/jagoo/v1/signal.proto` — channels

```protobuf
syntax = "proto3";
package jagoo.v1;

// ── Channel lifecycle ─────────────────────────────────────────────────────
message ChannelDeclare {
  string      channel_name  = 1;   // human label — NOT an identifier
  string      description   = 2;
  ChannelKind kind          = 3;
  repeated BroadcastCategory categories = 4;
  GeoArea     default_area  = 5;
  repeated IdentityClaim claims = 6;
  bytes       signing_key   = 7;   // Ed25519 — this is the channel identity
  bytes       kem_public_key= 8;   // ML-KEM-768, for encrypted broadcasts
  bytes       pq_key        = 9;   // ML-DSA-44 attestation key
  string      language      = 10;  // BCP-47, e.g. "bn" | "en"
  int64       valid_from    = 11;
}

message ChannelUpdate  { string channel=1; ChannelDeclare patch=2; }
message ChannelRetire  { string channel=1; string note=2; bytes successor_key=3; }

// Continuity across key rotation: the OLD key signs this.
message ChannelRotate  { string channel=1; bytes new_signing_key=2; bytes new_kem_key=3; int64 effective_from_ms=4; }

enum ChannelKind {
  CHANNEL_KIND_UNSPECIFIED = 0;
  PERSON       = 1;   // ward coordinator, journalist, doctor
  ORGANISATION = 2;   // NGO, relief group, hospital, student body
  AUTHORITY    = 3;   // official body — higher verification bar
  COMMUNITY    = 4;   // a neighbourhood or building's shared channel
}

message IdentityClaim {
  ClaimKind kind  = 1;
  string    value = 2;
  string    proof = 3;
  int64     asserted_at_ms = 4;
}
enum ClaimKind {
  CLAIM_KIND_UNSPECIFIED = 0;
  WEBSITE=1; SOCIAL_ACCOUNT=2; ORG_REGISTRY=3;
  PHYSICAL_ADDRESS=4; PHONE=5; IN_PERSON=6; PRINTED=7;
}

// ── Trust ─────────────────────────────────────────────────────────────────
message ChannelVouch {
  string     channel      = 1;   // the channel being vouched for
  VouchLevel level        = 2;
  string     basis        = 3;   // "verified in person", "known since 2019"
  int64      asserted_at_ms = 4;
}
enum VouchLevel {
  VOUCH_LEVEL_UNSPECIFIED = 0;
  NEGATIVE  = 1;   // this channel is impersonating someone
  KNOWN     = 2;   // I have interacted with them
  VERIFIED  = 3;   // I checked their identity out of band
  ENDORSED  = 4;   // I vouch for their broadcasts as an institution
}
```

### 2.1 Channel identity rules

**Requirement CH-01:** The channel identifier is `jbc1` + base32(`signing_key`). `channel_name` is a mutable label and MUST NOT be used as an identifier anywhere.
**Requirement CH-02:** Channel names are **not** globally unique. The client MUST detect confusable names (NFKC normalisation, homoglyph folding, edit distance ≤ 2 against known channels) and surface the collision to the subscriber rather than silently allowing it.
**Requirement CH-03:** `ChannelRotate` MUST be signed by the **old** key. This is what preserves subscriber lists across a key change — subscribers follow the channel, and continuity is established cryptographically.
**Requirement CH-04:** `Severity.CRITICAL` broadcasts MUST be rejected by the client's default filter unless the channel is at least *vouched* (`01-IDENTITY-PLANES.md` CV-04). An unverified channel can advise; it cannot trigger a maximum-severity alarm.

---

## 3. Broadcast

```protobuf
message BroadcastEmit {
  string   channel       = 1;   // jbc1…
  uint64   sequence      = 2;   // monotonic per channel — gap detection
  Severity severity      = 3;
  BroadcastCategory category = 4;
  string   headline      = 5;   // ≤ 120 chars — must fit one LoRa frame
  string   detail        = 6;   // optional, omitted on constrained transports
  GeoArea  area          = 7;
  int64    expires_at_ms = 8;
  string   supersedes    = 9;   // content_id of a broadcast this corrects
  string   language      = 10;
}

message BroadcastRevoke {
  string       channel = 1;
  string       target  = 2;   // content_id being retracted
  RevokeReason reason  = 3;
  string       note    = 4;
}
enum RevokeReason {
  REVOKE_REASON_UNSPECIFIED=0;
  FALSE_ALARM=1; RESOLVED=2; CORRECTED=3; ERROR=4; EXPIRED=5;
}

enum Severity {
  SEVERITY_UNSPECIFIED = 0;
  INFO     = 1;   // "distribution point open at X"
  ADVISORY = 2;   // "avoid route Y"
  WARNING  = 3;   // "water rising in Z"
  CRITICAL = 4;   // "evacuate now" — requires vouched channel
}

enum BroadcastCategory {
  BROADCAST_CATEGORY_UNSPECIFIED=0;
  FLOOD=1; EARTHQUAKE=2; FIRE=3; STORM=4; MEDICAL=5;
  SHELTER=6; SUPPLY=7; SAFETY=8; NETWORK_STATUS=9;
  MISSING_PERSON=10; UTILITY=11; OTHER=12;
}

message GeoArea { sint32 lat_e5=1; sint32 lon_e5=2; uint32 radius_m=3; string place_name=4; }
```

### 3.1 Sequence numbers matter

**Requirement BC-01:** `sequence` is strictly monotonic per channel. The client MUST detect gaps and show *"broadcast #47 from this channel has not reached you"*.

This is a censorship detector. If a node drops or withholds a broadcast, the subscriber sees the hole rather than silently receiving an incomplete picture. Missing broadcasts are evidence.

### 3.2 Correction and retraction

**Requirement BC-02:** A false alarm in a crisis is dangerous, so retraction is a first-class operation. `BroadcastRevoke` and `supersedes` MUST propagate at the same priority as the original and MUST update any already-displayed alert in place.
**Requirement BC-03:** A revoked broadcast is **marked revoked, not deleted**. Subscribers who acted on it need to see that it was retracted and why.

### 3.3 Size budget

`BROADCAST` priority, **≤ 512 bytes total**. Budget breakdown for a typical CRITICAL broadcast:

| Component | Bytes |
|---|---|
| Envelope framing (version, plane, priority, timestamps) | ~30 |
| `domain` string | ~24 |
| `author_key` (Ed25519) | 32 |
| `nonce` | 16 |
| `channel` reference (raw key bytes, not the base32 string) | 32 |
| `sequence`, `severity`, `category`, `expires_at` | ~14 |
| `headline` (120 chars, Bangla UTF-8 worst case ~3 B/char) | ~200 |
| `area` | ~14 |
| `signature` (Ed25519) | 64 |
| **Total** | **~426** |

**Requirement BC-04:** `detail` is omitted when the target transport MTU cannot carry it. The client fetches the full broadcast over IP when a path is available, keyed by `content_id`. The headline alone must be actionable.

---

## 4. Identified messaging

Same engine as forum DMs, different identity provider. One implementation, two planes (`07-ARCHITECTURE.md` §4).

```protobuf
// Published ahead of time so a sender can start a session while the
// recipient is offline — essential for store-and-forward transports.
message PrekeyBundle {
  bytes  identity_key      = 1;   // Ed25519
  bytes  signed_prekey     = 2;   // X25519
  bytes  signed_prekey_sig = 3;
  bytes  kem_public_key    = 4;   // ML-KEM-768
  repeated bytes one_time_prekeys = 5;
  int64  valid_until_ms    = 6;
}

message SignalSessionInit {
  bytes  recipient_key     = 1;
  bytes  kem_ciphertext    = 2;   // ML-KEM-768 encapsulation
  bytes  ephemeral_x25519  = 3;
  bytes  used_prekey_id    = 4;
  bytes  ciphertext        = 5;   // first message, ChaCha20-Poly1305
}

message SignalMessage {
  string session       = 1;   // content_id of the SessionInit
  uint64 counter       = 2;   // ratchet counter — gap and reorder detection
  bytes  header        = 3;   // encrypted ratchet header
  bytes  ciphertext    = 4;
  repeated string attachment_refs = 5;  // content_ids, separately encrypted
}

message SignalDeliveryReceipt {
  string message = 1;
  DeliveryState state = 2;
}
enum DeliveryState {
  DELIVERY_STATE_UNSPECIFIED=0;
  QUEUED=1; RELAYED=2; DELIVERED=3; READ=4;
}

// Group messaging — sender-keys model, small groups only
message SignalGroupCreate { string name=1; repeated bytes member_keys=2; bytes group_key_wrapped=3; }
message SignalGroupUpdate { string group=1; repeated bytes add=2; repeated bytes remove=3; bytes rekey_wrapped=4; }
```

### 4.1 Cryptographic requirements

**Requirement MS-01:** Key agreement is **hybrid X25519 + ML-KEM-768**. The session key derives from both; breaking it requires breaking both.
**Requirement MS-02:** Forward secrecy via a symmetric ratchet. Compromising the device today MUST NOT decrypt yesterday's messages.
**Requirement MS-03:** The server stores **ciphertext only**. Plaintext message bodies MUST NOT exist server-side in any plane.
**Requirement MS-04:** Prekey bundles MUST be publishable so a sender can start a session against an offline recipient. Without this, store-and-forward messaging cannot work.
**Requirement MS-05:** `counter` gaps MUST be surfaced to the user as *"a message may be missing"*, for the same reason as BC-01.
**Requirement MS-06:** Group messaging uses sender keys, capped at 64 members. Larger coordination uses a channel.

### 4.2 Metadata minimisation

**Requirement MS-07:** The node MUST NOT log message routing metadata (sender, recipient, timing) beyond what delivery requires, and MUST purge delivery state once `DELIVERED`.
**Requirement MS-08:** Attachments are encrypted separately with their own key, referenced from the message. The storage layer sees an opaque blob with no association to a conversation.

---

## 5. Signal domain registry

All rows have `plane: SIGNAL`.

| `domain` | Body | Priority | Idem. | Scope | Gates | Notes |
|---|---|---|---|---|---|---|
| `jb:channel:declare:v1` | `ChannelDeclare` | BULK | yes | NONE | POW | one-time, expensive |
| `jb:channel:update:v1` | `ChannelUpdate` | BULK | no | CHANNEL | — | channel key only |
| `jb:channel:rotate:v1` | `ChannelRotate` | BROADCAST | yes | CHANNEL | — | signed by **old** key |
| `jb:channel:retire:v1` | `ChannelRetire` | BROADCAST | yes | CHANNEL | — | |
| `jb:channel:vouch:v1` | `ChannelVouch` | BULK | no | CHANNEL | — | trust edge |
| `jb:broadcast:emit:v1` | `BroadcastEmit` | **BROADCAST** | yes | CHANNEL | — | ≤ 512 B |
| `jb:broadcast:revoke:v1` | `BroadcastRevoke` | **BROADCAST** | yes | CHANNEL | — | ≤ 512 B |
| `jb:checkin:post:v1` | `CheckIn` | **CHECKIN** | no | NONE | — | **zero cost** |
| `jb:missing:report:v1` | `MissingPersonReport` | CHECKIN | no | NONE | — | |
| `jb:resource:report:v1` | `ResourceReport` | CHECKIN | no | NONE | — | |
| `jb:message:signal:v1` | `SignalMessage` | **DIRECT** | yes | NONE | — | E2EE |
| `jb:message:session:v1` | `SignalSessionInit` | **DIRECT** | yes | NONE | — | |
| `jb:message:receipt:v1` | `SignalDeliveryReceipt` | DIRECT | no | NONE | — | |
| `jb:message:prekeys:v1` | `PrekeyBundle` | BULK | no | NONE | — | |
| `jb:group:create:v1` | `SignalGroupCreate` | DIRECT | yes | NONE | — | |
| `jb:group:update:v1` | `SignalGroupUpdate` | DIRECT | no | NONE | — | |
| `jb:key:certify:v1` | `KeyCertificate` | BROADCAST | yes | NONE | — | both planes |
| `jb:key:revoke:v1` | `KeyRevocation` | **BROADCAST** | yes | NONE | — | floods everywhere |

---

## 6. Crisis reporting bodies

```protobuf
message CheckIn {
  CheckInStatus status = 1;
  GeoArea area         = 2;   // optional, coarse by default
  string  note         = 3;   // ≤ 80 chars
  repeated bytes notify_keys = 4;   // trusted contacts
}
enum CheckInStatus {
  CHECKIN_STATUS_UNSPECIFIED=0;
  SAFE=1; NEED_HELP=2; MEDICAL=3; MOVING=4; UNREACHABLE=5;
}

message MissingPersonReport {
  string name=1; uint32 age=2; string description=3;
  string last_seen_place=4; int64 last_seen_at_ms=5;
  string contact_channel=6; repeated string photos=7;
  MissingStatus status=8;
}
enum MissingStatus {
  MISSING_STATUS_UNSPECIFIED=0;
  MISSING=1; FOUND_SAFE=2; FOUND_INJURED=3; DECEASED=4; RESOLVED_OTHER=5;
}

message ResourceReport {
  ResourceKind kind=1; GeoArea area=2; string detail=3;
  ResourceState state=4; int64 observed_at_ms=5;
}
enum ResourceKind  { RESOURCE_KIND_UNSPECIFIED=0; SHELTER=1; WATER=2; FOOD=3; MEDICAL=4; FUEL=5; POWER=6; INTERNET=7; ROAD=8; }
enum ResourceState { RESOURCE_STATE_UNSPECIFIED=0; AVAILABLE=1; LIMITED=2; EXHAUSTED=3; BLOCKED=4; DAMAGED=5; }
```

**Requirement CR-01:** `CheckIn` costs zero credits and requires no credential. In a disaster, telling people you are alive must never be rate-limited.
**Requirement CR-02:** Location is **coarse by default** (settlement-level radius). Precise coordinates require explicit per-message opt-in.
**Requirement CR-03:** `CheckIn` supersedes the author's previous check-in. Only the latest is projected; history is retained in the log but not surfaced by default.

---

## 7. Subscription

```protobuf
// LOCAL ONLY — never transmitted, never leaves the device.
message LocalSubscription {
  string  channel        = 1;
  bool    alert_critical = 2;
  bool    alert_warning  = 3;
  bool    alert_advisory = 4;
  bool    alert_info     = 5;
  GeoArea area_filter    = 6;
  repeated BroadcastCategory category_filter = 7;
  bool    muted_until_ms = 8;
}

// OPT-IN, server-visible. Only for push notification delivery.
message ChannelSubscribe {
  string channel    = 1;
  bool   push       = 2;
  bytes  push_token = 3;
}
```

**Requirement SB-01:** Subscription is **local by default**. `LocalSubscription` MUST NOT be serialised into an envelope or transmitted.
**Requirement SB-02:** `ChannelSubscribe` is opt-in, and the UI MUST state plainly that it reveals the subscription to the server before the user enables it.
**Requirement SB-03:** With local-only subscription, a client receives all flooded broadcasts and filters locally. Filtering MUST happen client-side, so the server cannot infer interest from request patterns.
**Requirement SB-04:** The client MUST support **area-based** subscription ("anything CRITICAL within 5 km") independent of channel subscription, so a person receives evacuation orders from a channel they have never heard of.

### 7.1 Delivery semantics

| Situation | Behaviour |
|---|---|
| Online, IP available | Broadcast arrives via federation flood + SSE stream |
| Online, opted into push | Additional web-push/native notification |
| Offline, app closed | Broadcast queued at the node; delivered on reconnect, replayed by `sequence` |
| Blackout, mesh available | Broadcast floods peer-to-peer; hop limit 8, TTL 72 h |
| Blackout, Reticulum available | Broadcast floods over RNS; headline only |

**Requirement SB-05:** Broadcast delivery MUST NOT depend on the server knowing the subscriber. Flood-and-filter is the mechanism precisely so that delivery survives the server not knowing, or not being reachable.

---

## 8. Signal read API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/channels?q&kind&category&area` | Channel directory |
| `GET` | `/v1/channels/:channelId` | Channel detail with claims and vouches |
| `GET` | `/v1/channels/:channelId/broadcasts?since_seq` | Broadcast history, gap-detectable |
| `GET` | `/v1/channels/:channelId/vouches` | Trust edges |
| `GET` | `/v1/broadcasts?area&severity&category&since` | Cross-channel broadcast feed |
| `GET` | `/v1/broadcasts/:contentId` | Full broadcast including `detail` |
| `GET` | `/v1/checkins?keys&area` | Check-ins (own trusted contacts, or area) |
| `GET` | `/v1/missing?q&status&area` | Missing-person registry |
| `GET` | `/v1/resources?kind&area&state` | Resource reports |
| `GET` | `/v1/prekeys/:keyId` | Prekey bundle for session start |
| `GET` | `/v1/signal/messages?since` | Ciphertext inbox |
| `GET` | `/v1/signal/events` | SSE stream, Signal plane only |

**Requirement SG-API-01:** Signal-plane endpoints MUST NOT be served on the same SSE stream as Forum-plane endpoints (`SEP-07`). Separate streams, separate connections.

---

## 9. Feature requirements

| ID | Requirement |
|---|---|
| SIG-01 | Declare a channel with kind, categories, area, language, and identity claims |
| SIG-02 | Channel verification via claims, vouches, instance attestation, and in-person QR |
| SIG-03 | Verification state shown on every broadcast, distinguishable without colour |
| SIG-04 | Confusable-name detection and collision warning |
| SIG-05 | Emit broadcast: severity, category, headline, detail, area, expiry, sequence |
| SIG-06 | `CRITICAL` gated on channel verification level |
| SIG-07 | Gap detection from sequence numbers, surfaced to the subscriber |
| SIG-08 | Correction (`supersedes`) and retraction (`BroadcastRevoke`) with in-place alert update |
| SIG-09 | Local subscription with per-severity, per-category, per-area filters |
| SIG-10 | Area-based subscription independent of channel |
| SIG-11 | Opt-in server-side subscription for push, with an explicit privacy warning |
| SIG-12 | Distinct alert UI and notification channel; unread `CRITICAL` pinned |
| SIG-13 | Identified 1:1 messaging, E2EE, hybrid PQ key agreement |
| SIG-14 | Prekey bundles for offline session initiation |
| SIG-15 | Small-group messaging (≤ 64) via sender keys |
| SIG-16 | Delivery receipts with `QUEUED`/`RELAYED`/`DELIVERED`/`READ` |
| SIG-17 | Check-in with status, coarse area, note, trusted-contact notification |
| SIG-18 | Missing-person registry: report, search, status update |
| SIG-19 | Resource reports with kind, area, and state |
| SIG-20 | Map view of broadcasts, check-ins, and resources |
| SIG-21 | Channel key rotation preserving subscribers |
| SIG-22 | Independent panic wipe of the Signal plane only |
