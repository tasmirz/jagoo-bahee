# Jagoo Bahee v2 — Plan Overview & Index

> **Read this first.** It fixes the goal order, the two-plane identity model, and the resilience ladder that every other document depends on.

---

## 1. Goal priority (normative)

These are ordered. A later goal must never be built at the cost of an earlier one, and no later goal may become a dependency of an earlier one.

| # | Goal | Priority | Phase |
|---|---|---|---|
| **1** | **Federation works.** Two or more independent instances exchange content, verify it, and project it. | ★ **Primary** | P2 |
| **2** | **ISP-level availability and ISP bridging.** Instances reachable within a single ISP with no national gateway; multi-homed nodes merge two ISP islands. | ★ **Secondary** | P3 |
| **3** | Broadcast (subscriber pattern) and identified messaging, over ordinary IP. | Tertiary | P4 |
| **4** | Offline store-and-forward — outbox, local mesh. | Low | P5 |
| **5** | **Reticulum / LoRa.** Opt-in transport for messaging and broadcast. | **Lowest** | P6 |

**Requirement G-01:** Reticulum is an **optional adapter behind a transport port**, never a dependency. The system must be complete and demonstrable with Reticulum absent from the build.
**Requirement G-02:** The primary transport is ordinary networking. Reticulum is opt-in per user and per node.
**Requirement G-03:** All contracts (documents 02–06) are frozen **before** Phase 1 implementation begins. Contract churn during implementation is the failure mode this plan exists to prevent.

---

## 2. The two identity planes

This is the central architectural change and it propagates through every contract.

| | **Plane A — FORUM** | **Plane B — SIGNAL** |
|---|---|---|
| Purpose | Community discussion | Emergency broadcast + person-to-person messaging |
| Identity | **Pseudonymous / anonymous.** A key with no real-world binding. | **Identified.** A key bound to a verifiable claim about a person or organisation. |
| Why that identity | Content is trusted because it is *signed*, not because of *who* signed it | Content matters *precisely because* of who signed it — you subscribe to a channel because you know the broadcaster |
| Unlinkability | Per-community derived keys; anonymous credentials; nullifier-based rate limits | None wanted — the whole point is being recognised |
| Contents | Posts, comments, votes, communities, moderation, roles, awards, pseudonymous DMs | Channels, broadcasts, subscriptions, identified messaging |
| Abuse control | PoW + blind credentials + epoch nullifiers | Subscription consent + channel verification + reputation |
| Transport class | Bulk | Priority (small, floods first) |

**The separation is a security requirement, not an organisational one.** If a person's known broadcast identity were linkable to their forum identity, publishing under their real name as a relief coordinator would deanonymise every forum post they ever made. Document `01-IDENTITY-PLANES.md` specifies the invariants that make this linkage impossible.

---

## 3. Resilience ladder

The system degrades one rung at a time. Each rung is a real operating mode with its own reachability scope, not a theoretical fallback.

| Rung | Condition | Reachability scope | What works |
|---|---|---|---|
| **L0** | Normal internet | `GLOBAL` | Everything |
| **L1** | International transit cut, domestic IX (BDIX) alive | `NATIONAL` | Everything between domestic instances |
| **L2** | IX down; each ISP is an island | `ISP_LOCAL` | Full function *within* each ISP; islands isolated |
| **L3** | Islands bridged by a multi-homed node | `ISP_LOCAL` ×2 | Islands merge via a node with two ISP uplinks |
| **L4** | No wide-area IP; local networks only | `LAN` / `MESH` | Local instance + phone-to-phone relay |
| **L5** | No IP at all | `RETICULUM` | Broadcast + messaging over LoRa/packet radio |

**Requirement G-04 — the fallback path must be the primary path whenever it works.** Path selection prefers the *narrowest* working scope (`LAN` > `ISP_LOCAL` > `NATIONAL` > `GLOBAL`). This is not just an optimisation: it means the resilience path is exercised continuously during normal operation, so it is warm and tested at the moment it becomes the only path. Code that only runs during a blackout is code that fails during a blackout.

**Requirement G-05 — pre-position the peer directory.** Peer endpoints tagged with scope, ASN, and ISP must be cached continuously during normal operation. When the gateway drops, the ISP-local addresses are already known. Discovery cannot depend on the network that just failed.

---

## 4. Document index

| File | Contents | Frozen before |
|---|---|---|
| `00-OVERVIEW.md` | This file — goals, planes, ladder, phase map | — |
| `01-IDENTITY-PLANES.md` | The two planes, key hierarchies, separation invariants, channel verification | P1 |
| `02-CONTRACTS-CORE.md` | Envelope, canonical encoding, IDs, receipts, errors, validation pipeline | **P1** |
| `03-CONTRACTS-FORUM.md` | Plane A bodies, domain registry, read API | **P1** |
| `04-CONTRACTS-SIGNAL.md` | Plane B — channels, subscriptions, broadcasts, identified messaging | **P1** |
| `05-CONTRACTS-FEDERATION.md` | Server↔server gRPC, TOFU trust, peer directory | **P2** |
| `06-CONTRACTS-TRANSPORT.md` | Transport ports, reachability scopes, uplinks, ISP bridging, Reticulum adapter | **P2** |
| `07-ARCHITECTURE.md` | Hexagonal layout, ports & adapters, plugin registry, SOLID mapping | P1 |
| `08-PHASES.md` | Phase definitions, scope, exit gates, demos | — |
| `09-TASKS.md` | Task backlog with IDs, dependencies, acceptance criteria | — |
| `SYSTEM-REQUIREMENTS.md` | **Feature catalogue** — §11 remains the authoritative list of every v1 feature carried forward plus new ones | — |

**Relationship to `SYSTEM-REQUIREMENTS.md`:** its §11 feature inventory (FEATURE IDs `AUTH-*`, `USR-*`, `COM-*`, `PST-*`, …) stays authoritative and is referenced throughout. Its §4 (identity), §7 (transport), and §14 (build order) are **superseded** by `01-IDENTITY-PLANES.md`, `06-CONTRACTS-TRANSPORT.md`, and `08-PHASES.md` respectively.

---

## 5. Phase map

```
P0  Contracts & Skeleton ────────────────────────────────┐
     proto/ frozen, codegen, cross-language vectors,     │
     module skeleton with ports & adapters               │
                                                          ▼
P1  Core Node & Forum Plane (single instance) ───────────┐
     ingress pipeline, projections, read API,            │
     forum feature parity, web client                    │
                                                          ▼
P2  ★ FEDERATION (PRIMARY GOAL) ─────────────────────────┐
     gRPC announce/deliver/backfill/stream,              │
     TOFU trust, peer directory, outbound-only mode      │
                                                          ▼
P3  ★ ISP AVAILABILITY & BRIDGING (SECONDARY GOAL) ──────┐
     uplinks, reachability scopes, path selection,       │
     multi-homed bridge relay, NAT traversal,            │
     pre-positioned peer directory                       │
                                                          ▼
P4  Signal Plane over IP ────────────────────────────────┐
     channels, subscriptions, broadcasts,                │
     identified E2EE messaging                           │
                                                          ▼
P5  Offline store-and-forward ───────────────────────────┐
     outbox, service worker sync, local mesh             │
                                                          ▼
P6  Reticulum / LoRa (opt-in adapter)
     bridge sidecar, end-device RNS, server forwarding
```

**Gate rule:** a phase may not start until the previous phase's exit gate (see `08-PHASES.md`) passes. The one permitted exception is P4, which may begin in parallel with P3 once P2's gate passes, because the Signal plane depends on federation but not on ISP bridging.

---

## 6. Reticulum's place in the design

The user requirement is explicit: Reticulum is last, optional, and must not shape the rest of the system. Three usage shapes are planned, all behind the same `Transport` port:

| Shape | Path | Who runs RNS |
|---|---|---|
| **Server forwarding** *(default)* | end user → server (IP) → RNS → LoRa | Server only. The user's device needs nothing. |
| **End-device direct** *(opt-in)* | device (RNS) → LoRa | User installs/enables the RNS stack |
| **Bridge relay** | RNS island ↔ server ↔ IP federation | A node bridging radio and IP |

**Requirement G-06:** The server-forwarding shape is the default and the only one required for the P6 exit gate. End-device RNS is opt-in and may ship later.
**Requirement G-07:** Only `BROADCAST`, `DIRECT`, and `CHECKIN` priority classes may traverse Reticulum. Bulk forum traffic is rejected at the adapter with a typed error — a LoRa link cannot carry a forum feed, and attempting it starves the emergency channel.

---

## 7. Glossary

| Term | Meaning |
|---|---|
| **Plane** | An identity domain — `FORUM` (anonymous) or `SIGNAL` (identified). Carried in the signed envelope. |
| **Envelope** | The universal signed unit. Every mutation in the system is one. |
| **Domain** | A string like `jb:post:create:v1` identifying what an envelope means. Bound to exactly one plane. |
| **Content ID** | `jb1` + base32(SHA-256(canonical envelope bytes)). Globally stable. |
| **Channel** | A Signal-plane broadcast publisher with a verifiable identity. |
| **Scope** | Reachability class of a network path — `GLOBAL`, `NATIONAL`, `ISP_LOCAL`, `LAN`, `MESH`, `RETICULUM`. |
| **Uplink** | A node's network interface, tagged with ASN, ISP, and the scopes it reaches. |
| **Bridge node** | A multi-homed node relaying between two ISP islands. |
| **Port / Adapter** | Hexagonal architecture — a port is an interface owned by the core; an adapter is a swappable implementation. |
| **BDIX** | Bangladesh Internet Exchange — domestic peering that can survive an international transit cut. |
