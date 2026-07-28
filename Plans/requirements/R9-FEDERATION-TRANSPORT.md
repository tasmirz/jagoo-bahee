# R9 — Federation, ISP Availability & Transport

The two highest-priority goals live here. Contracts: [`../05-CONTRACTS-FEDERATION.md`](../05-CONTRACTS-FEDERATION.md), [`../06-CONTRACTS-TRANSPORT.md`](../06-CONTRACTS-TRANSPORT.md)

## 1. Federation ★ PRIMARY GOAL

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| FED-01 | gRPC `Federation` service, server↔server only | ✗ (HTTP stub) | P2 |
| FED-02 | `Announce` handshake with mutual key exchange | ✗ | P2 |
| FED-03 | **TOFU admission** — a new peer lands at `PROBATION` on first contact | ✗ (admin allowlist only) | P2 |
| FED-04 | Trust levels: blocked, probation, normal, trusted | ✗ | P2 |
| FED-05 | Web-of-trust promotion via `ServerVouch` | — | P2 |
| FED-06 | `Deliver` — client-streaming push with flow control | ✗ | P2 |
| FED-07 | `StreamActivities` — server-streaming live push, resumable by index | ✗ | P2 |
| FED-08 | `Backfill` — resumable catch-up after a partition | ✗ | P2 |
| FED-09 | **Inbound envelopes projected into the read model**, not archived | ✗ | P2 |
| FED-10 | **Outbound delivery actually happens** — durable queue, backoff, dead-letter | ✗ | P2 |
| FED-11 | Auto-`Backfill` on reconnect | — | P2 |
| FED-12 | Unique index on `(content_id, direction)`; dedupe enforced by the database | ✗ | P2 |
| FED-13 | Full validation pipeline on every inbound envelope; trust affects quota only | ✗ | P2 |
| FED-14 | Per-peer, per-class quotas as token buckets | — | P2 |
| FED-15 | Automatic trust demotion on repeated quota breach, with operator notification | — | P2 |
| FED-16 | Peer identity is the **server public key**, not a URL | ✗ | P2 |
| FED-17 | Peers advertise which planes they serve | — | P2 |
| FED-18 | A Signal-only or Forum-only node is a supported deployment | — | P2 |
| FED-19 | `ExchangeTreeHeads` — STH gossip every ≤ 5 minutes with `TRUSTED` peers | — | P2 |
| FED-20 | Fork detection: an inconsistent peer STH triggers record, alert, and demotion | — | P2 |
| FED-21 | `PeerObservation` catches a peer showing different logs to different partners | — | P2 |
| FED-22 | `ExchangeDirectory` — peer records propagate with scope tags | — | P2 |
| FED-23 | Discovery endpoints list **all** endpoints with scopes, not just the public one | ✗ | P2 |
| FED-24 | NodeInfo 2.1 compatibility preserved | ✓ | P2 |
| FED-25 | **A node with no inbound reachability federates fully** via outbound-only streams | — | P2 |
| FED-26 | `outbound-only` configuration mode, default for home/community nodes | — | P2 |
| FED-27 | Planes never co-batched in a request, stream frame, or SSE connection | — | P2 |
| FED-28 | A node MUST NOT re-relay an envelope to the peer it received it from | — | P2 |

### What FED-03 replaces

v1 required `federationservers.status === 'approved'`, set manually by an admin. That is backwards for the threat model: it makes the system least able to grow relays at the exact moment relays matter most. TOFU with quota-bound trust levels lets a volunteer node join immediately at low reach and earn more.

### FED-25 rationale

Because `Deliver` is client-streaming and `StreamActivities` is caller-initiated server-streaming, a NATed node opens **both outbound** and federates in both directions over connections it initiated. No inbound port, no forwarding, no UPnP. This collapses most of the deployment problem for home and community nodes.

## 2. ISP availability & bridging ★ SECONDARY GOAL

| ID | Requirement | Phase |
|---|---|---|
| ISP-01 | `ReachabilityScope` (`GLOBAL`, `NATIONAL`, `ISP_LOCAL`, `LAN`, `MESH`, `RETICULUM`) threaded through endpoints, peers, and uplinks | P3 |
| ISP-02 | **Prefer the narrowest working scope** — `LAN` > `ISP_LOCAL` > `NATIONAL` > `GLOBAL` | P3 |
| ISP-03 | Same-ASN bonus in path ranking | P3 |
| ISP-04 | Per-scope metrics (attempts, successes, latency) proving narrow paths are actually used | P3 |
| ISP-05 | `UplinkManager` — multi-interface config, independent probing, state machine | P3 |
| ISP-06 | **Source-IP binding** for outbound connections per uplink | P3 |
| ISP-07 | Measured `liveScopes()` overrides configured `declaredScopes` | P3 |
| ISP-08 | Uplink state transitions logged and exported as metrics | P3 |
| ISP-09 | `PathSelector` as a pure function of (peer, uplink states, clock) — unit-testable with no network | P3 |
| ISP-10 | Exponential backoff with jitter, capped at 5 minutes | P3 |
| ISP-11 | **Bridge relay** — multi-homed node relaying between two ISP islands | P3 |
| ISP-12 | Bridging is opt-in and requires `TRUSTED` status with a peer on each side | P3 |
| ISP-13 | Relayed envelopes pass the full pipeline before relay — a verifying relay, not a repeater | P3 |
| ISP-14 | Per-pair, per-class relay quotas with **reserved capacity for classes 0–2** | P3 |
| ISP-15 | Bridges advertise `is_bridge` and `bridged_asns` so peers can prefer them during a partition | P3 |
| ISP-16 | Bridge visibility in the admin UI: bytes per direction, per class, quota headroom | P3 |
| ISP-17 | Uplink failover re-evaluates every active peer path within 30 seconds | P3 |
| ISP-18 | Switching uplinks loses **zero** queued envelopes — the queue is uplink-agnostic | P3 |
| ISP-19 | Auto re-`Announce` with the new endpoint set after a switch, then `Backfill` to close the gap | P3 |
| ISP-20 | Manual operator override: force an uplink up/down, pin a peer to an uplink | P3 |

### ISP-02 rationale

This is not a performance optimisation. A fallback path that only runs during a blackout is untested code that will fail during a blackout. Preferring the narrowest scope during *normal* operation means the ISP-local path is exercised continuously — warm, monitored, and known-good at the moment it becomes the only path. `ISP-04` exists so this can be verified rather than assumed.

### ISP-14 rationale

An emergency broadcast must cross a bridge even when a forum backlog is saturating it. Reserved capacity for classes 0–2 makes starvation structurally impossible rather than a scheduling hope.

## 3. Reachability & discovery

| ID | Requirement | Phase |
|---|---|---|
| TRN-01 | **Pre-position the peer directory** — cached continuously during normal operation | P3 |
| TRN-02 | Directory persisted durably; entries never evicted purely for age | P3 |
| TRN-03 | Baked-in per-ISP seed directory shipped with the build | P3 |
| TRN-04 | Hourly directory refresh while online | P3 |
| TRN-05 | mDNS / SSDP discovery on the local subnet | P3 |
| TRN-06 | Peer gossip via `ExchangeDirectory` | P3 |
| TRN-07 | Manual node entry in ≤ 3 taps | P3 |
| TRN-08 | QR node address scanning | P3 |
| TRN-09 | Always-visible scope indicator in the client, updating within 30 s | P3 |

**TRN-10:** All six discovery mechanisms (TRN-01, 03, 05, 06, 07, 08) MUST ship. Discovery is the single point of failure for the whole resilience story and must not have one path.

## 4. NAT traversal

| ID | Requirement | Phase |
|---|---|---|
| TRN-11 | UPnP-IGD and NAT-PMP mapping attempt at startup, with clear outcome reporting | P3 |
| TRN-12 | Continue functioning outbound-only when mapping fails | P3 |
| TRN-13 | STUN reflexive address discovery and advertisement | P3 |
| TRN-14 | CGNAT detection, surfaced in the admin UI | P3 |
| TRN-15 | Reverse-tunnel mode through a `TRUSTED` reachable peer | P3 |
| TRN-16 | Router port-forwarding documentation for common Bangladeshi consumer models, Bangla and English | P3 |

## 5. Transport abstraction

| ID | Requirement | Phase |
|---|---|---|
| TRN-17 | Every transport satisfies one `Transport` port; application code never branches on transport ID | P2 |
| TRN-18 | Adding a transport requires no change to the outbox, ingress, or application code | P2 |
| TRN-19 | A transport rejects a priority class it does not carry with `TRANSPORT_UNSUPPORTED` | P2 |
| TRN-20 | A transport never silently drops or silently fragments beyond its declared MTU | P2 |
| TRN-21 | Priority-ordered outbound queue: class 0 before class 3, then FIFO | P5 |

### Priority class transport matrix

| Class | Contents | Budget | IP | Mesh | Reticulum |
|---|---|---|---|---|---|
| 0 BROADCAST | Emergency broadcast, key revocation | ≤ 512 B | ✓ | ✓ flood | ✓ flood |
| 1 DIRECT | Messages | ≤ 1 KB | ✓ | ✓ routed | ✓ routed |
| 2 CHECKIN | Check-in, resource, missing person | ≤ 512 B | ✓ | ✓ flood | ✓ flood |
| 3 BULK | Posts, comments, votes, media, moderation | unbounded | ✓ | opportunistic | **✗ rejected** |

## 6. Mesh transport

| ID | Requirement | Phase |
|---|---|---|
| TRN-22 | WebRTC data channels between peers | P5 |
| TRN-23 | QR-exchanged SDP pairing with no network infrastructure | P5 |
| TRN-24 | Bloom-filter reconciliation of held content IDs | P5 |
| TRN-25 | Full pipeline verification before storage **and** before relay | P5 |
| TRN-26 | Hop limit (default 8) and TTL (default 72 h) on flooded classes | P5 |
| TRN-27 | Per-peer byte and envelope quotas | P5 |
| TRN-28 | `.jbpack` signed bundle export/import, verify-on-import | P5 |
| TRN-29 | BLE as a secondary carrier where the platform permits | P5 |

## 7. Reticulum ★ LOWEST PRIORITY

| ID | Requirement | Phase |
|---|---|---|
| TRN-30 | **Optional adapter behind the `Transport` port** — the system builds and passes its full suite with it absent | P6 |
| TRN-31 | Disabled by default; explicit opt-in per node and per device | P6 |
| TRN-32 | **Server-forwarding shape** (user → node over IP → RNS → LoRa) is the required shape; the user's device needs no RNS | P6 |
| TRN-33 | Separate process (Python RNS); a bridge crash must not affect the node | P6 |
| TRN-34 | Class 3 rejected with a typed error | P6 |
| TRN-35 | Fragmentation and reassembly with per-fragment integrity; partial reassembly discarded, never delivered | P6 |
| TRN-36 | `TCPInterface` demo path working with **no radio hardware** | P6 |
| TRN-37 | `RNodeInterface` configuration documented and tested for real LoRa boards | P6 |
| TRN-38 | Admin visibility: interfaces, paths, RSSI, SNR, queue depth | P6 |
| TRN-39 | *(optional)* End-device direct RNS | post-P6 |
| TRN-40 | *(optional)* RNS island ↔ IP federation bridge | post-P6 |

## 8. Client transport & availability

| ID | Requirement | Phase |
|---|---|---|
| TRN-41 | Client holds a signed, gossiped homeserver list and races candidates on startup | P3 |
| TRN-42 | Homeserver identity is the server public key, not a URL | P3 |
| TRN-43 | **Client fully static-exportable** — servable from IPFS, a USB stick, or any mirror | P1 |
| TRN-44 | No single origin's reachability is required for the app to function | P3 |
