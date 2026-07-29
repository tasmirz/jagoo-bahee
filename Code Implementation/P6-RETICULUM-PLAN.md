# P6 — Optional Reticulum / LoRa relay

> **Status: COMPLETE (software gate; physical radio drill not run).** The frozen bridge contract is
> `proto/jagoo/v1/bridge.proto`; transport policy is `Plans/06-CONTRACTS-TRANSPORT.md` §9.

## Build order

1. Isolated Python `services/relay` package and optional RNS runtime boundary.
2. Deterministic class filter, fragmentation, integrity, reassembly and durable queue.
3. local Unix/TCP bridge implementing Announce, Send, Receive and Status semantics.
4. TypeScript `ReticulumTransport` adapter selected only by configuration.
5. TCPInterface two-relay demo, disconnect/resume and admin status.
6. Hardware configuration documentation and RG-01…RG-04 gates.

## Task status

| Tasks | Status |
|---|---:|
| T6.1–T6.2 sidecar and node bridge | complete |
| T6.3–T6.8 transport, fragmentation and store-forward | complete |
| T6.9 admin visibility | complete |
| T6.10 adapter-absent build | complete |
| T6.11 RNode documentation | complete; on-air hardware drill not run |
| T6.12–T6.13 optional direct/bridge modes | deferred by the frozen phase scope |

## Safety boundary

The Python process owns RNS imports and radio state. The Nest process communicates through a
local bridge client and starts with Reticulum disabled. A missing or crashed relay degrades only
that transport and cannot affect ingress, federation, or HTTP.

## Exit gate

P6 is complete only when two TCP relay processes exchange a broadcast, a severed transfer resumes,
bulk returns `TRANSPORT_UNSUPPORTED`, status is visible, and the ordinary full suite passes with
the adapter disabled and the Python package absent.

## Gate evidence

| Gate | Evidence |
|---|---|
| RG-01 | `services/relay/tests/test_engine.py` exercises two TCP relay endpoints and the complete gRPC bridge round trip without radio hardware |
| RG-02 | the same suite queues a fragmented transfer while the peer is down, reconnects, drains and delivers one complete envelope |
| RG-03 | Python bridge and Nest adapter tests both reject `BULK`; the Nest side rejects before an RPC |
| RG-04 | Reticulum remains disabled unless `RETICULUM_ENABLED=true`; the ordinary workspace typecheck, test and build gates pass with no relay process |

`GET /v1/admin/reticulum` is administrator-authenticated, bounded by a sidecar deadline and returns
JSON-safe interfaces, paths, RSSI, SNR, byte counters and queue depth. The Admin workspace renders
that state. The sidecar auto-announces its local destination, stores frames in SQLite WAL and
isolates all RNS imports inside `RnsTransport`.

Operator commands, actual Reticulum TCPInterface configurations, RNodeInterface examples and
Bangla notes are in `services/relay/README.md` and
`Code Implementation/RETICULUM-RNODE-GUIDE.md`. No LoRa board was available in this environment,
so the physical on-air exercise is explicitly not claimed.
