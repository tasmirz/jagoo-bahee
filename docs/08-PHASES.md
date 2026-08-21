# 08 — Phases

> Each phase has a scope, an exit gate, and a demo. **A phase may not start until the previous gate passes.** The one permitted exception is P4, which may run in parallel with P3 once P2's gate passes.

---

## Phase map

| Phase | Name | Goal rank | Gate |
|---|---|---|---|
| **P0** | Contracts & Skeleton | foundation | Cross-language vectors pass |
| **P1** | Core Node & Forum Plane | foundation | Feature parity on one instance |
| **P2** | **Federation** | ★ **PRIMARY** | Two instances exchange and project |
| **P3** | **ISP Availability & Bridging** | ★ **SECONDARY** | Islands merge; scope preference proven |
| **P4** | Signal Plane over IP | tertiary | Broadcast + messaging work end-to-end |
| **P5** | Offline store-and-forward | low | Authoring works with the network off |
| **P6** | Reticulum / LoRa | **lowest** | Broadcast crosses an RNS link |

---

## P0 — Contracts & Skeleton

**Goal:** every contract frozen and generating code in three languages, with a running skeleton that proves the architecture holds.

### Scope
- `proto/jagoo/v1/*.proto` — envelope, forum, signal, federation, bridge
- `proto/jagoo/v1/registry.yaml` + generator → TS, Rust, Python
- `crates/jb-core` — canonical encoding, content IDs, envelope encode/decode
- `crates/jb-crypto` — Ed25519 sign/verify, BIP85 derivation, key certificates
- `crates/jb-wasm` — browser binding
- `services/node` skeleton: hexagonal layout, port interfaces, empty registry, composition root
- Import-boundary lint rule (AR-01)
- Cross-language test vector fixture and CI gate

### Out of scope
Any business logic. Any persistence beyond an in-memory double. Any UI.

### Exit gate

| ID | Criterion |
|---|---|
| P0-G1 | TS, Rust, and Python produce **byte-identical** canonical encodings and content IDs across the fixture set |
| P0-G2 | A signature over one `domain` fails verification under any other `domain` |
| P0-G3 | A `FORUM`-plane signature fails verification as a `SIGNAL`-plane envelope |
| P0-G4 | A body with fields omitted does not validate against a body with those fields populated *(the v1 signature-confusion regression test)* |
| P0-G5 | `registry.yaml` generates identical domain tables in all three languages |
| P0-G6 | The import-boundary lint fails when `core/domain` imports a driver |
| P0-G7 | An unknown `version` and an unknown `domain` are both hard-rejected |

**Demo:** a CLI that constructs, signs, encodes, and verifies an envelope — and the same fixture verified by the Rust binary and the Python script producing identical hashes.

---

## P1 — Core Node & Forum Plane (single instance)

**Goal:** full v1 forum feature parity, running through the new pipeline, on one instance.

### Scope
- Ingress pipeline, all 19 steps (`02-CONTRACTS-CORE.md` §5)
- Projector + `DomainRegistry`; all Forum feature directories
- Mongo/Redis/S3 adapters; local Merkle witness
- Read API (`03-CONTRACTS-FORUM.md` §5)
- Auth: challenge/response, BIP85 forum identity, key certificates
- Anti-abuse: Argon2id PoW, atomic credit ledger, nullifiers, blind credentials
- `apps/web`: all 42 v1 routes, static export, signature verification badges
- Labeller adapter (optional, with null default)
- `rebuild-projections` command

### Exit gate

| ID | Criterion |
|---|---|
| P1-G1 | Every `SYSTEM-REQUIREMENTS.md` §11 Forum-plane feature ID is reachable in the UI |
| P1-G2 | All 42 v1 frontend routes exist with equal or greater functionality |
| P1-G3 | `rebuild-projections` reconstructs every collection from the envelope log; output matches byte for byte |
| P1-G4 | Rotating `User-Agent` per request does not reset any rate limit or credit balance |
| P1-G5 | A client-supplied `X-Forwarded-For` neither creates a new rate-limit identity nor evades an IP block |
| P1-G6 | 50 concurrent requests against a 10-credit balance succeed exactly 10 times |
| P1-G7 | A refresh token presented as a bearer token is rejected on every write route |
| P1-G8 | A captured moderator-action envelope cannot be replayed |
| P1-G9 | Requesting 10⁵ PoW challenges does not measurably grow server memory |
| P1-G10 | Initial JS bundle < 300 KB gzipped, verified in CI |
| P1-G11 | Adding a trivial new domain requires **zero** changes to ingress, projector dispatch, or signing code |

**Demo:** post, comment, vote, moderate, and verify a signature client-side — with an inclusion proof shown in the audit view.

---

## P2 — Federation ★ PRIMARY GOAL

**Goal:** two independent instances exchange, verify, and project content.

### Scope
- gRPC `Federation` service: `Announce`, `Deliver`, `StreamActivities`, `Backfill`, `ExchangeTreeHeads`, `ExchangeDirectory`
- TOFU trust model with vouch-based promotion
- Durable outbound queue: backoff, dead-letter, auto-backfill on reconnect
- Inbound projection (not archival)
- Unique index on `(content_id, direction)`
- Per-peer, per-class quotas
- Outbound-only mode for NATed nodes
- STH gossip and fork detection
- Discovery endpoints with full scoped endpoint lists

### Exit gate

Full criteria in `05-CONTRACTS-FEDERATION.md` §8 (FG-01 … FG-10). Summary:

| ID | Criterion |
|---|---|
| FG-01 | `Announce` succeeds; peer lands at `PROBATION` via TOFU |
| FG-02 | A post on A appears, verified and projected, on B |
| FG-04 | Partition 5 min, 20 envelopes, reconnect → `Backfill` delivers exactly 20, zero duplicates |
| FG-05 | A replayed envelope is rejected by the unique index, not a racy read |
| FG-07 | An outbound-only node behind simulated NAT federates fully both ways |
| FG-08 | A peer that rewrote its log is detected via STH gossip and demoted |

**Demo:** two stacks on different ports. Post on A → appears on B within seconds with a verified badge. Kill B, post 20 items, restart B → backfill closes the gap exactly.

---

## P3 — ISP Availability & Bridging ★ SECONDARY GOAL

**Goal:** instances reachable within one ISP with no national gateway, and a multi-homed node merging two ISP islands.

### Scope
- `ReachabilityScope` end to end
- `UplinkManager` with per-uplink probing and source-IP binding
- `PathSelector` implementing narrowest-working-scope with the same-ASN bonus
- `PeerDirectory` with scope/ASN tagging, continuous refresh, durable cache
- Baked-in seed directory per ISP
- `BridgeRelay` — multi-homed relay with per-pair, per-class quotas and reserved emergency capacity
- Uplink failover: path re-evaluation within 30 s, zero envelope loss, auto re-announce and backfill
- NAT traversal: UPnP-IGD, NAT-PMP, STUN reflexive discovery, CGNAT detection
- Reverse-tunnel mode through a `TRUSTED` peer
- mDNS/SSDP local discovery; manual entry; QR node addresses
- Scope indicator in the client UI
- Per-scope metrics
- Port-forwarding documentation for common Bangladeshi consumer routers (Bangla + English)

### Test infrastructure
Linux network namespaces with simulated ASNs and iptables rules. **No physical multi-ISP setup required.**

### Exit gate

Full criteria in `06-CONTRACTS-TRANSPORT.md` §10 (TG-01 … TG-10). Summary:

| ID | Criterion |
|---|---|
| TG-02 | With `GLOBAL` firewalled, two nodes on the same simulated ASN federate over `ISP_LOCAL` |
| TG-03 | Metrics prove `ISP_LOCAL` is preferred over `NATIONAL` when both are alive |
| TG-04 | A bridge node merges two isolated ASN islands; a post on A reaches B |
| TG-05 | A class-0 broadcast crosses the bridge while a bulk backlog is queued |
| TG-06 | Killing uplink A re-establishes paths on B within 30 s with zero loss |
| TG-08 | An outbound-only node behind simulated CGNAT federates fully |
| TG-09 | A cold client using only the seed list connects on `ISP_LOCAL` with `GLOBAL` blocked |

**Demo:** three network namespaces — ISP-A island, ISP-B island, bridge node. Cut the simulated IX. Show the islands isolated. Bring up the bridge. Show a post crossing. Kill one bridge uplink and show recovery with no lost envelopes.

---

## P4 — Signal Plane over IP

May start in parallel with P3 once P2's gate passes.

**Goal:** identified broadcast channels with subscriber-side filtering, plus identified E2EE messaging.

### Scope
- Signal-plane signer, separate worker, separate key store (SEP-04, SG-02)
- Channel lifecycle: declare, update, rotate, retire, vouch
- Channel verification: claims, vouches, instance attestation, in-person QR
- Confusable-name detection
- Broadcast: emit, sequence gap detection, supersede, revoke
- Severity gating on verification level
- Local subscription with severity/category/area filters; opt-in server-side push
- Area-based subscription independent of channel
- Identified E2EE messaging: prekey bundles, hybrid X25519+ML-KEM, ratchet, delivery receipts, small groups
- Crisis bodies: check-in, missing person, resource report
- Map view
- Separate SSE stream per plane (SG-API-01)

### Exit gate

| ID | Criterion |
|---|---|
| P4-G1 | A channel is declared, verified in person by QR, and shows as *personally verified* |
| P4-G2 | A broadcast emitted on node A reaches a subscriber on node B and renders with the correct severity |
| P4-G3 | Dropping broadcast #47 causes the subscriber's client to display a gap warning |
| P4-G4 | A `CRITICAL` broadcast from an unverified channel is filtered out by default |
| P4-G5 | A retraction updates an already-displayed alert in place and marks it revoked, not deleted |
| P4-G6 | An E2EE message is sent to an **offline** recipient via a prekey bundle and decrypts on their return |
| P4-G7 | The server stores only ciphertext — verified by inspecting the database directly |
| P4-G8 | Forum and Signal envelopes never appear in the same request, stream frame, or batch |
| P4-G9 | No stored record associates a Forum key with a Signal key (schema audit) |
| P4-G10 | `panic()` on the Signal plane leaves the Forum plane intact, and the reverse |
| P4-G11 | A check-in succeeds with a zero credit balance and no credential |
| P4-G12 | A broadcast envelope with signature and anti-abuse fields is ≤ 512 bytes |

**Demo:** declare a relief-organisation channel, verify it by QR between two devices, emit a `WARNING` with a geographic area, watch it arrive and alert on a subscribed device on the other instance. Then retract it and watch the alert update.

---

## P5 — Offline store-and-forward

**Goal:** author with no network; sync when any path opens.

### Scope
- `Outbox` — durable IndexedDB queue of fully signed envelopes
- Priority-ordered drain (class 0 before class 3)
- Idempotent drain; `DUPLICATE` returns the original receipt
- Service worker background sync (replacing v1's empty stubs)
- Offline compose for every content type
- Offline read of cached feed, comments, broadcasts, and messages
- Local mesh transport: WebRTC data channels, QR-exchanged SDP, Bloom reconciliation, store-and-forward with hop limit and TTL
- `.jbpack` signed bundle export/import for sneakernet
- Battery-aware and data-saver modes

### Exit gate

| ID | Criterion |
|---|---|
| P5-G1 | With the backend stopped **and** the network adapter disabled: author a post, comment, vote, message, broadcast, and check-in — all signed with final content IDs, shown as authored-pending-receipt |
| P5-G2 | Two browser profiles pair over QR-exchanged WebRTC with no network infrastructure; class 0–2 envelopes transfer, verify, and render |
| P5-G3 | A tampered envelope from a mesh peer is rejected and not relayed |
| P5-G4 | On restore, the outbox drains, receipts arrive, and no duplicates are created |
| P5-G5 | A class-0 broadcast queued behind 500 class-3 envelopes is transmitted first |
| P5-G6 | A `.jbpack` from an untrusted source imports safely — every envelope independently verified |

**Demo:** the blackout drill. Backend down, adapter off, author content, pair two laptops by QR, watch signed content move phone-to-phone and verify with zero servers involved.

---

## P6 — Reticulum / LoRa (lowest priority)

**Goal:** broadcast and messaging cross an RNS link. Server-forwarding shape only is required.

### Scope
- `services/relay` — Python RNS daemon, gRPC/Unix-socket bridge
- Server-forwarding shape: end user → node (IP) → RNS → LoRa
- Class 0–2 only; `BULK` rejected with `TRANSPORT_UNSUPPORTED`
- Fragmentation and reassembly with per-fragment integrity
- `TCPInterface` demo path — no radio hardware needed
- `RNodeInterface` documentation for real LoRa boards
- Admin visibility: interfaces, paths, RSSI, SNR, queue depth
- Disabled by default (RT-06)

### Optional (may slip past P6)
- End-device direct RNS
- Bridge relay between an RNS island and IP federation

### Exit gate

| ID | Criterion |
|---|---|
| RG-01 | Two RNS nodes over `TCPInterface`, no browser able to reach any backend: a broadcast from A appears at B |
| RG-02 | Severing the link mid-transfer and reconnecting completes delivery via store-and-forward |
| RG-03 | A `BULK` envelope submitted to the bridge is rejected with a typed error |
| RG-04 | **The full acceptance suite passes with the Reticulum adapter removed from the build** |

**Demo:** two nodes, RNS over TCP, backend unreachable from either browser. Emit an emergency broadcast at node A; it appears at node B. Cut the link mid-send; reconnect; delivery completes.

---

## Hackathon-critical subset

If time runs short, the demonstrable core is **P0 → P1 → P2**, plus whichever of P3/P4 lands.

- **P0–P2** proves the thesis: self-authenticating content federating between independent instances, verifiable with no trusted server.
- **P3** is the Track A differentiator: it survives an ISP-level blockade and merges islands, which is the actual failure mode Bangladesh experienced.
- **P4** gives the human story: a relief organisation broadcasting to subscribers who know who it is.
- **P5** gives the strongest live demo: content moving between two laptops with the network switched off.
- **P6** is the headline if hardware is available, and explicitly nothing depends on it.

---

## Parallelisation

| Can run in parallel | Why |
|---|---|
| P3 ∥ P4 | Signal plane depends on federation (P2), not on ISP bridging |
| P1 web UI ∥ P1 node | Contracts frozen at P0 means both sides code against generated types |
| P6 relay service ∥ P4/P5 | Separate process, adapter behind a port |
| Documentation ∥ everything | Router port-forward guides need no code |

| Must be sequential | Why |
|---|---|
| P0 → everything | Contract churn after freeze invalidates all downstream work |
| P1 → P2 | Cannot federate what does not project |
| P2 → P3 | Cannot bridge federation that does not exist |
| P4 → P6 | Reticulum carries Signal-plane traffic; the traffic must exist first |
