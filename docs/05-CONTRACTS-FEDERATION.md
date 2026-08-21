# 05 — Federation Contracts

> **Frozen before P2. This is the PRIMARY goal.** Server↔server only; browsers use REST/JSON.

---

## 1. Why gRPC here and not for browsers

| | Server↔server | Browser↔server |
|---|---|---|
| Number of links | Few, long-lived, operator-controlled | Many, short-lived, hostile networks |
| Streaming needed | Yes — live push, backfill, backpressure | No — request/response suffices |
| Fingerprinting risk | Low — operators choose their peers | **High** — HTTP/2 has a distinctive TLS and frame fingerprint |
| Loss tolerance | Links are usually decent | Must survive lossy mobile links; HTTP/2 degrades badly |
| Extra infrastructure | None | gRPC-web needs an Envoy shim, and still no bidi streaming |

**Decision:** gRPC for federation, plain REST/JSON over HTTPS for clients. Compact binary framing also matters for satellite and HF backhaul between instances.

---

## 2. `proto/jagoo/v1/federation.proto`

```protobuf
syntax = "proto3";
package jagoo.v1;

service Federation {
  // Mutual key exchange and capability advertisement. TOFU on first contact.
  rpc Announce(AnnounceRequest) returns (AnnounceResponse);

  // Peer pushes to us, with flow control. Client-streaming: a NATed node can
  // use this with NO inbound port at all.
  rpc Deliver(stream Envelope) returns (DeliverAck);

  // We pull live updates from a peer. Long-lived server-streaming.
  rpc StreamActivities(StreamRequest) returns (stream Envelope);

  // Catch-up after a partition. Resumable by log index.
  rpc Backfill(BackfillRequest) returns (stream Envelope);

  // Transparency gossip — detects a peer forking its own log.
  rpc ExchangeTreeHeads(TreeHeadExchange) returns (TreeHeadExchange);

  // Endpoint and reachability refresh. Used heavily in P3 (ISP bridging).
  rpc ExchangeDirectory(DirectoryExchange) returns (DirectoryExchange);
}

// ── Handshake ─────────────────────────────────────────────────────────────
message AnnounceRequest {
  bytes  server_key       = 1;
  string display_name     = 2;
  string software         = 3;
  string version          = 4;
  repeated PeerEndpoint endpoints   = 5;   // see 06-CONTRACTS-TRANSPORT §3
  repeated string communities       = 6;   // forum communities hosted
  repeated string channels          = 7;   // signal channels hosted
  repeated Plane  planes            = 8;   // which planes this node serves
  repeated Priority accepted_classes= 9;
  SignedTreeHead current_sth        = 10;
  int64  timestamp_ms               = 11;
  bytes  nonce                      = 12;
  bytes  signature                  = 13;  // over fields 1..12
}

message AnnounceResponse {
  bytes      server_key = 1;
  TrustLevel assigned   = 2;
  repeated PeerEndpoint endpoints = 3;
  repeated ServerVouch vouches    = 4;
  Quota      granted_quota        = 5;
  SignedTreeHead current_sth      = 6;
  bytes      signature            = 7;
}

// ── Delivery ──────────────────────────────────────────────────────────────
message DeliverAck {
  repeated string    accepted  = 1;   // content_ids
  repeated Rejection rejected  = 2;
  uint32 backpressure_hint_ms  = 3;
  uint64 our_log_size          = 4;
}
message Rejection { string content_id=1; ErrorCode code=2; string detail=3; }

message StreamRequest {
  repeated string  communities = 1;
  repeated string  channels    = 2;
  repeated Plane   planes      = 3;
  repeated Priority classes    = 4;
  uint64 since_index           = 5;
}

message BackfillRequest {
  repeated string communities = 1;
  repeated string channels    = 2;
  repeated Plane  planes      = 3;
  uint64 from_index = 4;
  uint64 to_index   = 5;
  uint32 max        = 6;
}

// ── Trust ─────────────────────────────────────────────────────────────────
message ServerVouch {
  bytes      peer_key = 1;
  TrustLevel level    = 2;
  string     note     = 3;
  int64      asserted_at_ms = 4;
  bytes      signature = 5;
}

enum TrustLevel {
  TRUST_LEVEL_UNSPECIFIED = 0;
  BLOCKED   = 1;
  PROBATION = 2;   // default on first contact
  NORMAL    = 3;
  TRUSTED   = 4;
}

message Quota {
  uint32 envelopes_per_min = 1;
  uint64 bytes_per_min     = 2;
  uint32 max_concurrent_streams = 3;
  repeated Priority allowed_classes = 4;
}

// ── Transparency gossip ───────────────────────────────────────────────────
message TreeHeadExchange {
  bytes  server_key = 1;
  SignedTreeHead sth = 2;
  repeated PeerObservation observed = 3;
  bytes  signature = 4;
}
message PeerObservation { bytes peer_key=1; SignedTreeHead sth=2; int64 observed_at_ms=3; }

// ── Directory (heavily used by P3) ────────────────────────────────────────
message DirectoryExchange {
  repeated PeerRecord peers = 1;
  int64  generated_at_ms    = 2;
  bytes  signature          = 3;
}
```

---

## 3. Trust model — TOFU plus web-of-trust

**Requirement FD-01:** Admin allowlisting MUST NOT be the only path to federate. During a shutdown, volunteers stand up relay nodes and cannot wait for manual approval.

> v1 required `federationservers.status === 'approved'`, set by an admin. That is exactly backwards for the threat model: it makes the system least able to grow relays at the moment relays matter most.

| Level | Reached by | Grants |
|---|---|---|
| `BLOCKED` | Admin action, or ≥ 2 `TRUSTED` peers vouch `NEGATIVE` | Nothing accepted |
| `PROBATION` | **Default on first contact (TOFU)** | Class 0–2 only; tight quota; no community or channel creation |
| `NORMAL` | ≥ 2 `NORMAL`+ vouches, or admin promotion, or 7 days clean at `PROBATION` | All classes; standard quota |
| `TRUSTED` | Admin promotion, or ≥ 3 `TRUSTED` vouches | Full quota; may relay for others; STH gossip partner; **may act as a bridge** (P3) |

**Requirement FD-02:** Peer identity is the **server public key**. Endpoint URLs are mutable metadata. Losing a domain does not lose an identity or a history.
**Requirement FD-03:** Every inbound envelope re-runs the **full** validation pipeline (`02-CONTRACTS-CORE.md` §5). Peer trust affects **quota only**, never verification.
**Requirement FD-04:** Inbound envelopes MUST be **projected into the read model**, not merely archived.

> v1's `receive()` inserted into a `federationactivities` collection that nothing ever read, and `emitLocalActivity()` wrote to an outbox that was never delivered. Federation was a message morgue.

**Requirement FD-05:** `(content_id, direction)` carries a unique database index. Deduplication is enforced by the database, never by a read-then-write check.

> v1 did `findOne` then `insertOne` and caught error 11000 — but no unique index was ever declared, so the catch was unreachable and the check was a race.

**Requirement FD-06:** Outbound delivery is a durable queue with exponential backoff, a dead-letter path, and automatic `Backfill` on reconnect.
**Requirement FD-07:** Peers MUST advertise which planes they serve. A node MAY serve Forum only, Signal only, or both. A Signal-only relay node is a legitimate and useful deployment.

---

## 4. Transparency gossip

**Requirement FD-08:** Nodes exchange `SignedTreeHead`s with every `TRUSTED` peer at least every 5 minutes.
**Requirement FD-09:** On receiving a peer STH, the node verifies consistency against the last STH it holds for that peer. Inconsistency means the peer rewrote its log; the node MUST record the divergence, alert the operator, and demote the peer to `BLOCKED` pending review.
**Requirement FD-10:** `PeerObservation` entries let node C learn that node A saw a different STH for node B than C did — catching a peer that shows different logs to different partners.

---

## 5. NAT and inbound reachability

**Requirement FD-11 — a node with no inbound reachability MUST be able to fully federate.**

This is achieved because `Deliver` is **client-streaming** and `StreamActivities` is **server-streaming** initiated by the caller. A NATed node:

- opens a long-lived `Deliver` stream **outbound** to push its own content, and
- opens a long-lived `StreamActivities` **outbound** to receive the peer's content.

Both directions flow over a connection the NATed node initiated. No inbound port, no port forwarding, no UPnP.

| Deployment | Inbound port needed? |
|---|---|
| Node behind CGNAT, federating with a reachable peer | **No** |
| Node serving browser clients | **Yes** (or via a reverse-tunnelling peer) |
| Node accepting federation from unreachable peers | **Yes** |
| Bridge node joining two ISP islands (P3) | **At least one side** |

**Requirement FD-12:** A node MUST be configurable as `outbound-only`, in which case it advertises no endpoints and relies entirely on peer-initiated streams. This is the default for a home or community node.

---

## 6. Loop prevention and quotas

**Requirement FD-13:** Loop prevention is inherent — `content_id` deduplication means an envelope that returns to a node that already has it is dropped at pipeline step 11 with no further work.
**Requirement FD-14:** Relay depth is bounded: an envelope carries no hop counter over gRPC, but a node MUST NOT re-relay an envelope to the peer it received it from.
**Requirement FD-15:** Quotas are per peer, per class, enforced as a token bucket at ingress. Exceeding quota returns `backpressure_hint_ms` rather than dropping the connection.
**Requirement FD-16:** A peer exceeding quota repeatedly is demoted one trust level automatically, and the operator is notified.

---

## 7. Discovery endpoints

Preserved from v1, extended.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/.well-known/jagoo-bahee` | Node identity, server key, endpoints with scopes, planes, capabilities |
| `GET` | `/.well-known/nodeinfo` | NodeInfo 2.1 discovery link |
| `GET` | `/nodeinfo/2.1` | NodeInfo 2.1 document |
| `GET` | `/v1/federation/peers` | Known peers with trust levels and endpoints |
| `GET` | `/v1/federation/sth` | Current signed tree head |
| `GET` | `/v1/federation/directory` | Signed peer directory for pre-positioning (P3) |

**Requirement FD-17:** `/.well-known/jagoo-bahee` MUST list **all** endpoints with their reachability scopes, not just the public one. This is what lets a client on the same ISP find the ISP-local address before the gateway drops.

Example:
```json
{
  "serverId": "jbs1a4f7m2k…",
  "serverKey": "base64…",
  "displayName": "Dhaka Node 1",
  "planes": ["FORUM", "SIGNAL"],
  "endpoints": [
    { "uri": "https://node1.example.org",     "scope": "GLOBAL",    "asn": 12345 },
    { "uri": "https://203.0.113.10",          "scope": "NATIONAL",  "asn": 12345, "ispName": "ISP-A" },
    { "uri": "https://10.20.30.40:8443",      "scope": "ISP_LOCAL", "asn": 12345, "ispName": "ISP-A" },
    { "uri": "grpc://10.20.30.40:8444",       "scope": "ISP_LOCAL", "asn": 12345, "ispName": "ISP-A" }
  ],
  "capabilities": ["federation-grpc", "tofu", "sth-gossip", "directory-exchange", "outbound-only-peers"]
}
```

---

## 8. Federation exit gate (P2)

The primary goal is met when all of these pass:

| ID | Criterion |
|---|---|
| FG-01 | Two independent stacks; `Announce` succeeds; peer lands at `PROBATION` via TOFU |
| FG-02 | A post created on A appears, verified and projected, on B via `StreamActivities` |
| FG-03 | A vote, comment, and moderation action on A all project correctly on B |
| FG-04 | Partition B for 5 minutes, create 20 envelopes on A, reconnect → `Backfill` delivers exactly 20, zero duplicates |
| FG-05 | A replayed envelope is rejected by the unique index, not by a racy read |
| FG-06 | A tampered envelope from a peer is rejected and not projected |
| FG-07 | A node configured `outbound-only` behind simulated NAT federates fully in both directions |
| FG-08 | `ExchangeTreeHeads` detects a peer that rewrote its log; peer is demoted and the operator alerted |
| FG-09 | A `PROBATION` peer's class-3 envelopes are rejected; class 0–2 accepted |
| FG-10 | Signal-plane and Forum-plane envelopes are never carried in the same stream frame |
