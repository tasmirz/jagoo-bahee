# 01 — Identity Planes

> Frozen before P1. Defines the two decoupled identity domains and the invariants that keep them unlinkable.

---

## 1. Why two planes

A single identity system cannot serve both requirements at once:

- The **forum** needs pseudonymity. People discuss things they cannot safely attach their name to. Content is trusted because it is signed and auditable, not because of who signed it.
- **Broadcast and messaging** need the opposite. A subscriber follows a relief organisation, a hospital, or a ward coordinator *because they know who it is*. An anonymous emergency broadcast is worthless — worse than worthless, because it is trivially spoofable at scale.

If both used one identity, publishing a broadcast under a known name would retroactively deanonymise every forum post that key ever made. That is a catastrophic, irreversible leak in exactly the population this system exists to protect.

**So: two planes, cryptographically and operationally separate.**

---

## 2. Plane A — FORUM (anonymous)

### 2.1 Identity model

| Property | Value |
|---|---|
| Root secret | BIP-39 mnemonic `M_forum` (24 words, 256-bit) |
| Derivation | BIP85 child entropy |
| Real-world binding | **None.** Never requested, never stored, never inferable. |
| Cross-community linkability | **None** — a different key per community |
| Signature algorithm | Ed25519 (64 B) |
| Recovery | Mnemonic only. No server-side recovery exists. |

### 2.2 Derivation paths

```
m/83696968'/10'/0'      → forum device identity (root of this plane)
m/83696968'/11'/n'      → per-community identity n     (unlinkable across communities)
m/83696968'/12'/e'      → per-epoch posting secret e    (rate-limit nullifier source)
m/83696968'/13'/0'      → forum DM key agreement        (X25519 + ML-KEM-768)
m/83696968'/14'/0'      → credential blinding secret    (anonymous membership tokens)
```

### 2.3 Anonymity mechanisms

| Mechanism | Purpose |
|---|---|
| Per-community derived key | Activity in `r/a` cannot be linked to activity in `r/b` |
| Blind-signed membership credential | Proves "passed the join gate" without revealing which account passed it |
| Epoch nullifier `H(domain ‖ epoch ‖ secret)` | Enforces "N actions per epoch" without learning *which* identity acted |
| No IP-to-identity storage | The node must not persist any mapping from network address to key |

**Requirement PA-01:** The node MUST NOT persist any record linking a forum key to an IP address, session, User-Agent, or device fingerprint. Rate-limit state is keyed by nullifier or by network address alone — never by both together.
**Requirement PA-02:** The interface for credentials and nullifiers (`Signer.blind`, `Signer.nullifier`) is stable so a zk-SNARK Merkle-membership implementation can replace the internals with **no protocol change**. Full ZKP is an upgrade path, not a dependency.

---

## 3. Plane B — SIGNAL (identified)

### 3.1 Identity model

| Property | Value |
|---|---|
| Root secret | Separate mnemonic `M_signal`, **or** an organisation-managed key |
| Derivation | BIP85 child entropy from `M_signal`, or direct key import |
| Real-world binding | **Required.** Verifiable claims about a person or organisation. |
| Cross-context linkability | **Intended** — recognisability is the point |
| Signature algorithm | Ed25519 (64 B) per message; ML-DSA-44 identity certificate |
| Recovery | Mnemonic, plus key rotation announced to subscribers |

### 3.2 Derivation paths

```
m/83696968'/20'/0'      → signal device identity
m/83696968'/21'/c'      → channel signing key c        (an org may run several channels)
m/83696968'/22'/0'      → messaging key agreement      (X25519 + ML-KEM-768)
m/83696968'/23'/0'      → signed prekey batch seed
```

### 3.3 Entity kinds

```protobuf
enum ChannelKind {
  CHANNEL_KIND_UNSPECIFIED = 0;
  PERSON       = 1;  // an individual: ward coordinator, journalist, doctor
  ORGANISATION = 2;  // NGO, relief group, hospital, student body
  AUTHORITY    = 3;  // official body — held to a higher verification bar
  COMMUNITY    = 4;  // a neighbourhood or building's shared channel
}
```

---

## 4. Separation invariants (normative)

These are the rules that make the two planes genuinely unlinkable. Each is testable.

**Requirement SEP-01 — separate roots, mandatory.**
`M_forum` and `M_signal` MUST be independent secrets. Deriving both from one mnemonic is **forbidden**, because a device seizure would then let an adversary who knows the public Signal identity derive the Forum identity and deanonymise its entire history.

**Requirement SEP-02 — plane is inside the signature.**
Every envelope carries a `plane` field in its signed bytes (`02-CONTRACTS-CORE.md` §2). A signature made in one plane can never be replayed as the other, because the plane byte is covered by the signature.

**Requirement SEP-03 — one domain, one plane.**
The domain registry assigns every `domain` string to exactly one plane. An envelope whose `domain` does not match its `plane` is rejected with `PLANE_MISMATCH`.

**Requirement SEP-04 — separate signer instances.**
Each plane has its own `Signer` instance, its own encrypted key store, and its own unlock state. There is no code path by which a Forum signing context can reach a Signal private key. This is enforced by construction, not by a runtime check:

```typescript
// Two distinct nominal types — a PlaneSigner<FORUM> is not assignable
// to a PlaneSigner<SIGNAL>, so cross-plane signing fails to compile.
interface PlaneSigner<P extends Plane> {
  readonly plane: P;
  identity(ctx: ContextOf<P>): Promise<PublicIdentity>;
  sign(ctx: ContextOf<P>, canonicalBytes: Uint8Array): Promise<Signature>;
}

type ContextOf<P> =
  P extends Plane.FORUM  ? { kind: "device" } | { kind: "community"; communityId: string } | { kind: "epoch"; epoch: number }
: P extends Plane.SIGNAL ? { kind: "device" } | { kind: "channel"; channelId: string }
: never;
```

**Requirement SEP-05 — no cross-plane storage association.**
The node MUST NOT persist any record associating a Forum key with a Signal key. Not in a user row, not in a session, not in a log line. There is no "account" object spanning both planes.

**Requirement SEP-06 — no shared session.**
Authentication is per plane. A session token for the Forum plane grants nothing on the Signal plane. Token audiences differ and are asserted.

**Requirement SEP-07 — separate delivery paths.**
Signal-plane envelopes MUST NOT be batched in the same request, stream frame, or mesh push as Forum-plane envelopes. Co-transmission is a timing-correlation leak.

**Requirement SEP-08 — UI must not offer linkage.**
The client MUST NOT provide any feature that publishes both identities together, cross-links profiles, or imports one plane's contacts into the other. If a user asks, the UI explains the risk and refuses.

**Requirement SEP-09 — independent revocation.**
Revoking a key in one plane has no effect in the other and reveals nothing about it.

### 4.1 What the planes may legitimately share

| Shared | Why it is safe |
|---|---|
| The **envelope format** | Structure only; the `plane` field separates them and no key material crosses |
| The **E2EE messaging engine** | One implementation, parameterised by identity provider — no key sharing |
| The **transport stack** | Bytes are bytes; SEP-07 forbids co-batching |
| The **node's ingress pipeline** | Same validation code, plane-aware routing to separate projections |
| The **device** | Unavoidable. Mitigated by separate encrypted stores and separate unlock. |

---

## 5. Channel verification — how a subscriber knows who they are following

A key alone means nothing. `jbc1abc…` is not "Dhaka Relief Network" until something connects them. There is no certificate authority; there is **accumulated evidence**, and the client shows its weight.

### 5.1 Evidence kinds

```protobuf
message IdentityClaim {
  ClaimKind kind  = 1;
  string    value = 2;   // the claim itself
  string    proof = 3;   // where/how it can be checked
  int64     asserted_at_ms = 4;
}

enum ClaimKind {
  CLAIM_KIND_UNSPECIFIED = 0;
  WEBSITE          = 1;  // key fingerprint hosted at a domain the org already controls
  SOCIAL_ACCOUNT   = 2;  // fingerprint posted from an established account
  ORG_REGISTRY     = 3;  // registration number, licence
  PHYSICAL_ADDRESS = 4;  // verifiable premises
  PHONE            = 5;
  IN_PERSON        = 6;  // fingerprint exchanged face to face (strongest, unscalable)
  PRINTED          = 7;  // fingerprint/QR on posters, leaflets, vehicles
}
```

### 5.2 Trust signals shown to the subscriber

| Signal | Weight | Source |
|---|---|---|
| In-person fingerprint verification | **Highest** | The subscriber themself, scanned via QR |
| Vouches from already-trusted channels | High | `ChannelVouch` envelopes, weighted by the subscriber's own trust in the voucher |
| Instance operator attestation | Medium | The homeserver states it verified the org |
| Pre-existing web/social claim | Medium | Checkable by the subscriber independently |
| Channel age and broadcast history | Low | Derived from the log |
| Nothing | **None — shown as unverified** | |

**Requirement CV-01:** The client MUST display a channel's verification state on every broadcast, and MUST visually distinguish *unverified*, *vouched*, and *personally verified*. Colour alone is insufficient (NFR-A06).
**Requirement CV-02:** No single authority may confer verification. Instance attestation is *one* signal among several and MUST be overridable by the user.
**Requirement CV-03:** QR-based in-person fingerprint verification MUST work with no network connectivity.
**Requirement CV-04:** `Severity.CRITICAL` broadcasts MUST be rejected by the client's default filter unless the channel is at least *vouched*. Unverified channels can warn; they cannot trigger a maximum-severity alarm.

### 5.3 Impersonation defence

**Requirement CV-05:** The node MUST detect and flag channels whose `channel_name` is confusingly similar to an established channel (normalised Unicode comparison, homoglyph folding, edit distance) and MUST surface the collision to subscribers rather than silently allowing it.
**Requirement CV-06:** Channel names are **not** globally unique and MUST NOT be treated as identifiers. The channel ID (key fingerprint) is the identifier; the name is a label.

---

## 6. Key certificates and revocation (both planes)

```protobuf
message KeyCertificate {
  Plane  plane           = 1;
  bytes  device_key      = 2;  // Ed25519, 32 B
  bytes  pq_key          = 3;  // ML-DSA-44, 1312 B
  bytes  pq_attestation  = 4;  // ML-DSA sig over device_key ‖ valid_from ‖ valid_until
  int64  valid_from      = 5;
  int64  valid_until     = 6;
  bytes  self_signature  = 7;  // Ed25519
}

message KeyRevocation {
  Plane  plane             = 1;
  bytes  revoked_key       = 2;
  RevocationKind kind      = 3;
  int64  effective_from_ms = 4;
  bytes  replacement_key   = 5;
}

enum RevocationKind {
  REVOCATION_KIND_UNSPECIFIED = 0;
  ROTATE     = 1;  // planned change; replacement inherits standing
  COMPROMISE = 2;  // content signed after effective_from is untrusted
  DURESS     = 3;  // pre-signed, publishable by a trusted contact; triggers wipe
  RETIRE     = 4;  // channel or identity stops publishing
}
```

**Requirement KY-01:** Revocation MUST NOT invalidate content signed before `effective_from_ms`. Retroactive erasure of a person's history is itself a censorship vector.
**Requirement KY-02:** A `DURESS` revocation MUST be constructible and exportable *before* it is needed, and usable by a third party holding only the pre-signed blob.
**Requirement KY-03:** Signal-plane revocations MUST reach subscribers at `BROADCAST` priority so they propagate on every transport, including during a blackout.
**Requirement KY-04:** Signal key rotation MUST preserve subscriber lists. Subscribers follow a *channel*, and the channel's continuity is established by the old key signing the new one.

---

## 7. Signature algorithm policy (both planes)

Post-quantum signatures do not fit the constrained transports, and that constraint governs the whole design.

| Algorithm | Signature | Public key | Fits one LoRa frame (~222 B)? |
|---|---|---|---|
| Ed25519 | 64 B | 32 B | **Yes** |
| Falcon-512 | ~666 B | 897 B | No — 4+ fragments |
| ML-DSA-44 | 2420 B | 1312 B | No — ~12 fragments |

One ML-DSA signature is eleven LoRa transmissions before any content, each with independent loss probability. Signing per-message with ML-DSA makes the radio path unusable.

**The PQ budget is therefore spent by actual threat:**

| Threat | Real? | Decision |
|---|---|---|
| Harvest-now-decrypt-later on messages | **Yes** — traffic captured today, decrypted later, exposes people | **Hybrid X25519 + ML-KEM-768** for all message key agreement. Per-session cost, not per-message. |
| Retroactive signature forgery | **No** — a forged signature on a 2026 broadcast, produced in 2035, has no value | **Ed25519, 64 B** per message |
| Future identity impersonation | Yes, eventually | **ML-DSA-44 identity certificate**, signed once, cached. Peers verify a 64-byte Ed25519 signature against an Ed25519 key that is itself PQ-attested. |

**Requirement KY-05:** `BROADCAST`, `DIRECT`, and `CHECKIN` priority envelopes MUST use a 64-byte signature algorithm. Enforced at construction with a typed error, not discovered at send time.
**Requirement KY-06:** `key_alg` is negotiable per envelope. Verifiers MUST reject algorithms outside the accepted set for that domain and MUST NOT downgrade.

---

## 8. Signer boundary

All private-key operations sit behind one interface per plane, implemented once in Rust and exposed to every client.

```typescript
interface PlaneSigner<P extends Plane> {
  readonly plane: P;

  identity(ctx: ContextOf<P>): Promise<PublicIdentity>;
  sign(ctx: ContextOf<P>, canonicalBytes: Uint8Array): Promise<Signature>;
  agree(peer: PublicIdentity, kemCiphertext?: Uint8Array): Promise<SessionHandle>;

  // Forum plane only — absent from the Signal signer's type
  nullifier?(epoch: number, scope: string): Promise<Uint8Array>;
  blind?(message: Uint8Array): Promise<{ blinded: Uint8Array; state: BlindState }>;
  unblind?(state: BlindState, blindSig: Uint8Array): Promise<Credential>;

  prepareDuressRevocation(): Promise<Uint8Array>;
  panic(): Promise<void>;   // wipe this plane's material only
}
```

| Platform | Implementation | Storage |
|---|---|---|
| Web PWA | `jb-wasm` in a dedicated Web Worker, **one worker per plane** | Non-extractable IndexedDB entry, unlocked by a passphrase-derived AES-GCM key |
| Mobile | `jb-core` native | Secure Enclave / Android Keystore, separate key aliases per plane |
| Node / relay | `jb-core` native | OS keyring or encrypted file |

**Requirement SG-01:** No code outside the signer boundary may hold a private key in a variable. Enforced by lint rule and code-review checklist.
**Requirement SG-02:** One worker per plane. A single worker holding both planes' keys violates SEP-04 regardless of internal discipline.
**Requirement SG-03:** `panic()` wipes only the calling plane, so a user can destroy their Forum identity while keeping the Signal identity needed to coordinate relief — or the reverse.
