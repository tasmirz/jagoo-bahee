# ICCIT 2026 Paper #2056 — Reviewer Remedy & Verification Plan

> **INTERNAL VERIFICATION & TRACKING DOCUMENT ONLY — DO NOT SUBMIT TO THE CONFERENCE.**

- **Original Accepted Manuscript (Preserved):** `final-paper/IEEE-conference-template-062824/iccit2026-paper.tex` / `iccit2026-paper.pdf` (6 pages, 561,664 bytes)
- **Prior Revision Drafts (Preserved):** `iccit2026-paper-pre.tex`/`.pdf`, `iccit2026-paper-prev-v2.tex`/`.pdf`, `2056-response-to-reviewers.pdf`
- **Final Camera-Ready Manuscript:** `final-paper/IEEE-conference-template-062824/iccit2026-paper-camera-ready.tex` / `iccit2026-paper-camera-ready.pdf` (6 pages, A4)
- **Final Reviewer Response:** `final-paper/IEEE-conference-template-062824/2056-response-to-reviewers-final.md` / `.tex` / `.pdf` (2 pages)
- **Revision Change Log:** `final-paper/IEEE-conference-template-062824/CAMERA-READY-CHANGELOG.md`
- **Repository Base Commit:** `c71326b0f31ea98623b5944e0a76312b6d5527a4` (hardening/experiment commit `01ce916`, original submission commit `603e895`)
- **Paper Title:** *Islands of Reach: A Censorship-Resistant Federated Forum for National Internet Blackouts*
- **Status:** Camera-ready manuscript, revised `Fig. 1`, final point-by-point reviewer response, and verification ledger complete; deferred items explicitly bounded to future work. (`Disclosure` removed from manuscript per author instruction for separate submission.)

---

## 0. Final Disposition Summary

| ID | Topic | Implemented & Verified | Measured & Reported | Addressed Through Clarification | Deferred to Future Work |
| --- | --- | --- | --- | --- | --- |
| **R1.1 / R2.1** | Multi-host validation | Multi-host peering/source binding already exists in code | Single-host testbed hardware/env specs reported (`§IV`) | Claims bounded to single-host Docker (`Abstract`, `§IV`, `§VI`, `§VII`) | Independent multi-host deployment, physical routers, clock skew |
| **R1.2 / R2.2** | Repeated route-cut trials & CI | `ops/experiments/route-cut-trials.mjs` | `20` intact + single IX cut + `20` bridged chains (`03`), `50`/config scaling (`06`) | Explicitly describes sequential procedure & within-run bootstrap CIs (`§IV`, `§V-A`, `Fig. 5a`) | — |
| **R1.3** | Network impairments | `ops/experiments/netem-emulation.mjs` | `6` port-8444 scenarios (`04`, `10/10` each) | Bounded to tested impairment regimes (`§IV`, `§V-A`, `Fig. 5b`) | Wide-area/real access links |
| **R1.4 / R2.6** | ActivityPub baseline & caveats | `ops/experiments/ap-e2e-comparison.mjs`, `ap-inbox-server.cjs` | `20/20` shaped WAN + `10/10` vs `0/10` blocked inbound + `n=40` `fosstodon.org` (`07`) | Distinct timed intervals, persistence semantics, schema vs. JSON-LD trade-offs (`§IV`, `§V-C`, `§VI`, `Table III`) | Full Mastodon/Rails stack comparison |
| **R1.5 / R2.5** | Adversarial stress & valid writes | `ops/experiments/stress-suite.mjs` | `5a`–`5e` zero-write stress + `5f` `c=1..32` local valid writes (`05`) | Distinguishes local single-node admission vs. concurrent federation (`§IV`, `§V-B`, `Table II`) | Sustained resource-exhaustion thresholds |
| **R1.6 / R2.7** | Audit & fork guarantees | Local RFC 6962 proofs, `verifyAuditCertificate`, `observePeerSth` key/staleness/shrinkage checks | Verified in `server.spec.ts`, `merkle.spec.ts`, `federation.e2e.spec.ts` | Separated guarantees vs. open gaps (`§III-D`, `Table I`, `§VI`), incl. unverified peer STH sigs | Peer gRPC growth proofs, peer STH sig verification, ALS cross-auditing, split-view detection |
| **R1.7** | Differential fuzzing & PBT | Rust & Python canonical decoders + `fuzz-gate.mjs` + TS `asUint32` fix | `16` ref vectors + `20,000` seeded/mutated cases (`0` disagreements, `02`) | Scoped to wire-format agreement, not signature/admission/security (`§IV`, `§V-A`) | Independent external security audit |
| **R1.8 / R2.8** | Figures, prose & ICCIT fit | `fig1-system-architecture-camera.svg`/`.pdf`, TikZ `Figs. 3, 5`, `fig4` cited | — | Restored 4 contributions + resilient networking/security fit (`§I`), grammar & `created_at_ms` fixes | — |
| **R2.3** | Resource consumption | `docker-stats.mjs` | CPU/RAM snapshots (`03`, `05`, `06`, `07`) reported in `§§V-B–C`, `Table II` | Grounded x86 snapshot limits (`§VI`) | Peak RSS, disk footprint, SBC hardware benchmarks |
| **R2.4 / D7** | Timeouts, cancellation & CGNAT pull | `AbortSignal` on `deliver`, `5/15/30 s` bounds, `pullIntervalMs=2000` (`01ce916`) | Rebuilt `pnpm gate:isp` `22/22` in `39.91 s`; CGNAT pull `10/10` (`07`) | Separated pre-rebuild (`03–06`) vs. rebuilt (`02`, `07`, gate) builds (`§III-C`, `§IV`, `§V-A`) | — |
| **D1–D6** | Code-vs-paper alignment | `checks.envelopeSignature` added (`audit-certificate.ts`) | Verified in `server.spec.ts` | Removed orphaned refs (`D1`), fixed drain/quota keys (`D2`), symmetric decoders (`D3`), `created_at_ms` & Stage 14 (`D4`), HTTP vs. gRPC limiters (`D5`), ALS scope (`D6`) | — |

---

## 1. Reviewer #1 Checklist

### - [ ] R1.1 — Multi-host deployment beyond single-host Docker (Deferred to future work; bounded in manuscript)
- **Reviewer point:** Current experiments use Docker on a single host; unclear if the architecture behaves similarly in a multi-host experiment with independent machines, routers, and network connections.
- **Findings in codebase & paper:**
  - Already acknowledged as the primary limitation in Abstract, §IV, §VI (*Testbed validity*, `iccit2026-paper.tex:366`), and §VII.
  - Existing harnesses (`ops/isp-compose.yml`, `backend/src/cli/scale-gen.ts`) are single-host Docker Compose stacks sharing one kernel, clock, CPU, and storage subsystem.
  - The backend itself already supports multi-host HTTP/gRPC peering and explicit source-IP binding via `UPLINKS` (`backend/src/adapters/outbound/grpc/federation-client.ts`, `ops/isp-compose.yml`).
- **Solution:**
  - **Code / Experiment:** If multiple hosts/VMs are available (e.g., 3–4 separate VMs or physical machines on separate subnets/VLANs with NTP-synced clocks), deploy the `isp-compose.yml` topology across separate hosts (Island A nodes, Island B node, Dual-Homed Bridge) and run repeated route-cut trials measuring real inter-host RTT and delivery latency.
  - **Paper:** If multi-host hardware is unavailable before the revision deadline, keep the claim explicitly bounded to single-host container isolation, report NTP/clock-skew caveats clearly, and frame multi-host deployment as the immediate next evaluation step (without overclaiming wide-area generality).

---

### - [x] R1.2 — Repeated trials & statistical rigor (median, variance, CIs, delivery success rates)
- **Reviewer point:** The `0.5`, `1.2`, and `2.1` second route-cut latencies are from single runs; report repeated trials with median latency, variance/IQR, confidence intervals, and delivery success rates.
- **Findings in codebase & paper:**
  - Confirmed in `iccit2026-paper.tex:288` (*"These are single runs, not distributions."*) and `iccit2026-paper.tex:374`.
  - `backend/src/cli/isp-gate.ts:452-469` runs a single pass, polls `/v1/posts` every `1,000 ms`, and asserts boolean reachability rather than recording per-object certificate/community/post timestamps across $N$ trials.
  - `ops/sweep.sh` and `ops/sweep-analyse.py` already exist to run multi-node (`2, 4, 8, 12`) and multi-drain (`250, 500, 1000, 2000 ms`) sweeps, but `ops/results/` is absent in the repo and only 2 drain points (`1000 ms`, `250 ms`) are reported in the paper.
- **Solution:**
  - **Code / Experiment:**
    1. Add a multi-trial route-cut runner (e.g., `N = 20–30` independent cut-and-heal or fresh-stack trials) that records per-object (`certificate`, `community`, `post`) end-to-end crossing times (ideally using `received_at_ms` delta in addition to or instead of 1,000 ms polling) and delivery success rate (`delivered / attempted`).
    2. Run `ops/sweep.sh` + `ops/sweep-analyse.py` (or repeated `scale-measure.ts` trials) and compute median, IQR / std dev, 95% bootstrap/percentile confidence intervals, p95/p99, and delivery success rate.
  - **Paper:** Replace single-run `0.5 / 1.2 / 2.1 s` headline figures with median, IQR/variance, 95% CI, and delivery success rate across $N$ trials in Abstract, §V.A, Fig. 3, and §VII.
- **Verification / Experiment Status:**
  - `[x]` Executed repeated route-cut trials ($N=20$ IX-intact, single IX cut, $N=20$ IX-cut bridged on the same running stack) and clean hop/drain scaling sweeps ($N=50$/config) in [03-route-cut-trials.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/03-route-cut-trials.json) and [06-clean-sweep.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/06-clean-sweep.json) — 100% delivery with medians, IQRs, 95% CIs, p95/p99, and $R^2$ fits.
  - `[x]` Regenerated vector PDF/SVG/PNG Figs. 3, 4, and 5 in `figures-v2/` (`fig3-route-cut-topology.pdf`, `fig4-hop-and-drain-scaling.pdf`, `fig5-route-cut-and-netem.pdf`) directly from measured distributions (original `figures/` untouched); camera-ready manuscript renders crisp TikZ Figs. 3 & 5 and `fig4-hop-and-drain-scaling.pdf` with explicit text citation in `§V-B`.
  - `[x]` Incorporated statistical distributions and sequential protocol description into `iccit2026-paper-camera-ready.tex`.

---

### - [x] R1.3 — Controlled network emulation (packet loss, high latency, intermittent connectivity, bandwidth limits, varying paths)
- **Reviewer point:** Experiments do not explore packet loss, high latency, intermittent connectivity, bandwidth limits, or varying network paths; controlled network emulation is needed.
- **Findings in codebase & paper:**
  - Current harnesses only perform binary link cuts (`docker network disconnect` and `/v1/transport/uplinks/isp-a/state` `down`/`auto` in `backend/src/cli/isp-gate.ts:432-534`).
  - No `tc netem`, `tc tbf`, or link-flapping scripts exist in `ops/`.
- **Solution:**
  - **Code / Experiment:** Add a `tc netem` / `tbf` network-emulation matrix in the Docker testbed (granting `NET_ADMIN` in a dedicated experiment compose override) covering:
    - High RTT / jitter (e.g., `100–300 ms ± 50 ms`)
    - Packet loss (e.g., `1%`, `5%`, `10%`)
    - Bandwidth caps (e.g., `128 kbps` / `1 Mbps` to simulate throttled domestic/backup links)
    - Intermittent link flapping (periodic up/down cycles, e.g., `10 s` up / `10 s` down)
    - Measure delivery success rate, convergence time, and outbox retry behavior across repeated trials.
  - **Paper:** Add a concise subsection/table in §IV & §V summarizing convergence time and delivery rate under controlled `tc netem` impairment.
- **Verification / Experiment Status:**
  - `[x]` Executed 6 controlled `tc netem` scenarios (TCP port 8444 isolated via `tc prio` + `u32`, $N=10$ each) on the live bridged topology in [04-netem-emulation.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/04-netem-emulation.json) — 10/10 delivery across clean, `150 ± 50 ms` jitter, `5%`/`10%` loss, `128 kbit/s` cap, and `3x 8s/8s` flapping.
  - `[x]` Generated `fig5-route-cut-and-netem.pdf` in `figures-v2/` and embedded exact-JSON TikZ `Fig. 5b` in `iccit2026-paper-camera-ready.tex`.
  - `[x]` Added controlled `tc netem` results and figure cross-references to `§IV` and `§V-A` of `iccit2026-paper-camera-ready.tex`.

---

### - [x] R1.4 — End-to-end ActivityPub / store-and-forward comparison
- **Reviewer point:** Comparing representation sizes with ActivityPub is useful, but there is no equivalent end-to-end comparison of delivery latency, synchronization reliability, or resource usage against a federated or store-and-forward approach under equivalent network conditions.
- **Findings in codebase & paper:**
  - `backend/src/cli/ap-baseline.ts` only measures wire/gzipped byte sizes of 80 `Create`/`Note` activities sampled from two public Mastodon hosts.
  - No end-to-end benchmark runs an ActivityPub server or store-and-forward baseline inside the same Docker partition/impairment harness.
- **Solution:**
  - **Code / Experiment:** Stand up a minimal local ActivityPub / store-and-forward baseline (or two minimal fediverse/HTTP-inbox containers) in the same `tc netem` / route-cut Docker harness where technically feasible, comparing:
    - Delivery behavior when inbound connections are blocked (CGNAT/asymmetric reachability) or across a severed IX without a store-and-forward bridge,
    - Delivery latency, retry/backfill success rate, and payload + framing bytes under constrained bandwidth (`128 kbps` + `5%` loss).
  - **Paper:** Present the end-to-end comparison alongside Table I while explicitly qualifying protocol differences (interoperability/JSON-LD vs. fixed canonical protobuf).
- **Verification / Experiment Status:**
  - `[x]` Executed dual-network isolated (`db_net` vs `wan_net`) end-to-end comparison in [07-ap-e2e-comparison.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/07-ap-e2e-comparison.json) (`7a` 128 kbit/s + 5% loss + 150 ms RTT, `7b-1` steady-state blocked inbound exposing **D7**, `7b-2` `FEDERATION_OUTBOUND_ONLY=true` CGNAT push/pull 10/10, and live `fosstodon.org` $n=40$ baseline).
  - `[x]` Generated `fig7-ap-and-cgnat-comparison.pdf` in `figures-v2/` and `Table III` in `iccit2026-paper-camera-ready.tex`.
  - `[x]` Integrated end-to-end comparison + **R2.6** protocol-scope caveats into `§IV`, `§V-C`, `§VI`, and `Table III` of `iccit2026-paper-camera-ready.tex`.

---

### - [ ] R1.5 — Adversarial & valid-traffic stress tests (Multi-regime stress & valid writes measured; sustained resource exhaustion deferred)
- **Reviewer point:** The invalid-signature flood mostly hit the rate limiter; test validly signed flooding, coordinated attacks from multiple peers, replay attempts, malformed protobuf inputs, and resource exhaustion.
- **Findings in codebase & paper:**
  - `ops/flood.js` only issues single-client HTTP `POST /v1/envelopes` requests with 1-byte-mutated envelopes; ~90% (~2,700/3,000) were shed by the HTTP IP/subject rate limiter (`request-security.interceptor.ts`), leaving ~9% (~66 req/s) reaching Ed25519 verification (`iccit2026-paper.tex:320`).
  - Replay protection and malformed protobuf rejections are tested in unit/HTTP specs (`backend/src/core/app/ingress.spec.ts`, `packages/sdk-ts/src/vectors/decode.spec.ts`, `backend/src/adapters/inbound/http/http.spec.ts`), not under sustained load.
  - `backend/src/cli/scale-measure.ts:71-85` uses a single paced publisher (and its unpaced `--pace=0` burst result was omitted from the 6-page paper).
- **Solution:**
  - **Code / Experiment:** Build a benchmark suite extending `ops/flood.js` to measure 5 distinct regimes (with CPU, RSS memory, Mongo/Redis ops, and latency/throughput recorded via `docker stats` + Mongo profiler):
    1. **Invalid-signature pipeline saturation** (rate limiter disabled/raised, isolating Steps 1–12 CPU cost and confirming 0 DB writes).
    2. **Malformed protobuf flood** (truncated varints, unknown fields, non-canonical ordering, invalid UTF-8, trailing bytes — verifying 4xx rejection, 0 HTTP 500s, 0 DB writes).
    3. **Replay flood** (resending previously accepted `(author_key, nonce)` and duplicate `content_id` envelopes — verifying idempotent/replay rejection without projection amplification).
    4. **Coordinated multi-peer / multi-origin flood** (both HTTP across distinct source identities and gRPC `Deliver` across multiple peered nodes, testing `PeerQuotaLimiter` demotion).
    5. **Validly signed write flood** (validly signed envelopes exercising PoW/anti-abuse + atomic commit + witness append under concurrency, reporting sustainable write throughput and memory/CPU ceiling).
  - **Paper:** Replace the single rate-limiter-dominated `730 req/s` framing in §V.B with the breakdown across these regimes and resource measurements.
- **Verification / Experiment Status:**
  - `[x]` Executed all stress and valid-load regimes (`5a` default HTTP limiter, `5b` invalid-sig pipeline saturation, `5c` malformed protobuf flood, `5d-1` exact duplicate dedupe, `5d-2` non-idempotent `jb:vote:cast:v1` nonce-replay rejection, `5e` 5-peer gRPC flood & auto-block demotion, `5f` concurrent valid writes at `c = 1, 4, 16, 32`) with MongoDB profiler & `docker stats` in [05-stress-and-valid-load.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/05-stress-and-valid-load.json).
  - `[x]` Updated `§V-B` and `Table II` in `iccit2026-paper-camera-ready.tex` with the multi-regime breakdown, HTTP vs. gRPC limiter attribution (**D5**), and explicit local-admission scoping (deferred: sustained resource-exhaustion thresholds in `§VI`–`§VII`).

---

### - [ ] R1.6 — Audit-log & consistency proof guarantees vs. unimplemented pieces (Clarified in §III-D & Table I; peer growth/STH sig/split-view checks deferred)
- **Reviewer point:** Manuscript admits full consistency proofs for growing logs are not implemented; clearly explain which accountability guarantees are in place today and which are future work.
- **Findings in codebase & paper:**
  - **Implemented today in code:**
    - RFC 6962 `consistencyPath` and `verifyConsistency` (`backend/src/core/domain/merkle.ts:126-229`, 18 tests in `backend/src/core/domain/merkle.spec.ts`).
    - HTTP endpoint `GET /v1/log/consistency?from=&to=` (`backend/src/adapters/inbound/http/forum-read.controller.ts:1070-1080`, `backend/src/adapters/outbound/mongo/mongo-stores.ts:489-490`).
    - Offline receipt + inclusion proof + STH verification (`packages/sdk-ts/src/core/evidence.ts:85-103`).
    - Independent ALS hash-chained record & issue-report stores (`services/audit-log/src/store.ts`, `services/audit-log/src/server.ts`), verifying canonical envelope decoding, author Ed25519 signature (`D6`), content/server IDs, receipt signature, STH signature, and inclusion proof, and rejecting conflicting certificates for the same `(server_id, identifier)`.
    - Durable peer STH comparison (`backend/src/core/app/federation-inbox.ts:443-545`) that checks expected server-key attribution, discards observations older than the stored timestamp, and flags equal-size conflicting roots or newer-timestamp tree shrinkage.
  - **Not yet implemented:**
    - Independent STH signature verification inside `observePeerSth` (`federation-inbox.ts:443-545`).
    - Peer-to-peer gRPC consistency proof exchange/verification when a peer's tree grows (`federation-inbox.ts:544` explicitly returns `PeerLogStatus.UNKNOWN`).
    - Cross-observer split-view equivocation detection when partitions prevent peers from exchanging heads.
    - Automated ALS-side cross-STH consistency auditing across multiple receipts from the same server.
    - Proof of *omission before admission* (refusal to accept produces no receipt).
- **Resolution Status:**
  - `[x]` Clarified implemented guarantees vs. open gaps explicitly in `§III-D`, `Table I`, and `§VI` of `iccit2026-paper-camera-ready.tex`, including the unverified peer STH signature scope.
  - `[ ]` **Deferred to future work:** Automated peer gRPC growth consistency verification, STH signature verification on peer head observation, automated ALS cross-auditing, and distributed split-view detection.

---

### - [x] R1.7 — Property-based testing, differential fuzzing, malformed serialization, boundary value tests
- **Reviewer point:** 16 test vectors are not enough to fully validate the protocol; include Property-Based Testing (PBT), fuzzing, malformed serialization cases, and boundary value tests.
- **Verification / Experiment Status:**
  - `[x]` Implemented Rust (`crates/jb-core/src/decode.rs`, `src/bin/fuzz.rs`, `tests/vectors.rs`) & Python (`tools/vectors/jb_reference.py`, `fuzz.py`, `test_reference.py`) canonical decoders, boundary/negative tests, and cross-language 20,000-case differential fuzzer (`tools/vectors/fuzz-gate.mjs`); caught & fixed a real `uint32` truncation bug in `packages/sdk-ts/src/core/decode.ts` (case #9758) -> **0 disagreements / 20,000 cases** in [02-differential-fuzz.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/02-differential-fuzz.json).
  - `[x]` Updated `§IV` and `§V-A` in `iccit2026-paper-camera-ready.tex` with exact cross-language decoder & differential fuzzing scope (explicitly clarifying it tests wire-format agreement rather than signature verification or full protocol security).

---

### - [x] R1.8 — Figure readability & thorough language/formatting polish
- **Reviewer point:** Small labels in Figs. 2 and 3, unclear axis labels in Fig. 4, and multiple grammatical errors throughout the manuscript.
- **Verification / Experiment Status:**
  - `[x]` Regenerated publication figures into `figures-v2/` and created camera-ready `fig1-system-architecture-camera.svg`/`.pdf` distinguishing conceptual (`L0`), Docker-evaluated (`L1–L3`), and out-of-scope (`L4`) regimes (original `figures/` untouched).
  - `[x]` Embedded crisp vector `Fig. 1` (uncropped), clarified `Fig. 2` (`tabularx`), TikZ `Figs. 3 & 5`, and `fig4-hop-and-drain-scaling.pdf` (explicitly referenced in `§V-B`) in `iccit2026-paper-camera-ready.tex`, and applied prose, grammar, and `created_at_ms` terminology polish throughout.

---

## 2. Reviewer #2 Checklist

### - [ ] R2.1 — Multi-host / non-virtualized evaluation & scoped conclusions (Scoped in manuscript; multi-host deferred)
- **Reviewer point:** Evaluation is limited to a single physical host using virtual networks; conclusions should remain limited to the tested environment.
- **Status:** Covered by **R1.1**; Abstract, `§I`, `§IV`, `§VI`, and `§VII` in `iccit2026-paper-camera-ready.tex` explicitly scope claims to the tested single-host Docker testbed. Multi-host deployment remains deferred to future work.

---

### - [x] R2.2 — Repeated trials, latency distributions, and variability
- **Reviewer point:** Route-cut results are single runs; conduct repeated trials and report latency distributions and variability.
- **Verification / Experiment Status:**
  - `[x]` Completed in [03-route-cut-trials.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/03-route-cut-trials.json) ($N=20$ intact + single cut + $N=20$ bridged) and [06-clean-sweep.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/06-clean-sweep.json) ($N=50$/config).
  - `[x]` Updated `iccit2026-paper-camera-ready.tex` (`§IV`, `§V-A`, `§V-B`, `Fig. 4`, `Fig. 5`) with medians, IQRs, SDs, 95% CIs, and explicit text reference to `Fig. 4`.

---

### - [ ] R2.3 — Clarify resource consumption (CPU/RAM snapshots reported; peak RSS, disk, SBC deferred)
- **Reviewer point:** Clarify resource consumption.
- **Verification / Experiment Status:**
  - `[x]` Recorded container CPU %, RSS memory, network I/O, and PID counts across idle, active cut trials ([03-route-cut-trials.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/03-route-cut-trials.json)), 8-node linear chain ([06-clean-sweep.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/06-clean-sweep.json)), `c = 1, 4, 16, 32` stress ([05-stress-and-valid-load.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/05-stress-and-valid-load.json)), and ActivityPub comparison ([07-ap-e2e-comparison.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/07-ap-e2e-comparison.json)).
  - `[x]` Reported CPU/RAM snapshots in `§§V-B–C` and `Table II` and grounded the x86 snapshot limitations in `§VI` of `iccit2026-paper-camera-ready.tex`.
  - `[ ]` **Deferred to future work:** Peak RSS, disk footprint, sustained resource-exhaustion limits, and single-board computer hardware benchmarking (`§VI`).

---

### - [x] R2.4 — Clarify transport timeout & backoff behavior
- **Reviewer point:** Clarify transport timeout behaviour.
- **Verification / Experiment Status:**
  - `[x]` Implemented `AbortSignal` propagation in `FederationSender.deliver` (`network.port.ts`, `federation-outbox.ts`) and `AbortSignal.timeout` bounds (`5 s` control, `15 s` deliver, `30 s` backfill in `federation-client.ts`) with regression test in `federation-outbox.spec.ts`; cut `pnpm gate:isp` `TG-06` failover runtime from ~5 min to `39.91 s` total (`22/22 PASS`).
  - `[x]` Documented exact timeout, `AbortSignal` cancellation, backoff (`1 s` to `15 min` cap, 13th failure = `47 min 3 s` cumulative backoff), backpressure cap (`60 s`), and uplink probe parameters in `§III-C`, and explicitly separated pre-rebuild vs. rebuilt builds in `§IV`.

---

### - [x] R2.5 — Scalability under concurrent valid traffic
- **Reviewer point:** Clarify scalability under concurrent valid traffic.
- **Verification / Experiment Status:**
  - `[x]` Executed concurrent valid-write benchmark (`32` certified identities, `200` posts each at `c = 1, 4, 16, 32`, `200/200` accepted & projected to `forum_posts`) in [05-stress-and-valid-load.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/05-stress-and-valid-load.json).
  - `[x]` Reported `c = 1, 4, 16, 32` valid-traffic throughput/latency/memory in `§V-B` and `Table II` of `iccit2026-paper-camera-ready.tex`, clearly distinguishing local single-node admission scalability from concurrent end-to-end federation.

---

### - [x] R2.6 — Cautious ActivityPub size comparison
- **Reviewer point:** ActivityPub size comparison should be interpreted cautiously because the protocols differ in functionality and interoperability.
- **Verification / Experiment Status:**
  - `[x]` Added controlled end-to-end wire TX + latency + CGNAT comparison in [07-ap-e2e-comparison.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/07-ap-e2e-comparison.json) alongside live `fosstodon.org` ($n=40$) sampling.
  - `[x]` Added explicit qualification of timed intervals, persistence semantics, schema upgrades vs. JSON-LD extensibility, and Fediverse interoperability alongside `Table III` in `§IV`, `§V-C`, and `§VI`.

---

### - [ ] R2.7 — Clearer audit-log & fork-detection security guarantees (Clarified in §III-D & Table I; deferred gaps noted)
- **Reviewer point:** Proposed audit-log and consistency mechanisms need clearer discussion of security guarantees, particularly since full fork detection is not implemented.
- **Status:** Covered by **R1.6** (`§III-D`, `Table I`, `§VI`, `§VII`).

---

### - [x] R2.8 — Minor grammatical issues & conference theme fit
- **Reviewer point:** Improve minor grammatical issues and clarify the paper's fit with the conference themes.
- **Verification / Experiment Status:**
  - `[x]` Visual figure readability and labeling fixes completed in `figures-v2/` (including `fig1-system-architecture-camera.svg`/`.pdf`).
  - `[x]` Applied grammar/prose polish throughout (`§§I–VII`), restored the four explicit contributions in `§I`, and integrated resilient networking and security in distributed systems naturally into `§I` and `§VII`.

---

## 3. Additional Code-vs-Paper Discrepancies Caught During Verification

### - [x] D1 — Orphaned cross-references & leftover text from 6-page trimming
- **Resolution:** Removed dangling references (`voice-channel systems`, missing serial-drain §V pointer) and grounded x86 snapshot figures in `§§V-B–C` and `§VI` of `iccit2026-paper-camera-ready.tex`.

### - [x] D2 — Markdown backticks & incorrect outbox scheduler key in §III.A
- **Resolution:** Replaced backticks with `\texttt{...}` in `iccit2026-paper-camera-ready.tex` (`§III-A`) and separated `(priority, sequence)` outbox drain order and `(peer, plane)` grouping from the bridge's `(source uplink, destination uplink, priority)` quota key.

### - [x] D3 — Cross-language negative vector overclaim (§IV & §V.A)
- **Verification / Experiment Status:**
  - `[x]` Implemented canonical decoders and 15 negative/boundary tests each in Rust (`crates/jb-core/src/decode.rs`, `tests/vectors.rs`) and Python (`tools/vectors/jb_reference.py`, `test_reference.py`), plus 20,000-case differential fuzzer (`tools/vectors/fuzz-gate.mjs`); fixed `asUint32` truncation bug in `packages/sdk-ts/src/core/decode.ts` ([02-differential-fuzz.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/02-differential-fuzz.json)).
  - `[x]` Aligned `§IV` and `§V-A` text in `iccit2026-paper-camera-ready.tex` with the symmetric canonical decoders and differential fuzzing scope.

### - [x] D4 — Envelope `expiry` field & Stage 1–12 `authorisation` mismatch (§III.B)
- **Resolution:** Updated `§III-B` and `Fig. 2` in `iccit2026-paper-camera-ready.tex` to describe `created_at_ms` (checked against `[now - 7 days, now + 10 min]`, explicitly not an expiry field) and placed authorization at Stage 14 (`ingress.ts:186-196`).

### - [x] D5 — Flood rate-limiter misattribution (§V.B)
- **Verification / Experiment Status:**
  - `[x]` Separately benchmarked HTTP per-client rate limiting (`5a`: 2,709/3,000 `RATE_LIMITED`) and 5-peer gRPC `PeerQuotaLimiter` demotion (`5e`: `PROBATION -> BLOCKED`, `PERMISSION_DENIED: FORBIDDEN: peer is blocked`) in [05-stress-and-valid-load.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/05-stress-and-valid-load.json).
  - `[x]` Corrected HTTP rate limiter vs. gRPC peer quota attribution in `§III-B`, `Fig. 2`, `§V-B`, and `Table II` of `iccit2026-paper-camera-ready.tex`.

### - [x] D6 — ALS verification scope (§III.A & §III.D)
- **Verification / Experiment Status:**
  - `[x]` Implemented Ed25519 envelope author-signature verification (`checks.envelopeSignature`) in `packages/sdk-ts/src/core/audit-certificate.ts` and verified with a tampered-author-signature regression test on `POST /verify` in `services/audit-log/src/server.spec.ts`.
  - `[x]` Aligned `§III-D` and `Table I` in `iccit2026-paper-camera-ready.tex` with all `verifyAuditCertificate` checks (`requestPacket`, `contentIdentifier`, `serverIdentity`, `receiptSignature`, `envelopeSignature`, STH, inclusion proof).

### - [x] D7 — Steady-state CGNAT pull gap & uncancelled gRPC failover/deliver RPCs (found & fixed in code)
- **Solution & Verification Status:**
  - `[x]` Added `FederationInbox.lastInboundMs` (`federation-inbox.ts`), `FederationSync.pullMissing()` (`federation-sync.ts`), and `pullIntervalMs` (`FEDERATION_PULL_INTERVAL_MS`, default `2000 ms`, `federation.config.ts` / `federation.runtime.ts`) plus `FG-07` regression test (`federation.e2e.spec.ts`); Phase 7 `7b-1` steady-state CGNAT pull improved from `0/10` to **`10/10` (100%)**.
  - `[x]` Added `AbortSignal` to `FederationSender.deliver` (`network.port.ts`), `AbortController`-backed `withDeadline` (`federation-outbox.ts`), and `AbortSignal.timeout` bounds (`5 s` control, `15 s` deliver, `30 s` backfill in `federation-client.ts`) plus `federation-outbox.spec.ts` regression test; `pnpm gate:isp` dropped from **~5 min** to **`39.91 s`** (`22/22 PASS`).
  - `[x]` Documented periodic pull interval (`2 s`, stale threshold `2x = 4 s`) and `AbortSignal` RPC timeout bounds in `§III-C` and `§IV` of `iccit2026-paper-camera-ready.tex`.

---

## 4. Execution Progress Summary

1. **Environment & Baseline Gates:** Completed (Node deps installed, all workspace/Rust/Python baseline gates verified in `01-baseline-gates.json`).
2. **Code & Verification Hardening:** Completed in commit `01ce916` (cross-language Rust/Python canonical decoders + 20k differential fuzzer, `decode.ts` uint32 fix, `D6` ALS author-signature check, `D7` steady-state CGNAT pull timer, `R2.4`/`TG-06` `AbortSignal` + RPC timeouts, `.dockerignore`). Deferred to future work: peer-to-peer gRPC Merkle growth consistency verification, peer STH signature re-verification in `observePeerSth`, and distributed split-view detection (**R1.6**/**R2.7**).
3. **Single-Host Experiments & Harnesses:** Completed across all feasible single-host reviewer suites (`01`–`07*.json`). Multi-host deployment (**R1.1**/**R2.1**), sustained exhaustion thresholds (**R1.5**), and SBC benchmarks (**R2.3**) remain deferred to future work.
4. **Figures, Manuscript, Response & Change Log:** Preserved `iccit2026-paper.*`, `iccit2026-paper-pre.*`, `iccit2026-paper-prev-v2.*`, `2056-response-to-reviewers.pdf`, and pre-existing `figures/`/`figures-v2/` untouched. Generated `fig1-system-architecture-camera.svg`/`.pdf` and compiled final 6-page `iccit2026-paper-camera-ready.pdf`, 2-page `2056-response-to-reviewers-final.pdf`, and `CAMERA-READY-CHANGELOG.md`.

---

## 5. Measured Experiment & Verification Results

Raw machine-readable logs and JSON outputs live in [`ops/results/reviewer-experiments/`](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/):
- [01-baseline-gates.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/01-baseline-gates.json)
- [02-differential-fuzz.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/02-differential-fuzz.json)
- [03-route-cut-trials.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/03-route-cut-trials.json)
- [04-netem-emulation.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/04-netem-emulation.json)
- [05-stress-and-valid-load.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/05-stress-and-valid-load.json)
- [06-clean-sweep.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/06-clean-sweep.json)
- [07-ap-e2e-comparison.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/07-ap-e2e-comparison.json)

### 5.1 Baseline CI & Cross-Language Differential Fuzzing (Phases 1–2)
- **Baseline gates (`01-baseline-gates.json`):** `pnpm proto:check` (`50` domains: `30` forum, `20` signal), `pnpm vectors` (`16/16` across TS/Rust/Python), `@jagoo/sdk` (`13` files, `71` tests before Phase 2; `72` after Phase 2), `@jagoo/audit-log` (`1` file, `4` tests before D6), `@jagoo/backend` (`43` files passed, `3` live-Mongo/Redis files skipped; `533` passed, `13` skipped), `pnpm typecheck`, and `pnpm lint` (`0` errors) all exited `0`. `services/relay` Python tests skipped with exit `2` due to optional `grpc` dependency absent on host.
- **20,000-case differential fuzzer (`02-differential-fuzz.json`, seed `20260831`, `4,395 ms`):**
  - Valid/boundary corpus (`10,000` cases: `2,000` boundary, `2,000` NFC Unicode, `5,000` random full, `1,000` empty-AntiAbuse): **`10,000/10,000` encode & round-trip decode agreement (`0` disagreements)**.
  - Malformed/mutation corpus (`10,000` cases across 16 mutation classes, `625` each): **`9,455` rejected + `545` valid bit-flips accepted identically (`0` disagreements)**.
  - Initial fuzz pass uncovered a real cross-language uint32 bug at index `9758` (`wire_hex: 08ffffffff2f...`) where `packages/sdk-ts/src/core/decode.ts` lacked `<= 0xffffffffn` bounds on uint32 fields; fixed via `asUint32` + regression test.

### 5.2 Timed ISP Container Gate & Repeated Route-Cut Trials (`gate:isp` + Phase 3, $N=20$)
- **`pnpm gate:isp` (22/22 PASS criteria: `SETUP`×4, `TG-01`×2, `TG-02`×2, `TG-10`×1, `TG-03`×2, `TG-04`×5, `TG-05`×2, `TG-06`×4):** Previously ~5 min (due to `TG-06` blocking on `tcp_syn_retries=6`); after `AbortSignal.timeout` fix on rebuilt `jb-node:local`, completed in **`39.91 s`** total (`real 0m39.908s`).
- **Repeated route-cut trials (`03-route-cut-trials.json`, exact `jagoo_b1 - jagoo_a1` `received_at_ms` delta, `paceMs = 2500`):**

| Regime ($N=20$ each) | Metric | Delivered | Median (ms) | 95% CI (ms) | IQR (ms) | p95 (ms) | Max (ms) |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: |
| **IX intact** | Certificate | 20/20 (100%) | 581.0 | [439.5, 781.5] | 409.5 | 1083.3 | 1107 |
| **IX intact** | Community | 20/20 (100%) | 709.5 | [479.0, 874.0] | 431.0 | 1031.5 | 1097 |
| **IX intact** | Post | 20/20 (100%) | 735.0 | [507.0, 912.5] | 436.3 | 1017.4 | 1234 |
| **IX intact** | Chain span | 20/20 (100%) | 1104.5 | [859.5, 1275.5] | 452.3 | 1556.6 | 1682 |
| **IX cut (bridged)** | Certificate | 20/20 (100%) | 1374.5 | [985.5, 1657.5] | 921.3 | 1890.2 | 2103 |
| **IX cut (bridged)** | Community | 20/20 (100%) | 1706.5 | [1534.0, 1879.0] | 416.3 | 2163.4 | 2189 |
| **IX cut (bridged)** | Post | 20/20 (100%) | 1731.5 | [1481.5, 1841.0] | 446.3 | 2162.3 | 2167 |
| **IX cut (bridged)** | Chain span | 20/20 (100%) | 2013.0 | [1799.5, 2257.5] | 531.8 | 2441.0 | 2517 |

### 5.3 Controlled `tc netem` Impairment Matrix (Phase 4, TCP Port 8444 Isolated)
Executed on `jb-bridge` uplinks (`isp-a=eth0`, `isp-b=eth1`) with `tc prio` + `u32` filtering strictly on TCP port `8444` so container MongoDB/Redis RPCs remained unimpaired (`04-netem-emulation.json`, $N=10$ posts/scenario):

| Scenario | Shaping parameters (port 8444 only) | Delivered | Median (ms) | 95% CI (ms) | IQR (ms) | p95 (ms) | Max (ms) |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: |
| `baseline_clean` | 0 ms delay, 0% loss | 10/10 (100%) | 1153.5 | [929.0, 1491.0] | 482.3 | 1566.9 | 1624 |
| `high_rtt_jitter` | 150 ms ± 50 ms normal delay | 10/10 (100%) | 1201.5 | [1039.5, 1507.0] | 406.3 | 1662.1 | 1699 |
| `loss_5pct` | 50 ms ± 15 ms delay + 5% loss | 10/10 (100%) | 1210.0 | [1040.5, 1448.0] | 326.8 | 1599.6 | 1659 |
| `loss_10pct` | 75 ms ± 25 ms delay + 10% loss | 10/10 (100%) | 1377.0 | [1145.0, 1665.0] | 403.3 | 1724.8 | 1763 |
| `bw_128kbps` | 50 ms ± 10 ms + 2% loss + 128 kbit/s | 10/10 (100%) | 1335.0 | [1078.5, 1623.0] | 467.0 | 1719.7 | 1748 |
| `intermittent_flap` | 3× (8 s 100% loss / 8 s clear) | 10/10 (100%) | 18595.0 | [16841.0, 20071.0] | 2917.5 | 20869.0 | 21085 |

### 5.4 Adversarial Stress & Concurrent Valid-Write Scalability (Phase 5)
From `05-stress-and-valid-load.json` with MongoDB `system.profile` auditing (`writeOps`) and `envelopes`/`merkle_leaves`/`forum_posts` delta verification:

| Regime | Load ($c=$ concurrency) | Throughput (req/s) | Median (ms) | p95 (ms) | Response outcomes | DB `writeOps` / `envelopes` delta |
| --- | --- | ---: | ---: | ---: | --- | --- |
| `5a` HTTP default limiter | 3,000 invalid sig ($c=16$) | 1347 | 6.01 | 54.53 | 2,709 `RATE_LIMITED`, 204 `BAD_SIG`, 86 `MALFORMED`, 1 `ALG` | 0 / +0 |
| `5b` Pipeline saturation | 3,000 invalid sig ($c=16$) | 293 | 55.31 | 88.86 | 2,593 `BAD_SIG`, 399 `MALFORMED`, 4 `ALG`, 3 `CLOCK`, 1 `PRIO` | 0 / +0 |
| `5c` Malformed protobuf | 3,000 malformed ($c=16$) | 2383 | 5.87 | 11.59 | 3,000 `MALFORMED` (HTTP 400, **0** HTTP 500) | 0 / +0 |
| `5d-1` Exact duplicate | 1,000 identical ($c=16$) | 159 | 92.45 | 154.67 | 1,000 HTTP 200 idempotent receipt replays | 0 / +0 |
| `5d-2` Nonce replay (`jb:vote:cast:v1`)* | 1,000 reused nonce ($c=16$) | 134 | 116.06 | 180.40 | **1,000 HTTP 409 `REPLAY`** | 0 / +0 |
| `5e` 5-peer gRPC invalid sig | 500 CHECKIN frames | — | — | — | 0 accepted, 500 rejected | 0 / +0 |
| `5e` 5-peer gRPC over-quota | 4×50 frames/peer | — | — | — | Peers 0 & 3 demoted -> `PERMISSION_DENIED: peer is blocked` | 15 (`federation_peers`) / +0 env |
| `5f` Concurrent valid writes | 200 posts ($c=1$) | 29 | 32.06 | 49.41 | 200 `ACCEPTED` | +200 env / +200 leaves / +200 posts |
| `5f` Concurrent valid writes | 200 posts ($c=4$) | 27 | 104.33 | 352.60 | 200 `ACCEPTED` | +200 env / +200 leaves / +200 posts |
| `5f` Concurrent valid writes | 200 posts ($c=16$) | 9 | 1300.69 | 4132.36 | 200 `ACCEPTED` | +200 env / +200 leaves / +200 posts |
| `5f` Concurrent valid writes | 200 posts ($c=32$) | 6 | 4192.33 | 12586.59 | 200 `ACCEPTED` | +200 env / +200 leaves / +200 posts |

\* Note: `jb:post:create:v1` is `idempotent: true` (deduplicated at Stage 11 by `content_id`); Stage 12 `REPLAY` enforces spent nonces on non-idempotent domains (`idempotent: false`, e.g., `jb:vote:cast:v1`).

### 5.5 Clean Hop-Scaling & Drain-Interval Sweeps (Phase 6, $N=50$/config)
From `06-clean-sweep.json` (`jb-node:local`, clean `down -v` + 5 s cooldown between configs, `--pace=250`):
- **Repeat control (`n=4, drain=500ms`):** Start median `1067.0 ms` -> End median `1183.5 ms` (**10.9% drift**, well below L-35's 50% host-contention gate).
- **8-node linear chain (`n=8, drain=500ms`, 7 hops):** `50/50` delivered at every hop; hop 7 median `2368.0 ms` (`CI95 [2332.0, 2468.5]`, `IQR 190.8 ms`, `p95 2892.8 ms`), slope **`334.82 ms/hop`**, **`R^2 = 0.9936`**.
- **Drain-interval sweep (`n=4`, hop 3, 50/50 each):**
  - `drain=250 ms`: median `707.0 ms` (`IQR 129.0`, `R^2 = 0.9981`), `perHop = 235.67 ms`
  - `drain=500 ms`: median `1067.0 ms` (`IQR 248.5`, `R^2 = 0.9757`), `perHop = 355.67 ms`
  - `drain=1000 ms`: median `2365.0 ms` (`IQR 401.5`, `R^2 = 0.9906`), `perHop = 788.33 ms`
  - `drain=2000 ms`: median `5035.0 ms` (`IQR 815.8`, `R^2 = 0.9994`), `perHop = 1678.33 ms`
  - **Linear regression:** `per_hop_ms = 0.843 * drain_ms - 25.87` (**`R^2 = 0.9958`**).

### 5.6 Resource Footprint Summary (**R2.3**, `docker stats`)
- **ISP nodes (`03-route-cut-trials.json`):** Idle RAM `53.76–135.4 MiB` (`0.26%–1.24%` CPU); active cut-trial RAM `105.3–151.3 MiB` (`0.59%–30.72%` CPU). `mongo` instances `163.5–293.0 MiB`; `redis` `8.52–11.62 MiB`.
- **8-node chain (`06-clean-sweep.json`):** All 8 node containers ran in **`76.55–110.7 MiB` RSS each** (`jb-n5` peak `21.18%` CPU; shared `jb-scale-mongo` `184.2 MiB`, `jb-scale-redis` `8.99 MiB`).
- **Single-node valid-write stress (`05-stress-and-valid-load.json`):** `jb-stress-node` RAM rose cleanly from `87.18 MiB` (idle) -> `108.3 MiB` (`c=1`) -> `181.0 MiB` (`c=32`); `jb-stress-mongo` `150.0 -> 345.3 MiB`; `jb-stress-redis` stayed under `9.5 MiB`. (All node containers remained well inside a 512 MiB Raspberry Pi 4 RSS budget.)

### 5.7 End-to-End ActivityPub Comparison & CGNAT Verification (Phase 7, After Fix)
From `07-ap-e2e-comparison.json` (isolated `db_net` `10.95.1.0/24` vs. `wan_net` `10.95.2.0/24`; minimal Node.js AP HTTP-inbox baseline omits Ruby/Rails/Sidekiq overhead):
- **Constrained lossy link (`7a`: 128 kbit/s + 5% loss + 150 ms RTT on `wan_net`, $N=20$):**
  - **Jagoo Bahee:** `20/20` (100%) delivered, median **`520.5 ms`** (`CI95 [394, 586]`, `IQR 230 ms`, `p95 727.6 ms`), `36,928 B` `wan_net` TX (**`1,846.4 B/post`** including gRPC/HTTP2 framing & receipts; node RAM `88.09–91.88 MiB`).
  - **Minimal AP HTTP-inbox:** `20/20` (100%) delivered, median **`154.5 ms`** (`CI95 [144.5, 161]`, `IQR 18.5 ms`, `p95 282.65 ms`, `max 2,461 ms`), `25,566 B` `wan_net` TX (**`1,278.3 B/post`**; raw JSON-LD `1,585 B`, gzip `553 B`; baseline RAM `8.56–14.19 MiB`).
- **Live Mastodon sampling (`fosstodon.org`, $n=40$ real `Create`/`Note` objects):** Delivered p50 `3,931 B` (`p95 5,686 B`), gzipped p50 `1,063 B`, authored text p50 `258 B`, protocol overhead p50 **`3,627 B`** (`23.4×` check-in `155 B`, `20.5×` Bangla broadcast `177 B`, `17.6×` forum post `206 B`).
- **CGNAT asymmetric reachability (`7b-1` & `7b-2`, $N=10$ each):**
  - **Steady-state inbound blocked (`7b-1`, `-i <wanIf> --dport 8444/3000 -j DROP`):** ActivityPub HTTP-inbox push **`0/10` (0%)**; Jagoo Bahee steady-state periodic pull (`pullIntervalMs=2000 ms`, fixed **D7**) **`10/10` (100%)**, median **`1,045.5 ms`** (`CI95 [469, 1509]`, `p95 1,751.5 ms`).
  - **Outbound-only CGNAT node (`7b-2`, `FEDERATION_OUTBOUND_ONLY=true`, verified no port `8444` listener):** Catch-up pull via caller-initiated `Backfill` **`10/10` (100%)**, median **`4,957 ms`** from container start (`CI95 [4839.5, 5075]`); outbound push via caller-initiated `Deliver` **`10/10` (100%)**, median **`340.5 ms`** (`CI95 [191, 449]`).

### 5.8 Regenerated Publication Figures ([`figures-v2/`](file:///home/user/Projects/jagoo-bahee/final-paper/IEEE-conference-template-062824/figures-v2/))
All regenerated figures live in a separate directory (`final-paper/IEEE-conference-template-062824/figures-v2/`) generated deterministically by [generate_figures.py](file:///home/user/Projects/jagoo-bahee/final-paper/IEEE-conference-template-062824/figures-v2/generate_figures.py) (vector `.pdf`, `.svg`, and PDF-rasterized 300-DPI `.png` previews visually inspected for typography and layout). No files in the original `figures/` directory or `iccit2026-paper.tex` were modified.

| Figure | Files (`.pdf` / `.svg` / `.png`) | Target Size (pts) | Source Data | Reviewer Points Covered |
| --- | --- | --- | --- | --- |
| **Fig. 1** — System Architecture | [fig1-system-architecture.pdf](file:///home/user/Projects/jagoo-bahee/final-paper/IEEE-conference-template-062824/figures-v2/fig1-system-architecture.pdf) | `504 × 242` (`figure*`) | Architecture + **D6** | **R1.8**, **D6** (replaces raster `system-arch.jpg` & fixes clipped/overlapping labels) |
| **Fig. 2** — 19-Stage Admission Pipeline | [fig2-admission-pipeline.pdf](file:///home/user/Projects/jagoo-bahee/final-paper/IEEE-conference-template-062824/figures-v2/fig2-admission-pipeline.pdf) | `259 × 269` (1-col) | `ingress.ts` + **D4**/**D5** | **R1.8**, **D4**, **D5** (removes center gap; fixes Stage 8 clock window, Stage 14 authorise, HTTP vs. gRPC pre-gate) |
| **Fig. 3** — Route-Cut Topology (`N=20`) | [fig3-route-cut-topology.pdf](file:///home/user/Projects/jagoo-bahee/final-paper/IEEE-conference-template-062824/figures-v2/fig3-route-cut-topology.pdf) | `346 × 233` (1-col) | `03-route-cut-trials.json` | **R1.2**, **R1.8**, **R2.2** (replaces single-run `0.5/1.2/2.1 s` with `N=20` medians & 95% CIs) |
| **Fig. 4** — Hop & Drain-Interval Scaling | [fig4-hop-and-drain-scaling.pdf](file:///home/user/Projects/jagoo-bahee/final-paper/IEEE-conference-template-062824/figures-v2/fig4-hop-and-drain-scaling.pdf) | `439 × 207` (`figure*`) | `06-clean-sweep.json` | **R1.2**, **R1.8**, **R2.2** (clean axis labels, `N=50` IQR + 95% CI + p95 + `R²` fits across `250–2000 ms` drains) |
| **Fig. 5** — Route-Cut & `tc netem` Matrix | [fig5-route-cut-and-netem.pdf](file:///home/user/Projects/jagoo-bahee/final-paper/IEEE-conference-template-062824/figures-v2/fig5-route-cut-and-netem.pdf) | `446 × 207` (`figure*`) | `03` + `04-netem-emulation.json` | **R1.2**, **R1.3**, **R2.2** (intact vs. bridged distributions + 6 controlled `tc netem` port-8444 scenarios) |
| **Fig. 6** — Adversarial & Valid-Write Scaling | [fig6-stress-and-scalability.pdf](file:///home/user/Projects/jagoo-bahee/final-paper/IEEE-conference-template-062824/figures-v2/fig6-stress-and-scalability.pdf) | `533 × 207` (`figure*`) | `05-stress-and-valid-load.json` | **R1.5**, **R2.3**, **R2.5**, **D5** (`5a`–`5d-2` 0-write throughput + `5f` `c=1..32` throughput, p50/p95, node RSS MiB) |
| **Fig. 7** — ActivityPub & CGNAT Comparison | [fig7-ap-and-cgnat-comparison.pdf](file:///home/user/Projects/jagoo-bahee/final-paper/IEEE-conference-template-062824/figures-v2/fig7-ap-and-cgnat-comparison.pdf) | `512 × 212` (`figure*`) | `07-ap-e2e-comparison.json` | **R1.4**, **R2.6**, **D7** (live Mastodon `n=40` vs. JB overhead, `7a` lossy E2E, `7b-1`/`7b-2` CGNAT 10/10 vs. 0/10) |
