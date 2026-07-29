# P5 — Offline store-and-forward and local mesh

> **Status: COMPLETE (native software gate).** Wire and persistence contracts are frozen in
> `Plans/11-CONTRACTS-MESH.md`.

## Build order

1. Durable native outbox with final content IDs, priority ordering, crash recovery and receipts.
2. Integrate signed Forum and Signal submissions; drain on foreground/reconnect.
3. Cached offline read and explicit authored-pending-receipt UI.
4. Transport-neutral mesh protocol, Bloom reconciliation, TTL/hops and per-peer quotas.
5. WebRTC data-channel adapter with QR/copy pairing.
6. Independently verified `.jbpack` export/import.
7. Battery/data-saver controls and an offline/mesh operations screen.
8. P5-G1…P5-G6 acceptance tests.

## Task status

| Tasks | Status |
|---|---:|
| T5.1–T5.6 durable outbox, compose, drain and cached read | complete |
| T5.7–T5.12 mesh transport and verification | complete |
| T5.13 `.jbpack` | complete |
| T5.14 battery/data saver | complete |

## Native equivalence

T5.1's IndexedDB and T5.4's service worker names describe browser mechanisms. The Expo client uses
AsyncStorage and foreground/connectivity lifecycle hooks, as frozen in `Plans/11`. Correctness is
durable and platform-neutral; OS background time is an optimization.

## Exit gate

P5 completes only with automated evidence for offline final IDs, QR pairing state, tamper rejection,
idempotent receipt drain, priority preemption and per-envelope `.jbpack` verification.

## Gate evidence

| Gate | Evidence |
|---|---|
| P5-G1 | `frontend/src/offline/outbox.test.ts` signs and persists post, comment, vote, message, broadcast and check-in IDs without a node; Signal inbox/prekeys and ordinary read queries have offline caches |
| P5-G2 | Expiring QR offer/answer contract tests plus the production `react-native-webrtc` host-candidate adapter and Android/iOS export |
| P5-G3 | `mesh.test.ts` tampers signed bytes and asserts neither storage nor relay |
| P5-G4 | exact-byte crash recovery, final-ID dedupe and original receipt handling in `outbox.test.ts` |
| P5-G5 | 500 `BULK` rows cannot precede a `BROADCAST` |
| P5-G6 | `jbpack.test.ts` independently accepts one valid member and rejects one tampered member |

The native relay screen performs fingerprint-confirmed QR pairing, Bloom reconciliation, automatic
missing-envelope transfer, verified receipt display, manual emergency send, and `.jbpack`
import/export. Mesh is explicit opt-in. Battery/data saver settings increase the actual link-probe
cadence rather than merely changing a label.
