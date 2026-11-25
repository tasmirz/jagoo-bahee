# ICCIT 2026 Paper #2056 — Reviewer Remedy & Verification Plan

- **Manuscript:** `final-paper/IEEE-conference-template-062824/iccit2026-paper.tex` / `iccit2026-paper.pdf` (6 pages, 561,664 bytes)
- **Git HEAD:** `603e8957c9fa9fabc0bae13e4f13164e67afc6a2` (`feat: final paper draft for ICCIT 2026 submission`)
- **Paper Title:** *Islands of Reach: A Censorship-Resistant Federated Forum for National Internet Blackouts*
- **Status:** Planning / remedy tracking only — `iccit2026-paper.tex` has **not** been edited yet.

---

## 1. Reviewer #1 Checklist

### - [ ] R1.1 — Multi-host deployment beyond single-host Docker
- **Reviewer point:** Current experiments use Docker on a single host; unclear if the architecture behaves similarly in a multi-host experiment with independent machines, routers, and network connections.
- **Findings in codebase & paper:**
  - Already acknowledged as the primary limitation in Abstract, §IV, §VI (*Testbed validity*, `iccit2026-paper.tex:366`), and §VII.
  - Existing harnesses (`ops/isp-compose.yml`, `backend/src/cli/scale-gen.ts`) are single-host Docker Compose stacks sharing one kernel, clock, CPU, and storage subsystem.
  - The backend itself already supports multi-host HTTP/gRPC peering and explicit source-IP binding via `UPLINKS` (`backend/src/adapters/outbound/grpc/federation-client.ts`, `ops/isp-compose.yml`).
- **Solution:**
  - **Code / Experiment:** If multiple hosts/VMs are available (e.g., 3–4 separate VMs or physical machines on separate subnets/VLANs with NTP-synced clocks), deploy the `isp-compose.yml` topology across separate hosts (Island A nodes, Island B node, Dual-Homed Bridge) and run repeated route-cut trials measuring real inter-host RTT and delivery latency.
  - **Paper:** If multi-host hardware is unavailable before the revision deadline, keep the claim explicitly bounded to single-host container isolation, report NTP/clock-skew caveats clearly, and frame multi-host deployment as the immediate next evaluation step (without overclaiming wide-area generality).

---

### - [ ] R1.2 — Repeated trials & statistical rigor (median, variance, CIs, delivery success rates)
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
  - `[x]` Executed repeated route-cut trials ($N=20$ IX-intact, $N=20$ IX-cut bridged) and clean hop/drain scaling sweeps ($N=50$/config) in [03-route-cut-trials.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/03-route-cut-trials.json) and [06-clean-sweep.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/06-clean-sweep.json) — 100% delivery with medians, IQRs, 95% CIs, p95/p99, and $R^2$ fits.
  - `[x]` Regenerated vector PDF/SVG/PNG Figs. 3, 4, and 5 in `figures-v2/` (`fig3-route-cut-topology.pdf`, `fig4-hop-and-drain-scaling.pdf`, `fig5-route-cut-and-netem.pdf`) directly from measured distributions (original `figures/` untouched).
  - `[ ]` Incorporate statistical distributions into `iccit2026-paper.tex` & link the regenerated `figures-v2/` assets.

---

### - [ ] R1.3 — Controlled network emulation (packet loss, high latency, intermittent connectivity, bandwidth limits, varying paths)
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
  - `[x]` Generated `fig5-route-cut-and-netem.pdf` in `figures-v2/` plotting all 6 controlled `tc netem` scenarios alongside route-cut distributions.
  - `[ ]` Add the `tc netem` results table/subsection and figure reference to `iccit2026-paper.tex`.

---

### - [ ] R1.4 — End-to-end ActivityPub / store-and-forward comparison
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
  - `[x]` Generated `fig7-ap-and-cgnat-comparison.pdf` in `figures-v2/` comparing wire/overhead bytes, lossy-link E2E latency, and CGNAT blocked-inbound reachability.
  - `[ ]` Integrate end-to-end comparison + **R2.6** protocol-scope caveats into `iccit2026-paper.tex`.

---

### - [ ] R1.5 — Adversarial & valid-traffic stress tests (validly signed flood, multi-peer flood, replay storms, malformed protobufs, resource exhaustion)
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
  - `[x]` Generated `fig6-stress-and-scalability.pdf` in `figures-v2/` plotting adversarial/replay throughput and concurrent valid-write throughput, latency, and node RSS memory.
  - `[ ]` Update §V.B in `iccit2026-paper.tex` with the multi-regime breakdown and correct HTTP vs. peer-gRPC limiter attribution (**D5**).

---

### - [ ] R1.6 — Audit-log & consistency proof guarantees vs. unimplemented pieces
- **Reviewer point:** Manuscript admits full consistency proofs for growing logs are not implemented; clearly explain which accountability guarantees are in place today and which are future work.
- **Findings in codebase & paper:**
  - **Implemented today in code:**
    - RFC 6962 `consistencyPath` and `verifyConsistency` (`backend/src/core/domain/merkle.ts:126-229`, 18 tests in `backend/src/core/domain/merkle.spec.ts`).
    - HTTP endpoint `GET /v1/log/consistency?from=&to=` (`backend/src/adapters/inbound/http/forum-read.controller.ts:1070-1080`, `backend/src/adapters/outbound/mongo/mongo-stores.ts:489-490`).
    - Offline receipt + inclusion proof + STH verification (`packages/sdk-ts/src/core/evidence.ts:85-103`).
    - Independent ALS hash-chained record & issue-report stores (`services/audit-log/src/store.ts`, `services/audit-log/src/server.ts`), rejecting conflicting certificates for the same `(server_id, identifier)`.
    - Durable peer STH comparison (`backend/src/core/app/federation-inbox.ts:435-537`) that detects equal-size conflicting roots and newer-timestamp tree shrinkage, and discards stale out-of-order heads.
  - **Not yet implemented:**
    - Peer-to-peer gRPC consistency proof exchange/verification when a peer's tree grows (`federation-inbox.ts:534-536` explicitly returns `PeerLogStatus.UNKNOWN`).
    - Cross-observer split-view equivocation detection when partitions prevent peers from exchanging heads.
    - Automated ALS-side cross-STH consistency auditing across multiple receipts from the same server.
    - Proof of *omission before admission* (refusal to accept produces no receipt).
  - **Paper gap:** §VI (`iccit2026-paper.tex:372`) says blanket *"consistency proofs for growing trees, but these have not yet been implemented"* without distinguishing the implemented local RFC 6962 / HTTP endpoint from the unimplemented gRPC peer-exchange verification.
- **Solution:**
  - **Code (optional/recommended):** Wire `consistencyPath` / `verifyConsistency` into `ExchangeTreeHeads` (`federation-inbox.ts:534-536`) so peers verify append-only growth when `treeSize > previous.treeSize`, or clearly document the boundary if left as future work.
  - **Paper:** Add a crisp summary (or compact table) in §III.B / §VI separating: **(a) Enforced today** (post-admission receipt + inclusion proof, ALS hash-chained persistence, equal-size/shrinkage STH check, local HTTP consistency-proof generation) vs. **(b) Not yet enforced** (automated gRPC peer consistency verification on growth, split-view equivocation under partition, pre-admission refusal).

---

### - [ ] R1.7 — Property-based testing, differential fuzzing, malformed serialization, boundary value tests
- **Reviewer point:** 16 test vectors are not enough to fully validate the protocol; include Property-Based Testing (PBT), fuzzing, malformed serialization cases, and boundary value tests.
- **Findings in codebase & paper:**
  - No PBT or fuzzing (`fast-check`, `proptest`, `hypothesis`, `cargo-fuzz`) exists anywhere in the repo.
  - Only TypeScript (`packages/sdk-ts/src/vectors/decode.spec.ts`, 13 cases) tests malformed/non-canonical wire decoding; Rust and Python only test encoding/hashing on the 16 positive vectors (see Discrepancy #3 below).
- **Solution:**
  - **Code:**
    1. Add `fast-check` (TypeScript), `proptest` (Rust `crates/jb-core`), and `hypothesis` (Python `tools/vectors`) suites generating thousands of randomized & boundary-value envelopes (0/max varints, `int64` boundaries around $2^{53}$, empty vs. populated `AntiAbuse`, NFC/NFD Unicode & Bangla nukta clusters, max payload sizes, all enum boundaries).
    2. Add a cross-language **differential fuzzer** (e.g., 10,000+ generated + mutated wire byte sequences) verifying that TS, Rust, and Python agree identically on canonical bytes, content IDs, and accept/reject decisions for malformed/non-canonical inputs.
    3. Expand boundary & malformed serialization tests (overlong varints, truncated length prefixes, out-of-order tags, duplicate tags, unknown wire types 1/3/4/5/6/7, trailing garbage, invalid UTF-8).
  - **Paper:** Report the PBT/differential fuzzing corpus size, mutation classes, and zero-disagreement results in §IV & §V.A.
- **Verification / Experiment Status:**
  - `[x]` Implemented Rust (`crates/jb-core/src/decode.rs`, `src/bin/fuzz.rs`, `tests/vectors.rs`) & Python (`tools/vectors/jb_reference.py`, `fuzz.py`, `test_reference.py`) canonical decoders, boundary/negative tests, and cross-language 20,000-case differential fuzzer (`tools/vectors/fuzz-gate.mjs`); caught & fixed a real `uint32` truncation bug in `packages/sdk-ts/src/core/decode.ts` (case #9758) -> **0 disagreements / 20,000 cases** in [02-differential-fuzz.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/02-differential-fuzz.json).
  - `[ ]` Update §IV–§V.A in `iccit2026-paper.tex` with exact cross-language decoder & differential fuzzing scope.

---

### - [ ] R1.8 — Figure readability & thorough language/formatting polish
- **Reviewer point:** Small labels in Figs. 2 and 3, unclear axis labels in Fig. 4, and multiple grammatical errors throughout the manuscript.
- **Findings in submitted PDF & `iccit2026-paper.tex`:**
  - **Fig. 1** (`figures/system-arch.jpg`): Low-contrast raster JPEG with tiny text; should be vector PDF (`figures/drawio/previews/system-architecture.pdf` already exists in the repo!) with larger fonts.
  - **Fig. 2 & Fig. 3** (`figures/drawio/previews/admission-pipeline.pdf`, `route-cut-topology.pdf`): Sub-labels (`exact bytes`, `peer quota · outside pipeline`, `certificate 0.5 s -> community 1.2 s -> post 2.1 s`, IP addresses) are too small when scaled to single-column width.
  - **Fig. 4** (`iccit2026-paper.tex:299-317`): Uses `\tiny` tick labels, arrowhead-only `hop` / `seconds` labels rather than centered axis titles (`Hop count`, `End-to-end latency (s)`), and no error/IQR bars.
  - **Verified grammar / formatting slips in `iccit2026-paper.tex`:**
    - `L80`: `This proposed designed cannot` → `This proposed design cannot`
    - `L99`: `There is a difference currently present two fields.` → rewrite cleanly
    - `L115`: `` `(destination, source uplink, traffic class)` `` renders as `‘(...)‘` (use `\texttt{...}`)
    - `L162`: `A adversary` → `An adversary`
    - `L295`: `median End-to-end latency` → `median end-to-end latency`
    - `L296`: `fixed term; With a` → `fixed term. With a`
    - `L315`: `All the 200 envelopes` → `All 200 envelopes`
    - `L320`: `66 requests per seconds` → `66 requests per second`
    - `L370`: `range from find stable endpoints, ... isolate a node to pressuring a bridge operator.` → fix parallel gerunds (`finding ... isolating ... pressuring`)
    - `§§I–II`: Replace informal contractions (`doesn’t`, `can’t`, `we’ve`, `it’s`) with formal academic prose.
- **Solution:**
  - Regenerate Figs. 1–3 as crisp vector PDFs with larger font sizes (>= 8–9 pt at final column width), redraw Fig. 4 with proper axis titles, readable tick fonts, and IQR/CI error bars, and perform a full grammar/style pass over `iccit2026-paper.tex`.
- **Verification / Experiment Status:**
  - `[x]` Regenerated all 7 publication figures (`fig1`–`fig7` in `.pdf`, `.svg`, and 300-DPI `.png`) into [`final-paper/IEEE-conference-template-062824/figures-v2/`](file:///home/user/Projects/jagoo-bahee/final-paper/IEEE-conference-template-062824/figures-v2/) via [generate_figures.py](file:///home/user/Projects/jagoo-bahee/final-paper/IEEE-conference-template-062824/figures-v2/generate_figures.py) with `>= 8 pt` typography, **D4**/**D5**/**D6** alignment, `03`–`07` statistical bands/CIs, and visual PNG verification; original `figures/` left untouched.
  - `[ ]` Wire `figures-v2/` assets into `iccit2026-paper.tex` and apply the prose/grammar fixes above.

---

## 2. Reviewer #2 Checklist

### - [ ] R2.1 — Multi-host / non-virtualized evaluation & scoped conclusions
- **Reviewer point:** Evaluation is limited to a single physical host using virtual networks; conclusions should remain limited to the tested environment.
- **Solution:** Covered by **R1.1**; additionally tighten §VII (*Conclusion*) so every claim explicitly qualifies *"on our single-host containerized testbed"* (or multi-host if new multi-host trials are run).

---

### - [ ] R2.2 — Repeated trials, latency distributions, and variability
- **Reviewer point:** Route-cut results are single runs; conduct repeated trials and report latency distributions and variability.
- **Solution:** Covered by **R1.2** (report median, IQR/std dev, min/max or 95% CI, and delivery rates across repeated trials).
- **Verification / Experiment Status:**
  - `[x]` Completed in [03-route-cut-trials.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/03-route-cut-trials.json) ($N=20$) and [06-clean-sweep.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/06-clean-sweep.json) ($N=50$).
  - `[x]` Regenerated `fig3-route-cut-topology.pdf`, `fig4-hop-and-drain-scaling.pdf`, and `fig5-route-cut-and-netem.pdf` in `figures-v2/` (original `figures/` untouched).
  - `[ ]` Update `iccit2026-paper.tex` & link `figures-v2/` figures.

---

### - [ ] R2.3 — Clarify resource consumption (CPU, RAM, disk, SBC plausibility)
- **Reviewer point:** Clarify resource consumption.
- **Findings in codebase & paper:**
  - Zero CPU, memory, or storage measurements appear in the 6-page paper, yet §VI (`iccit2026-paper.tex:374`) has an orphaned sentence: *"Resource figures were taken on x86 hardware and say nothing about the single-board computers a community deployment would use."*
- **Solution:**
  - **Code / Experiment:** Record idle, steady-state, and flood/chain-load CPU %, RSS memory (MiB), and MongoDB/Redis disk footprint per node (`docker stats` + process metrics) during the experiments.
  - **Paper:** Report a concise resource table/paragraph in §V (and remove or ground the orphaned §VI sentence).
- **Verification / Experiment Status:**
  - `[x]` Recorded container CPU %, RSS memory, network I/O, and PID counts across idle, active cut trials ([03-route-cut-trials.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/03-route-cut-trials.json)), 8-node linear chain ([06-clean-sweep.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/06-clean-sweep.json)), `c = 1, 4, 16, 32` stress ([05-stress-and-valid-load.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/05-stress-and-valid-load.json)), and ActivityPub comparison ([07-ap-e2e-comparison.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/07-ap-e2e-comparison.json)).
  - `[x]` Annotated node RSS memory (`108–181 MiB`) directly on `fig6-stress-and-scalability.pdf` in `figures-v2/`.
  - `[ ]` Add measured resource table/summary to §V and ground §VI in `iccit2026-paper.tex`.

---

### - [ ] R2.4 — Clarify transport timeout & backoff behavior
- **Reviewer point:** Clarify transport timeout behaviour.
- **Findings in codebase & paper:**
  - `iccit2026-paper.tex:185-189` notes that a delivery deadline bounds how long the drain pass waits without cancelling the underlying transport call, but omits concrete timeout, backoff, dead-letter, and probe parameters.
  - Codebase values:
    - `DEFAULT_DELIVER_TIMEOUT_MS = 15_000` (15 s) via `withDeadline` (`backend/src/core/app/federation-outbox.ts:83,92-105`).
    - Exponential backoff: `INITIAL_BACKOFF_MS = 1_000` (1 s) up to `MAX_BACKOFF_MS = 15 * 60 * 1000` (15 min), dead-lettering after `MAX_DELIVERY_ATTEMPTS = 13` (~2 hours) (`backend/src/core/domain/federation/backoff.ts:16-32`).
    - Peer backpressure hints capped at `60,000 ms` (`backoff.ts:55-63`).
    - Uplink health probe in testbed: `PROBE_INTERVAL_MS=5000`, `PROBE_FAILURE_THRESHOLD=2`, `PROBE_TIMEOUT_MS=1500` (`ops/isp-compose.yml:64-66`).
    - `streamActivities` already accepts `AbortSignal` (`federation-client.ts:208-226`), whereas `deliver` previously did not.
- **Solution:**
  - **Code:** Pass `AbortSignal` into `FederationSender.deliver` so `withDeadline` cancels stuck gRPC streams rather than leaving them open, and bound unary/backfill RPCs.
  - **Paper:** State the exact timeout (`15 s`), backoff (`1 s → 15 min`, 13 attempts), `AbortSignal` cancellation, and uplink-probe parameters in §III.C.
- **Verification / Experiment Status:**
  - `[x]` Implemented `AbortSignal` propagation in `FederationSender.deliver` (`network.port.ts`, `federation-outbox.ts`) and `AbortSignal.timeout` bounds (`5 s` control, `15 s` deliver, `30 s` backfill in `federation-client.ts`) with regression test in `federation-outbox.spec.ts`; cut `pnpm gate:isp` `TG-06` failover runtime from ~5 min (`~4m20s` kernel `tcp_syn_retries=6` stall) to `39.91 s` total.
  - `[ ]` Update §III.C in `iccit2026-paper.tex` with concrete timeout, cancellation, and backoff parameters.

---

### - [ ] R2.5 — Scalability under concurrent valid traffic
- **Reviewer point:** Clarify scalability under concurrent valid traffic.
- **Findings in codebase & paper:**
  - `scale-measure.ts` drives a single origin publisher (`jb-n0`); no multi-publisher or concurrent-client valid-traffic benchmark is reported.
- **Solution:**
  - **Code / Experiment:** Run concurrent valid-post benchmarks (e.g., `c = 4, 16, 32` concurrent clients publishing valid signed envelopes across multiple origins/communities) and report throughput (req/s), p50/p99 latency, queue depth, and delivery completeness.
  - **Paper:** Add the concurrent valid-traffic results to §V.B alongside the adversarial flood breakdown.
- **Verification / Experiment Status:**
  - `[x]` Executed concurrent valid-write benchmark (`32` certified identities, `200` posts each at `c = 1, 4, 16, 32`, `200/200` accepted & projected to `forum_posts`) in [05-stress-and-valid-load.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/05-stress-and-valid-load.json).
  - `[x]` Generated `fig6-stress-and-scalability.pdf` in `figures-v2/` showing `c = 1, 4, 16, 32` throughput, median/p95 latency, and node RSS MiB.
  - `[ ]` Report `c = 1, 4, 16, 32` valid-traffic throughput/latency table in §V.B of `iccit2026-paper.tex`.

---

### - [ ] R2.6 — Cautious ActivityPub size comparison
- **Reviewer point:** ActivityPub size comparison should be interpreted cautiously because the protocols differ in functionality and interoperability.
- **Solution:** Covered by **R1.4**; strengthen the framing in §IV, Table I, and §V.B to emphasize that the byte ratio reflects fixed-schema protobuf vs. extensible JSON-LD federation rather than an apples-to-apples functional equivalence.
- **Verification / Experiment Status:**
  - `[x]` Added controlled end-to-end wire TX + latency + CGNAT comparison in [07-ap-e2e-comparison.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/07-ap-e2e-comparison.json) alongside live `fosstodon.org` ($n=40$) sampling.
  - `[ ]` Strengthen protocol-scope caveats alongside Table I in `iccit2026-paper.tex`.

---

### - [ ] R2.7 — Clearer audit-log & fork-detection security guarantees
- **Reviewer point:** Proposed audit-log and consistency mechanisms need clearer discussion of security guarantees, particularly since full fork detection is not implemented.
- **Solution:** Covered by **R1.6** (explicitly separate what is enforced locally today from unimplemented growth consistency proofs and cross-observer equivocation detection).

---

### - [ ] R2.8 — Minor grammatical issues & conference theme fit
- **Reviewer point:** Improve minor grammatical issues and clarify the paper's fit with the conference themes.
- **Solution:**
  - Fix all grammar/style issues listed in **R1.8**.
  - Add 1–2 explicit sentences in §I (and §VII) connecting the work to ICCIT themes (resilient computer networks, distributed systems, and network security under partial/shutdown connectivity).
- **Verification / Experiment Status:**
  - `[x]` Visual figure readability and labeling fixes completed in `figures-v2/` (see **R1.8** and §5.8; original `figures/` untouched).
  - `[ ]` Apply grammar/prose polish and ICCIT theme sentences in `iccit2026-paper.tex`.

---

## 3. Additional Code-vs-Paper Discrepancies Caught During Verification

### - [ ] D1 — Orphaned cross-references & leftover text from 6-page trimming
- **Finding:**
  - `iccit2026-paper.tex:183` (§III.C) states the serial-drain defect is *"described in §V"*, but §V does not mention the serial-drain defect (`407.6 s → 2.1 s`).
  - `iccit2026-paper.tex:374` (§VI) references *"Resource figures were taken on x86 hardware..."* and *"voice-channel systems"*, neither of which exists in the 6-page paper.
- **Solution:** Either restore a brief mention of the serial-drain `407.6 s → 2.1 s` fix and actual x86 resource measurements in §V, or remove the dangling references.

### - [ ] D2 — Markdown backticks & incorrect outbox scheduler key in §III.A
- **Finding:** `iccit2026-paper.tex:115` writes `` `(destination, source uplink, traffic class)` `` (rendering as curly quotes `‘(...)‘`). Moreover, `mongo-federation.ts:414-420` and `federation-outbox.ts:226-232` drain in `{ priority: 1, sequence: 1 }` order and batch by `(peerId, plane)`; `(source uplink, destination uplink, priority)` is the *bridge quota* key, not the outbox drain key.
- **Solution:** Replace backticks with `\texttt{...}` and describe the actual `(priority, sequence)` outbox drain order + `(peer, plane)` batching vs. the bridge's `(fromUplink, toUplink, priority)` quota key.

### - [ ] D3 — Cross-language negative vector overclaim (§IV & §V.A)
- **Finding:** `iccit2026-paper.tex:229-232,285` claims TS, Rust, and Python all execute and reject negative byte vectors. Previously, `tools/vectors/fixtures/envelopes.json` contained 16 *positive* encoding vectors and only TypeScript (`packages/sdk-ts/src/vectors/decode.spec.ts`) implemented a canonical wire decoder and rejected malformed bytes; Rust (`crates/jb-core/tests/vectors.rs`) tested Ed25519 signature rejection across separation pairs, and Python (`tools/vectors/test_reference.py`) tested canonical byte/CID inequality.
- **Solution:** Either implement canonical decoders + negative byte tests in Rust (`jb-core`) and Python (`jb_reference.py`) alongside the new differential fuzzer (**R1.7**), or state the exact per-language test scope accurately in §IV–§V.A.
- **Verification / Experiment Status:**
  - `[x]` Implemented canonical decoders and 15 negative/boundary tests each in Rust (`crates/jb-core/src/decode.rs`, `tests/vectors.rs`) and Python (`tools/vectors/jb_reference.py`, `test_reference.py`), plus 20,000-case differential fuzzer (`tools/vectors/fuzz-gate.mjs`); fixed `asUint32` truncation bug in `packages/sdk-ts/src/core/decode.ts` ([02-differential-fuzz.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/02-differential-fuzz.json)).
  - `[ ]` Align §IV–§V.A text in `iccit2026-paper.tex` with the now-symmetric canonical decoders & differential fuzzing suite.

### - [ ] D4 — Envelope `expiry` field & Stage 1–12 `authorisation` mismatch (§III.B)
- **Finding:**
  - `iccit2026-paper.tex:123` lists `expiry` as an envelope field, whereas `proto/jagoo/v1/envelope.proto:22-36` has `created_at_ms` validated against `[now - 7d, now + 10m]` (`backend/src/core/domain/pipeline/clock-window.ts`).
  - `iccit2026-paper.tex:134` places `authorisation` inside `Stages 1 through 12`, contradicting `backend/src/core/app/ingress.ts:118-204` and Fig. 2, where `AUTHORISE` is Stage 14 (after Stage 13 `ANTI-ABUSE`).
- **Solution:** Update §III.B to `timestamp (created_at_ms)` checked against a bounded clock window, and remove `authorisation` from the Stages 1–12 list (it is Stage 14).

### - [ ] D5 — Flood rate-limiter misattribution (§V.B)
- **Finding:** `iccit2026-paper.tex:320` attributes the ~2,700 blocked requests to the *"per-peer rate limiter"*, whereas `ops/flood.js:65-70` posts to HTTP `POST /v1/envelopes`, hitting the HTTP IP/network-subject rate limiter (`request-security.interceptor.ts`), not the gRPC federation `PeerQuotaLimiter`.
- **Solution:** Correct the label to *HTTP per-client/network-subject rate limiter* and separately test the gRPC `PeerQuotaLimiter` alongside multi-peer flood experiments (**R1.5**).
- **Verification / Experiment Status:**
  - `[x]` Separately benchmarked HTTP per-client rate limiting (`5a`: 2,709/3,000 `RATE_LIMITED`) and 5-peer gRPC `PeerQuotaLimiter` demotion (`5e`: `PROBATION -> BLOCKED`, `PERMISSION_DENIED: FORBIDDEN: peer is blocked`) in [05-stress-and-valid-load.json](file:///home/user/Projects/jagoo-bahee/ops/results/reviewer-experiments/05-stress-and-valid-load.json).
  - `[ ]` Correct the rate-limiter label in §V.B of `iccit2026-paper.tex`.

### - [ ] D6 — ALS verification scope (§III.A)
- **Finding:** `iccit2026-paper.tex:119` states each ALS *"re-verifies the envelope, content identifier, receipt, signed tree head, and inclusion proof"*. Previously, `packages/sdk-ts/src/core/audit-certificate.ts:169-185` verified canonical decoding (`decodeSignedEnvelope`), content ID, server ID, receipt signature, STH signature, and inclusion proof, but did **not** verify the envelope's **author Ed25519 signature**.
- **Solution:** Add author-signature verification (`envelopeSignature`) to `verifyAuditCertificate` so the implementation matches §III.A's claim.
- **Verification / Experiment Status:**
  - `[x]` Implemented Ed25519 envelope author-signature verification (`checks.envelopeSignature`) in `packages/sdk-ts/src/core/audit-certificate.ts` and verified with a tampered-author-signature regression test on `POST /verify` in `services/audit-log/src/server.spec.ts`.
  - `[ ]` Confirm §III.A wording matches `verifyAuditCertificate` checks (`requestPacket`, `contentIdentifier`, `serverIdentity`, `receiptSignature`, `envelopeSignature`).

### - [ ] D7 — Steady-state CGNAT pull gap & uncancelled gRPC failover/deliver RPCs (found & fixed in code)
- **Finding (discovered during reviewer experiments):**
  1. **Steady-state CGNAT pull gap (`7b` initial run):** `FederationService.streamActivities` (`backend/src/adapters/inbound/grpc/federation.service.ts:259-261`) yielded the finite log snapshot and closed at EOF, while `FederationRuntime.onApplicationBootstrap` (`backend/src/composition/federation.runtime.ts:67-69`) invoked `sync.connect(peer.serverId)` only once at startup (`federation.e2e.spec.ts:571` masked this by manually calling `nat.sync.backfillFrom(...)`). Consequently, blocking inbound `:8444` on an already-running node (`jb-cmp-b`) yielded `0/10` steady-state delivery before the fix.
  2. **Uncancelled gRPC RPCs / `TG-06` failover stall:** Under `isp-compose` bridge failover (`TG-06`), forcing `isp-a` `down` caused `selectPath` to fall back to `isp-b` (`10.90.2.30`) toward unreachable `10.90.1.4`/`10.90.1.5` sockets; without per-RPC `AbortSignal` timeouts, each `Announce` blocked for the Linux kernel `tcp_syn_retries=6` timeout (~130 s per peer, ~4m20s total), and `FederationSender.deliver` lacked `AbortSignal` cancellation (**R2.4**).
- **Solution & Verification Status:**
  - `[x]` Added `FederationInbox.lastInboundMs` (`federation-inbox.ts`), `FederationSync.pullMissing()` (`federation-sync.ts`), and `pullIntervalMs` (`FEDERATION_PULL_INTERVAL_MS`, default `2000 ms`, `federation.config.ts` / `federation.runtime.ts`) plus `FG-07` regression test (`federation.e2e.spec.ts`); Phase 7 `7b-1` steady-state CGNAT pull improved from `0/10` to **`10/10` (100%)**.
  - `[x]` Added `AbortSignal` to `FederationSender.deliver` (`network.port.ts`), `AbortController`-backed `withDeadline` (`federation-outbox.ts`), and `AbortSignal.timeout` bounds (`5 s` control, `15 s` deliver, `30 s` backfill in `federation-client.ts`) plus `federation-outbox.spec.ts` regression test; `pnpm gate:isp` dropped from **~5 min** to **`39.91 s`** (`22/22 PASS`).
  - `[ ]` Document periodic pull catch-up interval (`2 s`) and `AbortSignal` RPC timeout bounds in §III.C/§IV of `iccit2026-paper.tex`.

---

## 4. Execution Progress Summary

1. **Environment & Baseline Gates:** Completed (Node deps installed, all workspace/Rust/Python baseline gates verified).
2. **Code & Verification Hardening:** Completed (cross-language Rust/Python canonical decoders + 20k differential fuzzer, `decode.ts` uint32 fix, `D6` ALS author-signature check, `D7` steady-state CGNAT pull timer, `R2.4`/`TG-06` `AbortSignal` + RPC timeouts, `.dockerignore`). Pending optional future work: peer-to-peer gRPC Merkle consistency verification (**R1.6**).
3. **Single-Host Experiments & Harnesses:** Completed across all feasible single-host reviewer suites (`01`–`07*.json`). Multi-host deployment (**R1.1**/**R2.1**) remains hardware-blocked on a single host.
4. **Figures & Manuscript Revision:** Figures regenerated into [`figures-v2/`](file:///home/user/Projects/jagoo-bahee/final-paper/IEEE-conference-template-062824/figures-v2/) (original `figures/` preserved untouched); manuscript revision (`iccit2026-paper.tex`) intentionally untouched.

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
- **20,000-case differential fuzzer (`02-differential-fuzz.json`, seed `20260831`, `5,166 ms`):**
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
