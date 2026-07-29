# P3 — ISP Availability & Bridging ★ SECONDARY GOAL

> **Status: IN PROGRESS.** `Plans/06-CONTRACTS-TRANSPORT.md` is frozen. `proto/jagoo/v1/transport.proto`
> already carries `ReachabilityScope`, `PeerEndpoint`, `PeerRecord` and `Quota` — P3 adds **no**
> proto messages and **no** registry rows. `proto:check` staying clean is the proof the freeze held.

## 1. Why this phase exists

Federation (P2) assumes a working path between two nodes. P3 is the phase that answers *what
happens when the path is the thing that broke*: the national gateway drops, the IX goes dark, an
ISP is islanded, and the only reachable node is three hops away inside the same AS.

The mechanism is **TP-01, the narrowest-working-scope rule**, and it is not a performance
optimisation:

> A fallback path that only runs during a blackout is untested code that will fail during a
> blackout. By preferring the narrowest scope during *normal* operation, the ISP-local path is
> exercised continuously — warm, monitored, and known-good at the moment it becomes the only path.

Everything in this plan follows from that sentence. The path selector prefers `LAN` over
`ISP_LOCAL` over `NATIONAL` over `GLOBAL` **always**, not on failure; the per-scope metric
(TP-02) exists so an operator can *see* the narrow path being used rather than assume it; and the
gate (TG-03) fails if `GLOBAL` wins while `ISP_LOCAL` is alive.

## 2. Entry condition

P2's gate passes: FG-01…FG-10 green, `pnpm ops:two-node` federating in containers with separate
databases. ADR-010 (community origin) is closed, which `T3.11 BridgeRelay` depended on — relay is
exactly where the delivering peer stops being the origin, and a bridge that keyed a community on
its own server id would have re-created ID-01 one hop out.

## 3. Deliverables, by task

### Path — the spine (T3.1 → T3.5, T3.9, T3.10)

| Task | Deliverable | File |
|---|---|---|
| T3.1 | `ReachabilityScope` through endpoint, peer and uplink records | `core/domain/transport/scope.ts` |
| T3.2 | Uplink state machine: probe results → `up`/`degraded`/`down`/`unknown` | `core/domain/transport/uplink-state.ts` |
| T3.3 | Source-IP binding for outbound gRPC (**TP-08**) | `adapters/outbound/transport/uplink-resolver.ts` |
| T3.4 | `selectPath` — narrowest-working-scope + same-ASN bonus, **pure** (TP-13) | `core/domain/transport/path-selection.ts` |
| T3.5 | Endpoint failure backoff with jitter, capped at 5 min (TP-12) | `core/domain/transport/path-selection.ts` |
| T3.9 | ISP-local federation | proven by the harness, no new code |
| T3.10 | Per-scope attempt/success/latency metrics (TP-02) | `core/ports/observability.port.ts`, `core/app/path-router.ts` |

### Bridge (T3.11 → T3.14)

| Task | Deliverable | File |
|---|---|---|
| T3.11 | `BridgeRelay` — pair config, relay decision, loop prevention (BR-01…BR-05) | `core/domain/transport/bridge-policy.ts`, `core/app/bridge-relay.ts` |
| T3.12 | Per-pair, per-class quota with reserved class 0–2 capacity (BR-04) | `core/domain/transport/bridge-policy.ts` |
| T3.13 | Uplink failover — re-evaluate every peer path within 30 s, zero loss (BR-07, BR-08) | `core/app/transport-supervisor.ts` |
| T3.14 | Auto re-`Announce` + `Backfill` after a switch (BR-09) | `core/app/federation-sync.ts` (`reconnectAll`) |

### Reach (T3.15 → T3.17)

| Task | Deliverable | File |
|---|---|---|
| T3.15 | UPnP-IGD / NAT-PMP mapping, clear failure, continues outbound-only (TP-14) | `adapters/outbound/transport/nat-traversal.ts` |
| T3.16 | STUN reflexive discovery + CGNAT detection (TP-15) | `adapters/outbound/transport/nat-traversal.ts` |
| T3.17 | Reverse tunnel through a `TRUSTED` peer (TP-16) | `adapters/inbound/http/tunnel.gateway.ts`, `adapters/outbound/transport/reverse-tunnel.ts` |

### Discovery (T3.6, T3.7, T3.18, T3.19)

| Task | Deliverable | File |
|---|---|---|
| T3.6 | Durable client peer directory, hourly refresh, never age-evicted (TP-05, TP-06) | `frontend/src/data/peer-directory.ts` |
| T3.7 | Baked-in per-ISP seed directory (TP-07) | `frontend/src/data/seed-directory.ts` |
| T3.18 | mDNS / SSDP local discovery | `adapters/outbound/transport/local-discovery.ts` |
| T3.19 | Manual node entry ≤ 3 taps + QR node address (TP-19) | `frontend/src/features/connectivity/` |

### Surfaces and docs (T3.20 → T3.22)

| Task | Deliverable | File |
|---|---|---|
| T3.20 | Always-visible scope indicator in the client (TG-10) | `frontend/src/features/connectivity/scope-indicator.tsx` |
| T3.21 | Bridge visibility in the admin surface (BR-06) | `adapters/inbound/http/transport.controller.ts` |
| T3.22 | Router port-forwarding docs, Bangla + English (TP-17) | `ops/docs/PORT-FORWARDING.md` |

## 4. Test infrastructure — T3.8, and why it is Docker and not netns

`Plans/08` §P3 specifies **Linux network namespaces with simulated ASNs and iptables rules**. That
is the right shape and the wrong implementation for this repository: the development machine is
macOS, CI runners vary, and a gate that only runs on one operating system is a gate that gets
skipped. Docker networks give the same property — genuinely separate L2 segments with no route
between them — on every platform, and `internal: true` is a stronger isolation statement than an
iptables rule because there is no interface to misconfigure. **ADR-015** records this.

Two harnesses, and both are required, because L-18 and L-20 each cost a session:

- **`backend/src/transport/isp.e2e.spec.ts`** — in-process, real sockets on loopback aliases,
  covering TG-01…TG-10 as unit-grade assertions. This is the gate that runs on every commit.
- **`ops/isp-compose.yml` + `ops/isp-gate.mjs`** — four containers on three Docker networks
  (`isp-a` internal, `isp-b` internal, `ix` for the national exchange), with the bridge node
  multi-homed on both islands. This is the artefact gate: *the in-process suite proves the logic;
  only the container proves the deployment.*

```
   network: isp-a (internal, asn 64501)      network: isp-b (internal, asn 64502)
   ┌───────────────────────┐                 ┌───────────────────────┐
   │  node-a1     node-a2  │                 │        node-b1        │
   └───────────┬───────────┘                 └───────────┬───────────┘
               │                                         │
               └───────────────┐         ┌───────────────┘
                               ▼         ▼
                        ┌────────────────────────┐
                        │  jb-bridge             │
                        │  eth0 → isp-a (64501)  │
                        │  eth1 → isp-b (64502)  │
                        └────────────────────────┘
```

Cutting the IX is `docker network disconnect`; killing an uplink is the same call against one
island. No physical multi-ISP setup, no privileged containers, no host network changes.

## 5. Exit gate — TG-01 … TG-10

| ID | Criterion | Evidence |
|---|---|---:|
| TG-01 | Two uplinks bind outbound connections to the correct source IP per peer | ☐ |
| TG-02 | `GLOBAL` blocked, two nodes on one simulated ASN federate over `ISP_LOCAL` | ☐ |
| TG-03 | Path selector demonstrably prefers `ISP_LOCAL` over `NATIONAL`, metric confirms | ☐ |
| TG-04 | Bridge merges two isolated ASN islands; a post on island A reaches island B | ☐ |
| TG-05 | Class-0 broadcast crosses the bridge while a bulk backlog is queued | ☐ |
| TG-06 | Killing uplink A re-establishes affected paths on B within 30 s, zero loss | ☐ |
| TG-07 | `Backfill` after an uplink switch closes the gap exactly, no duplicates | ☐ |
| TG-08 | An outbound-only node behind simulated CGNAT federates fully | ☐ |
| TG-09 | Cold client, seed list only, connects on `ISP_LOCAL` with `GLOBAL` blocked | ☐ |
| TG-10 | Current scope visible in the client UI, updates within 30 s of a change | ☐ |

## 6. Rules this phase must not break

- **AR-12 stays true one rung up.** Federation is off unless configured; **transport is off unless
  configured**. A node with no `UPLINKS` behaves exactly as it did in P2 — one implicit uplink,
  every scope, no probing, no binding, no bridge.
- **No branch on transport ID** outside the transport layer (NFR-M03, lint-enforced). The bridge
  decides on *uplinks and classes*, never on `transport.id`.
- **A bridge is a verifying relay, not a repeater** (BR-02). Relayed envelopes have already run all
  19 steps on arrival; the bridge only decides fanout.
- **No row ID and no node-local identifier in anything relayed** (ID-01, ADR-010). A bridge relays
  the peer's exact bytes — the passthrough codec from ADR-008 §1 is what makes that true, and the
  bridge must not touch it.
- **Anti-abuse is charged at origin** (ADR-011). A bridged envelope pays nothing on the bridge; the
  bridge's protection is its per-pair, per-class quota.

## 7. Task status

| Tasks | Status |
|---|---:|
| T3.1–T3.5 scopes, uplinks, source binding, selector, backoff | done |
| T3.6–T3.7 client directory cache and seed list | done |
| T3.8 Docker island harness | done |
| T3.9–T3.10 ISP-local federation and scope metrics | done |
| T3.11–T3.14 bridge relay, quotas, failover, re-announce | done |
| T3.15–T3.17 UPnP/NAT-PMP, STUN/CGNAT, reverse tunnel | done |
| T3.18–T3.19 mDNS/SSDP, manual entry and QR | done |
| T3.20–T3.22 scope indicator, bridge visibility, router docs | done |
