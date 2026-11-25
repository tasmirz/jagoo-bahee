# Response to Reviewers — ICCIT 2026 Paper #2056

**Title:** *Islands of Reach: A Censorship-Resistant Federated Forum for National Internet Blackouts*

We sincerely thank Reviewer #1 and Reviewer #2 for their thorough, constructive feedback. Because the paper was accepted, we carried out a targeted camera-ready revision that preserves the original research motivation, architecture, and core contributions while incorporating the necessary technical clarifications, statistical reporting, controlled experiments, figure/prose improvements, and explicit scope boundaries.

Below is our point-by-point response noting what changed, what was measured or clarified, where each change appears in the final manuscript (`iccit2026-paper-camera-ready.pdf`), and which items remain open as future work.

---

## Reviewer #1

1. **Multi-host validation beyond single-host Docker**
   - **Clarified & scoped:** All controlled experiments share one physical x86_64 host (Intel Core i5-8265U, 8 logical CPUs, 19.38 GiB RAM) running isolated Docker virtual networks (`node:20-alpine`, MongoDB 7, Redis 7). We explicitly bounded all claims in the Abstract, Methodology, Discussion/Limitations, and Conclusion to this single-host testbed.
   - **Where in manuscript:** Abstract, `§IV`, `§VI` (*Testbed and measurement limits*), `§VII`.
   - **Remaining open:** Independent multi-host deployment across separate machines and physical routers, with measured inter-host clock skew and wide-area latency, remains future work.

2. **Repeated trials and statistical rigor (route-cut latency)**
   - **Changed & measured:** Replaced the earlier single-run headline numbers (`0.5`, `1.2`, `2.1` s) with a repeated measurement protocol: we submitted 20 fresh dependency chains (author certificate, community record, and post) with the exchange intact, withdrew the direct exchange path once, and submitted another 20 fresh chains through the dual-homed bridge using the same running stack (`20/20` delivered in each regime). Post medians rose from `735 ms` (`IQR 436 ms`, `SD 260 ms`, `95% CI 507–913 ms`) intact to `1,732 ms` (`IQR 446 ms`, `SD 298 ms`, `95% CI 1,482–1,841 ms`) bridged, with certificate, community, and chain-span medians also reported. We explicitly note that the bootstrap intervals characterize within-run variation and that sequential conditions on one stack cannot separate route effects from host-load drift.
   - **Where in manuscript:** Abstract, `§IV`, `§V-A`, `§VI`, `Fig. 5a`.

3. **Controlled network emulation (loss, latency, bandwidth, intermittent paths)**
   - **Changed & measured:** Added six controlled `tc netem` scenarios shaping only bridge federation traffic on TCP port `8444` (`1` unshaped control plus `5` impairment conditions, `10` posts each): unshaped control (`1.154 s`), `150 ± 50 ms` egress delay (`1.202 s`), `5%` loss with delay (`1.210 s`), `10%` loss with delay (`1.377 s`), `128 kbit/s` cap with delay and `2%` loss (`1.335 s`), and `3` cycles of `8 s` full loss / `8 s` recovery on the bridge's island-B uplink (`18.595 s`, `95% CI 16.841–20.071 s`). All `10/10` posts arrived in each tested condition, explicitly qualified as characterizing those tested regimes rather than arbitrary networks.
   - **Where in manuscript:** Abstract, `§IV`, `§V-A`, `Fig. 5b`.

4. **End-to-end ActivityPub / store-and-forward baseline**
   - **Changed & measured:** Added a controlled dual-network comparison pairing two Jagoo Bahee nodes against two minimal Node.js ActivityPub HTTP-inbox peers (gzip, Ed25519 HTTP Signatures, push retries) over the same shaped WAN link (`128 kbit/s`, `5%` loss, `75 ± 15 ms` per direction). Both delivered `20/20` posts: Jagoo Bahee had `520.5 ms` median (`CI 394–586 ms`), `1,846.4 B/post` sender-interface traffic, and `88–92 MiB` RAM, versus `154.5 ms` (`CI 145–161 ms`), `1,278.3 B/post`, and `9–14 MiB` for the minimal inbox (which omits Mastodon's web and worker stack). With shaping removed and inbound federation ports blocked, periodic pull recovered `10/10` posts (`1.046 s` median) while minimal-inbox push delivered `0/10`; an outbound-only node with no gRPC listener backfilled `10/10` (`4.957 s` from startup) and pushed `10/10` (`0.341 s`). We explicitly qualify that timed intervals and persistence semantics differ across the two implementations.
   - **Where in manuscript:** Abstract, `§IV`, `§V-C`, `Table III`.

5. **Adversarial stress, replay, malformed inputs, valid writes, and resource exhaustion**
   - **Changed & measured:** Expanded the stress evaluation beyond the default HTTP rate limiter (`2,709/3,000` rejected at `1,347 req/s`) to include: raised HTTP limit isolating bad-signature rejection (`2,593/3,000`, `293 req/s`), malformed protobuf flood (`3,000` HTTP 400 / `0` HTTP 500 at `2,383 req/s`), exact duplicates (`1,000` existing receipts, `159 req/s`), non-idempotent nonce reuse (`1,000` HTTP 409 replays, `134 req/s`)—all with zero profiled database writes—plus five-peer gRPC invalid-signature rejection (`500/500`), over-quota peer blocking (`2` peers blocked, `15` peer-state writes, `0` envelopes admitted), and local concurrent valid writes (`200` posts/setting at `c = 1, 4, 16, 32`).
   - **Where in manuscript:** `§IV`, `§V-B`, `§VI`, `Table II`.
   - **Remaining open:** Sustained resource-exhaustion thresholds, disk growth, and peak resident memory remain unmeasured and are identified as open work (`§VI`, `§VII`).

6. **Accountability guarantees vs. unimplemented mechanisms**
   - **Changed & clarified:** Added an explicit breakdown and summary table distinguishing enforced mechanisms from open gaps: (i) server-signed admission receipts and inclusion proofs are independently verified (including canonical decoding, author Ed25519 signature, receipt signature, STH, and proof) and stored by ALSs; (ii) local RFC 6962 consistency proof generation and HTTP retrieval are implemented; (iii) peer head comparison checks that heads name the expected server key, discards stale timestamps, and flags conflicting roots at equal size or newer tree shrinkage; (iv) refusal before admission produces no receipt.
   - **Where in manuscript:** `§III-D`, `Table I`, `§VI`.
   - **Remaining open:** Peer gRPC consistency verification when a peer's tree grows, STH signature re-verification during peer head observation, automated ALS cross-head auditing, and distributed split-view detection remain open (`§III-D`, `Table I`, `§VI`, `§VII`).

7. **Cross-language property-based testing and differential fuzzing**
   - **Changed & measured:** Implemented canonical decoders and negative and boundary suites in Rust and Python alongside TypeScript, and ran a `20,000`-case seeded differential fuzzer in addition to the `16` canonical reference vectors: `10,000` generated wire-format cases (numeric boundaries, NFC Unicode, empty anti-abuse fields) matched byte-for-byte, and across `16` mutation classes (`10,000` cases) all three decoders rejected the same `9,455` inputs and decoded the same `545` valid bit-flips with `0` disagreements (after fixing an unsigned 32-bit bounds bug in TypeScript covered by a regression test). We explicitly clarify that these tests verify wire-format agreement rather than signature verification, application admission, or full protocol security.
   - **Where in manuscript:** Abstract, `§IV`, `§V-A`.

8. **Figure readability, language quality, and editorial polish**
   - **Changed:** Replaced the low-contrast raster architecture diagram with a crisp vector `Fig. 1` explicitly distinguishing conceptual (`L0`), Docker-evaluated (`L1–L3`), and out-of-scope (`L4`) regimes; clarified the `19`-stage admission table (`Fig. 2`, specifying pre-gate quotas and Stage 14 authorization); redrew `Fig. 3` in vector TikZ; replaced `Fig. 4` with clearly labeled `50`-post hop-scaling and drain-sweep plots with IQR/95% CI/p95 bands and cited it explicitly in `§V-B`; added `Fig. 5` for route-cut and `tc netem` distributions; fixed grammatical slips, contractions, and `created_at_ms` (clock-window vs. expiry) terminology throughout.
   - **Where in manuscript:** `Figs. 1–5`, `§§I–VII`.

---

## Reviewer #2

1. **Single-host testbed scope and bounded conclusions**
   - **Changed & clarified:** Bounded all conclusions in the Abstract, `§I`, `§IV`, `§VI`, and `§VII` strictly to proof-of-concept feasibility within the tested single-host Docker environment.
   - **Where in manuscript:** Abstract, `§I`, `§IV`, `§VI`, `§VII`.
   - **Remaining open:** Independent multi-host deployment across separate physical machines, routers, and links with measured clock skew (`§VI`, `§VII`).

2. **Repeated trials, latency distributions, and variability**
   - **Changed & measured:** Reported medians, IQRs, sample standard deviations, 95% within-run bootstrap intervals, and `20/20` delivery counts for the route-cut experiment (`20` intact chains followed by one exchange cut and `20` bridged chains on the same stack), `10/10` across all `6` `tc netem` conditions, and `50`-post distributions (`IQR`, `95% CI`, `p95`, and linear `R^2` fits) across the `8`-node chain and `4`-node drain sweep (`10.9%` repeat-control shift).
   - **Where in manuscript:** `§IV`, `§V-A`, `§V-B`, `Fig. 4`, `Fig. 5`.

3. **Resource consumption (CPU, RAM, disk, single-board hardware)**
   - **Changed & measured:** Reported container memory and CPU snapshots from Docker across valid-write stress (`87 MiB` idle, `108–181 MiB` post-batch; MongoDB `150–345 MiB`, Redis `< 9.5 MiB`), the `8`-node chain (`77–111 MiB` per node, max sampled CPU `21.18%`; shared MongoDB `184 MiB`, Redis `9 MiB`), route-cut active containers (`105–151 MiB`, `0.59–30.72%` CPU), and the ActivityPub comparison (`88–92 MiB` vs. `9–14 MiB` for the minimal inbox).
   - **Where in manuscript:** `§§V-B–C`, `§VI`, `Table II`.
   - **Remaining open:** Peak resident memory, disk footprint, sustained exhaustion limits, and benchmarking on single-board computers remain unmeasured (`§VI`).

4. **Transport timeout, cancellation, and backoff behavior**
   - **Changed & clarified:** Documented exact RPC deadlines (`5 s` control, `15 s` delivery with `AbortSignal` cancellation, `30 s` backfill), exponential retry backoff (`1 s` doubling to `15 min` cap, dead-lettering on the `13`th failure after `47 min 3 s` cumulative backoff), `60 s` peer backpressure cap, and testbed uplink probes (`5 s` interval, `1.5 s` timeout, `2`-failure threshold). Also documented separately which datasets (`03`–`06`) precede the rebuild introducing bounded RPC cancellation/steady-state pull versus which (`02`, `07`, rebuilt `22/22` ISP gate in `39.91 s`) run on the rebuilt build.
   - **Where in manuscript:** `§III-C`, `§IV`, `§V-A`.

5. **Scalability under concurrent valid traffic**
   - **Changed & measured:** Evaluated `200` valid signed posts per concurrency setting (`c = 1, 4, 16, 32`) across `32` certified identities on a single node (`200/200` projected in every setting): throughput declined from `29` to `27`, `9`, and `6 requests/s`, median latency rose from `32.06 ms` to `4,192.33 ms`, p95 rose from `49.41 ms` to `12,586.59 ms`, and p99 rose from `60 ms` to `15.940 s`. We explicitly state that these results characterize local single-node admission scalability under shared storage rather than concurrent end-to-end federation capacity, and avoid attributing a specific bottleneck without per-stage profiling.
   - **Where in manuscript:** `§IV`, `§V-B`, `Table II`.

6. **Cautious ActivityPub size and end-to-end comparison**
   - **Changed & clarified:** Separated representation sizes (earlier `80`-activity `1,074 B` gzipped median and `40`-activity `fosstodon.org` sample of `3,931 B` raw / `1,063 B` gzipped / `3,627 B` non-text overhead vs. Jagoo Bahee's `155`, `177`, `206 B` non-text) from sender-interface traffic (`1,846.4 B/post` vs. `1,278.3 B/post` on the shaped link). Retained both favorable (blocked-inbound pull `10/10` vs. `0/10`) and unfavorable (higher latency and wire bytes vs. minimal push inbox) findings, explicitly noting that timed operations, persistence semantics, schema evolution, and Fediverse interoperability differ across the tested implementations.
   - **Where in manuscript:** `§IV`, `§V-C`, `§VI`, `Table III`.

7. **Clearer audit-log security guarantees and fork detection**
   - **Changed & clarified:** Clarified exact boundaries of admission receipts, local HTTP RFC 6962 consistency proofs, and peer-head observation (`§III-D`, `Table I`): peer observation verifies server-key attribution, discards stale timestamps, and detects equal-size conflicting roots or newer tree shrinkage, without verifying STH signatures on observed peer heads or verifying append-only consistency across growing logs; isolated observers can still receive undetected split views.
   - **Where in manuscript:** `§III-D`, `Table I`, `§VI`.
   - **Remaining open:** Peer gRPC consistency verification on growth, STH signature verification on peer observation, and distributed split-view detection remain open (`§III-D`, `Table I`, `§VI`, `§VII`).

8. **Grammar, clarity, and conference theme fit**
   - **Changed:** Edited prose and grammar throughout (`§§I–VII`), restored the four explicit contributions in `§I`, and integrated the paper's alignment with resilient networking and security in distributed systems directly into `§I` and `§VII`.
   - **Where in manuscript:** `§I`, `§§II–VII`.
