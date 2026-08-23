# Pre-Submission Technical Review: "Islands of Reach" for NSysS 2026 and ICCIT 2026

Date: 2026-08-22. Basis: `paper/main.tex` (1177 lines, read in full), `PROJECT-OVERVIEW.md`,
both conference websites/CFPs (scraped and verified on the dates below), and a targeted
literature search over the research-paper index (arXiv-focused) plus web sources. Strongest
overlap candidates were verified at the source (abstract/metadata level). This review is
deliberately adversarial; treat it as the hostile referee report you want to read *before*
the real referees write theirs.

> **Confidentiality note:** this document names de-anonymisation vectors for a double-blind
> submission. Do not commit it to a public branch while either submission is under review.

---

## 0. Executive verdict

- **Publishable at these venues?** Yes, plausibly — the scope fit is real and the honest
  engineering culture of the paper is an asset. But not in the current form, and not at both.
- **Desk-reject risks (fix before anything else):** 10 pages vs. the 8-page NSysS cap;
  double-blind broken in practice by a unique Googleable project name and a public repo;
  simultaneous submission to both venues is explicitly banned by both.
- **Novelty wound:** the title vocabulary ("islands") and the L0–L3 ladder collide with a
  published USC/ISI taxonomy (peninsulas/islands of partial reachability) that is not cited.
- **Weakest technical claims:** the §6.5 "fork detection" rule (detects only pure tree
  shrinkage; a history rewrite that keeps the tree non-decreasing passes it), and the §8.4
  flood result (730 req/s measures the rate limiter, not the pipeline; ~9% of requests reached
  signature verification).
- **Strongest assets:** the 407.6 s → 2.1 s deployment defect story, the honest offered-load
  reporting, cross-language byte-agreement vectors, and the limitations section. Keep them.

---

## 1. Verified venue constraints (from the live CFPs, 2026-08-22)

| Item | NSysS 2026 (cse.buet.ac.bd/nsyss2026) | ICCIT 2026 (iccit.org.bd/2026) |
|---|---|---|
| Deadline | **Aug 28, 2026 AoE** | **Aug 31, 2026** (extended) |
| Notification | Oct 30, 2026 | Oct 15, 2026 (per site dates pages) |
| Format | ACM sigconf ("use sample-sigconf.tex") | IEEE conference template, A4 |
| Length | **6–8 pages double column, including figures, tables, appendices, references** | **max 6 pages, including figures and references** |
| Anonymity | **Double-blind** ("no author name should appear… no references that may reveal identity") | **Double-blind** ("If it is not maintained, the manuscript will be immediately rejected") |
| Dual submission | Banned: "must not be submitted simultaneously to another conference with refereed proceedings or to a journal" | Banned: "immediately declined… followed by appropriate disciplinary action" (IEEE policy) |
| Publication | ACM ICPS (DBLP indexed; APC may apply under the new ACM Open model) | "Submitted for inclusion into IEEE Xplore **subject to meeting scope and quality requirements**" |
| Submission system | Microsoft CMT (NSysS2026) | Microsoft CMT (ICCITconf2026) |

**Hard consequences:**

1. **You cannot submit the same paper to both.** Deadlines are 3 days apart; notifications come
   *after* both deadlines pass, so "try NSysS, fall back to ICCIT" is impossible for 2026.
   Choosing both = policy violation at both. Choose one, or write two genuinely different papers
   (see §7; salami-slicing a single system into two thin papers is itself a reject/integrity risk).
2. **Current `main.pdf` is 10 pages.** Over the NSysS cap by ~2 pages. For ICCIT you would need a
   ~40% cut *and* an IEEE reformat — a different paper, practically speaking.
3. **Both are double-blind.** "Islands of Reach" is a unique searchable string bound to a public
   repository, a public PROJECT-OVERVIEW.md, and a public presentation. Any reviewer who googles
   the title de-anonymizes the submission. The `anonymous` option in acmart does not fix that.
   Options: retitle the submission (e.g., "A Federated Public Forum Surviving National Internet
   Partitions"), scrub third-person references to "the repository", or accept the risk. ICCIT's
   wording ("immediately rejected") makes the risk real.

## 2. Publishability criticism (Q1)

### NSysS 2026

- **Scope fit: good.** The CFP explicitly lists "networking system design", "delay/disruption
  tolerant networks", "P2P, overlay, and content distribution networks", "privacy and anonymity
  in networks and distributed systems", and "experimental results from operational networks or
  network applications". This paper is all five.
- **Bar reality:** NSysS explicitly invites early-stage/undergraduate work and offers mentoring.
  A working system + real testbed + honest limitations is a strong profile *for this venue*.
- **What a reviewer will attack first:** not the engineering, but (a) the missing citation of the
  partial-reachability literature that already named "islands" (§5.1), (b) the fork-rule framing
  (§4.2), (c) the flood-evaluation design (§4.3), (d) one-host container evaluation as the sole
  evidence base. All four are survivable if pre-empted in text; fatal if discovered.

### ICCIT 2026

- **Scope fit: acceptable** (broad IEEE conference), but the 6-page ceiling forces amputation:
  the 19-step pipeline figure, the classification extension, and most of related work would go.
  What remains is "we built a federated forum and ran it in containers" — the weakest version.
- **Prestige reality:** ICCIT is the longest-running IEEE-sponsored venue in Bangladesh, but
  "submitted for inclusion into IEEE Xplore subject to scope and quality requirements" means
  indexing is not guaranteed, and the review depth at a 29-year generalist conference is uneven.
- **Recommendation:** NSysS is the better target for *this* paper (systems + networking scope,
  8 pages achievable, audience that will appreciate the Bangladesh-2024 grounding). If both are
  wanted, the second paper must be a different study (e.g., a measurement/analysis paper on the
  OONI Bangladesh dataset + shutdown taxonomy), not a reformat.

## 3. Claim-by-claim audit of `main.tex` (Q2)

Verdicts: **HOLDS** (fine as written) / **CAVEAT** (true but needs reframing or qualification) /
**AT RISK** (a competent reviewer can dismantle it) / **FAILS** (incorrect or unsupported).

| # | Location | Claim (paraphrased) | Verdict |
|---|---|---|---|
| C1 | Abstract | Circumvention systems keep an external path; a full transit cut removes it | HOLDS |
| C2 | Abstract | Loss of transit "degrades reach without ending it" | CAVEAT |
| C3 | Abstract | A dual-transit node bridges ISP islands | CAVEAT |
| C4 | Abstract | "Content is valid the instant its author signs it… removes withheld approval as a censorship mechanism" | AT RISK |
| C5 | Abstract | Origin-charged admission cost | CAVEAT |
| C6 | Abstract | 407.6 s → 2.1 s defect found only in deployed multi-peer testbed | HOLDS |
| C7 | §1 | Mastodon: removing 5 ASes cuts LCC 92%→46% [raman2019mastodon] | CAVEAT (verify numbers) |
| C8 | §1 | Contribution 1: "three-position design space it completes" (canonicalisation as admission) | AT RISK (oversold) |
| C9 | §1 | Contribution 2: conservative fork policy | AT RISK (see C14) |
| C10 | §1 | Contribution 3: two federation invariants | CAVEAT |
| C11 | §1 | Contribution 4: "resilience ladder that makes such systems comparable" + first measurements | AT RISK (prior taxonomy) |
| C12 | §3.2 | Canonical-admission prevents a relay repairing malformed objects into valid ones | HOLDS |
| C13 | §3.3 | 19-step pipeline; steps 1–12 no DB writes; 16–17 atomic | HOLDS (engineering, not novelty) |
| C14 | §4.5 | Fork rule: stale→UNKNOWN; smaller-newer→FORKED; else OK | AT RISK (detection gap, see §4.2) |
| C15 | §4.3 | CGNAT: no-inbound node federates both ways | HOLDS |
| C16 | §4.6 | Order-independent fold via (created_at_ms, content_id) | HOLDS |
| C17 | §4.7 | Source binding verified via /proc/net/tcp; per-uplink-pair quota; 50% bulk cap | HOLDS (testbed) |
| C18 | §5 | Adversary exclusions (no traffic-analysis resistance, eclipse surface, coercible bridge…) | HOLDS (honest; use it) |
| C19 | §6 | Audit certificate proves prior acknowledgement | CAVEAT (what it cannot prove matters more) |
| C20 | §8.2 | 16/16 cross-language vectors | HOLDS |
| C21 | §8.3 | Byte-identical projection rebuild; 31 federation assertions | HOLDS |
| C22 | §8.4 | 8-node chain, 200/200 delivered, median 4.125 s | HOLDS |
| C23 | §8.4 | Unpaced load: first-hop median 10 s, p95 173 s | HOLDS (praiseworthy honesty) |
| C24 | §8.5 | Cut-path crossing 0.5/1.2/2.1 s vs healthy 1.5/1.5/1.9 s | CAVEAT (n, single config) |
| C25 | §8.6 | Flood: 3,000 mutated envelopes, 730 req/s, zero DB writes | AT RISK (design flaw, see §4.3) |
| C26 | §8.7 | 750 req/s read path; 62/233/384 MiB memory; "fits 512 MB SBC budget" | CAVEAT (measured on x86 host) |
| C27 | §8.8 | ActivityPub overhead 19.5–25.9× raw, 4.4–6.9× gzipped | CAVEAT (asymmetric sample) |
| C28 | §9 | Capability matrix self-scored "checked against each spec" | CAVEAT (unchecked by third party) |
| C29 | Title | "Censorship-Resistant" | AT RISK (your own text disclaims it) |

Detailed analyses of the AT RISK claims follow in §4.

## 4. Detailed technical takedowns (Q2 continued)

### 4.1 C4 — "removes withheld approval as a censorship mechanism" (AT RISK)

The signature makes content self-validating, yes. But the censorship act your own system can
*evidence* is only "server acknowledged, then hid/deleted" (via receipt + ALS). The cheaper
censorship — **refusing admission in the first place** — leaves no receipt, no certificate, no
trace. A rational censoring operator answers borderline posts with 500s or silence and your
evidence chain never starts. The overview concedes this ("does not prove that an unacknowledged
request was accepted"); the abstract claims the opposite impression. Fix: soften the abstract to
"moves censorship from silent alteration to attributable omission *after admission*".

### 4.2 C14/C9 — the fork rule detects almost nothing a real adversary does (AT RISK)

The rule (§4.5): incoming head `(t,n)` vs recorded `(t0,n0)`: `t<t0` → UNKNOWN, don't record;
else `n<n0` → FORKED; else record + OK.

Walk the adversary's options:

1. **Pure shrinkage** (delete entries, present smaller tree): caught by clause 2 — but *no
   competent adversary does this*, because…
2. **Rewrite with growth:** delete 2 old leaves, append 3 new ones, mint a fresh signed head with
   newer `t` and `n' > n`. Clause 1 passes, clause 2 passes. **The rewrite is invisible to this
   rule.** The paper's own fine print concedes "a malicious log controls its timestamps… not proof
   of append-only consistency" — but the contribution bullet and Table row still sell it as
   "fork detection that stays safe". The gap between framing and fine print is exactly what a
   reviewer quotes in a rejection.
3. **Equivocation / split view:** show peer A head X and peer B head Y, both internally growing.
   No pairwise local rule can detect this; it needs cross-observer comparison — which the
   partition (your motivating condition) removes. Admitted ("assumes one honest observer
   exchanges a conflicting head"), but then the word "detection" is doing too much work.

What the rule *actually* is: **stale-head hygiene that eliminates self-manufactured false
positives** (the size-8-then-size-6 concurrency artifact, which genuinely happened and is a good
war story). That is a legitimate, publishable-in-context engineering result. Call it that.
Rename the section "A conservative *observation* policy…", state the detection gap in the claim
sentence itself, and move the "fetch a consistency proof when reachable" fallback up front.

### 4.3 C25 — the flood experiment measures the rate limiter, not the pipeline (AT RISK)

3,000 well-formed unique envelopes, one mutated signed byte, concurrency 16: "absorbed at
730 req/s, zero database writes". Your own breakdown: **90% shed by the per-peer rate limiter;
~9% reached signature verification.** So the expensive rejection path (canonical parse →
Ed25519 verify) was exercised at ≈66 req/s effective, and the headline number describes a
token bucket, not the 19-step pipeline. Further:

- "Zero writes" for envelopes failing at step 9 is the *expected* behavior of any
  verify-before-insert system. It is a regression test, not a DoS measurement.
- The per-peer limiter doing 90% of the work invites the obvious counter-attack: a Sybil/distributed
  flood across hundreds of peer identities. Unmeasured.
- The attack that actually hurts — **valid, correctly signed envelopes** that pass steps 1–12 and
  hit anti-abuse/apply/witness — is admitted as unmeasured (§5: "valid-envelope floods"). That is
  the experiment reviewers will ask for, because those writes are *supposed* to happen.
- The honest sentence "The no-write prefix is therefore the second line of defence" is good;
  it should be promoted to the claim, replacing the 730 req/s framing.

Fix: re-run with the rate limiter raised so the pipeline itself is measured; report sig-verify
throughput per core; add a many-peer flood; add a bounded valid-envelope flood.

### 4.4 C8 — "three-position design space it completes" is oversold (AT RISK)

Matrix canonicalizes-then-verifies; Cosmos verifies-as-arrived without a defined form; you define
a form *and* verify-as-arrived, with rejection on re-encode mismatch. That is a fine engineering
decision — but it is not an unexplored third position. Strict-decode-then-verify-the-arrived-bytes
is decades-old practice (X.509 DER, Bitcoin's strict encodings, JWS, CT's TLS-format leaves).
Claiming to "complete a design space" invites a reviewer to spend a paragraph listing precedents.
Fix: keep the mechanism, drop the taxonomy claim; reframe as "canonicalisation placed at
admission rather than verification, with the failure mode it removes" — defensible and sufficient.

### 4.5 C11 — the ladder collides with published "islands" terminology (AT RISK, fixable)

Baltra, Saluja, Pradkin, Heidemann (USC/ISI) already published the vocabulary: **"islands" =
networks partitioned from the Internet core; "peninsulas" = persistent partial connectivity**
(arXiv:2407.14427, "Reasoning About Internet Connectivity"), with detection algorithms Taitao and
**Chiloe ("detects islands")** (arXiv:2412.09711, "Measuring Partial Reachability in the Public
Internet"; follow-up arXiv:2601.12196). Your title "Islands of Reach" and the L0–L3 ladder walk
into this without a citation. Those are *measurement* papers; yours is a *system* — the collision
is not fatal, but an uncited collision in your title word looks like either ignorance or
borrowing. Fix: cite all three, one sentence each ("they detect and name the condition; we build
the system that must operate inside it"), and the ladder survives as a systems-oriented
refinement. Also: L3 is a *remediation* of L2, not a rung below it — redraw as levels plus a
recovery arrow, or a reviewer will. And the ladder is missing the rung that actually kills you:
**DPI-whitelist shutdowns** (see §5.2).

### 4.6 C19 — the ALS proves the censorship case that matters least (CAVEAT)

The audit certificate evidences "acknowledged then hidden/deleted". It cannot evidence
refusal-to-admit (no receipt → no certificate), cannot compel service, and needs the ALS to be
reachable post-write — during L1, that means *domestic, pre-deployed, independent, uncoerced*
auditors, whose operators are as legible to the state as ISPs are. An ALS that sees every public
certificate is also a metadata concentrator (you handle DMs by keeping certificates local —
good). The construction is sound engineering, but it sits squarely in a lineage you do not cite:
**PeerReview** (Haeberlen et al., SOSP'07; see arXiv:2305.09123 calling it "the best-known
protocol for providing accountability"), **CoSi witness cosigning** (arXiv:1503.08768, "Keeping
Authorities Honest or Bust"), and CT's monitor/auditor roles. Fix: cite and differentiate
(yours is client-initiated, portable, post-hoc evidence for a federated forum — not continuous
witness cosigning), and state plainly that the ALS deters *provable* misbehavior only when an
independent auditor survives inside the partition.

### 4.7 C5 — origin-charged cost has an unanalysed consequence (CAVEAT)

"Cost is paid once, at the origin" is forced by design (secrets are node-local), but an origin
server *controls its own secrets* — it can mint unlimited free anti-abuse proofs for its own
users. Anti-abuse strength therefore equals the policy of the weakest origin in your peer set,
and an adversary running N origin nodes multiplies aggregate attack capacity by N (bounded only
by per-peer quotas). One paragraph acknowledging origin-assisted spam and the quota-as-backstop
argument would close it; silence looks like a blind spot.

### 4.8 C26 — the "512 MB single-board-computer budget" is an x86 measurement (CAVEAT)

62 MiB idle / 233 MiB under crossing / ~384 MiB total were measured on the container host. SBC
class hardware differs in CPU (Ed25519 verify cost), storage latency (the atomic 16–17 commit),
and memory bandwidth. Either say "fits a 512 MB-class budget *on this host*" or run one
Raspberry-Pi-class node for the crossing test. Also note MongoDB multi-document transactions on
an SBC are a real operational cost — the paper states the requirement; good.

### 4.9 C27 — the ActivityPub byte comparison is asymmetric (CAVEAT)

80 real Create/Note activities, unsigned, vs your signed fixed-schema envelopes. The confounds
are disclosed (authored-text subtraction, gzip) — unusually honest, keep it. But: AP activities
*with* HTTP/LD signatures would be larger still, while AP-over-gzip on real federation links is
the number an operator cares about; your own "4.4–6.9× gzipped" figure is the defensible headline
and "19.5–25.9×" will be quoted against you. Lead with the gzipped ratio.

### 4.10 C29 — the title contradicts your own disclaimer (AT RISK)

Title: "Censorship-Resistant…". §5/table and the overview: no traffic-analysis resistance, ISP
sees federation metadata, bridge is a coercible chokepoint, TOFU eclipse surface, dominant client
can censor, "It is not 'censorship proof'". A hostile reviewer: *"The title claims what Section 5
disclaims."* The system is censorship-**evidencing** and partition-**tolerant**, not resistant.
Retitle to what you actually prove: e.g., "Partition-Tolerant Federated Forum with Attributable
Moderation". This also reduces the anonymity/activism legal spotlight on the authors — worth
considering given the venue and the country context.

## 5. Constraints to publish (Q3)

### Logistical (hard)

1. **One venue only.** Dual submission banned by both; deadlines Aug 28 / Aug 31; notifications
   after both deadlines. Pick NSysS for this paper (§2).
2. **Page cut to ≤8** (NSysS) — currently 10. Cheapest cuts: §3.4 classification extension is
   explicitly "specified, not evaluated" → compress to 3 sentences (it costs you ~1 page and
   buys nothing a reviewer can check); merge the two §8.4 figures; tighten §2 related work after
   adding the missing citations.
3. **De-anonymise nothing, but anonymise for real:** neutral title, no repo/product names, no
   "the repository contains…", check PDF metadata, and remember the public repo + PPTX exist.
   ICCIT auto-rejects broken anonymity; NSysS is softer but identical in policy.
4. **ACM ICPS APC check** — confirm KUET's ACM Open eligibility or waiver *before* acceptance,
   not after.
5. **Timeline:** ~6 days to NSysS deadline (today is Aug 22). The fixes in §7 are sized for that.

### Intellectual (the real constraints)

6. **Composition-novelty profile.** You say it yourself: "No individual mechanism is new."
   At NSysS/ICCIT that is fine — systems integration + honest measurement is publishable there.
   Do not oversell individual mechanisms (§4.4) and the profile holds.
7. **Single-operator, single-host evidence ceiling.** Everything rests on containers on one host,
   one operator, aligned clocks. The paper already concedes this; the constraint is that no
   stronger claim (field readiness, real-shutdown efficacy) may appear anywhere, including the
   title and abstract. Currently mostly true; the title breaks it (§4.10).
8. **The threat model must name the adversary's cheapest winning move** — refusal-to-admit
   (§4.1) and DPI-whitelisting (§5.2) — or reviewers will name them for you, less kindly.
9. **Dual-use/political sensitivity.** A censorship-resilience paper grounded in Bangladesh 2024,
   submitted to Bangladeshi venues, by named Bangladeshi authors (camera-ready): discuss
   internally how much adversary framing to keep concrete vs. abstract. Not a reason to soften
   the science; a reason to be deliberate.

## 6. Similar works and how similar they are (Q4)

Similarity scale: ● high (same mechanism/claim space), ◐ medium (same problem, different layer),
○ low (background). "Cited?" = present in `references.bib` today.

### 6.1 The dangerous gap — partial-reachability taxonomy (● for framing, ○ for mechanism)

| Work | What it is | Overlap with you | Cited? |
|---|---|---|---|
| arXiv:2407.14427 — *Reasoning About Internet Connectivity* (Baltra, Saluja, Pradkin, Heidemann) | Conceptual definition of Internet core; corollaries: **peninsulas** (persistent partial connectivity) and **islands** (networks partitioned from the core) | Your title word and L1/L2 concept, formally published | **No** |
| arXiv:2412.09711 — *Measuring Partial Reachability in the Public Internet* (same group) | Algorithms **Taitao** (peninsulas) and **Chiloe (detects islands)** on Trinocular/Atlas/Ark data | Same | **No** |
| arXiv:2601.12196 — *Understanding Partial Reachability in the Internet Core* | Follow-up consolidation | Same | **No** |

They measure and name the condition; you build a system that must run inside it. Complementary —
but only if cited. This is the single most important related-work fix.

### 6.2 Blackout/shutdown systems (◐ — same event, different substrate)

| Work | Approach | Why you differ | Cited? |
|---|---|---|---|
| arXiv:1612.03371 — **Rangzen** | Anonymous one-to-many broadcast during blackouts, smartphone store-and-forward mesh | They assume no IP at all; you assume surviving IP. Must name-differentiate | No |
| arXiv:2207.04145 — *Strong Anonymity for Mesh Messaging*; arXiv:2603.12871 — **FoSAM** | Protest mesh messaging (Firechat/Bridgefy lineage), metadata/forward-secrecy analyses | Device mesh, not ISP islands | No |
| arXiv:2606.17245 — *Cache to the Future* | Distributed web archive for blackouts | Read-only knowledge access, not publishing | No |
| arXiv:2509.22568 | LoRa + crisis app, off-grid civilian comms | Below your L-floor; you correctly exclude radio | No |
| DTN social: arXiv:1703.08947, 1702.05654 (AlleyOop), 2006.02825 (SOS), 1407.8355 (SocialDTN) | Delay-tolerant social networking | No server federation, no transparency log | No |
| arXiv:2509.08248 — *EFPIX* | Encrypted flood relay, PoW+dedup+aging anti-spam, topology-agnostic | Closest to your mesh frame + anti-abuse; no moderation/ALS/bridging | No |

### 6.3 Shutdown measurement that both supports and threatens you (◐)

- **Support:** arXiv:2605.00187 (Iran 2025–26 shutdowns): forwarding-plane discard while
  **80–88% of domestic prefixes stayed reachable** — empirical evidence your L1 premise occurs.
  arXiv:1209.6398 (hidden domestic routing in Iran). Cite both; they ground the ladder in reality.
- **Threat:** arXiv:2507.14183 — *Iran's Stealth Internet Blackout*: domestic routing intact but
  **protocol whitelisting via DPI**. In that shutdown model, your non-standard federation
  protocol between ISPs dies on day one regardless of signatures. Your paper never says what the
  federation traffic looks like on the wire (port, TLS profile, camouflage options). One honest
  paragraph ("we survive transit cuts, not whitelisting; riding 443/HTTPS is future work") defuses it.

### 6.4 Signed federated social (◐/○ — mostly cited already)

You cite Nostr, SSB, ActivityPub, Matrix, ATProto — good. Add:
- arXiv:2402.05709 — empirical Nostr analysis (decentralization, availability, **replication
  overhead**) — directly relevant to your flooding-gossip cost; supports and pressures you.
- arXiv:2402.03239 — Bluesky/ATProto architecture (strengthens your "closest prior composition"
  paragraph), arXiv:2408.15383 — critical Fediverse decentralization analysis (citation armor for
  your §1 argument).

### 6.5 Anti-abuse without identity (● for the mechanism)

- arXiv:2207.00117 / 2207.00116 — **WAKU-RLN-RELAY**: Semaphore-based **rate-limiting nullifiers,
  epoch-scoped**, privacy-preserving spam protection for gossip networks. Your "epoch nullifier"
  is this. Cite, and note theirs adds economic punishment (yours is credit/PoW-based).
- arXiv:1509.03934 — Dpush (DHT+PoW spam-resistant messaging): background.
- You already cite Dwork–Naor, Chaum, Privacy Pass — good.

### 6.6 Accountability / transparency lineage (● for ALS) — **uncited, must fix**

- **PeerReview** (Haeberlen et al., SOSP'07 — via arXiv:2305.09123 CFT-Forensics, which calls it
  "the best-known protocol for providing accountability"): signed receipts + witnesses + auditors
  detecting misbehaving replicas. Your ALS is a descendant idea.
- arXiv:1503.08768 — **CoSi** ("Keeping Authorities Honest or Bust"): witness cosigning +
  public logging of authoritative statements. The ALS's independent-retention role is adjacent.
- arXiv:2105.13116 — IA-CCF: individual accountability past BFT thresholds (receipt/governance).
- Moderation transparency as policy: Santa Clara Principles ecosystem and the DSA Transparency
  Database literature (e.g., arXiv:2312.10269) — one sentence positions your *signed, federated,
  client-portable* alternative against regulator-mandated transparency.

### 6.7 Novelty bottom line

**Nothing you use is new; the composition for the L1–L3 operating regime is underexplored, and
no published system claims your exact conjunction** (server-to-server signed federation +
client-portable acknowledgement evidence + scope-aware multi-ISP bridging, evaluated under a
severed exchange). That is a legitimate NSysS/ICCIT contribution **if** §6.1 and §6.6 are cited
and §4's overclaims are narrowed. Today, the two uncited clusters are the difference between
"composition paper" and "unaware of prior art".

## 7. Fixes per issue, and what is fundamentally unsolvable (Q5)

| Issue | Fix | Effort | Solvable? |
|---|---|---|---|
| 10 pages → ≤8 | Cut §3.4 to 3 sentences; merge §8.4 figures; tighten §2 | 1 day | Yes |
| Double-blind leak | Neutral title; scrub "the repository"; PDF metadata check | 2 h | Yes |
| Missing citations (§6.1, §6.6, §6.2, §6.5) | ~12 new bib entries + one positioning sentence each | 1 day | Yes |
| Fork-rule framing (§4.2) | Rename to observation/stale-head policy; state detection gap in the claim sentence; promote consistency-proof fallback | 3 h | Yes (framing) |
| Flood-eval design (§4.3) | Re-run with limiter raised; add many-peer + valid-envelope floods; report verify throughput/core | 1–2 days | Yes |
| Title overclaim (§4.10) | "Censorship-Resistant" → "Partition-Tolerant … with Attributable Moderation" | 10 min | Yes |
| Abstract overclaim (§4.1) | "moves censorship from silent alteration to attributable omission after admission" | 10 min | Yes |
| Origin-assisted spam (§4.7) | One paragraph: weakest-origin analysis + quota backstop | 2 h | Yes (analysis only) |
| SBC budget claim (§4.8) | Qualify to "on this host" or run one Pi-class node | 1 day if hardware available | Yes |
| AP comparison (§4.9) | Lead with gzipped 4.4–6.9× | 30 min | Yes |
| DPI-whitelist shutdown model (§5.2) | Honest paragraph + 443/HTTPS camouflage as future work | 2 h | Partially |
| Refusal-to-admit censorship (§4.1) | State as fundamental limit; no receipt → no evidence | text only | **No** (fundamental) |
| Equivocation under partition (§4.2) | Requires reachable honest observers; state as assumption | text only | **No** without connectivity |
| Bridge trust bootstrap during crisis | TOFU + vouching is what exists; analyze infiltration window | 1 day text | Partially |
| Bridge operator legibility/coercion | Redundant bridges + operator diversity; field-only question | future work | Partially |
| ALS independence/reachability in-country | Governance + pre-deployment; not a protocol property | future work | Partially |
| Traffic analysis / metadata | Out of scope by design; keep the disclaimer | — | **No** at this cost target |
| Sybil identity count | Cost bounds rate, not identities — keep the disclaimer | — | **No** (by design choice) |
| Global erasure vs. replication | Irreconcilable; keep tombstone honesty | — | **No** (fundamental tension) |
| Field validation during a real shutdown | Cannot be scheduled; instrument + wait, or partner with ISPs for drills | months | Not before the deadline |

## 8. Simulated reviewer reports (Q6)

**NSysS reviewer (knowledgeable, cs.NI):** *"Interesting and unusually honest systems paper on a
problem Bangladesh knows first-hand. Concerns: (1) the title's 'islands' and the L0–L3 ladder are
published vocabulary (Baltra/Heidemann et al.) — uncited; (2) §4.5 'fork detection' detects only
shrinkage — a rewriting log that keeps growing passes, so the claim is overstated; (3) §8.6's
730 req/s is the rate limiter's number, not the pipeline's — 90% never reached verification;
(4) all evidence is single-host containers. The 407 s defect story and the offered-load honesty
are the paper at its best. Recommendation: borderline; accept if reframed as partition-tolerant
engineering with narrowed claims."*

**ICCIT reviewer (generalist):** *"Well written but 4 pages over limit, anonymity compromised by
an identifiable project name, evaluation on one laptop. The federation/anti-abuse design reuses
known techniques (Nostr, CT, PoW); contribution is integration. Weak reject."*

Both are survivable — but only pre-emptively.

## 9. Six-day action plan (NSysS, deadline Aug 28 AoE)

1. **Day 1:** retitle + anonymity scrub; cut to 8 pages (§7 rows 1–3).
2. **Day 2:** add the ~12 citations with positioning sentences (§6); fix abstract C4; fork-rule
   rename (§4.2); lead with gzipped ratio (§4.9).
3. **Day 3–4:** re-run flood with limiter raised + many-peer variant; one SBC node if hardware
   exists, else qualify the budget sentence; origin-spam paragraph.
4. **Day 5:** DPI-whitelist paragraph; full limitation pass; PDF metadata check; fresh-eyes read.
5. **Day 6:** submit to NSysS CMT; archive the submission PDF; do **not** also submit to ICCIT.

---

*Review ends. Method note: literature findings were verified at abstract/metadata level via the
research-paper index; full-text verification of the six highest-overlap papers is the natural
next pass if any single one feels load-bearing.*









