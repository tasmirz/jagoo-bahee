# Jagoo Bahee v2 — System Requirements & Interface Contracts

> **Status:** Design-frozen for build. Supersedes the v1 implementation.
> **Track:** Crisis Tech. Dedicated to Jogajog.
> **Rule for this document:** every v1 capability is carried forward. Nothing is dropped. New capability is *appended*, and where a v1 mechanism was unsound it is *replaced by a stronger mechanism serving the same feature*, never by removal.

---

## Table of Contents

1. [Vision & Scope](#1-vision--scope)
2. [Threat Model](#2-threat-model)
3. [Architecture Overview](#3-architecture-overview)
4. [Layer 0 — Identity & Cryptography](#4-layer-0--identity--cryptography)
5. [Layer 1 — The Envelope (canonical contract)](#5-layer-1--the-envelope-canonical-contract)
6. [Layer 2 — Domain Model & Projections](#6-layer-2--domain-model--projections)
7. [Layer 3 — Transport Contracts](#7-layer-3--transport-contracts)
8. [Layer 4 — Federation Contract](#8-layer-4--federation-contract)
9. [Layer 5 — Trust, Labels & Transparency](#9-layer-5--trust-labels--transparency)
10. [Layer 6 — Abuse Resistance](#10-layer-6--abuse-resistance)
11. [Complete Feature Requirements](#11-complete-feature-requirements)
12. [HTTP API Contract](#12-http-api-contract)
13. [Internal Service Interfaces](#13-internal-service-interfaces)
14. [Repository Layout & Build Order](#14-repository-layout--build-order)
15. [Non-Functional Requirements](#15-non-functional-requirements)
16. [Acceptance Criteria](#16-acceptance-criteria)
17. [Appendix A — v1 → v2 Migration Map](#appendix-a--v1--v2-migration-map)

---

## 1. Vision & Scope

### 1.1 What this is

A **federated, censorship-resistant community platform** that degrades gracefully from full internet, through ISP-level blocking, to complete national blackout — and keeps working at every step.

It has the shape of a forum (communities, posts, threaded comments, votes, moderation, DMs, awards) because that is what people actually use to coordinate. Underneath, every piece of content is a **self-authenticating signed object** that does not depend on any server for its validity, so it can travel over HTTP, gRPC, LoRa radio, phone-to-phone Bluetooth, or a QR code on a screen, and still be verified on arrival.

### 1.2 The three operating modes

| Mode | Condition | What works |
|---|---|---|
| **Connected** | Normal internet | Everything. Full feed, media, federation, live updates. |
| **Constrained** | ISP blocking, DPI, throttling | Multi-homeserver failover, alternate transports, degraded media, text-first. Full feature set at reduced fidelity. |
| **Blackout** | No internet at all | Emergency broadcast, DMs, check-ins, and locally-cached content over mesh/LoRa/sneakernet. Content authored offline queues and syncs when any path opens. |

### 1.3 Design axioms

These are non-negotiable and every design decision must be checkable against them.

1. **The author, not the server, makes content valid.** A signature is created before the network is touched. No server approval is ever a precondition for publishing.
2. **Identity is a public key.** Not a row ID, not a username, not a server-issued token. Names are labels on keys; keys are the identity.
3. **Content is addressed by its hash.** The same post has the same ID on every node, forever. Deduplication, replay protection, and cross-node references all fall out of this.
4. **One wire format, every transport.** The bytes signed on a browser are the bytes sent over LoRa. A verifier does not need to know how the bytes arrived.
5. **Moderation is additive, never subtractive at the protocol layer.** Servers and moderators publish *opinions* (labels, removals) that clients choose to honour. Content cannot be un-published, only un-shown.
6. **Every censorship action is evidence.** If a server removes or refuses something, that action is itself a signed, auditable object. Silent deletion is structurally impossible.
7. **Cost, not identity, is the anti-abuse primitive.** Rate limiting must work against an anonymous user. Requiring identity for spam control is a censorship lever.
8. **Assume the device is seized.** Key revocation, duress destruction, and forward secrecy are requirements, not features.

### 1.4 Explicitly out of scope for v2

- Cryptocurrency, tokens, on-chain anything.
- Video transcoding pipelines or live streaming.
- SMS/USSD/IVR (deferred to v3 — the envelope is designed to fit, but no gateway ships in v2).
- Full zk-SNARK group membership (the interface is designed for it; the v2 implementation uses blind credentials + nullifiers, see §4.5).

---

## 2. Threat Model

### 2.1 Adversaries

| ID | Adversary | Capability | Primary mitigations |
|---|---|---|---|
| **A1** | **State network operator** | Nationwide DNS/IP/SNI blocking, full internet shutdown, DPI protocol fingerprinting, BGP manipulation | Multi-homeserver, pluggable transports, Reticulum, mesh, sneakernet, static-exportable client |
| **A2** | **Compromised / coerced instance** | Full DB access, can forge server signatures, delete content, lie to clients, shadowban | Client-side signature verification, Merkle transparency log with gossiped tree heads, federation replication, E2EE DMs |
| **A3** | **Device seizure** | Physical access to an unlocked phone, compelled unlock | Key revocation, pre-signed duress revocation, per-community key isolation, forward-secret DMs, panic wipe |
| **A4** | **Mass spam / astroturf operator** | Thousands of IPs, cheap compute, scripted clients | Memory-hard PoW, credit economy, blind-credential rate limits, per-epoch nullifiers, web-of-trust reach limits |
| **A5** | **Passive network observer** | Records all traffic for later analysis | Hybrid PQ key agreement (harvest-now-decrypt-later), metadata minimisation, per-community identity unlinkability |
| **A6** | **Malicious mesh peer** | Injects, drops, replays, or floods mesh traffic | Every envelope verified before storage or relay; hop limits; TTL; per-peer quotas; content-ID dedupe |

### 2.2 Explicit non-goals

- **Anonymity against a global passive adversary.** We are not Tor. We reduce metadata but do not claim traffic-analysis resistance.
- **Protection against a fully compromised client device with an active attacker present.** If malware is running with the app unlocked, keys are exposed. We mitigate blast radius (per-community keys, revocation), not the root compromise.
- **Availability against sustained physical destruction of all local hardware.**

### 2.3 Safety property (must hold in all modes)

> A client that holds an author's public key can determine, **with no network access and no trusted server**, whether a given piece of content was genuinely authored by that key and has not been modified.

---

## 3. Architecture Overview

### 3.1 Component map

```
┌───────────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────────┐     │
│  │ Web PWA        │  │ Mobile app     │  │ Relay node (headless)│     │
│  │ (static export)│  │ (native shell) │  │ (community-run)      │     │
│  └───────┬────────┘  └───────┬────────┘  └──────────┬───────────┘     │
│          │  jb-wasm (crypto) │  jb-core (native)    │                 │
└──────────┼───────────────────┼──────────────────────┼─────────────────┘
           │                   │                      │
    ┌──────┴──────┬────────────┴──────┬───────────────┴────────┐
    │  TRANSPORTS (all carry identical Envelope bytes)          │
    │  HTTPS   WebRTC/BLE mesh   Reticulum(LoRa/TCP)   QR/file  │
    └──────┬────────────────────────────────────────────────────┘
           │
┌──────────┴────────────────────────────────────────────────────────────┐
│  INSTANCE ("node")                                                    │
│  ┌─────────────┐ ┌────────────┐ ┌───────────┐ ┌──────────┐            │
│  │ Ingress     │ │ Projector  │ │ Witness   │ │ Labeller │            │
│  │ verify+rate │→│ apply to   │→│ Merkle log│ │ LLM/mod  │            │
│  │             │ │ read model │ │ + STH     │ │ (async)  │            │
│  └─────────────┘ └─────┬──────┘ └───────────┘ └──────────┘            │
│         ↑              │                                              │
│  ┌──────┴──────┐  ┌────┴──────┐  ┌──────────┐  ┌─────────────┐        │
│  │ Federation  │  │ Read API  │  │ Mongo    │  │ Reticulum   │        │
│  │ gRPC peer   │  │ REST/JSON │  │ Redis    │  │ bridge      │        │
│  └──────┬──────┘  └───────────┘  │ S3/MinIO │  └─────────────┘        │
└─────────┼───────────────────────────────────────────────────────────  ┘
          │ gRPC (server↔server only)
    ┌─────┴─────┐
    │ Peer node │
    └───────────┘
```

### 3.2 The two paths

Everything in the system is either a **write** or a **read**, and they have completely different contracts.

**Write path — uniform, one contract, transport-agnostic.**
```
author signs Envelope → any transport → Ingress verifies → Projector applies
    → Witness appends to Merkle log → Receipt returned (when a server is reachable)
```
There is exactly **one** write endpoint per transport. A post, a vote, a ban, a DM, and a key revocation all go through it. This is what makes offline authoring and mesh relay possible without duplicating logic.

**Read path — conventional, optimised, cacheable.**
```
client → REST/JSON → projection (Mongo) → JSON + provenance block
```
Reads return denormalised, paginated JSON exactly like a normal API, with a `provenance` block attached so the client can verify locally.

### 3.3 Why this split

The v1 system had signing bolted onto REST handlers, so each feature reimplemented canonicalization, verification, and receipts — which is how three incompatible canonical forms and a signature-confusion bug appeared. Making the write path a single generic pipeline means the security-critical code exists **once**, is tested once, and every new feature inherits it.

---

## 4. Layer 0 — Identity & Cryptography

### 4.1 Key hierarchy (BIP85)

Root secret is a **24-word BIP-39 mnemonic** (256-bit entropy). All keys derive from it via **BIP85 child-entropy derivation**.

> **Why BIP85 and not BIP32:** BIP32 derives child *keys* within a single curve (secp256k1). BIP85 derives child *entropy*, which can then seed a keypair in **any algorithm**. Because v2 requires Ed25519, X25519, ML-KEM and ML-DSA keys from one mnemonic, BIP85 is a structural requirement, not a preference. It also gives per-context identities that are mutually unlinkable with no zero-knowledge machinery.

| Path | Purpose | Algorithms | Lifetime |
|---|---|---|---|
| `m/83696968'/0'/0'` | **Device identity** — the root of trust for this device | Ed25519 (primary) + ML-DSA-44 (attestation) | Long-lived, revocable |
| `m/83696968'/1'/n'` | **Per-community identity** `n` — unlinkable across communities | Ed25519 | Per community, rotatable |
| `m/83696968'/2'/e'` | **Per-epoch posting secret** — source of rate-limit nullifiers | scalar only, never published | Per epoch (default 24h) |
| `m/83696968'/3'/0'` | **Key agreement** — E2EE DMs | X25519 + ML-KEM-768 (hybrid) | Long-lived, rotatable |
| `m/83696968'/4'/0'` | **Credential blinding secret** — anonymous membership tokens | scalar only | Long-lived |

**Requirement ID-01:** The mnemonic MUST NOT leave the device. All derivation happens locally.
**Requirement ID-02:** Derived private keys MUST live only inside the signer boundary (§4.4) and MUST NOT be readable by application JavaScript.
**Requirement ID-03:** Losing the mnemonic is unrecoverable and the UI MUST state this before generation completes.

### 4.2 Signature algorithm policy — the size constraint

Post-quantum signatures are too large for the mesh. This governs the whole design.

| Algorithm | Signature | Public key | Fits one LoRa frame (~222 B)? |
|---|---|---|---|
| Ed25519 | 64 B | 32 B | **Yes** |
| secp256k1 (Schnorr) | 64 B | 33 B | **Yes** |
| Falcon-512 | ~666 B | 897 B | No — 4+ fragments |
| ML-DSA-44 (Dilithium2) | 2420 B | 1312 B | No — ~12 fragments |

A single ML-DSA signature is eleven LoRa transmissions *before any content*, on a link where each fragment carries independent loss probability. Signing mesh traffic with ML-DSA makes the mesh unusable.

**Therefore the PQ budget is spent where quantum computers actually threaten:**

| Threat | Real? | Decision |
|---|---|---|
| **Harvest-now-decrypt-later on DMs** | **Yes** — traffic captured in 2026 decrypted in 2035 exposes people | **Hybrid X25519 + ML-KEM-768** for all DM key agreement. Per-session cost, not per-message. |
| **Retroactive signature forgery** | **No** — a forged signature on a 2026 post, produced in 2035, has no value to anyone | **Ed25519 (64 B)** on every per-message envelope. |
| **Future identity impersonation** | Yes, eventually | **ML-DSA-44 identity certificate**, signed once, published on the internet path and cached. Mesh peers verify a 64-byte Ed25519 signature against an Ed25519 key that is itself PQ-attested. |

**Requirement ID-04:** `key_alg` is negotiable per envelope. The verifier MUST reject any algorithm not in the accepted set for that `domain`, and MUST NOT downgrade.
**Requirement ID-05:** Class 0–2 envelopes (§7.1) MUST use a 64-byte signature algorithm. This is enforced at construction, not just validation.

### 4.3 Key certificates & revocation

```
KeyCertificate {
  device_key      : Ed25519 pubkey (32 B)
  pq_key          : ML-DSA-44 pubkey (1312 B)
  pq_attestation  : ML-DSA sig over device_key ‖ valid_from ‖ valid_until
  valid_from      : int64
  valid_until     : int64
  self_signature  : Ed25519 sig over all above
}
```

**Requirement ID-06:** Every identity MUST publish a `KeyCertificate` before its first content is accepted by a server. Mesh peers MAY accept content from an uncertified key at reduced trust.

**Revocation** is a priority-class-0 envelope (`domain: "jb:key:revoke:v1"`) so it floods over every transport including mesh, and propagates during a blackout.

| Revocation kind | Trigger | Effect |
|---|---|---|
| `ROTATE` | Planned key change | New key inherits karma/roles; old key marked superseded from timestamp T |
| `COMPROMISE` | Key believed stolen | All content signed after timestamp T is marked untrusted; content before T stays valid |
| `DURESS` | Pre-signed, stored offline, published by a trusted contact | Same as COMPROMISE + client wipes local state + notifies contacts |

**Requirement ID-07:** A `DURESS` revocation MUST be constructible and exportable *before* it is needed, and MUST be usable by a third party who holds only the pre-signed blob.
**Requirement ID-08:** Revocation MUST NOT invalidate content signed before the stated compromise timestamp. Retroactive erasure of a person's history is itself a censorship vector.

### 4.4 The signer boundary

All private-key operations happen behind one interface, implemented once in Rust and exposed to every client.

```typescript
// packages/sdk-ts/src/signer.ts — the ONLY way any client touches a private key
interface Signer {
  /** Derive and cache a context identity. Never returns private material. */
  identity(ctx: IdentityContext): Promise<PublicIdentity>;

  /** Sign canonical envelope bytes. Private key never crosses this boundary. */
  sign(ctx: IdentityContext, canonicalBytes: Uint8Array): Promise<Signature>;

  /** Hybrid key agreement for E2EE. Returns a session key handle, not the key. */
  agree(peer: PublicIdentity, kemCiphertext?: Uint8Array): Promise<SessionHandle>;

  /** Epoch nullifier for anonymous rate limiting. */
  nullifier(epoch: number, scope: string): Promise<Uint8Array>;

  /** Blind a credential request; unblind the issuer's response. */
  blind(message: Uint8Array): Promise<{ blinded: Uint8Array; state: BlindState }>;
  unblind(state: BlindState, blindSig: Uint8Array): Promise<Credential>;

  /** Pre-sign a duress revocation for offline storage. */
  prepareDuressRevocation(): Promise<Uint8Array>;

  /** Wipe all derived material from memory and storage. */
  panic(): Promise<void>;
}

type IdentityContext =
  | { kind: "device" }
  | { kind: "community"; communityId: string }
  | { kind: "epoch"; epoch: number };

interface PublicIdentity {
  keyId: string;          // "jbk1..." — base32 multibase of the pubkey
  publicKey: Uint8Array;
  alg: KeyAlg;
}
```

| Platform | Implementation | Key storage |
|---|---|---|
| Web PWA | `jb-wasm` inside a dedicated **Web Worker** | Non-extractable IndexedDB entry, unlocked by passphrase-derived AES-GCM key |
| Mobile | `jb-core` native | Secure Enclave / Android Keystore-wrapped |
| Relay node | `jb-core` native | OS keyring or encrypted file, operator-supplied passphrase |

**Requirement ID-09:** No code path outside the signer boundary may hold a private key in a variable. This is verified by a lint rule and a code-review checklist item.

### 4.5 Anonymous participation

The goal — **post without revealing which account you are, while still being rate-limited** — is achieved with two primitives, neither of which needs a zk circuit.

**a) Blind-signed membership credential.** After a one-time PoW + captcha, the server blind-signs a token. The user unblinds it. The token proves "the holder passed the join gate" but is cryptographically unlinkable to the account that obtained it.

**b) Epoch nullifier.** `nullifier = H(domain ‖ epoch ‖ secret_from_path_2')`. The server records one nullifier per epoch per identity and can enforce "N posts per epoch" without ever learning *which* identity. Repeats are detectable; identity is not.

**Requirement ID-10:** The credential/nullifier interface (`Signer.blind`, `Signer.nullifier`) MUST be stable so that a zk-SNARK Merkle-membership implementation can replace the internals with **no protocol change**. Full ZKP is an upgrade path, not a v2 dependency.

---

## 5. Layer 1 — The Envelope (canonical contract)

This is the single most important contract in the system. Everything else is downstream of it.

### 5.1 Canonical encoding rules

**Requirement EN-01:** The signed bytes are **deterministic protobuf**, defined as:
- Fields serialised in strictly ascending field-number order.
- Default/zero values omitted entirely.
- No unknown fields retained or re-emitted.
- `string` fields NFC-normalised before encoding.
- No `float`/`double` anywhere in signed structures (integers and strings only).

**Requirement EN-02:** There is exactly **one** accepted encoding per `version`. Fallback chains, "try the legacy form too", and multi-shape acceptance are **forbidden**. A verifier that cannot parse a version rejects it; it never guesses.

> This rule exists because v1 accepted a signature over either of two canonical forms, one of which omitted `url` and `attachmentIds` — making a text-post signature valid for a post with an attacker-chosen link and attachments.

**Requirement EN-03:** Content ID is `"jb1" + base32-nopad(SHA-256(canonical_envelope_bytes_excluding_signature))`. Stable across nodes, versions of the storage layer, and transports.

### 5.2 `proto/jagoo/v1/envelope.proto`

```protobuf
syntax = "proto3";
package jagoo.v1;

// ─── The universal signed unit ────────────────────────────────────────────
message Envelope {
  uint32  version        = 1;  // MUST be 1. Unknown → hard reject.
  string  domain         = 2;  // e.g. "jb:post:create:v1" — domain separation
  bytes   author_key     = 3;  // raw public key; identity IS this value
  KeyAlg  key_alg        = 4;
  string  parent         = 5;  // content_id of parent, "" if none
  string  community      = 6;  // "<name>@<origin_fp>", "" for non-community
  int64   created_at_ms  = 7;
  bytes   nonce          = 8;  // 16 bytes, anti-replay
  Priority priority      = 9;
  bytes   body           = 10; // serialized typed body (see body.proto)
  AntiAbuse anti_abuse   = 11; // credential/nullifier/PoW, may be empty on mesh
  bytes   signature      = 12; // over canonical bytes of fields 1..11
}

enum KeyAlg {
  KEY_ALG_UNSPECIFIED = 0;
  ED25519             = 1;  // default for all per-message signing
  SECP256K1_SCHNORR   = 2;  // v1 compatibility
  ML_DSA_44           = 3;  // certificates only; too large for mesh
  FALCON_512          = 4;  // reserved
}

enum Priority {
  PRIORITY_UNSPECIFIED = 0;
  BROADCAST            = 1;  // class 0 — emergency, key revocation
  DIRECT               = 2;  // class 1 — E2EE DMs
  CHECKIN              = 3;  // class 2 — safe-status, beacons
  BULK                 = 4;  // class 3 — posts, comments, votes, media
}

message AntiAbuse {
  bytes  credential = 1;  // unblinded membership token
  bytes  nullifier  = 2;  // H(domain ‖ epoch ‖ secret)
  uint32 epoch      = 3;
  bytes  pow        = 4;  // Argon2id proof, when demanded
}

// ─── Server-issued proof of acceptance ────────────────────────────────────
message Receipt {
  string content_id       = 1;
  string server_id        = 2;  // server public key fingerprint, NOT a URL
  bytes  server_key       = 3;
  int64  accepted_at_ms   = 4;
  uint64 log_index        = 5;  // leaf position in the Merkle log
  SignedTreeHead sth      = 6;
  repeated bytes inclusion_proof = 7;
  bytes  server_signature = 8;
}

message SignedTreeHead {
  uint64 tree_size    = 1;
  bytes  root_hash    = 2;
  int64  timestamp_ms = 3;
  bytes  signature    = 4;
}
```

### 5.3 `proto/jagoo/v1/body.proto` — every mutation in the system

Each body type maps to exactly one `domain` string. **This table is the complete write surface of the platform.**

```protobuf
syntax = "proto3";
package jagoo.v1;

// ── Content ───────────────────────────────────────────────────────────────
message PostCreate {
  string title            = 1;  // ≤ 300 chars
  PostKind kind           = 2;
  string body_markdown    = 3;
  string url              = 4;
  repeated string attachments = 5;  // content_ids of AttachmentClaim
  Poll   poll             = 6;
  string crosspost_of     = 7;      // content_id
  string flair            = 8;
  ContentFlags flags      = 9;      // nsfw, spoiler, oc
}
enum PostKind { POST_KIND_UNSPECIFIED=0; TEXT=1; LINK=2; IMAGE=3; VIDEO=4; POLL=5; CROSSPOST=6; }
message Poll { string question=1; repeated string options=2; bool multiple=3; int64 closes_at_ms=4; }
message ContentFlags { bool nsfw=1; bool spoiler=2; bool oc=3; }

message PostUpdate  { string target=1; string body_markdown=2; string flair=3; ContentFlags flags=4; }
message PostDelete  { string target=1; string reason=2; }

message CommentCreate { string post=1; string parent_comment=2; string body_markdown=3; repeated string attachments=4; }
message CommentUpdate { string target=1; string body_markdown=2; }
message CommentDelete { string target=1; string reason=2; }

message VoteCast { string target=1; TargetKind target_kind=2; int32 value=3; }  // -1 | 0 | +1
enum TargetKind { TARGET_KIND_UNSPECIFIED=0; POST=1; COMMENT=2; USER=3; COMMUNITY=4; MESSAGE=5; }

// ── Community ─────────────────────────────────────────────────────────────
message CommunityCreate {
  string name=1; string title=2; string description=3; string rules_markdown=4;
  Theme theme=5; CommunitySettings settings=6;
  bool is_private=7; bool is_nsfw=8;
}
message Theme { string primary=1; string accent=2; string background=3; string foreground=4; }
message CommunitySettings {
  bool allow_text_posts=1; bool allow_link_posts=2; bool allow_image_posts=3; bool allow_video_posts=4;
  bool require_post_approval=5; bool allow_crossposts=6;
  int32 minimum_karma_to_post=7; int32 minimum_account_age_days=8;
}
message CommunityUpdate  { string target=1; CommunityCreate patch=2; }
message CommunityArchive { string target=1; bool archived=2; }

message MembershipJoin  { string community=1; }
message MembershipLeave { string community=1; }

// ── Moderation (all reversible, all auditable) ────────────────────────────
message ModAction {
  ModVerb verb        = 1;
  string  target      = 2;      // content_id or key_id
  TargetKind target_kind = 3;
  string  reason      = 4;
  int64   expires_at_ms = 5;    // for temporary bans/mutes
  bytes   nonce       = 6;      // anti-replay; mod actions are NOT idempotent
}
enum ModVerb {
  MOD_VERB_UNSPECIFIED=0;
  APPROVE=1;  REMOVE=2;   RESTORE=3;
  LOCK=4;     UNLOCK=5;   PIN=6;      UNPIN=7;
  FLAG=8;     UNFLAG=9;   COLLAPSE=10; UNCOLLAPSE=11;
  BAN=12;     UNBAN=13;   MUTE=14;    UNMUTE=15;   KICK=16;
  ROLE_GRANT=17; ROLE_REVOKE=18;
}

message ReportCreate  { string target=1; TargetKind target_kind=2; ReportReason reason=3; string detail=4; }
enum ReportReason {
  REPORT_REASON_UNSPECIFIED=0; SPAM=1; HARASSMENT=2; HATE=3; VIOLENCE=4;
  MISINFORMATION=5; SEXUAL_CONTENT=6; SELF_HARM=7; ILLEGAL=8; RULE_VIOLATION=9; OTHER=10;
}
message ReportResolve { string target=1; ReportStatus status=2; ModVerb action_taken=3; string note=4; }
enum ReportStatus { REPORT_STATUS_UNSPECIFIED=0; PENDING=1; REVIEWED=2; RESOLVED=3; DISMISSED=4; }

message RoleDefine { string community=1; string name=2; uint64 permission_mask=3; bool is_default=4; }
message RoleAssign { string community=1; bytes subject_key=2; string role=3; }
message RoleRevoke { string community=1; bytes subject_key=2; string role=3; }

// ── Social ────────────────────────────────────────────────────────────────
message ProfileUpdate { string display_name=1; string bio=2; string avatar=3; string banner=4; }
message FollowUser    { bytes subject_key=1; bool follow=2; }
message BlockUser     { bytes subject_key=1; bool block=2; string reason=3; }
message SaveContent   { string target=1; TargetKind target_kind=2; bool save=3; string collection=4; }
message FeedPreferences {
  SortMode default_sort=1; Timeframe default_timeframe=2;
  bool show_nsfw=3; bool blur_nsfw=4; LayoutMode layout=5;
  repeated string favourite_communities=6; repeated bytes hidden_keys=7;
}
enum SortMode  { SORT_MODE_UNSPECIFIED=0; HOT=1; NEW=2; TOP=3; CONTROVERSIAL=4; RISING=5; }
enum Timeframe { TIMEFRAME_UNSPECIFIED=0; HOUR=1; DAY=2; WEEK=3; MONTH=4; YEAR=5; ALL=6; }
enum LayoutMode{ LAYOUT_MODE_UNSPECIFIED=0; CARD=1; CLASSIC=2; COMPACT=3; }

message AwardGive     { string target=1; TargetKind target_kind=2; string award_type=3; bool anonymous=4; string message=5; }
message AwardTypeDefine { string slug=1; string name=2; string icon=3; int32 cost=4; bool active=5; }

message AttachmentClaim {
  string  storage_key=1; bytes content_sha256=2; string mime=3; uint64 size_bytes=4;
  uint32  width=5; uint32 height=6; uint32 duration_ms=7; string alt_text=8;
}

// ── Private messaging (E2EE) ──────────────────────────────────────────────
message MessageSend {
  bytes  recipient_key   = 1;
  bytes  kem_ciphertext  = 2;  // ML-KEM-768 encapsulation, first message of session
  bytes  ephemeral_x25519= 3;
  bytes  ciphertext      = 4;  // ChaCha20-Poly1305 over the plaintext body
  string thread          = 5;  // content_id of thread root
  uint32 ratchet_index   = 6;
}

// ── Crisis primitives (NEW in v2) ─────────────────────────────────────────
message EmergencyBroadcast {
  Severity severity   = 1;
  string   headline   = 2;  // ≤ 120 chars — must fit one LoRa frame with the envelope
  string   detail     = 3;
  GeoArea  area       = 4;
  int64    expires_at_ms = 5;
  BroadcastCategory category = 6;
}
enum Severity { SEVERITY_UNSPECIFIED=0; INFO=1; ADVISORY=2; WARNING=3; CRITICAL=4; }
enum BroadcastCategory {
  BROADCAST_CATEGORY_UNSPECIFIED=0; FLOOD=1; EARTHQUAKE=2; FIRE=3; STORM=4;
  MEDICAL=5; SHELTER=6; SUPPLY=7; SAFETY=8; NETWORK_STATUS=9; OTHER=10;
}
message GeoArea { sint32 lat_e5=1; sint32 lon_e5=2; uint32 radius_m=3; string place_name=4; }

message CheckIn {
  CheckInStatus status = 1;
  GeoArea  area        = 2;   // optional, coarse by default
  string   note        = 3;   // ≤ 80 chars
  repeated bytes notify_keys = 4;
}
enum CheckInStatus { CHECKIN_STATUS_UNSPECIFIED=0; SAFE=1; NEED_HELP=2; MEDICAL=3; MOVING=4; UNREACHABLE=5; }

message MissingPersonReport {
  string name=1; uint32 age=2; string description=3;
  string last_seen_place=4; int64 last_seen_at_ms=5;
  string contact_channel=6; repeated string photos=7;
  MissingStatus status=8;
}
enum MissingStatus { MISSING_STATUS_UNSPECIFIED=0; MISSING=1; FOUND_SAFE=2; FOUND_INJURED=3; DECEASED=4; RESOLVED_OTHER=5; }

message ResourceReport {
  ResourceKind kind=1; GeoArea area=2; string detail=3;
  ResourceState state=4; int64 observed_at_ms=5;
}
enum ResourceKind  { RESOURCE_KIND_UNSPECIFIED=0; SHELTER=1; WATER=2; FOOD=3; MEDICAL=4; FUEL=5; POWER=6; INTERNET=7; ROAD=8; }
enum ResourceState { RESOURCE_STATE_UNSPECIFIED=0; AVAILABLE=1; LIMITED=2; EXHAUSTED=3; BLOCKED=4; DAMAGED=5; }

// ── Trust & keys ──────────────────────────────────────────────────────────
message KeyCertificate { bytes device_key=1; bytes pq_key=2; bytes pq_attestation=3; int64 valid_from=4; int64 valid_until=5; }
message KeyRevocation   { bytes revoked_key=1; RevocationKind kind=2; int64 effective_from_ms=3; bytes replacement_key=4; }
enum RevocationKind { REVOCATION_KIND_UNSPECIFIED=0; ROTATE=1; COMPROMISE=2; DURESS=3; RETIRE=4; }

message Label {
  string target        = 1;  // content_id being labelled
  Verdict verdict      = 2;
  repeated string categories = 3;
  uint32 confidence_pct= 4;
  string model_id      = 5;  // e.g. "claude-haiku-4.5" or "human:mod"
  repeated string reasons = 6;
  bool   appealable    = 7;
}
enum Verdict { VERDICT_UNSPECIFIED=0; OK=1; REVIEW=2; RESTRICT=3; DANGEROUS=4; }

message ServerVouch { bytes peer_key=1; string peer_endpoint=2; TrustLevel level=3; string note=4; }
enum TrustLevel { TRUST_LEVEL_UNSPECIFIED=0; BLOCKED=1; PROBATION=2; NORMAL=3; TRUSTED=4; }
```

### 5.4 Domain string registry

Every `domain` value, its body type, priority, and idempotency behaviour. **This is a normative table.**

| `domain` | Body | Priority | Idempotent | Notes |
|---|---|---|---|---|
| `jb:post:create:v1` | `PostCreate` | BULK | yes (by content_id) | |
| `jb:post:update:v1` | `PostUpdate` | BULK | no | last-write-wins by `created_at_ms` |
| `jb:post:delete:v1` | `PostDelete` | BULK | yes | tombstone, not erasure |
| `jb:comment:create:v1` | `CommentCreate` | BULK | yes | |
| `jb:comment:update:v1` | `CommentUpdate` | BULK | no | |
| `jb:comment:delete:v1` | `CommentDelete` | BULK | yes | |
| `jb:vote:cast:v1` | `VoteCast` | BULK | no | last-write-wins per (author, target) |
| `jb:community:create:v1` | `CommunityCreate` | BULK | yes | |
| `jb:community:update:v1` | `CommunityUpdate` | BULK | no | |
| `jb:community:archive:v1` | `CommunityArchive` | BULK | no | |
| `jb:membership:join:v1` | `MembershipJoin` | BULK | yes | |
| `jb:membership:leave:v1` | `MembershipLeave` | BULK | yes | |
| `jb:mod:action:v1` | `ModAction` | BULK | **no** — `nonce` required | replay-protected |
| `jb:report:create:v1` | `ReportCreate` | BULK | yes | |
| `jb:report:resolve:v1` | `ReportResolve` | BULK | no | |
| `jb:role:define:v1` | `RoleDefine` | BULK | no | |
| `jb:role:assign:v1` | `RoleAssign` | BULK | no | |
| `jb:role:revoke:v1` | `RoleRevoke` | BULK | no | |
| `jb:profile:update:v1` | `ProfileUpdate` | BULK | no | |
| `jb:social:follow:v1` | `FollowUser` | BULK | no | |
| `jb:social:block:v1` | `BlockUser` | BULK | no | |
| `jb:social:save:v1` | `SaveContent` | BULK | no | client-private, may be local-only |
| `jb:prefs:feed:v1` | `FeedPreferences` | BULK | no | |
| `jb:award:give:v1` | `AwardGive` | BULK | yes | |
| `jb:award:type:v1` | `AwardTypeDefine` | BULK | no | admin-gated |
| `jb:attachment:claim:v1` | `AttachmentClaim` | BULK | yes | |
| `jb:message:send:v1` | `MessageSend` | **DIRECT** | yes | E2EE, server sees ciphertext only |
| `jb:broadcast:emit:v1` | `EmergencyBroadcast` | **BROADCAST** | yes | ≤ 512 B total |
| `jb:checkin:post:v1` | `CheckIn` | **CHECKIN** | no | latest-wins per author |
| `jb:missing:report:v1` | `MissingPersonReport` | CHECKIN | no | |
| `jb:resource:report:v1` | `ResourceReport` | CHECKIN | no | |
| `jb:key:certify:v1` | `KeyCertificate` | BROADCAST | yes | |
| `jb:key:revoke:v1` | `KeyRevocation` | **BROADCAST** | yes | floods every transport |
| `jb:label:emit:v1` | `Label` | BULK | no | issued by labellers, not authors |
| `jb:server:vouch:v1` | `ServerVouch` | BULK | no | web-of-trust edge |

**Requirement EN-04:** Adding a new feature means adding a row to this table and a message to `body.proto`. It MUST NOT mean writing new signing, verification, or receipt code.

### 5.5 Validation pipeline (normative order)

Every envelope, from every transport, passes through exactly these steps in exactly this order. Failing any step aborts with a typed error.

```
 1. SIZE          reject if > transport limit (checked pre-parse, on raw bytes)
 2. PARSE         deterministic protobuf decode; reject unknown fields
 3. VERSION       reject unknown version
 4. DOMAIN        must exist in the registry (§5.4)
 5. ALG POLICY    key_alg permitted for this domain and priority
 6. CLOCK         created_at_ms within [now - max_age, now + max_skew]
 7. SIGNATURE     verify over canonical bytes of fields 1..11
 8. CERT          author key has a valid, unrevoked KeyCertificate
 9. DEDUPE        content_id not already present (atomic, unique index)
10. ANTI-ABUSE    credential / nullifier / PoW / credits (§10)
11. AUTHORISE     domain-specific permission check against projection
12. BODY VALIDATE domain-specific field constraints
13. APPLY         project into read model (transactional)
14. WITNESS       append content_id to Merkle log
15. RECEIPT       sign and return
16. FANOUT        enqueue for federation + mesh relay per priority
```

**Requirement EN-05:** Steps 1–9 MUST be free of database writes so that a flood of invalid envelopes cannot cause write amplification.
**Requirement EN-06:** Steps 13–14 MUST be atomic with respect to each other. A projected envelope that is missing from the log is a transparency failure.

---

## 6. Layer 2 — Domain Model & Projections

### 6.1 Identifier scheme

| Kind | Format | Example | Stable across nodes |
|---|---|---|---|
| Identity | `jbk1` + base32(pubkey) | `jbk1qy2f8x...` | **Yes** |
| Content | `jb1` + base32(sha256(envelope)) | `jb1h7k3m9p...` | **Yes** |
| Community | `<name>@<origin_fp>` | `dhaka-relief@jbs1a4f...` | **Yes** |
| Server | `jbs1` + base32(server pubkey) | `jbs1a4f7...` | **Yes** |
| Storage row | Mongo ObjectId | — | **No — never signed, never federated** |

**Requirement DM-01:** No signed structure and no federated payload may contain a Mongo ObjectId. Row IDs are a local storage detail only.

> In v1, `authorId` and `subredditId` were signed as ObjectIds. This is the specific reason v1 federation could not work: a remote node cannot resolve or verify an identifier that only exists in another node's database.

### 6.2 Projections (read model)

Projections are **derived state**. They can be dropped and rebuilt from the envelope log at any time. This is what makes the system recoverable and what makes "rebuild from a peer after seizure" possible.

| Collection | Built from | Key fields |
|---|---|---|
| `identities` | `KeyCertificate`, `ProfileUpdate`, `KeyRevocation` | key_id, display_name, bio, avatar, banner, post_karma, comment_karma, cert, revocation, created_at |
| `communities` | `CommunityCreate/Update/Archive` | community_id, name, title, description, rules, theme, settings, is_private, is_nsfw, is_archived, member_count, owner_key |
| `memberships` | `MembershipJoin/Leave`, `ModAction(BAN/MUTE/KICK)`, `RoleAssign/Revoke` | community_id, key_id, status_flags, role_mask, permission_mask, banned_until, ban_reason |
| `posts` | `PostCreate/Update/Delete`, `ModAction` | content_id, community_id, author_key, title, kind, body, url, attachments, poll, flair, flags, status_flags, scores, counts |
| `comments` | `CommentCreate/Update/Delete`, `ModAction` | content_id, post_id, parent_id, depth, author_key, body, status_flags, scores |
| `votes` | `VoteCast` | (author_key, target) unique, value, target_kind |
| `messages` | `MessageSend` | thread, sender_key, recipient_key, ciphertext, ratchet_index, read_at |
| `attachments` | `AttachmentClaim` | content_id, owner_key, storage_key, sha256, mime, size, dims, scan_status |
| `awards` | `AwardGive`, `AwardTypeDefine` | target, giver_key, type, anonymous, message |
| `reports` | `ReportCreate/Resolve` | target, reporter_key, reason, status, resolver_key, action_taken |
| `mod_events` | `ModAction` | community_id, actor_key, verb, target, reason, prev_hash *(hash-chained)* |
| `labels` | `Label` | target, labeller_key, verdict, categories, confidence, model_id |
| `broadcasts` | `EmergencyBroadcast` | author_key, severity, category, headline, area, expires_at |
| `checkins` | `CheckIn` | author_key (latest wins), status, area, note |
| `missing_persons` | `MissingPersonReport` | content_id, name, age, last_seen, status |
| `resources` | `ResourceReport` | kind, area, state, observed_at |
| `peers` | `ServerVouch`, federation handshake | server_key, endpoints, trust_level, vouched_by[], last_seen |
| `notifications` | derived side-effect of other projections | recipient_key, type, actor_key, target, read_at |
| `feed_prefs`, `saved`, `follows`, `blocks` | corresponding social bodies | |
| `merkle_log` | every accepted envelope | leaf_index, content_id, leaf_hash |

**Requirement DM-02:** A `rebuild-projections` command MUST exist and MUST reconstruct every collection above purely from the envelope store. This is the disaster-recovery and node-migration path.

### 6.3 Status flag bitmaps (preserved from v1, extended)

Bit positions are **frozen** — they cross federation boundaries and must never be renumbered.

**Identity flags** (`identities.status_flags`, uint64):
| Bit | Meaning |
|---|---|
| 0 | ACTIVE |
| 1 | BANNED (instance-wide) |
| 2 | SHADOWBANNED |
| 3 | VERIFIED |
| 4 | GLOBAL_MODERATOR |
| 5 | GLOBAL_ADMIN |
| 6 | KEY_REVOKED *(new)* |
| 7 | TRUSTED_BROADCASTER *(new — may emit CRITICAL severity)* |
| 8–15 | reserved |
| 16–31 | instance-local custom |

**Membership flags** (`memberships.status_flags`, uint64) — unchanged from v1:
| Bit | Meaning |
|---|---|
| 0 | MEMBER |
| 1 | MUTED |
| 2 | BANNED |
| 3 | MODERATOR |
| 4 | CONTRIBUTOR |
| 5 | APPROVED_SUBMITTER *(new)* |

**Content flags** (`posts/comments.status_flags`, uint64) — unchanged from v1:
| Bit | Meaning | | Bit | Meaning |
|---|---|---|---|---|
| 0 | ACTIVE | | 5 | ARCHIVED |
| 1 | NSFW | | 6 | REMOVED |
| 2 | SPOILER | | 7 | FLAGGED |
| 3 | PINNED | | 8 | APPROVED |
| 4 | LOCKED | | 9 | OC |
| | | | 10 | COLLAPSED *(comments)* |

**Community permission bits** (`memberships.permission_mask`, uint64) — v1 set preserved, extended:
| Bit | Permission | | Bit | Permission |
|---|---|---|---|---|
| 0 | `community.read` | | 6 | `member.role.update` |
| 1 | `post.create` | | 7 | `post.moderate` |
| 2 | `community.update` | | 8 | `comment.moderate` |
| 3 | `member.ban` | | 9 | `modlog.read` |
| 4 | `member.unban` | | 10 | `report.review` |
| 5 | `member.kick` | | 11 | `broadcast.emit` *(new)* |
| | | | 12 | `label.trust` *(new)* |
| | | | 13 | `federation.manage` *(new)* |

**Requirement DM-03:** The v1 29-bit `RolePermission` enum is preserved verbatim as the community role template set and maps onto `permission_mask` via a documented translation table, so existing role definitions survive migration.

---

## 7. Layer 3 — Transport Contracts

### 7.1 Priority classes and transport matrix

Not all content is equal in a blackout. This table is normative.

| Class | Content | Size budget | Internet | Mesh (WebRTC/BLE) | Reticulum/LoRa | QR / file |
|---|---|---|---|---|---|---|
| **0 BROADCAST** | Emergency broadcast, key revocation | **≤ 512 B** | ✓ | ✓ flood | ✓ flood | ✓ |
| **1 DIRECT** | E2EE DMs | ≤ 1 KB | ✓ | ✓ routed | ✓ routed | ✓ |
| **2 CHECKIN** | Check-in, missing person, resource report | ≤ 512 B | ✓ | ✓ flood | ✓ flood | ✓ |
| **3 BULK** | Posts, comments, votes, media, moderation | unbounded | ✓ | opportunistic | ✗ | ✓ bulk |

**Requirement TR-01:** Class 3 MUST NOT be relayed over Reticulum/LoRa. The traffic budget of a LoRa link cannot carry a forum feed, and attempting it starves the emergency channel.
**Requirement TR-02:** Class 0–2 envelopes MUST fit their size budget *after* encoding, including signature and anti-abuse fields. This is enforced at construction time with a typed error, not discovered at send time.

### 7.2 Transport interface (uniform)

```typescript
// packages/sdk-ts/src/transport.ts
interface Transport {
  readonly id: string;                    // "https" | "mesh" | "reticulum" | "qr"
  readonly classes: Priority[];           // which priority classes it carries
  readonly mtu: number;                   // max envelope bytes

  available(): Promise<boolean>;
  send(env: EncodedEnvelope): Promise<SendOutcome>;
  subscribe(onEnvelope: (e: EncodedEnvelope, meta: PeerMeta) => void): Unsubscribe;

  /** Bloom-filter reconciliation. Returns content_ids the peer lacks. */
  reconcile?(have: BloomFilter): Promise<string[]>;
}

type SendOutcome =
  | { status: "receipted"; receipt: Receipt }   // a server accepted it
  | { status: "relayed"; peers: number }        // mesh accepted, no server yet
  | { status: "queued" }                        // no path; held in outbox
  | { status: "rejected"; error: EnvelopeError };
```

**Requirement TR-03:** The client MUST hold an ordered transport list and attempt them in order, falling through on failure. The application layer never chooses a transport directly.

### 7.3 Offline outbox — the foundation

Every transport is a **drain of one queue**. This must be built first; everything else depends on it.

```typescript
interface Outbox {
  enqueue(env: EncodedEnvelope): Promise<void>;
  pending(priority?: Priority): Promise<OutboxEntry[]>;
  drain(transport: Transport): Promise<DrainReport>;
  markReceipted(contentId: string, receipt: Receipt): Promise<void>;
  purgeReceipted(olderThanMs: number): Promise<number>;
}

interface OutboxEntry {
  contentId: string;
  encoded: Uint8Array;
  priority: Priority;
  createdAt: number;
  attempts: number;
  lastError?: string;
  relayedToPeers: number;
  receipt?: Receipt;
}
```

**Requirement TR-04:** Content authored with zero connectivity MUST be fully signed, assigned its final `content_id`, and rendered in the UI as authored-but-unreceipted. It MUST NOT be a "draft".
**Requirement TR-05:** Draining MUST be idempotent. Re-sending an already-accepted envelope returns the original receipt, never a duplicate.
**Requirement TR-06:** Outbox order is by priority class first, then FIFO. A queued emergency broadcast overtakes 500 queued votes.

### 7.4 Mesh (WebRTC + BLE)

**Discovery:** mDNS/local WebSocket when a LAN exists; QR-exchanged SDP offer/answer when nothing exists; BLE GATT advertisement where the platform permits.

**Sync protocol — Bloom reconciliation:**
```
A → B : HAVE   { bloom: BloomFilter(content_ids), classes: [0,1,2] }
B → A : WANT   { content_ids: [...] }          // in A's bloom, absent locally
A → B : PUSH   { envelopes: [...] }            // batched, MTU-chunked
B     : verify each → store → re-flood class 0/2 to other peers
```

**Requirement TR-07:** Every received envelope MUST pass the full §5.5 pipeline (steps 1–9 at minimum) **before** storage and **before** relay. A mesh peer is never trusted.
**Requirement TR-08:** Class 0 and 2 envelopes carry a hop limit (default 8) and TTL (default 72 h). Relays decrement; exhausted envelopes are stored but not forwarded.
**Requirement TR-09:** Per-peer quotas MUST bound bytes/sec and envelopes/sec. A malicious peer degrades its own link, not the node.

### 7.5 Reticulum bridge

A Python RNS daemon beside the node (Reticulum has no TypeScript implementation; a sidecar is the honest engineering choice). It inherits Reticulum's store-and-forward, path discovery, and interface abstraction — which is precisely the "bridge ISPs with a specialised router setup" requirement, already solved.

```
Node  ←── Unix socket / gRPC ──→  reticulum-bridge (Python RNS)
                                       │
                        ┌──────────────┼──────────────┐
                    RNodeInterface  TCPInterface   AutoInterface
                    (LoRa radio)    (any IP link)  (local Ethernet)
```

**Contract (`proto/jagoo/v1/bridge.proto`):**
```protobuf
service ReticulumBridge {
  rpc Announce(AnnounceReq) returns (AnnounceResp);          // publish destination
  rpc Send(SendReq) returns (SendResp);                      // class 0-2 only
  rpc Receive(ReceiveReq) returns (stream InboundEnvelope);
  rpc Status(StatusReq) returns (BridgeStatus);              // links, paths, RSSI
}
```

**Requirement TR-10:** The bridge MUST reject any envelope with `priority = BULK` and return a typed error.
**Requirement TR-11:** The bridge MUST fragment and reassemble envelopes exceeding the link MTU, with per-fragment integrity so a partial reassembly is discarded rather than delivered.
**Requirement TR-12:** A demo path over `TCPInterface` MUST work with no radio hardware. `RNodeInterface` configuration for real LoRa boards MUST be documented and tested.

### 7.6 Sneakernet (QR + file)

- **Animated QR:** chunked, Reed-Solomon coded, ~2 KB/s in practice. For class 0–2 and small class 3.
- **`.jbpack` bundle:** a signed archive of envelopes for USB/SD transfer. Bulk sync path.

**Requirement TR-13:** Import MUST verify every envelope independently. The courier is never trusted — a `.jbpack` from a stranger is as safe to import as one from a friend.

### 7.7 Multi-homeserver client transport

**Requirement TR-14:** The web client MUST be **fully static-exportable** (no server-side rendering dependency) so it can be served from IPFS, a USB stick, a community mirror, or any static host. Reachability of any single origin MUST NOT be required.
**Requirement TR-15:** The client holds a signed, gossiped homeserver list in IndexedDB, races candidates on startup, and pins the fastest reachable one. The user can add a homeserver manually.
**Requirement TR-16:** Homeserver identity is the **server public key**, not its URL. A blocked domain does not orphan the node's history or its users' trust in it.

---

## 8. Layer 4 — Federation Contract

Server↔server only. Browsers use REST/JSON.

> **Why gRPC here and not for browsers:** HTTP/2 has a more distinctive TLS and frame fingerprint than plain HTTPS, degrades badly under packet loss, and gRPC-web requires an Envoy shim while giving up bidirectional streaming. Server↔server links are few, long-lived, and operator-controlled — exactly where streaming and backpressure pay off, and where compact binary framing matters for satellite or HF backhaul.

### 8.1 `proto/jagoo/v1/federation.proto`

```protobuf
service Federation {
  // Mutual key exchange. TOFU on first contact.
  rpc Announce(AnnounceRequest) returns (AnnounceResponse);

  // Live push from peer to us. Long-lived.
  rpc StreamActivities(StreamRequest) returns (stream Envelope);

  // Catch-up after a partition. Resumable by log index.
  rpc Backfill(BackfillRequest) returns (stream Envelope);

  // Push to peer with flow control.
  rpc Deliver(stream Envelope) returns (DeliverAck);

  // Transparency-log gossip — detects a peer forking its own log.
  rpc ExchangeTreeHeads(TreeHeadExchange) returns (TreeHeadExchange);
}

message AnnounceRequest {
  bytes  server_key    = 1;
  string display_name  = 2;
  repeated string endpoints = 3;   // multiple, for blocking resistance
  repeated string communities = 4; // what this node hosts
  SignedTreeHead current_sth = 5;
  bytes  signature     = 6;
}
message AnnounceResponse { bytes server_key=1; TrustLevel assigned=2; repeated ServerVouch vouches=3; bytes signature=4; }

message StreamRequest  { repeated string communities=1; repeated Priority classes=2; uint64 since_index=3; }
message BackfillRequest{ repeated string communities=1; uint64 from_index=2; uint64 to_index=3; uint32 max=4; }
message DeliverAck     { repeated string accepted=1; repeated Rejection rejected=2; uint32 backpressure_hint_ms=3; }
message Rejection      { string content_id=1; string code=2; string detail=3; }
message TreeHeadExchange { bytes server_key=1; SignedTreeHead sth=2; repeated PeerObservation observed=3; }
message PeerObservation  { bytes peer_key=1; SignedTreeHead sth=2; int64 observed_at_ms=3; }
```

### 8.2 Trust model — TOFU + web-of-trust

**Requirement FD-01:** Admin allowlisting MUST NOT be the only path to federate. During a shutdown, volunteers stand up relay nodes and cannot wait for manual approval.

| Level | How reached | Reach granted |
|---|---|---|
| `BLOCKED` | Admin action, or ≥ N trusted peers vouch negative | Nothing accepted |
| `PROBATION` | **Default on first contact (TOFU)** | Class 0–2 only, tight quota, no community creation |
| `NORMAL` | ≥ 2 `NORMAL`+ peers vouch, or admin promotion | All classes, standard quota |
| `TRUSTED` | Admin promotion, or ≥ 3 `TRUSTED` vouches | Full quota, may relay for others, STH gossip partner |

**Requirement FD-02:** Peer identity is the server public key. Endpoint URLs are mutable metadata; losing a domain does not lose an identity.
**Requirement FD-03:** Every inbound envelope re-runs the **full** §5.5 pipeline. Peer trust affects *quota*, never *verification*.
**Requirement FD-04:** Inbound envelopes MUST be **projected into the read model**, not merely archived. (v1 stored inbound federation activities in a collection that nothing ever read.)
**Requirement FD-05:** `(content_id, direction)` carries a unique database index. Deduplication is enforced by the database, never by a read-then-write check.
**Requirement FD-06:** Outbound delivery is a durable queue with exponential backoff, a dead-letter path, and automatic `Backfill` on reconnect.

### 8.3 Discovery

Preserved from v1 and extended:
- `GET /.well-known/jagoo-bahee` → node identity, keys, endpoints, capabilities
- `GET /.well-known/nodeinfo` → NodeInfo 2.1 discovery link
- `GET /nodeinfo/2.1` → NodeInfo 2.1 document
- `GET /v1/federation/peers` → known peers with trust levels *(new)*
- `GET /v1/federation/sth` → current signed tree head *(new)*

---

## 9. Layer 5 — Trust, Labels & Transparency

### 9.1 Publish-then-attest moderation

**Requirement MD-01:** Server approval MUST NOT be a precondition for publishing. A post is valid the instant its author signs it.

The flow:
1. Author signs and publishes. Content is live and verifiable immediately.
2. **Labellers** — the home server's LLM, a community's mod team, a fact-checking org — asynchronously publish signed `Label` envelopes about it.
3. Clients subscribe to labellers they trust and filter locally.
4. Labels are additive metadata. Removing a label removes a filter, never the content.

**Why this is stronger than a pre-publish gate:**

| Property | Pre-publish LLM gate | Publish-then-attest |
|---|---|---|
| Server can silently censor | **Yes** — withholding approval is indistinguishable from a network error | **No** — absence of a label is visible; a `RESTRICT` label is signed evidence |
| Works offline / on mesh | No — requires a round trip before publishing | **Yes** |
| Latency to publish | 2 round trips + inference | 0 round trips |
| User can contest a decision | Nothing to point at | Signed label with `reasons[]` and `appealable` |
| Multiple opinions possible | No — one gatekeeper | **Yes** — labellers can publicly disagree, which is a stronger signal than one opaque verdict |

The value in the original idea is preserved: the LLM still explains *specifically what it thinks is wrong* via `Label.reasons[]`, surfaced in the composer as a warning. It simply no longer holds the publish button.

**Requirement MD-02:** The composer SHOULD request a pre-flight label and show warnings before the user publishes — as advice, with publishing always available.
**Requirement MD-03:** Every `ModAction` is a signed envelope in the public mod log, hash-chained to the previous event in that community. A moderator cannot act invisibly.
**Requirement MD-04:** Removal is a tombstone. The content_id, author, timestamp, acting moderator, and reason remain publicly visible; only the body is withheld from the default view.

### 9.2 Labeller interface

```typescript
interface Labeller {
  readonly keyId: string;
  readonly modelId: string;
  readonly categories: string[];

  /** Advisory pre-flight. Never blocks. */
  preflight(draft: DraftContent): Promise<LabelAdvice>;

  /** Authoritative post-publication label. Emitted as a signed envelope. */
  label(contentId: string, content: ResolvedContent): Promise<Label>;
}

interface LabelAdvice {
  verdict: Verdict;
  warnings: { category: string; explanation: string; span?: [number, number] }[];
  suggestion?: string;
}
```

**Requirement MD-05:** Labeller failure MUST be fail-open. If the LLM is down, content publishes unlabelled. A dead moderation service must never become an outage.
**Requirement MD-06:** Clients MUST ship a default labeller trust set and MUST allow the user to remove any labeller from it, including the home server's.

### 9.3 Transparency log

**Requirement TL-01:** Every accepted envelope's `content_id` is appended as a leaf to a per-instance append-only Merkle tree (RFC 6962 structure).
**Requirement TL-02:** A `SignedTreeHead` is published at least every 60 seconds and on demand.
**Requirement TL-03:** Every `Receipt` carries an inclusion proof (⌈log₂ n⌉ hashes) — small enough for a client to store offline as durable proof of publication.
**Requirement TL-04:** The node MUST serve consistency proofs between any two tree sizes, so retroactive deletion or reordering is **detectable**.
**Requirement TL-05:** Tree heads gossip between federated peers via `ExchangeTreeHeads`. A node that forks its log is caught by its peers, not by trusting the node itself.

> This replaces v1's `createProofHash` = `SHA256(userId|postId|serverKeyId)`. That construction hashes three public values, so anyone can compute it — it proved nothing while being presented in the UI as verification.

**Requirement TL-06:** The witness service MUST use an append-only storage format. Rewriting a full JSON file per submission (v1) is both a tamper vector and an O(n) DoS vector.

---

## 10. Layer 6 — Abuse Resistance

The hard constraint: **rate limiting must work against an anonymous user**, because requiring identity for spam control hands the adversary a censorship lever.

### 10.1 Layered defences

| Layer | Mechanism | Defeats |
|---|---|---|
| **L1 Connection** | Per-verified-IP and per-/24 token bucket | Naive floods |
| **L2 Proof of work** | **Argon2id** (memory-hard), difficulty scaled by live system pressure, bound to the author public key | GPU/ASIC farms; cheap parallelism |
| **L3 Credit economy** | Token bucket per identity, refilled by time and by PoW redemption | Sustained scripted abuse |
| **L4 Credential** | Blind-signed membership token required for class 3 writes | Sybil account farms |
| **L5 Nullifier** | One nullifier per identity per epoch per scope | Multi-account posting from one person |
| **L6 Reputation** | Karma and account age gate high-cost actions | New-account brigading |
| **L7 Web-of-trust** | Peer trust level bounds federated inbound quota | Hostile federated instances |

### 10.2 Normative rules

**Requirement AB-01:** `User-Agent` MUST NOT appear in any rate-limit, credit, or throttle subject.
> In v1 the UA string was joined into the tracker that keyed both the abuse limiter and the credit balance. Rotating one header minted a fresh rate-limit bucket *and* a fresh full credit balance.

**Requirement AB-02:** `X-Forwarded-For` MUST be parsed with a configured trusted-proxy hop count or CIDR set. `trust proxy: true` (trust everything) is forbidden.
> In v1, a client-supplied XFF header produced a new identity per request, bypassing every per-IP limit *and* the IP blocklist.

**Requirement AB-03:** All counter and balance mutations MUST be atomic — a single Redis Lua script per operation.
> In v1, credits were read-modify-write (N concurrent requests cost 1 credit total), and the counter did `INCR` then a separate `PEXPIRE` (a crash between them left a TTL-less key that locked the subject out permanently).

**Requirement AB-04:** PoW MUST be memory-hard and MUST be bound to the requesting public key so work cannot be amortised across identities. Challenge issuance MUST be stateless (HMAC-derived, not stored) so issuing challenges cannot exhaust server memory.
> v1 used SHA-256 with 3–4 hex zeros — tens of milliseconds for 30 credits — and stored every issued challenge in Redis with no issuance limit.

**Requirement AB-05:** Every signed payload MUST carry domain separation, and non-idempotent actions MUST carry a nonce.
> v1 moderator signatures were `${action}|${subredditId}|${postId}|${reason}` — no nonce, no expiry, no server binding, replayable forever on any instance.

**Requirement AB-06:** Token classes MUST be distinguishable and MUST use separate signing keys. A refresh token MUST NOT authenticate as an access token.
> v1's guard accepted any valid JWT, so the 7-day refresh token worked as a bearer on every non-ABAC route.

**Requirement AB-07:** Rate-limiter unavailability MUST fail closed in production.

### 10.3 Credit interface

```typescript
interface CreditLedger {
  /** Atomic. Throws InsufficientCredits without partial deduction. */
  consume(subject: CreditSubject, cost: number): Promise<CreditStatus>;
  status(subject: CreditSubject): Promise<CreditStatus>;
  /** Stateless HMAC challenge bound to the subject's public key. */
  issueChallenge(subject: CreditSubject): Promise<PowChallenge>;
  redeem(subject: CreditSubject, solution: PowSolution): Promise<CreditStatus>;
}

type CreditSubject =
  | { kind: "identity"; keyId: string }
  | { kind: "nullifier"; nullifier: string; epoch: number }
  | { kind: "network"; verifiedIp: string; subnet: string };   // NO user-agent

interface PowChallenge {
  challenge: string;     // HMAC(server_secret, keyId ‖ window) — not stored
  algorithm: "argon2id";
  memoryKib: number;     // scaled by live system pressure
  iterations: number;
  boundTo: string;       // keyId — work is non-transferable
  expiresAt: number;
}
```

### 10.4 Action costs (defaults, admin-tunable)

| Action | Credits | PoW when balance low | Credential | Nullifier |
|---|---|---|---|---|
| Read | 0 | no | no | no |
| Vote | 1 | no | yes | no |
| Comment | 3 | yes | yes | yes |
| Post | 10 | yes | yes | yes |
| Create community | 200 | yes | yes | yes |
| DM | 2 | no | yes | no |
| Emergency broadcast | 50 | yes | yes | yes + `broadcast.emit` permission |
| Check-in | 0 | no | no | no |
| Report | 2 | no | yes | yes |
| Attachment upload | 5 + 1/MB | yes | yes | no |

**Requirement AB-08:** Check-in costs zero credits and requires no credential. In a disaster, telling people you are alive must never be rate-limited.

---

## 11. Complete Feature Requirements

Every v1 feature is listed and carried forward. New v2 features are marked **NEW**.

### 11.1 Identity & Authentication

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| AUTH-01 | 24-word BIP-39 mnemonic generation with copy/download and explicit no-recovery warning | ✓ | ✓ preserved |
| AUTH-02 | Mnemonic import for returning users, with live word-list validation | ✓ | ✓ preserved |
| AUTH-03 | Optional BIP-39 passphrase (25th word) | ✓ | ✓ preserved |
| AUTH-04 | Deterministic keypair derivation | BIP-32 `m/44'/0'/0'/0'/0'` | **BIP85** multi-context (§4.1) |
| AUTH-05 | Challenge–response login, no password ever transmitted | ✓ | ✓ + challenge bound to public key, typed claim |
| AUTH-06 | Proof-of-work on login | SHA-256, difficulty 3 | **Argon2id**, pressure-scaled |
| AUTH-07 | mCaptcha integration | ✓ | ✓ preserved |
| AUTH-08 | Session tokens with refresh, httpOnly cookies, logout | ✓ | ✓ + separate keys per token class |
| AUTH-09 | Public key lookup by identity | ✓ | ✓ |
| AUTH-10 | Global status bitmap (active/banned/shadowbanned/verified/mod/admin) | ✓ | ✓ extended |
| AUTH-11 | **Key certificate publication with PQ attestation** | — | **NEW** |
| AUTH-12 | **Key rotation preserving karma, roles, and history** | — | **NEW** |
| AUTH-13 | **Compromise revocation with effective-from timestamp** | — | **NEW** |
| AUTH-14 | **Pre-signed duress revocation, exportable and third-party publishable** | — | **NEW** |
| AUTH-15 | **Per-community derived identities, unlinkable across communities** | — | **NEW** |
| AUTH-16 | **Blind-signed anonymous membership credentials** | — | **NEW** |
| AUTH-17 | **Signing isolated in a worker; keys never in page JS** | ✗ (sessionStorage) | **NEW** |
| AUTH-18 | **Panic wipe of all local key material and cached content** | — | **NEW** |

### 11.2 Users & Profiles

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| USR-01 | Auto-generated unique username on first auth | ✓ | ✓ |
| USR-02 | Profile: display name, bio, avatar, banner | ✓ | ✓ |
| USR-03 | Post karma and comment karma | ✓ | ✓ |
| USR-04 | Public profile page by username | ✓ | ✓ |
| USR-05 | **Public profile page by key ID** | partial | ✓ canonical |
| USR-06 | Follow / unfollow | ✓ | ✓ |
| USR-07 | Block / unblock, enforced in DMs and feed | ✓ | ✓ |
| USR-08 | Save / unsave posts and comments | ✓ | ✓ |
| USR-09 | Saved-content page | ✓ | ✓ |
| USR-10 | Feed preferences: sort, timeframe, NSFW show/blur, layout, favourites, hidden users | ✓ | ✓ |
| USR-11 | List of joined communities | ✓ | ✓ |
| USR-12 | Temporary account ban with expiry | ✓ | ✓ |
| USR-13 | **Multiple identities per device with fast switching** | — | **NEW** |
| USR-14 | **Trusted-contact list for duress revocation and check-in notification** | — | **NEW** |

### 11.3 Communities

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| COM-01 | Create community: name, title, description, rules | ✓ | ✓ |
| COM-02 | Name-availability check | ✓ | ✓ |
| COM-03 | List / browse / search communities | ✓ | ✓ |
| COM-04 | Get by ID and by name | ✓ | ✓ |
| COM-05 | Update settings and metadata | ✓ | ✓ |
| COM-06 | Delete / archive | ✓ | ✓ archive-only (tombstone) |
| COM-07 | Custom theme: primary, accent, background, foreground | ✓ | ✓ |
| COM-08 | Icon and banner attachments | ✓ | ✓ |
| COM-09 | Post-type toggles (text/link/image/video) | ✓ | ✓ |
| COM-10 | Require-post-approval mode | ✓ | ✓ |
| COM-11 | Allow-crossposts toggle | ✓ | ✓ |
| COM-12 | Minimum karma to post | ✓ | ✓ |
| COM-13 | Minimum account age to post | ✓ | ✓ |
| COM-14 | Private and NSFW flags | ✓ | ✓ |
| COM-15 | Join / leave, member count | ✓ | ✓ |
| COM-16 | Member list with roles and status | ✓ | ✓ |
| COM-17 | Ban / unban with reason and expiry; ban list | ✓ | ✓ |
| COM-18 | Kick member | ✓ | ✓ |
| COM-19 | Add / remove / list moderators | ✓ | ✓ |
| COM-20 | is-moderator check | ✓ | ✓ |
| COM-21 | Public mod log | ✓ | ✓ + hash-chained |
| COM-22 | Permission-cache service | ✓ | ✓ |
| COM-23 | Scheduled community maintenance tasks | ✓ | ✓ |
| COM-24 | Community statistics page | ✓ | ✓ |
| COM-25 | **Cross-instance community addressing (`name@origin`)** | — | **NEW** |
| COM-26 | **Per-community emergency broadcast channel** | — | **NEW** |

### 11.4 Posts

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| PST-01 | Create text, link, image, video, poll, crosspost | ✓ | ✓ |
| PST-02 | Title ≤ 300 chars | ✓ | ✓ |
| PST-03 | Markdown body with rich editor (TipTap) | ✓ | ✓ |
| PST-04 | Multiple attachments with ownership + confirmation checks | ✓ | ✓ |
| PST-05 | Poll: question, options, multi-select, close time | ✓ | ✓ |
| PST-06 | Flair | ✓ | ✓ |
| PST-07 | NSFW / spoiler / OC flags | ✓ | ✓ |
| PST-08 | Author signature over canonical payload | ✓ | ✓ **single canonical form** |
| PST-09 | Content hash verification | ✓ | ✓ **no fallback chain** |
| PST-10 | Edit own post | ✓ | ✓ |
| PST-11 | Delete own post with deletion signature | ✓ | ✓ |
| PST-12 | Feed listing: pagination, sort, community filter | ✓ | ✓ |
| PST-13 | Sort modes: hot, new, top, controversial, rising | ✓ | ✓ |
| PST-14 | Timeframe filter | ✓ | ✓ |
| PST-15 | View, comment, award, upvote, downvote, score counts | ✓ | ✓ |
| PST-16 | Infinite scroll | ✓ | ✓ |
| PST-17 | Share with short link (`/p/[id]`) | ✓ | ✓ |
| PST-18 | Client-side signature verification badge | ✓ | ✓ |
| PST-19 | Audit trail view | ✓ | ✓ + inclusion proof |
| PST-20 | **Offline authoring into outbox** | ✗ | **NEW** |
| PST-21 | **Merkle inclusion proof stored client-side** | ✗ | **NEW** |
| PST-22 | **Label display with reasons and labeller attribution** | — | **NEW** |

### 11.5 Comments

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| CMT-01 | Create comment on post | ✓ | ✓ |
| CMT-02 | Threaded replies with depth tracking | ✓ | ✓ |
| CMT-03 | Comment tree rendering with collapse/expand | ✓ | ✓ |
| CMT-04 | Markdown body | ✓ | ✓ |
| CMT-05 | Attachments on comments | ✓ | ✓ |
| CMT-06 | Edit / delete own comment | ✓ | ✓ |
| CMT-07 | Signature + content hash | ✓ | ✓ |
| CMT-08 | Vote on comment | ✓ | ✓ |
| CMT-09 | Scores and reply counts | ✓ | ✓ |
| CMT-10 | Per-comment settings page | ✓ | ✓ |
| CMT-11 | **Offline authoring** | ✗ | **NEW** |

### 11.6 Votes

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| VOT-01 | Upvote / downvote / clear on posts and comments | ✓ | ✓ |
| VOT-02 | One vote per identity per target | ✓ | ✓ |
| VOT-03 | Optimistic UI with rollback | ✓ | ✓ |
| VOT-04 | Score aggregation | ✓ | ✓ |
| VOT-05 | **Offline vote queueing** | ✗ (empty stub) | **NEW** |

### 11.7 Private Messaging

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| MSG-01 | Send DM with subject and body | ✓ | ✓ |
| MSG-02 | Threaded replies | ✓ | ✓ |
| MSG-03 | Conversation list and view | ✓ | ✓ |
| MSG-04 | Mark read / unread | ✓ | ✓ |
| MSG-05 | Delete message | ✓ | ✓ |
| MSG-06 | Block enforcement | ✓ | ✓ |
| MSG-07 | Attachments | ✓ | ✓ |
| MSG-08 | Sender signature | ✓ | ✓ |
| MSG-09 | **End-to-end encryption — server stores ciphertext only** | ✗ (plaintext) | **NEW** |
| MSG-10 | **Hybrid X25519 + ML-KEM-768 key agreement** | — | **NEW** |
| MSG-11 | **Forward secrecy via symmetric ratchet** | — | **NEW** |
| MSG-12 | **DM delivery over mesh and Reticulum** | — | **NEW** |
| MSG-13 | **Offline compose and queued send** | — | **NEW** |

### 11.8 Moderation

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| MOD-01 | Post: approve, remove, restore, lock, unlock, pin, unpin, flag, unflag | ✓ | ✓ |
| MOD-02 | Comment: approve, remove, collapse, uncollapse, flag, unflag | ✓ | ✓ |
| MOD-03 | Moderator signature on every action | ✓ | ✓ + nonce, expiry, domain separation |
| MOD-04 | Mod queue UI | ✓ | ✓ |
| MOD-05 | Reports: create, list, get, update, delete, count | ✓ | ✓ |
| MOD-06 | Report reasons taxonomy | ✓ | ✓ extended |
| MOD-07 | Report status lifecycle | ✓ | ✓ |
| MOD-08 | Signed, chained moderation events | ✓ | ✓ |
| MOD-09 | Mod log with actor, action, target, reason | ✓ | ✓ |
| MOD-10 | Server acknowledgements | ✓ | → `Receipt` |
| MOD-11 | Audit receipts: create, verify, lookup by subject/content | ✓ | ✓ + inclusion proof |
| MOD-12 | Server public key endpoint | ✓ | ✓ |
| MOD-13 | External audit witness service | ✓ | ✓ → **Merkle log** |
| MOD-14 | Client-side receipt verification page | ✓ | ✓ |
| MOD-15 | Acknowledgements page (local proof store) | ✓ | ✓ |
| MOD-16 | **LLM labeller with categories, confidence, reasons** | — | **NEW** |
| MOD-17 | **Pre-flight advisory in composer (non-blocking)** | — | **NEW** |
| MOD-18 | **User-configurable labeller trust set** | — | **NEW** |
| MOD-19 | **Removal as public tombstone, not erasure** | partial | **NEW** |
| MOD-20 | **Appeal flow against a label or removal** | — | **NEW** |

### 11.9 Roles & Permissions

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| ROL-01 | 29-bit role permission enum | ✓ | ✓ preserved |
| ROL-02 | Community role bits (member/contributor/moderator/owner) | ✓ | ✓ |
| ROL-03 | Community permission bits (11) | ✓ | ✓ extended to 14 |
| ROL-04 | Create / update / delete custom roles | ✓ | ✓ |
| ROL-05 | Assign / revoke roles | ✓ | ✓ |
| ROL-06 | Role management UI | ✓ | ✓ |
| ROL-07 | Default role for new members | ✓ | ✓ |
| ROL-08 | ABAC guard on protected routes | ✓ | ✓ |
| ROL-09 | Permission-resolution helper | ✓ | ✓ |

### 11.10 Attachments & Media

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| ATT-01 | Presigned upload URL (S3/MinIO) | ✓ | ✓ |
| ATT-02 | Upload confirmation | ✓ | ✓ |
| ATT-03 | List / get / update / delete | ✓ | ✓ |
| ATT-04 | Delete by storage key | ✓ | ✓ |
| ATT-05 | Download endpoint | ✓ | ✓ |
| ATT-06 | MIME, size, dimensions, duration metadata | ✓ | ✓ |
| ATT-07 | Max upload size enforcement | ✓ | ✓ |
| ATT-08 | Ownership + confirmation checks before attaching | ✓ | ✓ |
| ATT-09 | ABAC on attachment access | ✓ | ✓ |
| ATT-10 | Scan status field | ✓ | ✓ |
| ATT-11 | **Content hash in the signed claim (integrity binding)** | ✗ | **NEW** |
| ATT-12 | **Low-bandwidth mode: thumbnails only, opt-in full media** | — | **NEW** |
| ATT-13 | **Alt text field** | — | **NEW** |

### 11.11 Notifications & Awards

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| NOT-01 | Create, list, mark read/unread, delete | ✓ | ✓ |
| NOT-02 | Notification types (reply, mention, award, mod action, follow) | ✓ | ✓ |
| NOT-03 | Web push via service worker | ✓ | ✓ |
| NOT-04 | Notification page with unread badge | ✓ | ✓ |
| NOT-05 | **Emergency broadcast notification with distinct alert channel** | — | **NEW** |
| AWD-01 | Award types CRUD (name, icon, cost, active) | ✓ | ✓ |
| AWD-02 | Give award to post or comment | ✓ | ✓ |
| AWD-03 | Anonymous awards | ✓ | ✓ |
| AWD-04 | Award message | ✓ | ✓ |
| AWD-05 | List awards for a target; awards page | ✓ | ✓ |

### 11.12 Search & Discovery

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| SRC-01 | Search posts, comments, communities, users | ✓ | ✓ |
| SRC-02 | Search results page with filters | ✓ | ✓ |
| SRC-03 | Community browse and list pages | ✓ | ✓ |
| SRC-04 | **Offline search over locally cached content** | — | **NEW** |
| SRC-05 | **Geographic filter for broadcasts and resource reports** | — | **NEW** |

### 11.13 Administration

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| ADM-01 | Instance summary statistics | ✓ | ✓ |
| ADM-02 | User list with search | ✓ | ✓ |
| ADM-03 | Ban / unban user | ✓ | ✓ |
| ADM-04 | Assign global role | ✓ | ✓ |
| ADM-05 | Federation peer CRUD | ✓ | ✓ + trust levels |
| ADM-06 | Moderation overview | ✓ | ✓ |
| ADM-07 | Security config get/put (registrations open, rate limits) | ✓ | ✓ |
| ADM-08 | IP block list CRUD | ✓ | ✓ |
| ADM-09 | Admin dashboard UI | ✓ | ✓ |
| ADM-10 | **Transport status: mesh peers, Reticulum links, RSSI** | — | **NEW** |
| ADM-11 | **Transparency log health and peer STH divergence alerts** | — | **NEW** |
| ADM-12 | **Labeller configuration and trust management** | — | **NEW** |
| ADM-13 | **Projection rebuild command** | — | **NEW** |

### 11.14 Crisis Features (all NEW)

| ID | Requirement |
|---|---|
| CRS-01 | Emergency broadcast: severity, category, headline, detail, geographic area, expiry |
| CRS-02 | Broadcast permission gated by `broadcast.emit`; `CRITICAL` requires `TRUSTED_BROADCASTER` |
| CRS-03 | Broadcasts flood every transport including mesh and LoRa |
| CRS-04 | Distinct alert UI and notification channel; unread broadcasts pinned |
| CRS-05 | Check-in: safe / need-help / medical / moving / unreachable, with optional coarse location |
| CRS-06 | Check-in notifies a pre-configured trusted-contact list |
| CRS-07 | Check-in costs zero credits and needs no credential |
| CRS-08 | Missing-person registry: report, search, status update |
| CRS-09 | Resource reports: shelter, water, food, medical, fuel, power, internet, road status |
| CRS-10 | Map view of broadcasts, check-ins, and resources |
| CRS-11 | Network-status broadcasts ("ISP X is blocking, use transport Y") |
| CRS-12 | Battery-aware mode: reduce mesh scan frequency and disable media below a threshold |
| CRS-13 | Data-saver mode: text-only, no avatars, no thumbnails |
| CRS-14 | Full offline read of cached feed, comments, and DMs |
| CRS-15 | Offline authoring of every content type into the outbox |
| CRS-16 | QR pairing for mesh peers with no network |
| CRS-17 | `.jbpack` export/import for sneakernet |
| CRS-18 | Transport status indicator always visible in the UI |
| CRS-19 | Panic wipe accessible without unlocking the full app |

### 11.15 Platform & Infrastructure

| ID | Requirement | v1 | v2 |
|---|---|---|---|
| INF-01 | Health live/ready endpoints | ✓ | ✓ |
| INF-02 | Redis caching with invalidation | ✓ | ✓ **tagged keys, no keyspace SCAN** |
| INF-03 | Redis-backed distributed throttler | ✓ | ✓ |
| INF-04 | Horizontal scaling behind HAProxy/nginx | ✓ | ✓ |
| INF-05 | Docker Compose dev and scale profiles | ✓ | ✓ |
| INF-06 | Seed script for demo data | ✓ | ✓ |
| INF-07 | OpenAPI/Swagger export | ✓ | ✓ + proto docs |
| INF-08 | CSP, HSTS, and security headers | ✓ | ✓ |
| INF-09 | Service worker with offline shell | ✓ | ✓ **with working sync** |
| INF-10 | PWA manifest and installability | ✓ | ✓ |
| INF-11 | IndexedDB cache for profiles, verifications, receipts | ✓ | ✓ extended |
| INF-12 | Bloom filter utility | ✓ | ✓ **used for mesh reconciliation** |
| INF-13 | Error boundary and loading skeletons | ✓ | ✓ |
| INF-14 | Dark/light theme toggle | ✓ | ✓ |
| INF-15 | **Static export build target** | ✗ | **NEW** |
| INF-16 | **Real-time updates (SSE/WebSocket)** | ✗ (no-op stub) | **NEW** |
| INF-17 | **Reticulum bridge service** | — | **NEW** |
| INF-18 | **Witness/transparency service** | partial | **NEW** |
| INF-19 | **Labeller service** | — | **NEW** |
| INF-20 | **Mobile app shell** | — | **NEW** |

---

## 12. HTTP API Contract

### 12.1 The single write endpoint

```
POST /v1/envelopes
Content-Type: application/x-protobuf   (or application/json for the JSON mapping)

Body: Envelope (or { envelopes: [...] } for batch)

200 → Receipt
202 → { status: "accepted_unwitnessed" }   // accepted, log append pending
409 → { code: "DUPLICATE", receipt: Receipt }   // idempotent replay, original receipt
400 → { code: "...", detail, field? }
403 → { code: "FORBIDDEN", detail }
429 → { code: "RATE_LIMITED", retryAfterMs, challenge?: PowChallenge }
```

**Every mutation in the system goes through this endpoint.** No feature adds a write route.

**Error codes (normative):**

| Code | Meaning | Retry? |
|---|---|---|
| `UNKNOWN_VERSION` | Envelope version not supported | no |
| `UNKNOWN_DOMAIN` | Domain not in registry | no |
| `MALFORMED` | Deterministic decode failed | no |
| `ALG_NOT_PERMITTED` | key_alg disallowed for this domain/priority | no |
| `CLOCK_SKEW` | `created_at_ms` outside window | no — re-sign |
| `BAD_SIGNATURE` | Signature verification failed | no |
| `NO_CERTIFICATE` | Author key has no valid certificate | after certifying |
| `KEY_REVOKED` | Author key revoked before `created_at_ms` | no |
| `DUPLICATE` | content_id already accepted | no — receipt returned |
| `INSUFFICIENT_CREDITS` | Credit balance too low | after PoW redemption |
| `NULLIFIER_SPENT` | Epoch quota exhausted | next epoch |
| `CREDENTIAL_INVALID` | Blind credential failed verification | re-obtain |
| `FORBIDDEN` | Permission check failed | no |
| `BODY_INVALID` | Domain-specific validation failed | no |
| `TOO_LARGE` | Exceeds transport limit for its class | no |
| `RATE_LIMITED` | Connection-layer limit | after `retryAfterMs` |

### 12.2 Read endpoints

All return JSON. All list endpoints share cursor pagination: `?cursor=<opaque>&limit=<1..100>` → `{ items: [...], nextCursor: string | null }`.

Every content object carries a `provenance` block:
```json
{
  "contentId": "jb1h7k3m9p...",
  "authorKey": "jbk1qy2f8x...",
  "keyAlg": "ED25519",
  "signature": "base64...",
  "canonicalBytes": "base64...",
  "receipt": { "logIndex": 48213, "sth": {...}, "inclusionProof": ["..."], "serverSignature": "..." },
  "labels": [ { "labellerKey": "...", "verdict": "OK", "categories": [], "confidence": 92 } ]
}
```

| Method | Path | Purpose | v1 equivalent |
|---|---|---|---|
| `GET` | `/v1/feed` | Global/subscribed feed; `?sort&timeframe&community&cursor` | `GET /posts` |
| `GET` | `/v1/posts/:contentId` | Single post | `GET /posts/{id}` |
| `GET` | `/v1/posts/:contentId/comments` | Comment tree; `?depth&sort` | `GET /posts/{id}/comments` |
| `GET` | `/v1/posts/:contentId/audit` | Full audit trail + inclusion proof | `GET /posts/{id}/audit-trail` |
| `GET` | `/v1/comments/:contentId` | Single comment | `GET /comments/{id}` |
| `GET` | `/v1/communities` | List/browse; `?q&sort` | `GET /subreddits` |
| `GET` | `/v1/communities/:id` | Community detail | `GET /subreddits/{id}` |
| `GET` | `/v1/communities/name-available/:name` | Name check | `GET /subreddits/check-name/{name}` |
| `GET` | `/v1/communities/:id/members` | Member list; `?role&status` | `GET /subreddits/{id}/members` |
| `GET` | `/v1/communities/:id/moderators` | Moderators | `GET /subreddits/{id}/moderators` |
| `GET` | `/v1/communities/:id/bans` | Ban list | `GET /subreddits/{id}/bans` |
| `GET` | `/v1/communities/:id/modlog` | Public mod log | `GET /subreddits/{id}/modlogs` |
| `GET` | `/v1/communities/:id/reports` | Report queue | `GET /moderation/subreddits/{id}/reports` |
| `GET` | `/v1/communities/:id/roles` | Role definitions | `GET /roles/subreddit/{name}` |
| `GET` | `/v1/communities/:id/stats` | Statistics | *(frontend-only in v1)* |
| `GET` | `/v1/identities/:keyId` | Profile by key | `GET /users/{id}` |
| `GET` | `/v1/identities/by-name/:username` | Profile by username | `GET /users/{username}` |
| `GET` | `/v1/me/profile` | Own profile | `GET /users/me/profile` |
| `GET` | `/v1/me/communities` | Joined communities | `GET /users/me/subreddits` |
| `GET` | `/v1/me/preferences` | Feed preferences | `GET /users/me/feed-preferences` |
| `GET` | `/v1/me/saved` | Saved content | *(frontend-only in v1)* |
| `GET` | `/v1/me/notifications` | Notifications; `?unread` | `GET /notifications` |
| `GET` | `/v1/me/messages` | Conversation list | `GET /messages` |
| `GET` | `/v1/me/messages/:threadId` | Thread (ciphertext) | *(derived in v1)* |
| `GET` | `/v1/awards/types` | Award types | `GET /awards/types` |
| `GET` | `/v1/awards/target/:kind/:id` | Awards on a target | `GET /awards/target/{type}/{id}` |
| `GET` | `/v1/search` | Unified search; `?q&kind&community` | *(frontend-only in v1)* |
| `GET` | `/v1/broadcasts` | Active broadcasts; `?area&severity&category` | **NEW** |
| `GET` | `/v1/checkins` | Check-ins; `?keys&area` | **NEW** |
| `GET` | `/v1/missing` | Missing-person registry; `?q&status` | **NEW** |
| `GET` | `/v1/resources` | Resource reports; `?kind&area&state` | **NEW** |
| `GET` | `/v1/labels/:contentId` | Labels on content | **NEW** |
| `GET` | `/v1/receipts/:contentId` | Receipt + inclusion proof | `GET /audit/receipts/{id}` |
| `GET` | `/v1/log/sth` | Current signed tree head | **NEW** |
| `GET` | `/v1/log/consistency` | `?from&to` — consistency proof | **NEW** |
| `GET` | `/v1/log/inclusion/:contentId` | Inclusion proof | **NEW** |
| `GET` | `/v1/events` | SSE stream of live updates | **NEW** (v1 stub) |

### 12.3 Non-envelope endpoints

Operations that are genuinely not content mutations.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/auth/challenge` | Login challenge, bound to a submitted public key |
| `POST` | `/v1/auth/session` | Exchange signed challenge for tokens |
| `GET` | `/v1/auth/refresh` | Refresh access token |
| `POST` | `/v1/auth/logout` | Clear session |
| `POST` | `/v1/credentials/request` | Blind credential issuance (PoW + captcha) |
| `GET` | `/v1/credits` | Credit balance |
| `POST` | `/v1/credits/challenge` | PoW challenge |
| `POST` | `/v1/credits/redeem` | Redeem PoW for credits |
| `POST` | `/v1/attachments/upload-url` | Presigned upload URL |
| `POST` | `/v1/attachments/confirm` | Confirm upload (precedes `AttachmentClaim`) |
| `GET` | `/v1/attachments/:id/download` | Download / redirect |
| `POST` | `/v1/labels/preflight` | Advisory pre-publish check (non-blocking) |
| `POST` | `/v1/verify/envelope` | Stateless verification helper for third parties |
| `GET` | `/v1/server/identity` | Server key, endpoints, capabilities |
| `GET` | `/v1/homeservers` | Signed, gossiped homeserver list |
| `GET` | `/health/live`, `/health/ready` | Health probes |
| `GET` | `/.well-known/jagoo-bahee` | Federation discovery |
| `GET` | `/.well-known/nodeinfo`, `/nodeinfo/2.1` | NodeInfo |
| `*` | `/v1/admin/**` | Admin surface (preserves all v1 admin routes) |

---

## 13. Internal Service Interfaces

These are the seams inside the node. Each is independently testable and independently replaceable.

```typescript
// ─── Ingress: the one write path ──────────────────────────────────────────
interface EnvelopeIngress {
  accept(raw: Uint8Array, source: IngressSource): Promise<IngressResult>;
  acceptBatch(raws: Uint8Array[], source: IngressSource): Promise<IngressResult[]>;
}
type IngressSource =
  | { kind: "http"; ip: string; session?: SessionInfo }
  | { kind: "grpc"; peerKey: string; trust: TrustLevel }
  | { kind: "mesh"; peerId: string; hops: number }
  | { kind: "reticulum"; destinationHash: string; rssi?: number }
  | { kind: "import"; bundleId: string };

type IngressResult =
  | { ok: true; contentId: string; receipt: Receipt; duplicate: boolean }
  | { ok: false; code: EnvelopeErrorCode; detail: string; field?: string };

// ─── Validation stages (§5.5), individually testable ──────────────────────
interface EnvelopeValidator {
  parse(raw: Uint8Array): Result<ParsedEnvelope>;
  checkVersionAndDomain(e: ParsedEnvelope): Result<DomainSpec>;
  checkAlgPolicy(e: ParsedEnvelope, spec: DomainSpec): Result<void>;
  checkClock(e: ParsedEnvelope): Result<void>;
  verifySignature(e: ParsedEnvelope): Result<void>;
  checkCertificate(authorKey: Uint8Array, at: number): Promise<Result<void>>;
}

// ─── Projection ───────────────────────────────────────────────────────────
interface Projector {
  /** Registered per domain. Transactional with the log append. */
  register(domain: string, handler: ProjectionHandler): void;
  apply(e: ParsedEnvelope, session: DbSession): Promise<void>;
  /** Disaster recovery: rebuild every projection from the envelope store. */
  rebuild(opts?: { from?: number; to?: number }): Promise<RebuildReport>;
}
type ProjectionHandler = (e: ParsedEnvelope, ctx: ProjectionContext) => Promise<void>;

// ─── Authorisation ────────────────────────────────────────────────────────
interface Authorizer {
  can(actor: Uint8Array, domain: string, body: unknown, ctx: AuthContext): Promise<AuthDecision>;
  permissions(actor: Uint8Array, communityId: string): Promise<bigint>;
}
type AuthDecision = { allow: true } | { allow: false; reason: string };

// ─── Transparency ─────────────────────────────────────────────────────────
interface WitnessLog {
  append(contentId: string, session: DbSession): Promise<number>;   // leaf index
  currentSth(): Promise<SignedTreeHead>;
  inclusionProof(contentId: string): Promise<{ index: number; path: Uint8Array[]; sth: SignedTreeHead }>;
  consistencyProof(from: number, to: number): Promise<Uint8Array[]>;
  verifyPeerSth(peerKey: Uint8Array, sth: SignedTreeHead): Promise<PeerLogStatus>;
}
type PeerLogStatus = "consistent" | "forked" | "unknown" | "signature_invalid";

// ─── Federation ───────────────────────────────────────────────────────────
interface FederationOut {
  enqueue(e: ParsedEnvelope, targets?: string[]): Promise<void>;
  peers(): Promise<Peer[]>;
  backfillFrom(peerKey: string, fromIndex: number): Promise<BackfillReport>;
  vouch(peerKey: string, level: TrustLevel, note?: string): Promise<void>;
}

// ─── Mesh ─────────────────────────────────────────────────────────────────
interface MeshNode {
  start(): Promise<void>;
  peers(): MeshPeer[];
  broadcast(e: EncodedEnvelope): Promise<number>;    // peers reached
  reconcile(peer: MeshPeer): Promise<ReconcileReport>;
  onEnvelope(cb: (e: EncodedEnvelope, peer: MeshPeer) => void): Unsubscribe;
}

// ─── Storage abstraction (allows swapping Mongo later) ────────────────────
interface EnvelopeStore {
  put(e: ParsedEnvelope, raw: Uint8Array, session: DbSession): Promise<void>;
  get(contentId: string): Promise<{ envelope: ParsedEnvelope; raw: Uint8Array } | null>;
  has(contentId: string): Promise<boolean>;
  range(fromIndex: number, toIndex: number): AsyncIterable<ParsedEnvelope>;
  bloom(classes: Priority[], sinceMs: number): Promise<BloomFilter>;
}
```

**Requirement SI-01:** `EnvelopeIngress.accept` is the **only** function in the node that writes content. Any code path that writes a projection without going through it is a defect.
**Requirement SI-02:** Every interface above has a test double, so each layer is testable in isolation and the mesh/Reticulum paths are testable without hardware.

---

## 14. Repository Layout & Build Order

### 14.1 Monorepo layout

```
jagoo-bahee/
├── proto/jagoo/v1/          # SOURCE OF TRUTH for all contracts
│   ├── envelope.proto       # Envelope, Receipt, SignedTreeHead
│   ├── body.proto           # every mutation body
│   ├── federation.proto     # server↔server gRPC
│   └── bridge.proto         # Reticulum sidecar
│
├── crates/
│   ├── jb-core/             # envelope encode/decode, canonical bytes, content IDs
│   ├── jb-crypto/           # BIP85, Ed25519, ML-DSA, X25519+ML-KEM, blind creds
│   └── jb-wasm/             # wasm-bindgen wrapper for browsers
│
├── services/
│   ├── node/                # NestJS: ingress, projector, read API, gRPC federation
│   ├── relay/               # Python RNS ↔ node bridge
│   ├── labeller/            # LLM labelling service
│   └── witness/             # Merkle transparency log
│
├── apps/
│   ├── web/                 # Next.js PWA — static export target
│   └── mobile/              # native shell (BLE, background mesh, secure keystore)
│
├── packages/
│   ├── sdk-ts/              # generated protos + Signer/Transport/Outbox
│   └── ui/                  # shared components
│
├── ops/                     # compose, haproxy, nginx, deployment
└── docs/
```

**Requirement RL-01:** `proto/` is the single source of truth. TypeScript, Rust, and Python bindings are all **generated**. Hand-written duplicates of a contract are forbidden.

### 14.2 Build order

Each phase is independently demonstrable.

| Phase | Deliverable | Depends on |
|---|---|---|
| **P0** | `proto/` + codegen for TS/Rust/Python; envelope encode/verify with cross-language test vectors | — |
| **P1** | `jb-crypto` + `jb-wasm`: BIP85 derivation, Ed25519, key certificates, revocation; `Signer` on web | P0 |
| **P2** | `services/node`: ingress pipeline, projector, envelope store, read API, auth. **Every v1 feature reachable through the new pipeline.** | P0, P1 |
| **P3** | `apps/web`: full UI parity with v1 (all 42 routes), static export, signature verification badges | P2 |
| **P4** | Outbox + service worker: offline authoring, queued drain, receipt reconciliation | P3 |
| **P5** | Mesh: WebRTC transport, bloom reconciliation, store-and-forward, QR pairing | P4 |
| **P6** | Crisis features: broadcast, check-in, missing persons, resources, map, alert UI | P4 |
| **P7** | `services/witness`: Merkle log, STH, inclusion + consistency proofs | P2 |
| **P8** | Federation gRPC: announce, deliver, backfill, stream, TOFU trust, STH gossip | P2, P7 |
| **P9** | `services/relay`: Reticulum bridge, TCP demo path, LoRa hardware docs | P4 |
| **P10** | `services/labeller`: LLM labels, pre-flight advisory, trust configuration | P2 |
| **P11** | E2EE DMs: hybrid X25519+ML-KEM, ratchet, mesh delivery | P1, P5 |
| **P12** | Anti-abuse: Argon2id PoW, atomic credit ledger, blind credentials, nullifiers | P2 |
| **P13** | `apps/mobile`: native shell with BLE and background mesh | P5 |

**Minimum viable demo (hackathon-critical): P0 → P4 → P5 → P6.**
That yields: signed content authored with the backend killed, moving phone-to-phone over mesh, emergency broadcast with priority routing, verified end-to-end with zero servers. P9 adds the strongest Track A story if a Reticulum node can be stood up.

---

## 15. Non-Functional Requirements

### 15.1 Performance

| ID | Requirement | Target |
|---|---|---|
| NFR-P01 | Envelope signature verification (Ed25519) | < 1 ms server, < 5 ms browser WASM |
| NFR-P02 | Feed page load, warm cache | < 300 ms p95 |
| NFR-P03 | Envelope ingress throughput, single node | ≥ 500/s sustained |
| NFR-P04 | Offline app cold start | < 2 s on a 2019 mid-range Android |
| NFR-P05 | Mesh peer discovery to first envelope | < 10 s |
| NFR-P06 | Class-0 broadcast propagation across 3 mesh hops | < 30 s |
| NFR-P07 | Merkle inclusion proof generation | < 10 ms at 10⁶ leaves |

### 15.2 Footprint (low-resource is a hard requirement)

| ID | Requirement | Target |
|---|---|---|
| NFR-F01 | Web app initial JS bundle (gzipped) | **< 300 KB** |
| NFR-F02 | `jb-wasm` module (gzipped) | **< 250 KB** |
| NFR-F03 | Full offline shell including cached feed | < 5 MB |
| NFR-F04 | Class 0–2 envelope on the wire | **≤ 512 bytes** |
| NFR-F05 | Node RAM at idle | < 512 MB |
| NFR-F06 | Node runnable on a Raspberry Pi 4 | **required** |
| NFR-F07 | Data-saver mode page weight | < 50 KB/page |

> v1 shipped four overlapping crypto libraries in the browser (`bip39`, `bip32`, `@scure/*`, `tiny-secp256k1` WASM, `@noble/secp256k1`), including two independent secp256k1 implementations. v2 ships exactly one crypto module.

### 15.3 Reliability

| ID | Requirement |
|---|---|
| NFR-R01 | No single point of failure between client and content — every layer has a fallback |
| NFR-R02 | Projections fully rebuildable from the envelope store |
| NFR-R03 | Federation partitions heal automatically via backfill, with no operator action |
| NFR-R04 | Outbox survives app termination, browser restart, and device reboot |
| NFR-R05 | Labeller, witness, and Reticulum bridge outages degrade gracefully; none is on the critical publish path |

### 15.4 Security

| ID | Requirement |
|---|---|
| NFR-S01 | All private-key operations behind the signer boundary; keys never in page JS |
| NFR-S02 | Every signed payload carries domain separation |
| NFR-S03 | Exactly one canonical form per envelope version; no fallback acceptance |
| NFR-S04 | Rate limiter fails closed in production |
| NFR-S05 | Token classes use separate signing keys and assert their type |
| NFR-S06 | No secret or personal data in URLs, query strings, or logs |
| NFR-S07 | Dependency audit and SBOM in CI |
| NFR-S08 | Every §2.1 threat has at least one test demonstrating its mitigation |

### 15.5 Accessibility & Localisation

| ID | Requirement |
|---|---|
| NFR-A01 | WCAG 2.1 AA for all core flows |
| NFR-A02 | Full keyboard navigation |
| NFR-A03 | Screen-reader labels on all interactive elements |
| NFR-A04 | **Bangla and English UI**, with Bangla as a first-class locale |
| NFR-A05 | Emergency broadcast UI legible at maximum system font scale |
| NFR-A06 | Colour is never the sole carrier of meaning (verification status, severity) |

---

## 16. Acceptance Criteria

The system is done when all of these pass.

### 16.1 Feature parity
- **AC-01** Every requirement ID in §11 marked ✓ or NEW is implemented and reachable in the UI.
- **AC-02** All 42 v1 frontend routes exist with equal or greater functionality.
- **AC-03** Every v1 endpoint has a documented v2 equivalent in §12 or Appendix A.

### 16.2 Cryptographic correctness
- **AC-04** Cross-language test vectors: TS, Rust, and Python produce byte-identical canonical encodings and content IDs for a shared fixture set.
- **AC-05** A signature made over one `domain` fails verification under any other `domain`.
- **AC-06** A signature over a body with fields omitted does not validate a body with those fields populated. *(The v1 signature-confusion bug, as a permanent regression test.)*
- **AC-07** A revoked key's post-revocation content is rejected; its pre-revocation content remains valid and visible.

### 16.3 Abuse resistance
- **AC-08** Rotating `User-Agent` per request does not reset any rate limit or credit balance.
- **AC-09** A client-supplied `X-Forwarded-For` does not create a new rate-limit identity and does not evade an IP block.
- **AC-10** 50 concurrent requests against a 10-credit balance succeed exactly 10 times.
- **AC-11** A refresh token presented as a bearer token is rejected on every write route.
- **AC-12** A captured moderator action envelope cannot be replayed.
- **AC-13** Requesting 10⁵ PoW challenges does not grow server memory measurably.

### 16.4 Blackout operation — the headline demo
- **AC-14** With the backend stopped **and** the network adapter disabled: author a post, a comment, a vote, a DM, an emergency broadcast, and a check-in. All are signed, assigned final content IDs, and shown as authored-pending-receipt.
- **AC-15** Two browser profiles pair over QR-exchanged WebRTC with no network infrastructure; all class 0–2 envelopes transfer, verify against the author's key, and render.
- **AC-16** A tampered envelope injected by a mesh peer is rejected and not relayed.
- **AC-17** On network restore, the outbox drains, receipts arrive, and no duplicates are created.
- **AC-18** A class-0 broadcast queued behind 500 class-3 envelopes is transmitted first.

### 16.5 Reticulum
- **AC-19** Two RNS nodes over `TCPInterface`, with no browser able to reach any backend: a broadcast emitted at node A appears at node B.
- **AC-20** Severing the link mid-transfer and reconnecting completes delivery via store-and-forward.
- **AC-21** A class-3 envelope submitted to the bridge is rejected with a typed error.

### 16.6 Federation
- **AC-22** Two full stacks: announce → TOFU at `PROBATION` → a post on A appears on B via `StreamActivities`.
- **AC-23** Partition B for 5 minutes, post 20 items on A, reconnect → `Backfill` delivers exactly 20, zero duplicates.
- **AC-24** A replayed envelope is rejected by the unique index, not by a racy read-then-write.
- **AC-25** A peer that rewrites its log is detected via `ExchangeTreeHeads` and flagged in the admin UI.

### 16.7 Transparency & moderation
- **AC-26** An inclusion proof fetched while online verifies offline against a stored STH.
- **AC-27** Deleting a post server-side causes the consistency proof between the old and new STH to fail — the deletion is **detectable**.
- **AC-28** A removed post shows a public tombstone with acting moderator, timestamp, and reason.
- **AC-29** With the labeller service stopped, publishing still succeeds and content appears unlabelled.
- **AC-30** A user who removes the home server's labeller from their trust set sees unfiltered content.

### 16.8 Footprint
- **AC-31** Initial JS bundle < 300 KB gzipped, verified in CI.
- **AC-32** A class-0 broadcast envelope with signature and anti-abuse fields is ≤ 512 bytes.
- **AC-33** The node runs the full acceptance suite on a Raspberry Pi 4.

---

## Appendix A — v1 → v2 Migration Map

### A.1 Write operations → envelope domains

| v1 endpoint | v2 domain |
|---|---|
| `POST /posts` | `jb:post:create:v1` |
| `PATCH /posts/{id}` | `jb:post:update:v1` |
| `DELETE /posts/{id}` | `jb:post:delete:v1` |
| `POST /posts/{id}/vote`, `POST /votes` | `jb:vote:cast:v1` |
| `POST /posts/{id}/mod/*` (8 routes) | `jb:mod:action:v1` (verb) |
| `POST /comments` | `jb:comment:create:v1` |
| `PATCH /comments/{id}` | `jb:comment:update:v1` |
| `DELETE /comments/{id}` | `jb:comment:delete:v1` |
| `POST /comments/{id}/mod/*` (6 routes) | `jb:mod:action:v1` (verb) |
| `POST /comments/{id}/vote` | `jb:vote:cast:v1` |
| `POST /subreddits` | `jb:community:create:v1` |
| `PUT /subreddits/{id}` | `jb:community:update:v1` |
| `DELETE /subreddits/{id}` | `jb:community:archive:v1` |
| `POST /subreddits/{id}/join` | `jb:membership:join:v1` |
| `POST /subreddits/{id}/leave` | `jb:membership:leave:v1` |
| `POST /subreddits/{id}/ban`, `/kick`, `DELETE /ban/{userId}` | `jb:mod:action:v1` (BAN/KICK/UNBAN) |
| `POST|DELETE /subreddits/{id}/moderators*` | `jb:role:assign:v1` / `jb:role:revoke:v1` |
| `POST /subreddits/{sid}/members`, `PATCH`, `DELETE`, `/ban`, `/role` | membership + mod + role domains |
| `POST /messages`, `POST /messages/reply` | `jb:message:send:v1` |
| `DELETE /messages/{id}` | `jb:message:send:v1` (tombstone body) |
| `POST /moderation/reports` | `jb:report:create:v1` |
| `PUT /moderation/reports/{id}` | `jb:report:resolve:v1` |
| `POST /roles`, `PUT /roles/{id}`, `DELETE /roles/{id}` | `jb:role:define:v1` |
| `POST /roles/{rid}/assign/{uid}` | `jb:role:assign:v1` |
| `DELETE /roles/{rid}/revoke/{uid}` | `jb:role:revoke:v1` |
| `POST /awards` | `jb:award:give:v1` |
| `POST|PATCH|DELETE /awards/types*` | `jb:award:type:v1` |
| `POST /attachments`, `/confirm`, `PUT /attachments/{id}` | `jb:attachment:claim:v1` |
| `PATCH /users/me/profile` | `jb:profile:update:v1` |
| `POST /users/me/follow|unfollow/{id}` | `jb:social:follow:v1` |
| `POST /users/me/block|unblock/{id}` | `jb:social:block:v1` |
| `POST /users/me/save|unsave` | `jb:social:save:v1` |
| `POST /users/me/feed-preferences` | `jb:prefs:feed:v1` |
| `PATCH /admin/users/{id}/ban|unban` | `jb:mod:action:v1` (global scope) |
| `PATCH /admin/users/{id}/global-role` | `jb:role:assign:v1` (global scope) |
| `POST|PATCH|DELETE /admin/federation/servers*` | `jb:server:vouch:v1` |

### A.2 Mechanisms replaced (feature preserved, implementation strengthened)

| v1 mechanism | Problem | v2 replacement |
|---|---|---|
| Dual canonical form with fallback acceptance | Signature confusion — a text-post signature validated a post with attacker-chosen url/attachments | One canonical form per version; `UNKNOWN_VERSION` on mismatch |
| `createProofHash = SHA256(userId\|postId\|serverKeyId)` | All inputs public; proves nothing | Merkle inclusion proof against a signed tree head |
| `audit-service` flat JSON file | No tamper evidence; O(n) rewrite per submission | Append-only Merkle log with gossiped STHs |
| ObjectIds in signed payloads | Meaningless off-instance; blocks federation entirely | Public keys and content hashes |
| Two divergent JSON canonicalizers | Cross-language verification would disagree | Deterministic protobuf, one implementation, cross-language vectors |
| Admin-only federation allowlist | Volunteer relays cannot join during a shutdown | TOFU + web-of-trust with quota-by-trust |
| `federationactivities` with no unique index | Dedupe was a read-then-write race | Unique index on `(content_id, direction)` |
| Federation outbox with no delivery | Nothing was ever sent or projected | gRPC delivery queue + inbound projection |
| Server acknowledgements | Server-only attestation, unverifiable history | `Receipt` with inclusion proof |
| SHA-256 PoW, difficulty 3–4 | Milliseconds of work; no real cost | Argon2id, pressure-scaled, key-bound |
| Read-modify-write credit ledger | Concurrent burst costs 1 credit total | Atomic Redis Lua token bucket |
| `INCR` + separate `PEXPIRE` | Crash between them permanently locks a subject out | Single atomic script |
| UA + XFF in rate-limit subject | One header rotation resets all limits and credits | Verified IP + subnet, or authenticated identity |
| Any-JWT-accepted guard | Refresh token authenticated as access token | Typed claims, separate signing keys per class |
| Private key in `sessionStorage` | XSS = permanent, unrevocable identity theft | Worker-isolated signer + revocation |
| Plaintext DMs | Server seizure exposes every conversation | E2EE with hybrid PQ key agreement |
| `delPattern` Redis SCAN per write | Self-DoS growing with keyspace size | Tagged cache keys |
| No-op WebSocket manager | No realtime at all | SSE stream + mesh push |
| Empty `syncVotes`/`syncPosts` SW stubs | "Offline-first" was not true | Real outbox drain |
| Build-time-baked API origin | One blocked domain kills everything | Multi-homeserver racing + static export |
