# R12 — Non-Functional Requirements

## 1. Performance

| ID | Requirement | Target |
|---|---|---|
| NFR-P01 | Ed25519 envelope signature verification | < 1 ms server, < 5 ms browser WASM |
| NFR-P02 | Feed page load, warm cache | < 300 ms p95 |
| NFR-P03 | Envelope ingress throughput, single node | ≥ 500/s sustained |
| NFR-P04 | Offline app cold start | < 2 s on a 2019 mid-range Android |
| NFR-P05 | Mesh peer discovery to first envelope | < 10 s |
| NFR-P06 | Class-0 broadcast propagation across 3 mesh hops | < 30 s |
| NFR-P07 | Merkle inclusion proof generation at 10⁶ leaves | < 10 ms |
| NFR-P08 | Path re-selection after an uplink failure | < 30 s |
| NFR-P09 | Federation backfill of 10⁴ envelopes | < 60 s |
| NFR-P10 | Projection rebuild of 10⁶ envelopes | < 10 min |

## 2. Footprint

Low-resource operation is a **hard** requirement, not an aspiration. The target user is on a mid-range Android phone on a congested mobile network, and the target node may be a Raspberry Pi on a home connection.

| ID | Requirement | Target |
|---|---|---|
| NFR-F01 | Web app initial JS bundle, gzipped | **< 300 KB** |
| NFR-F02 | `jb-wasm` crypto module, gzipped | **< 250 KB** |
| NFR-F03 | Full offline shell including cached feed | < 5 MB |
| NFR-F04 | Class 0–2 envelope on the wire | **≤ 512 bytes** |
| NFR-F05 | Node RAM at idle | < 512 MB |
| NFR-F06 | Node runs on a Raspberry Pi 4 | **required** |
| NFR-F07 | Data-saver mode page weight | < 50 KB |
| NFR-F08 | Signal-only relay node RAM | < 256 MB |

**NFR-F09:** `NFR-F01` and `NFR-F02` are enforced as **blocking CI gates**, not measured occasionally.

> v1 shipped four overlapping crypto libraries in the browser — `bip39`, `bip32` (Node builds with a Buffer polyfill and the full wordlist), `@scure/bip39`, `@scure/bip32`, `tiny-secp256k1` (WASM), and `@noble/secp256k1` — including two independent secp256k1 implementations. v2 ships exactly one crypto module.

## 3. Reliability

| ID | Requirement |
|---|---|
| NFR-R01 | No single point of failure between a client and content — every layer has a fallback |
| NFR-R02 | Projections fully rebuildable from the envelope store |
| NFR-R03 | Federation partitions heal automatically via backfill, with no operator action |
| NFR-R04 | The outbox survives app termination, browser restart, and device reboot |
| NFR-R05 | Labeller, witness, and Reticulum bridge outages degrade gracefully; none is on the critical publish path |
| NFR-R06 | Uplink failure loses zero queued envelopes |
| NFR-R07 | A node restart does not lose federation position — `since_index` is durable |
| NFR-R08 | Redis loss degrades rate limiting to fail-closed, not to data loss |

## 4. Security

| ID | Requirement |
|---|---|
| NFR-S01 | All private-key operations behind the signer boundary; keys never in page JS |
| NFR-S02 | Every signed payload carries domain separation |
| NFR-S03 | Exactly one canonical form per envelope version; no fallback acceptance |
| NFR-S04 | Rate limiter fails closed in production |
| NFR-S05 | Token classes use separate signing keys and assert their type |
| NFR-S06 | No secret or personal data in URLs, query strings, or logs |
| NFR-S07 | Dependency audit and SBOM in CI |
| NFR-S08 | Every threat-model adversary (A1–A7) has at least one mitigation test |
| NFR-S09 | One signer worker per plane; no shared key store |
| NFR-S10 | No stored association between a Forum key and a Signal key |
| NFR-S11 | Message plaintext never exists server-side, verified by direct database inspection |
| NFR-S12 | `trusted_proxy_hops` has no "trust everything" value in the config schema |

## 5. Accessibility

| ID | Requirement |
|---|---|
| NFR-A01 | WCAG 2.1 AA for all core flows |
| NFR-A02 | Full keyboard navigation |
| NFR-A03 | Screen-reader labels on all interactive elements |
| NFR-A04 | **Bangla and English UI**, with Bangla as a first-class locale |
| NFR-A05 | Emergency broadcast UI legible at maximum system font scale |
| NFR-A06 | Colour is never the sole carrier of meaning — verification status, severity, transport scope |
| NFR-A07 | Alert severity distinguishable by shape and text, not only hue |
| NFR-A08 | Touch targets ≥ 44×44 px on crisis actions (check-in, panic wipe) |

**NFR-A04 note:** Bangla is not a translation layer added at the end. Headline size budgets (`SIG-26`) are computed against Bangla UTF-8 worst case, because that is the primary language of the target users.

## 6. Operability

| ID | Requirement |
|---|---|
| NFR-O01 | Every deployment shape startable from a config file with no code changes |
| NFR-O02 | Structured logs, no personal data, no keys, no message metadata beyond delivery need |
| NFR-O03 | Metrics for ingress, rejections, projection lag, federation queues, per-scope paths |
| NFR-O04 | Readiness endpoint reflects real dependency state |
| NFR-O05 | A single-binary or single-compose deployment path for community operators |
| NFR-O06 | Setup documentation in Bangla and English, including router port forwarding |

## 7. Maintainability

| ID | Requirement |
|---|---|
| NFR-M01 | Adding a content type requires no change to ingress, projection dispatch, signing, verification, or receipt code |
| NFR-M02 | No `switch` on domain anywhere in the core |
| NFR-M03 | No branch on transport ID outside the transport layer |
| NFR-M04 | Every port has a production adapter and an in-memory test double |
| NFR-M05 | Mesh and Reticulum paths testable with no hardware |
| NFR-M06 | ISP-bridging paths testable with no physical multi-ISP setup |
| NFR-M07 | A feature is one directory; deleting it and its registry rows removes it completely |
| NFR-M08 | Every MUST requirement has at least one test citing its ID |

## 8. Testability gates

| Gate | Blocking | Phase |
|---|---|---|
| Cross-language canonical vectors | **Yes** | P0 |
| Import-boundary lint | **Yes** | P0 |
| Regenerate-and-diff on generated code | **Yes** | P0 |
| Bundle size < 300 KB | **Yes** | P1 |
| WASM size < 250 KB | **Yes** | P1 |
| Requirement-ID test coverage report | Warn → block at P2 | P1 |
| Raspberry Pi acceptance run | Nightly | P1 |
| Two-node federation suite | **Yes** | P2 |
| Network-namespace ISP suite | **Yes** | P3 |
| Build-without-Reticulum suite | **Yes** | P6 |

**NFR-M09:** The cross-language vector gate is the highest-value gate in the project. A canonicalization divergence between the Rust/WASM signer and the TypeScript node is the most expensive bug this architecture can have, and it must be caught at commit time.
