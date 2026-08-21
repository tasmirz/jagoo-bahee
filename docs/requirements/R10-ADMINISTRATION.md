# R10 — Administration & Operations

## 1. Instance administration

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| ADM-01 | Instance summary statistics (identities, communities, posts, peers, reports, blocks) | ✓ | P1 |
| ADM-02 | Identity list with search | ✓ | P1 |
| ADM-03 | Ban / unban identity | ✓ | P1 |
| ADM-04 | Assign global role | ✓ | P1 |
| ADM-05 | Moderation overview across communities | ✓ | P1 |
| ADM-06 | Security config get / put (registrations open, rate-limit overrides) | ✓ | P1 |
| ADM-07 | IP block list CRUD | ✓ | P1 |
| ADM-08 | Admin dashboard UI | ✓ | P1 |
| ADM-09 | Federation peer list with trust levels | ✓ | P2 |
| ADM-10 | Peer trust promotion / demotion / block | ✓ | P2 |
| ADM-11 | Vouch for a peer | — | P2 |
| ADM-12 | **Projection rebuild command** | — | P1 |
| ADM-13 | Labeller configuration and trust management | — | P1 |
| ADM-14 | Feature toggle inspection (which features are on, which adapters are bound) | — | P1 |

## 2. Network operations

| ID | Requirement | Phase |
|---|---|---|
| ADM-15 | Uplink status: interface, source IP, ASN, ISP, declared vs live scopes, state | P3 |
| ADM-16 | Manual uplink override (force up / force down) | P3 |
| ADM-17 | Per-peer path view — which endpoint and uplink is currently in use | P3 |
| ADM-18 | Pin a peer to a specific uplink | P3 |
| ADM-19 | Bridge relay stats: bytes and envelopes per direction, per class, quota headroom | P3 |
| ADM-20 | NAT status: mapping result, reflexive address, CGNAT detection | P3 |
| ADM-21 | Peer directory browser with scope and ASN filters | P3 |
| ADM-22 | Mesh peer list with link quality | P5 |
| ADM-23 | Reticulum status: interfaces, paths, RSSI, SNR, queue depth | P6 |

## 3. Transparency operations

| ID | Requirement | Phase |
|---|---|---|
| ADM-24 | Transparency log health: tree size, last STH, append latency | P1 |
| ADM-25 | **Peer STH divergence alerts** — a peer that forked its log is surfaced prominently | P2 |
| ADM-26 | STH history browser with consistency verification | P2 |
| ADM-27 | Inclusion proof lookup by content ID | P1 |

## 4. Observability

| ID | Requirement | Phase |
|---|---|---|
| ADM-28 | Structured logs with no personal data, no keys, and no message metadata beyond delivery need | P1 |
| ADM-29 | Metrics: ingress rate by domain, rejection rate by error code, projection lag | P1 |
| ADM-30 | Metrics: per-scope path attempts, successes, latency | P3 |
| ADM-31 | Metrics: federation queue depth, backfill progress, per-peer quota use | P2 |
| ADM-32 | Health endpoints: `/health/live`, `/health/ready` | P1 |
| ADM-33 | Readiness reflects real dependency state (database, cache, witness), not a constant | P1 |

**ADM-34:** Logs MUST NOT contain private keys, message plaintext, mnemonic material, or any Forum-key-to-IP association (`THR-09`). This is verified by a log-scrubbing test.

## 5. Deployment shapes

| ID | Shape | Requirements |
|---|---|---|
| ADM-35 | **Full instance** — Forum + Signal, public IP, serves browser clients | All |
| ADM-36 | **Community node** — Forum + Signal, behind NAT, outbound-only federation, serves its LAN | `FED-25`, `FED-26` |
| ADM-37 | **Signal-only relay** — broadcasts and messages only, Raspberry Pi class | `FED-18`, `NFR-F06` |
| ADM-38 | **Bridge node** — multi-homed, relays between ISP islands | `ISP-11`–`ISP-16` |
| ADM-39 | **Radio gateway** — bridge node plus Reticulum forwarding | `TRN-32` |

**ADM-40:** Every shape MUST be startable from a documented config file with no code changes. Deployment shape is configuration, not a build variant.

## 6. Backup & recovery

| ID | Requirement | Phase |
|---|---|---|
| ADM-41 | The envelope store is the only backup-critical dataset; projections are derived | P1 |
| ADM-42 | `rebuild-projections` reconstructs every collection from the envelope log, byte-identical | P1 |
| ADM-43 | Node migration: move the envelope store and server key, rebuild, resume federation | P2 |
| ADM-44 | A node that lost its data can `Backfill` from peers for communities it hosts | P2 |
| ADM-45 | Server key rotation with peer re-announce | P2 |

**ADM-46:** Losing the server private key means losing the ability to sign receipts, but MUST NOT invalidate previously issued receipts or any user content. User content validity never depends on a server key.

## 7. Configuration surface

```yaml
node:
  server_key_path: /etc/jagoo/server.key
  public_name: "Dhaka Node 1"

planes:
  forum:  { enabled: true }
  signal: { enabled: true }

features:
  mesh:      false
  reticulum: false
  labeller:  true
  bridge:    false

uplinks:  [ ... ]        # see 06-CONTRACTS-TRANSPORT §4
bridge:   { ... }
probe:    { ... }

storage:
  mongo_uri: ...
  redis_url: ...
  blobs: { kind: s3 | filesystem, ... }

witness:
  remote: false           # true ⇒ external witness service

limits:
  trusted_proxy_hops: 1   # NEVER "trust everything"
  rate_limits: { ... }
  credit: { ... }
```

**ADM-47:** `trusted_proxy_hops` has **no** "trust all" value. The configuration schema makes the v1 mistake unexpressible.
