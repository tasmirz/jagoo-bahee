# Camera-Ready Change Log — ICCIT 2026 Paper #2056

**Final Manuscript:** `iccit2026-paper-camera-ready.tex` / `iccit2026-paper-camera-ready.pdf` (6 pages, A4)
**Final Reviewer Response:** `2056-response-to-reviewers-final.md` / `.tex` / `.pdf` (2 pages)
**Preserved Reference Files (Untouched):**
- `iccit2026-paper.tex` / `iccit2026-paper.pdf` (original accepted manuscript)
- `iccit2026-paper-pre.tex` / `iccit2026-paper-pre.pdf` (initial revision draft)
- `iccit2026-paper-prev-v2.tex` / `iccit2026-paper-prev-v2.pdf` (narrative-focused revision draft)
- `2056-response-to-reviewers.pdf` (earlier reviewer response)
- All pre-existing files in `figures/` and `figures-v2/`

---

## 1. Base Selection & Editorial Synthesis

- **Technical and structural base:** `2056-paper-recommended.pdf` (with `iccit2026-paper-pre.tex` preamble, ICCIT first-page copyright/venue notice, and `iccit2026-paper-pre-references.bib`).
- **Narrative and contribution synthesis:** Selectively restored the problem framing, research question, explicit four-contribution list, and explanatory prose from `iccit2026-paper-prev-v2.tex` and the original accepted `iccit2026-paper.tex`, avoiding both the overly compressed framing of `2056-paper-recommended.pdf` and repetitive caveats across sections.

## 2. Substantive Section-by-Section Changes

1. **Abstract**
   - Restored research-problem balance: states the partial-shutdown/surviving-domestic-IP problem, poses the core research question, explicitly names all four mechanisms including the **quota-bounded, dual-homed validating relay**, retains the headline route-cut (`0.735 s -> 1.732 s`, 40/40 chains), impairment (10/10 across six scenarios), ActivityPub/blocked-inbound (`20/20`, `10/10` pull vs. `0/10` push), and 20,000-case cross-language results, and explicitly bounds findings to the single-host testbed.

2. **§I Introduction**
   - Preserved distinctions across complete blackouts, loss of international transit, surviving domestic IP connectivity, and Baltra et al.'s *connectivity islands* vs. *peninsulas* (`[1]–[3]`).
   - Restored the **explicit four contributions** (`\begin{enumerate}`), matching the original paper's conceptual structure while using tightened, technically accurate phrasing.
   - Integrated conference relevance naturally (*"Addressing resilient networking and security in distributed systems, this work studies secure federation under partial Internet connectivity..."*) without adding a separate promotional paragraph.

3. **§II Background and Research Gap**
   - Retained `2056-paper-recommended.pdf`'s distinctions across federated systems (`ActivityPub`, `AT Protocol`, `Nostr`), circumvention (`Snowflake`), device-to-device meshes (`Anix`, `Rangzen`, `Moby`), and accountability (`CT`, `PeerReview`, `CoSi`).
   - Added explicit framing that existing systems are not claimed to fail categorically under partitions; positioned our contribution as composing, adapting, and evaluating these mechanisms in the surviving domestic-IP server regime.

4. **§III System Design (`§III-A`–`§III-D` & `Table I`)**
   - **`§III-A`:** Clarified why the dual-homed bridge runs the full admission stack instead of transparent forwarding, why preconfigured trust governs quotas/traffic classes without relaxing validity checks, how independent ALSs sit outside the admission path, and verified outbox keys (`(priority, sequence)` drain order, `(peer, plane)` batching) vs. bridge quota keys (`(source uplink, destination uplink, priority)`). Replaced literal Markdown backticks with `\texttt{...}`.
   - **`Fig. 1` (`figures-v2/fig1-system-architecture-camera.svg`/`.pdf`):** Built uncropped camera-ready architecture figure keeping the muted palette while explicitly distinguishing `L0 · GLOBAL` (*conceptual IP scope*), `L1–L3` (*evaluated in Docker testbed (L1–L3)*), and `L4 · ISOLATED` (*out of scope (no IP)*).
   - **`§III-B` & `Fig. 2`:** Retained exact-byte canonical protobuf validation rationale (why re-encoding prior to signature verification is unsafe), corrected `created_at_ms` window (`[now - 7d, now + 10m]`, explicitly noting it is not an expiry field), verified Stage 14 authorization (`ingress.ts:186-196`), and separated HTTP rate limiting from gRPC peer quotas.
   - **`§III-C` & `Fig. 3`:** Distinguished `Deliver`, `StreamActivities`, and `Backfill`; documented `2 s` catch-up polling (`4 s` stale threshold), explicit peer-discovery requirement, `5 s / 15 s (AbortSignal) / 30 s` RPC deadlines, `1 s -> 15 min` retry backoff (13th failure dead-letter, `47 min 3 s` cumulative backoff), `60 s` backpressure cap, and uplink probe parameters (`5 s` interval, `1.5 s` timeout, 2 failures). Moved the `22/22 in 39.91 s` gate pass result from `§III-C` to `§V-A`.
   - **`§III-D` & `Table I`:** Verified against `audit-certificate.ts:149-212` and `federation-inbox.ts:443-545`. Explicitly stated that ALS checks canonical decoding, author Ed25519 signature, content/server IDs, receipt signature, STH, and inclusion proof, whereas `observePeerSth` checks server-key match and timestamp staleness without re-verifying STH signatures and advances larger trees without proving append-only growth.

5. **§IV Methodology**
   - Added host hardware/OS/runtime reproducibility metadata (`Intel Core i5-8265U`, `8` logical CPUs, `19.38 GiB` RAM, `Linux 7.2.14`, `Docker 29.9.2`, `node:20-alpine`, `MongoDB 7`, `Redis 7`) and build identifiers (`603e895` for datasets `03`–`06` vs. `01ce916` / image `261e952266d1` for dataset `02`, `07`, and timed ISP gate), keeping datasets separated by build.
   - Restored concise testbed topology counts from `prev-v2` (4 app nodes, 2 MongoDBs, 2 Redis caches across 3 isolated Docker networks).
   - Replaced ambiguous phrasing of the route-cut experiment with the exact sequential procedure: *"we submitted 20 fresh dependency chains (author certificate, community record, and post) with the exchange intact, withdrew the direct exchange path once, and submitted another 20 chains through the bridge using the same running stack."*

6. **§V Results (`§V-A`–`§V-C`, `Figs. 4–5`, `Tables II–III`)**
   - **`§V-A`:** Verified all differential fuzzing (`02-differential-fuzz.json`: 16 vectors + 10,000 generated + 10,000 mutated across 16 classes -> 9,455 rejected, 545 identically decoded, 0 disagreements; scoped to wire-format agreement rather than signature/admission/security), ISP gate (`22/22` in `39.91 s`), route-cut statistics (`03-route-cut-trials.json`), and six `tc netem` conditions (`04-netem-emulation.json`: 1 unshaped control + 5 impairment conditions, bounded to tested regimes).
   - **`§V-B`:** Added the missing explicit text reference to **`Fig. 4`** (`fig4-hop-and-drain-scaling.pdf`), preserved both the `50`-post sweep (`06-clean-sweep.json`) and earlier `200`-envelope (`1,000 ms` drain) run, reported HTTP/gRPC stress and `c = 1..32` valid writes (`05-stress-and-valid-load.json`, `Table II`), explicitly framed valid-write results as **local single-node admission scalability** rather than concurrent end-to-end federation capacity, and avoided unprofiled bottleneck attribution.
   - **`§V-C`:** Preserved `Table III` and `07-ap-e2e-comparison.json` results (both favorable blocked-inbound `10/10` pull vs. `0/10` push and unfavorable shaped-link latency/interface bytes vs. the minimal inbox), added the required qualification on differing timed operations and persistence semantics, and avoided generalizing blocked-inbound behavior to all ActivityPub implementations.

7. **§VI Discussion and Limitations & §VII Conclusion**
   - Reorganized `§VI` around practical implications followed by non-repetitive grouped limitations (testbed/measurement limits, operational/security/privacy limits including **no anonymity guarantee** and inability to compel admission/forwarding, and ethics).
   - Synthesized `§VII` around the original research question, proof-of-concept feasibility on the single-host testbed, observed scalability/transport costs, and remaining open work.

8. **Disclosure Removal**
   - Removed `\section*{Disclosure}` from `iccit2026-paper-camera-ready.tex` per author instruction (AI-use disclosure is submitted separately through the conference portal). Balanced Page 6 columns cleanly across `§VI–§VII` and `References` `[1]–[16]`.

9. **Reviewer Response (`2056-response-to-reviewers-final.*`) & Internal Remedy (`REMEDY.md`)**
   - Corrected all section/table cross-references (`R1.4 -> §IV, §V-C, Table III`; `R1.6 -> §III-D, Table I, §VI`; `R2.3 -> §§V-B–C, §VI, Table II`; `R2.6 -> §IV, §V-C, §VI, Table III`; `R2.7 -> §III-D, Table I, §VI`), fixed route-cut wording (one withdrawal, 20 intact + 20 bridged on the same stack), distinguished local concurrent writes from concurrent federation, and explicitly listed all deferred items.
   - Updated internal `REMEDY.md` with a Final Disposition Matrix, accurate `[x]` / deferred `[ ]` tracking, corrected `02-differential-fuzz.json` runtime (`4,395 ms`), and verified `observePeerSth` signature scope.
