# 06 — Transport Contracts, ISP Availability & Bridging

> **Frozen before P2, implemented in P3 (ISP work) and P6 (Reticulum).** This is the **secondary goal**: instances reachable within one ISP with no national gateway, and multi-homed nodes merging two ISP islands.

---

## 1. Reachability scopes

The core abstraction. Every endpoint, every uplink, and every path decision is expressed in these terms.

```protobuf
enum ReachabilityScope {
  SCOPE_UNSPECIFIED = 0;
  GLOBAL    = 1;   // reachable from the public internet
  NATIONAL  = 2;   // reachable via domestic peering / IX (e.g. BDIX)
  ISP_LOCAL = 3;   // reachable only within one ISP's AS
  LAN       = 4;   // same local network segment
  MESH      = 5;   // WebRTC / BLE peer-to-peer
  RETICULUM = 6;   // RNS destination hash
}
```

### 1.1 The narrowest-working-scope rule

**Requirement TP-01 — prefer the narrowest scope that works.**

Ranking, best first: `LAN` → `ISP_LOCAL` → `NATIONAL` → `GLOBAL` → `MESH` → `RETICULUM`.

This is not a performance optimisation. It is the central resilience mechanism:

> A fallback path that only runs during a blackout is untested code that will fail during a blackout. By preferring the narrowest scope during *normal* operation, the ISP-local path is exercised continuously — it is warm, monitored, and known-good at the moment it becomes the only path.

A secondary benefit is real: intra-ISP routing is faster and cheaper than transiting the IX or international links.

**Requirement TP-02:** The node MUST export a metric per scope (attempts, successes, latency) so operators can see that the narrow paths are actually being used, not silently failing over to `GLOBAL`.

---

## 2. Transport port

Every transport satisfies one interface. The application layer never branches on which transport it is using — that is Liskov substitution applied to the network stack.

```typescript
interface Transport {
  readonly id: string;                    // "https" | "grpc" | "mesh" | "reticulum" | "qr"
  readonly scopes: ReachabilityScope[];   // scopes this transport can reach
  readonly classes: Priority[];           // priority classes it will carry
  readonly mtu: number;                   // max envelope bytes, 0 = unbounded

  available(): Promise<boolean>;
  send(env: EncodedEnvelope, target: PeerRef): Promise<SendOutcome>;
  subscribe(onEnvelope: (e: EncodedEnvelope, meta: InboundMeta) => void): Unsubscribe;

  /** Bloom-filter reconciliation. Optional — only gossip transports implement it. */
  reconcile?(peer: PeerRef, have: BloomFilter): Promise<string[]>;

  /** Liveness and quality, used by the path selector. */
  probe(target: PeerRef): Promise<ProbeResult>;
}

type SendOutcome =
  | { status: "receipted"; receipt: Receipt }    // a node accepted and witnessed it
  | { status: "relayed";  peers: number }        // handed to peers, no receipt yet
  | { status: "queued" }                          // no path; held in the outbox
  | { status: "rejected"; error: EnvelopeError };

interface ProbeResult { reachable: boolean; rttMs?: number; scope: ReachabilityScope; via: string; }
interface InboundMeta { transportId: string; scope: ReachabilityScope; peer?: PeerRef; hops?: number; }
```

**Requirement TP-03:** Adding a transport MUST NOT require modifying the outbox, the ingress pipeline, or any application code. Transports are registered adapters (`07-ARCHITECTURE.md` §3).
**Requirement TP-04:** A transport MUST reject an envelope whose priority class it does not carry, with `TRANSPORT_UNSUPPORTED`. It MUST NOT silently drop or silently fragment beyond its declared MTU.

---

## 3. Endpoint and peer records

```protobuf
message PeerEndpoint {
  string uri              = 1;   // https://… | grpc://… | rns://<dest_hash> | mesh://<peer_id>
  ReachabilityScope scope = 2;
  uint32 asn              = 3;   // autonomous system number
  string isp_name         = 4;
  string region           = 5;   // free-form: "dhaka", "chittagong"
  bool   inbound_capable  = 6;   // false ⇒ this peer must initiate
  int64  last_ok_at_ms    = 7;
  uint32 rtt_ms           = 8;
  uint32 consecutive_failures = 9;
}

message PeerRecord {
  bytes  server_key = 1;
  string display_name = 2;
  repeated PeerEndpoint endpoints = 3;
  TrustLevel trust = 4;
  repeated bytes vouched_by = 5;
  repeated string communities = 6;
  repeated string channels    = 7;
  repeated Plane  planes      = 8;
  bool   is_bridge   = 9;        // multi-homed, relays between islands
  repeated uint32 bridged_asns = 10;
  int64  last_seen_ms = 11;
}
```

**Requirement TP-05 — pre-position the directory.** Peer records MUST be cached continuously during normal operation, on both nodes and clients. When the gateway drops, the ISP-local addresses must already be known. **Discovery cannot depend on the network that just failed.**

**Requirement TP-06:** The client MUST persist its peer directory to durable storage (IndexedDB / disk), refresh it at least hourly while online, and never evict entries purely for age — a stale ISP-local address is infinitely more useful than no address.

**Requirement TP-07:** The application ships a **seed directory** of known nodes per major ISP, baked into the build. A first-run client during a blackout still has somewhere to try.

---

## 4. Uplinks — the node's side

A node declares its network interfaces and what each can reach.

```yaml
# node.config.yaml
uplinks:
  - id: isp-a
    interface: eth0
    source_ip: 203.0.113.10
    asn: 12345
    isp_name: "ISP-A"
    scopes: [GLOBAL, NATIONAL, ISP_LOCAL]
    inbound_port: 8443          # omit ⇒ outbound-only on this uplink
    priority: 1

  - id: isp-b
    interface: eth1
    source_ip: 198.51.100.20
    asn: 67890
    isp_name: "ISP-B"
    scopes: [NATIONAL, ISP_LOCAL]
    inbound_port: 8443
    priority: 2

  - id: lan
    interface: eth2
    source_ip: 192.168.1.10
    scopes: [LAN]
    inbound_port: 8443
    priority: 0                 # tried first

bridge:
  enabled: true
  relay_between: [isp-a, isp-b]
  classes: [BROADCAST, DIRECT, CHECKIN, BULK]
  quota_bytes_per_min: 5000000
  quota_envelopes_per_min: 2000

probe:
  targets:
    GLOBAL:    ["https://1.1.1.1", "https://8.8.8.8"]
    NATIONAL:  ["https://<bdix-peer>"]
    ISP_LOCAL: ["<isp-gateway-or-known-node>"]
  interval_seconds: 30
  failure_threshold: 3
```

```typescript
interface Uplink {
  readonly id: string;
  readonly interfaceName: string;
  readonly sourceIp: string;
  readonly asn?: number;
  readonly ispName?: string;
  readonly declaredScopes: ReachabilityScope[];
  readonly inboundPort?: number;
  readonly priority: number;

  /** Live probe result — which scopes are ACTUALLY reachable right now. */
  liveScopes(): Promise<ReachabilityScope[]>;
  state(): UplinkState;
}

type UplinkState = "up" | "degraded" | "down" | "unknown";

interface UplinkManager {
  uplinks(): Uplink[];
  /** Uplinks that can currently reach a given scope. */
  forScope(scope: ReachabilityScope): Uplink[];
  /** Bind an outbound socket to a specific uplink's source address. */
  bind(uplinkId: string, socket: Socket): void;
  onChange(cb: (u: Uplink, from: UplinkState, to: UplinkState) => void): Unsubscribe;
}
```

**Requirement TP-08:** Outbound federation connections MUST be bound to a specific uplink's source IP. Without source binding, the OS routing table picks the interface and multi-homing does not work.
**Requirement TP-09:** Each uplink is probed independently. `declaredScopes` is configuration; `liveScopes()` is measured truth, and the path selector uses the measured value.
**Requirement TP-10:** Uplink state transitions MUST be logged and exported as metrics. "The IX went down at 03:14" is operationally critical information.

---

## 5. Path selection algorithm (normative)

```
selectPath(peer: PeerRecord) → { endpoint, uplink } | null

 1. live ← union of uplink.liveScopes() over all uplinks in state "up"|"degraded"
 2. candidates ← peer.endpoints where endpoint.scope ∈ live
 3. drop candidates where endpoint.consecutive_failures ≥ 3
      AND now − endpoint.last_ok_at_ms < backoff(consecutive_failures)
 4. rank candidates by:
      a. scope rank ASC   (LAN=0, ISP_LOCAL=1, NATIONAL=2, GLOBAL=3, MESH=4, RETICULUM=5)
      b. same-ASN bonus   (endpoint.asn == some uplink.asn ⇒ rank − 0.5)
      c. rtt_ms ASC
      d. last_ok_at_ms DESC
 5. for each candidate in rank order:
      uplink ← the highest-priority uplink whose liveScopes ∋ endpoint.scope
                 (prefer uplink.asn == endpoint.asn)
      attempt connection bound to uplink.sourceIp
      on success  → record last_ok_at, reset failures, return
      on failure  → increment consecutive_failures, continue
 6. if all fail and peer.inbound_capable == false:
      → wait for the peer to initiate (outbound-only peers connect to us)
 7. return null → caller enqueues to the outbox
```

**Requirement TP-11:** Step 4b — the same-ASN bonus — is what makes ISP-local paths win over merely national ones when both are alive. This is the rule that keeps the resilience path warm (TP-01).
**Requirement TP-12:** Failure backoff is exponential with jitter, capped at 5 minutes. A dead endpoint must not be retried into a hot loop, and a recovering ISP must not see a thundering herd.
**Requirement TP-13:** Path selection MUST be a pure function of (peer record, uplink states, clock) so it is unit-testable without a network.

---

## 6. ISP bridging

This is the L3 rung of the resilience ladder: two ISP islands, merged by a node that sits on both.

```
        ISP-A island                          ISP-B island
   ┌──────────────────────┐              ┌──────────────────────┐
   │  node-a1 ── node-a2  │              │  node-b1 ── node-b2  │
   │      \        /      │              │      \        /      │
   │       node-a3        │              │       node-b3        │
   └──────────┬───────────┘              └───────────┬──────────┘
              │ ISP_LOCAL (asn 12345)                │ ISP_LOCAL (asn 67890)
              │                                      │
              └────────────┐            ┌────────────┘
                           ▼            ▼
                    ┌──────────────────────────┐
                    │   BRIDGE NODE            │
                    │   eth0 → ISP-A (12345)   │
                    │   eth1 → ISP-B (67890)   │
                    │   relay_between: [a, b]  │
                    └──────────────────────────┘
```

A bridge node is an ordinary federated node with two uplinks and a relay policy. It federates with ISP-A peers over `eth0` and ISP-B peers over `eth1`, and re-delivers envelopes across.

```typescript
interface BridgeRelay {
  readonly enabled: boolean;
  readonly pairs: [uplinkId: string, uplinkId: string][];
  readonly classes: Priority[];
  readonly quota: Quota;

  /** Called after an envelope is accepted from `viaUplink`. */
  shouldRelay(env: ParsedEnvelope, viaUplink: string): RelayDecision;
  relay(env: ParsedEnvelope, toUplink: string): Promise<void>;
  stats(): BridgeStats;
}

type RelayDecision =
  | { relay: true; toUplinks: string[] }
  | { relay: false; reason: "class_excluded" | "quota" | "loop" | "same_island" | "disabled" };
```

### 6.1 Bridging rules

**Requirement BR-01:** Bridging is **opt-in** per node and requires `TRUSTED` status with at least one peer on each side. An untrusted node cannot volunteer to become a chokepoint.
**Requirement BR-02:** Relayed envelopes go through the **full** validation pipeline before relay. A bridge is not a dumb repeater; it is a verifying relay.
**Requirement BR-03:** Loop prevention is inherent via `content_id` dedupe. A bridge additionally MUST NOT relay back to the uplink it received from.
**Requirement BR-04:** Relay quotas are per uplink pair and per class. Class 0–2 have reserved capacity that bulk traffic cannot consume — the emergency channel must never be starved by a forum backlog.
**Requirement BR-05:** A bridge advertises `is_bridge: true` and `bridged_asns` in its `PeerRecord`, so peers know a cross-island path exists and can prefer it during a partition.
**Requirement BR-06:** Bridge operation MUST be visible in the admin UI: bytes relayed per direction, per class, per hour, and current quota headroom.

### 6.2 Interface switching

The user's scenario: the national gateway or IX drops, and the operator switches between two ISP interfaces to merge the islands.

**Requirement BR-07:** Uplink state changes MUST trigger re-evaluation of every active peer path within 30 seconds. Existing streams on a failed uplink are torn down and re-established on a live one.
**Requirement BR-08:** Switching uplinks MUST NOT lose queued envelopes. The outbound queue is durable and uplink-agnostic; only the path changes.
**Requirement BR-09:** After a switch, affected peers are automatically re-`Announce`d with the new endpoint set, and `Backfill` runs to close any gap created during the transition.
**Requirement BR-10:** A manual operator override MUST exist — force an uplink up/down, force a peer onto a specific uplink — for situations the probes cannot detect.

---

## 7. Inbound reachability and port forwarding

| Deployment | Inbound port | Mechanism |
|---|---|---|
| VPS with a public IP | Yes | Direct bind |
| Home/office node behind NAT, serving only federation | **No** | Outbound-only streams (`05-CONTRACTS-FEDERATION.md` §5) |
| Home node also serving browser clients on its LAN | LAN only | Bind to the LAN interface |
| Home node serving clients across the ISP | Yes | Manual port forward, or UPnP-IGD / NAT-PMP |
| Node behind CGNAT serving clients | Not possible directly | Reverse tunnel through a `TRUSTED` reachable peer |

**Requirement TP-14:** The node MUST attempt UPnP-IGD and NAT-PMP port mapping at startup when configured to, report the outcome clearly, and continue functioning outbound-only if mapping fails.
**Requirement TP-15:** The node MUST perform STUN-style reflexive address discovery to learn and advertise its externally-visible address, and MUST detect when it is behind CGNAT (reflexive address in a shared-address range) and say so in the admin UI.
**Requirement TP-16:** A reverse-tunnel mode MUST exist: an unreachable node maintains an outbound stream to a `TRUSTED` peer, which accepts client traffic on its behalf. This is the last resort before mesh.
**Requirement TP-17:** Port-forwarding setup MUST be documented with concrete steps for common Bangladeshi consumer routers, in Bangla and English. This is a deployment blocker, not a nice-to-have.

---

## 8. ISP-local discovery

When the IX is down, how does a client find nodes on its own ISP?

| Method | Works during | Notes |
|---|---|---|
| **Pre-positioned directory cache** | Any outage | Primary mechanism (TP-05). Cached before the outage. |
| **Baked-in seed list** | First run during an outage | Per-ISP known nodes shipped with the build (TP-07) |
| **mDNS / SSDP on the local subnet** | LAN-scope outages | Finds a node on the same network segment |
| **Peer gossip via `DirectoryExchange`** | Partial outages | Any reachable node shares what it knows |
| **Manual entry** | Always | User types an address heard by word of mouth. Must be easy. |
| **QR code** | Always | Scan a node address from a poster or another phone |

**Requirement TP-18:** All six mechanisms MUST be implemented. Discovery is the single point of failure for the whole resilience story, and it must not have one path.
**Requirement TP-19:** Manual node entry MUST be prominent and take at most three taps. During a blackout, word-of-mouth address sharing is the highest-bandwidth channel available.
**Requirement TP-20:** The client MUST display which scope it is currently connected on (`GLOBAL` / `NATIONAL` / `ISP_LOCAL` / `LAN` / `MESH`), always visible, never buried in settings. People need to know what network they are on.

---

## 9. Reticulum adapter (P6 — lowest priority)

**Requirement RT-01:** Reticulum is an **optional adapter behind the `Transport` port**. The system MUST build, run, and pass its full acceptance suite with the Reticulum adapter absent.

### 9.1 Three usage shapes

| Shape | Path | Who runs RNS | Priority |
|---|---|---|---|
| **Server forwarding** *(default)* | end user → node (IP) → RNS → LoRa | Node only | **P6 required** |
| **End-device direct** *(opt-in)* | device (RNS) → LoRa | User installs/enables RNS | P6 optional |
| **Bridge relay** | RNS island ↔ node ↔ IP federation | A bridging node | P6 optional |

The default shape means a user needs **nothing** — no radio, no RNS install. Their phone talks IP to a node, and the node forwards to the radio network. This is why it is the required shape.

### 9.2 Bridge contract

```protobuf
// proto/jagoo/v1/bridge.proto
service ReticulumBridge {
  rpc Announce(AnnounceReq) returns (AnnounceResp);            // publish a destination
  rpc Send(SendReq) returns (SendResp);                        // class 0-2 only
  rpc Receive(ReceiveReq) returns (stream InboundEnvelope);
  rpc Status(StatusReq) returns (BridgeStatus);                // links, paths, RSSI, SNR
}

message SendReq {
  bytes  envelope         = 1;
  string destination_hash = 2;   // "" ⇒ broadcast to the announced destination
  Priority priority       = 3;
}

message BridgeStatus {
  repeated RnsInterface interfaces = 1;
  repeated RnsPath paths = 2;
  uint32 queue_depth = 3;
}
message RnsInterface { string name=1; string kind=2; bool up=3; int32 rssi=4; int32 snr=5; uint64 tx_bytes=6; uint64 rx_bytes=7; }
message RnsPath { string destination_hash=1; uint32 hops=2; int64 last_seen_ms=3; }
```

**Requirement RT-02:** The bridge MUST reject `BULK` priority with `TRANSPORT_UNSUPPORTED`. A LoRa link cannot carry a forum feed, and attempting it starves the emergency channel.
**Requirement RT-03:** The bridge MUST fragment and reassemble envelopes exceeding the link MTU, with per-fragment integrity so a partial reassembly is discarded rather than delivered.
**Requirement RT-04:** A demo path over RNS `TCPInterface` MUST work with **no radio hardware**. `RNodeInterface` configuration for real LoRa boards MUST be documented and tested separately.
**Requirement RT-05:** The bridge is a separate process (Python RNS — there is no TypeScript implementation). A bridge crash MUST NOT affect the node.
**Requirement RT-06:** Reticulum is disabled by default. Enabling it is an explicit operator action for nodes and an explicit user action for devices.

---

## 10. Transport exit gates

**P3 — ISP availability and bridging (secondary goal):**

| ID | Criterion |
|---|---|
| TG-01 | Node with two uplinks binds outbound connections to the correct source IP per peer |
| TG-02 | With `GLOBAL` blocked at the firewall, two nodes on the same simulated ASN federate over `ISP_LOCAL` |
| TG-03 | Path selector demonstrably prefers `ISP_LOCAL` over `NATIONAL` when both are alive (metric confirms) |
| TG-04 | Bridge node merges two isolated ASN islands; a post on island A reaches island B |
| TG-05 | Class-0 broadcast crosses the bridge while a bulk backlog is queued — reserved capacity holds |
| TG-06 | Killing uplink A re-establishes affected peer paths on uplink B within 30 s, with zero envelope loss |
| TG-07 | `Backfill` after an uplink switch closes the gap exactly, no duplicates |
| TG-08 | An outbound-only node behind simulated CGNAT federates fully |
| TG-09 | Client with a cleared cache, using only the baked-in seed list, connects on `ISP_LOCAL` with `GLOBAL` blocked |
| TG-10 | Current scope is visible in the client UI and updates within 30 s of a change |

**P6 — Reticulum (lowest priority):**

| ID | Criterion |
|---|---|
| RG-01 | Two RNS nodes over `TCPInterface`, no browser able to reach any backend: a broadcast from node A appears at node B |
| RG-02 | Severing the link mid-transfer and reconnecting completes delivery via store-and-forward |
| RG-03 | A `BULK` envelope submitted to the bridge is rejected with a typed error |
| RG-04 | The full suite passes with the Reticulum adapter removed from the build |
