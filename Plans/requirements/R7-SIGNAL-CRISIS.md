# R7 — Signal Plane: Channels, Broadcast & Crisis

Plane: **SIGNAL** throughout. Contracts: [`../04-CONTRACTS-SIGNAL.md`](../04-CONTRACTS-SIGNAL.md)

## 1. Delivery model — flood then filter

**SIG-01:** Broadcast delivery MUST NOT depend on the server knowing who is subscribed.

Broadcasts are ≤ 512 bytes and replicate across the federation regardless of subscription. The subscriber's client holds its subscription list **locally** and filters. One decision buys three things:

| Benefit | Why it matters |
|---|---|
| **Subscriber privacy** | A server-side subscription table is a list of targets. Following an opposition organiser must not be discoverable. |
| **Blackout delivery** | Flooding works over mesh and Reticulum, where per-subscriber fanout cannot. |
| **No fanout amplification** | One broadcast is one object, not N deliveries. |

Server-side subscription exists **only** as an opt-in push optimisation, and the UI must state plainly that it reveals the subscription.

## 2. Channels

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| SIG-02 | Declare a channel: name, description, kind, categories, area, language, claims | — | P4 |
| SIG-03 | Channel kinds: person, organisation, authority, community | — | P4 |
| SIG-04 | Channel ID is the key fingerprint; the name is a mutable label, never an identifier | — | P4 |
| SIG-05 | Update channel metadata | — | P4 |
| SIG-06 | Key rotation signed by the **old** key, preserving subscribers | — | P4 |
| SIG-07 | Retire a channel with an optional successor key | — | P4 |
| SIG-08 | Confusable-name detection (NFKC, homoglyph folding, edit distance) with collision warning | — | P4 |

## 3. Channel verification

| ID | Requirement | Phase |
|---|---|---|
| SIG-09 | Identity claims: website, social account, org registry, address, phone, in-person, printed | P4 |
| SIG-10 | `ChannelVouch` envelopes from other channels, with levels negative / known / verified / endorsed | P4 |
| SIG-11 | Instance operator attestation as **one signal among several**, never authoritative | P4 |
| SIG-12 | In-person QR fingerprint verification, working with **no network** | P4 |
| SIG-13 | Verification state shown on every broadcast, distinguishable without relying on colour | P4 |
| SIG-14 | Vouch weight computed from the subscriber's own trust in the voucher | P4 |
| SIG-15 | User can override any verification signal, including the instance's | P4 |

### Trust signal weighting

| Signal | Weight |
|---|---|
| In-person fingerprint scan by the subscriber | **Highest** |
| Vouches from already-trusted channels | High |
| Instance operator attestation | Medium |
| Pre-existing web/social claim, independently checkable | Medium |
| Channel age and broadcast history | Low |
| Nothing | **Shown as unverified** |

## 4. Broadcast

| ID | Requirement | Phase |
|---|---|---|
| SIG-16 | Emit broadcast: severity, category, headline (≤ 120 chars), detail, area, expiry, language | P4 |
| SIG-17 | Severity scale: info, advisory, warning, critical | P4 |
| SIG-18 | 13 categories including flood, earthquake, fire, storm, medical, shelter, supply, safety, network status | P4 |
| SIG-19 | **`CRITICAL` requires a vouched channel** — unverified channels may advise, never alarm | P4 |
| SIG-20 | `broadcast.emit` permission gate | P4 |
| SIG-21 | Monotonic per-channel sequence number | P4 |
| SIG-22 | Client detects sequence gaps and displays *"broadcast #N has not reached you"* | P4 |
| SIG-23 | Correction via `supersedes`, updating an already-displayed alert in place | P4 |
| SIG-24 | Retraction via `BroadcastRevoke` with reason: false alarm, resolved, corrected, error, expired | P4 |
| SIG-25 | A revoked broadcast is **marked revoked, not deleted** — people who acted on it need to see the retraction | P4 |
| SIG-26 | Envelope ≤ 512 bytes total, enforced at construction with a typed error | P4 |
| SIG-27 | `detail` omitted when the transport MTU cannot carry it; headline alone must be actionable | P4 |
| SIG-28 | Broadcasts flood every transport: IP, mesh, Reticulum | P4 / P5 / P6 |

### SIG-22 rationale

Sequence numbers are a **censorship detector**. If a node drops or withholds a broadcast, the subscriber sees a hole rather than silently receiving an incomplete picture. Missing broadcasts become evidence.

### Size budget for a CRITICAL broadcast

| Component | Bytes |
|---|---|
| Envelope framing | ~30 |
| `domain` string | ~24 |
| `author_key` (Ed25519) | 32 |
| `nonce` | 16 |
| `channel` reference (raw key) | 32 |
| sequence, severity, category, expiry | ~14 |
| `headline` (120 chars, Bangla UTF-8 worst case) | ~200 |
| `area` | ~14 |
| `signature` (Ed25519) | 64 |
| **Total** | **~426** |

## 5. Subscription

| ID | Requirement | Phase |
|---|---|---|
| SIG-29 | Local subscription store — never serialised into an envelope, never transmitted | P4 |
| SIG-30 | Per-severity alert toggles | P4 |
| SIG-31 | Per-category filters | P4 |
| SIG-32 | Geographic area filter | P4 |
| SIG-33 | Mute channel until a timestamp | P4 |
| SIG-34 | **Area-based subscription independent of channel** — receive evacuation orders from a channel never heard of | P4 |
| SIG-35 | Opt-in server-side push subscription with an explicit privacy warning shown before enabling | P4 |
| SIG-36 | Client-side filtering, so the server cannot infer interest from request patterns | P4 |
| SIG-37 | Broadcast replay by sequence on reconnect after being offline | P4 |

## 6. Alerting

| ID | Requirement | Phase |
|---|---|---|
| SIG-38 | Distinct alert UI and notification channel, separate from ordinary notifications | P4 |
| SIG-39 | Unread `CRITICAL` broadcasts pinned until acknowledged | P4 |
| SIG-40 | Alert UI legible at maximum system font scale | P4 |
| SIG-41 | Severity conveyed by more than colour alone | P4 |
| SIG-42 | Alert sound and vibration configurable per severity | P4 |

## 7. Crisis reporting

| ID | Requirement | Phase |
|---|---|---|
| CRS-01 | Check-in with status: safe, need help, medical, moving, unreachable | P4 |
| CRS-02 | Check-in notifies a pre-configured trusted-contact list | P4 |
| CRS-03 | **Check-in costs zero credits and requires no credential** | P4 |
| CRS-04 | Latest check-in supersedes the previous; history retained in the log, not surfaced by default | P4 |
| CRS-05 | Location coarse by default (settlement-level); precise coordinates require per-message opt-in | P4 |
| CRS-06 | Missing-person registry: report, search, status update | P4 |
| CRS-07 | Missing-person statuses: missing, found safe, found injured, deceased, resolved other | P4 |
| CRS-08 | Resource reports: shelter, water, food, medical, fuel, power, internet, road | P4 |
| CRS-09 | Resource states: available, limited, exhausted, blocked, damaged | P4 |
| CRS-10 | Map view of broadcasts, check-ins, and resources, rendering offline from cached data | P4 |
| CRS-11 | Network-status broadcasts — *"ISP X is blocking, use transport Y"* | P4 |

### CRS-03 rationale

In a disaster, telling people you are alive must never be rate-limited. This is the one action in the system with no cost gate at all, and it is deliberate.

## 8. Device and power

| ID | Requirement | Phase |
|---|---|---|
| CRS-12 | Battery-aware mode: reduce mesh scan frequency and disable media below a threshold | P5 |
| CRS-13 | Data-saver mode: text-only, no avatars, no thumbnails, < 50 KB per page | P5 |
| CRS-14 | Full offline read of cached broadcasts, check-ins, and messages | P5 |
| CRS-15 | Offline authoring of every Signal content type | P5 |
| CRS-16 | QR pairing for mesh peers with no network | P5 |
| CRS-17 | `.jbpack` export/import for sneakernet | P5 |
| CRS-18 | Transport and scope status always visible in the UI | P3 |
| CRS-19 | **Panic wipe accessible without unlocking the full app**, per plane | P4 |
