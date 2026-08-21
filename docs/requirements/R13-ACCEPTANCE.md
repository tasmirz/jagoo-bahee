# R13 — Acceptance Criteria

System-level criteria. Phase-level exit gates live in [`../08-PHASES.md`](../08-PHASES.md).

## 1. Feature parity

| ID | Criterion |
|---|---|
| AC-01 | Every requirement ID across R2–R11 marked ✓ or — is implemented and reachable in the UI |
| AC-02 | All 42 v1 frontend routes exist with equal or greater functionality |
| AC-03 | Every v1 endpoint has a documented v2 equivalent in [R14](R14-V1-MIGRATION.md) |
| AC-04 | Every v1 database field is either projected or explicitly documented as dropped with a reason |

## 2. Cryptographic correctness

| ID | Criterion |
|---|---|
| AC-05 | TypeScript, Rust, and Python produce byte-identical canonical encodings and content IDs across the shared fixture set |
| AC-06 | A signature made over one `domain` fails verification under any other `domain` |
| AC-07 | A `FORUM`-plane signature fails verification as a `SIGNAL`-plane envelope |
| AC-08 | A signature over a body with fields omitted does **not** validate a body with those fields populated *(the v1 signature-confusion regression)* |
| AC-09 | A revoked key's post-revocation content is rejected; its pre-revocation content stays valid and visible |
| AC-10 | An unknown envelope version and an unknown domain are both hard-rejected, never guessed |
| AC-11 | Content validity is verifiable with all network interfaces disabled |

## 3. Identity plane separation

| ID | Criterion |
|---|---|
| AC-12 | No stored record associates a Forum key with a Signal key (schema audit) |
| AC-13 | Forum and Signal envelopes never appear in the same request, stream frame, SSE connection, or mesh batch |
| AC-14 | Panic wipe on one plane leaves the other intact |
| AC-15 | A Forum signer cannot be passed where a Signal signer is expected — compile error |
| AC-16 | No persisted mapping from network address to Forum key |

## 4. Abuse resistance

| ID | Criterion |
|---|---|
| AC-17 | Rotating `User-Agent` per request does not reset any rate limit or credit balance |
| AC-18 | A client-supplied `X-Forwarded-For` neither creates a new rate-limit identity nor evades an IP block |
| AC-19 | 50 concurrent requests against a 10-credit balance succeed exactly 10 times |
| AC-20 | A refresh token presented as a bearer token is rejected on every write route |
| AC-21 | A captured moderator-action envelope cannot be replayed |
| AC-22 | Requesting 10⁵ PoW challenges does not measurably grow server memory |
| AC-23 | A check-in succeeds with a zero credit balance and no credential |

## 5. Federation ★ primary goal

| ID | Criterion |
|---|---|
| AC-24 | Two independent stacks: `Announce` succeeds, peer lands at `PROBATION` via TOFU |
| AC-25 | A post on A appears, verified and projected, on B |
| AC-26 | Partition B for 5 minutes, create 20 envelopes on A, reconnect → `Backfill` delivers exactly 20, zero duplicates |
| AC-27 | A replayed envelope is rejected by the unique index, not by a racy read |
| AC-28 | A tampered envelope from a peer is rejected and not projected |
| AC-29 | An `outbound-only` node behind simulated NAT federates fully in both directions |
| AC-30 | A peer that rewrote its log is detected via STH gossip, demoted, and the operator alerted |
| AC-31 | A `PROBATION` peer's class-3 envelopes are rejected while class 0–2 are accepted |

## 6. ISP availability & bridging ★ secondary goal

| ID | Criterion |
|---|---|
| AC-32 | With `GLOBAL` firewalled, two nodes on the same simulated ASN federate over `ISP_LOCAL` |
| AC-33 | Metrics prove `ISP_LOCAL` is preferred over `NATIONAL` when both are alive |
| AC-34 | A bridge node merges two isolated ASN islands; a post on island A reaches island B |
| AC-35 | A class-0 broadcast crosses the bridge while a bulk backlog is queued — reserved capacity holds |
| AC-36 | Killing uplink A re-establishes affected peer paths on uplink B within 30 s with zero envelope loss |
| AC-37 | `Backfill` after an uplink switch closes the gap exactly, no duplicates |
| AC-38 | A cold client using only the baked-in seed list connects on `ISP_LOCAL` with `GLOBAL` blocked |
| AC-39 | The current scope is visible in the client UI and updates within 30 s of a change |

## 7. Signal plane

| ID | Criterion |
|---|---|
| AC-40 | A channel is declared, verified in person by QR with no network, and shows as *personally verified* |
| AC-41 | A broadcast emitted on node A reaches a subscriber on node B and renders with correct severity |
| AC-42 | Dropping broadcast #47 causes the subscriber's client to display a gap warning |
| AC-43 | A `CRITICAL` broadcast from an unverified channel is filtered out by default |
| AC-44 | A retraction updates an already-displayed alert in place and marks it revoked, not deleted |
| AC-45 | A broadcast envelope with signature and anti-abuse fields is ≤ 512 bytes |
| AC-46 | An E2EE message reaches an offline recipient via a prekey bundle and decrypts on their return |
| AC-47 | The server stores only ciphertext — verified by direct database inspection |
| AC-48 | Local subscriptions are never serialised or transmitted |

## 8. Blackout operation

| ID | Criterion |
|---|---|
| AC-49 | With the backend stopped **and** the network adapter disabled: author a post, comment, vote, message, broadcast, and check-in. All signed with final content IDs, shown as authored-pending-receipt. |
| AC-50 | Two browser profiles pair over QR-exchanged WebRTC with no network infrastructure; class 0–2 envelopes transfer, verify, and render |
| AC-51 | A tampered envelope injected by a mesh peer is rejected and not relayed |
| AC-52 | On network restore, the outbox drains, receipts arrive, and no duplicates are created |
| AC-53 | A class-0 broadcast queued behind 500 class-3 envelopes is transmitted first |
| AC-54 | A `.jbpack` from an untrusted source imports safely — every envelope independently verified |

## 9. Reticulum

| ID | Criterion |
|---|---|
| AC-55 | Two RNS nodes over `TCPInterface`, no browser able to reach any backend: a broadcast from A appears at B |
| AC-56 | Severing the link mid-transfer and reconnecting completes delivery via store-and-forward |
| AC-57 | A class-3 envelope submitted to the bridge is rejected with a typed error |
| AC-58 | **The full acceptance suite passes with the Reticulum adapter removed from the build** |

## 10. Transparency

| ID | Criterion |
|---|---|
| AC-59 | An inclusion proof fetched while online verifies offline against a stored STH |
| AC-60 | Deleting a post server-side causes the consistency proof between the old and new STH to fail — the deletion is **detectable** |
| AC-61 | A removed post shows a public tombstone with acting moderator, timestamp, and reason |
| AC-62 | With the labeller service stopped, publishing still succeeds and content appears unlabelled |
| AC-63 | A user who removes the home instance's labeller from their trust set sees unfiltered content |

## 11. Footprint & platform

| ID | Criterion |
|---|---|
| AC-64 | Initial JS bundle < 300 KB gzipped, verified in CI |
| AC-65 | WASM crypto module < 250 KB gzipped, verified in CI |
| AC-66 | The node runs the full acceptance suite on a Raspberry Pi 4 |
| AC-67 | A Signal-only relay node runs in < 256 MB RAM |
| AC-68 | The web client loads and functions when served as a static export from a local file path |

## 12. Maintainability

| ID | Criterion |
|---|---|
| AC-69 | Adding a trivial new domain requires zero changes to ingress, projector dispatch, or signing code |
| AC-70 | No `switch` on domain exists in the core (verified by lint) |
| AC-71 | No branch on transport ID exists outside the transport layer (verified by lint) |
| AC-72 | `rebuild-projections` reconstructs every collection byte-identically |
| AC-73 | Every MUST requirement has at least one test citing its ID |
