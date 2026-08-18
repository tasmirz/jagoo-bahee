# NSysS 2026 — the publication bar, measured from 35 accepted papers, and the finished paper plan

**Status:** Final plan · 2026-08-18
**Supersedes:** `NSYSS-2026-PAPER-RESEARCH.md` (that file stays as-is; §7 below lists every point where
these papers contradict it)
**Method:** full text of 35 accepted NSysS PDFs in `nsyss-papers/`, read locally. Page counts, figure
counts, table counts, reference counts and keyword incidence are machine-extracted from the PDF text
layer and cross-checked against each paper's own ACM Reference Format line. Nothing here comes from
DBLP, a search engine, or the ACM DL web UI.

---

## 0. What the corpus actually is — establish this before using any number below

Confirmed from the ACM footer block and ACM Reference Format on page 1 of each PDF:

| Prefix | Edition | Name on the PDF | Dates / place | ISBN |
| --- | --- | --- | --- | --- |
| `3704522.*` | **11th** | International Conference on **Networking, Systems, and Security** (NSysS '24) | 19–21 Dec 2024, Khulna | 979-8-4007-1158-9/24/12 |
| `3777555.*` | **12th** | International Conference on **Next Generation Computing, Communication, Systems and Security** (NSysS '25) | 18–20 Dec 2025, Sylhet | 979-8-4007-2122-9/25/12 |

Verbatim, `3704522.3704523.pdf p.1`: "In *11th International Conference on Networking, Systems, and
Security (NSysS '24), December 19–21, 2024, Khulna, Bangladesh.* ACM, New York, NY, USA, 9 pages."
Verbatim, `3777555.3777556.pdf p.1`: "In *12th International Conference on Next Generation Computing,
Communication, Systems and Security (NSysS '25), December 18–20, 2025, Sylhet, Bangladesh.* ACM, New
York, NY, USA, 7 pages." The rename the prior pass inferred from DBLP is confirmed on the artefact.

**The two proceedings are not equally complete, and this changes what the corpus licenses.** I
reconstructed each paper's folio range from the printed page numbers:

- **`3704522` (NSysS '24) is complete and contiguous: pp. 1–196, 24 papers, zero gaps.** DOIs
  `.3704523`–`.3704546` are 24 consecutive integers. Whatever else the 2024 proceedings contains
  begins at p. 197 and has a DOI ≥ `.3704547`.
- **`3777555` (NSysS '25) is a subset: 11 papers spanning pp. 1–136 with four gaps** — pp. 24–34
  (11 pp.), pp. 53–58 (6 pp.), pp. 73–91 (19 pp.), pp. 110–119 (10 pp.). 46 printed pages are
  missing from inside the range, plus anything after p. 136.

So the corpus is **all 24 papers of NSysS '24, plus 11 of NSysS '25.** The 11 for 2025 match exactly
the "11 full papers" the prior pass read off the conference's own accepted-papers page, and the four
gaps are where the short papers sit. **Every statistic below is a statistic about the full-paper
track.** It is not a statistic about short papers, and I have not read a single short paper.

---

## 1. Q1 — The page limit, settled

### 1.1 The histogram

All 35 PDFs. Each paper's physical PDF page count **exactly equals** the "*N* pages" it declares in
its own ACM Reference Format line — 35/35 agreement, so the measurement is not an artefact of
extraction.

| Pages | Count | Papers |
| --- | --- | --- |
| 6 | 1 | `3777555.3777564` |
| 7 | 7 | `3704522.3704525`, `.3704527`, `.3704534`, `.3704537`, `.3704538`, `.3704545`, `3777555.3777556` |
| 8 | **13** | `3704522.3704524`, `.3704526`, `.3704528`, `.3704530`, `.3704533`, `.3704536`, `.3704540`, `.3704543`, `.3704546`, `3777555.3777558`, `.3777563`, `.3777565`, `.3777566` |
| 9 | **13** | `3704522.3704523`, `.3704529`, `.3704531`, `.3704532`, `.3704535`, `.3704541`, `.3704542`, `.3704544`, `3777555.3777557`, `.3777559`, `.3777560`, `.3777561`, `.3777562` |
| 10 | 1 | `3704522.3704539` |

**Median 8 · mean 8.17 · min 6 · max 10 · total 286 pages over 35 papers.**

### 1.2 The verdict

**The Author Instructions are operative; the CFP's "6 to 8 pages" is contradicted by the accepted
corpus.** Fourteen of 35 papers — **40%** — exceed 8 pages. Thirteen sit exactly at 9, which is the
Author Instructions' stated full-paper limit and the single most common length (tied with 8). One
paper, *Connecting Mobile Money* (`3704522.3704539`, 10 pp.), exceeds even 9.

If the CFP's 6–8 rule were enforced, 40% of the 2024–2025 full-paper track would have been
desk-rejected. It was not. **Write to 9 pages.** Planning to 8, as the prior pass recommended, throws
away a full page — 11% of the budget — for a rule the proceedings does not obey.

The 10-page outlier is a single HCI paper and is not a licence to write 10. Treat 9 as the cap and 10
as evidence that the cap is enforced loosely rather than as a target.

### 1.3 Bimodality: none, and the reason matters

The distribution is **unimodal and tight** — 6 to 10, with 26 of 35 papers at 8 or 9. There is no
second cluster at 4–5 pages. **This is not evidence that short papers do not exist; it is evidence
that they are not in this corpus.** The pagination gaps in §0 are where they went. A 5-page short
paper track can coexist with this histogram and the histogram would look identical.

**Q3's short-vs-full question, answered as far as the PDFs permit:** you cannot tell short from full
by any marking *inside* these 35, because all 35 are full papers. The string "Short Paper" appears
nowhere in any of the 35 full texts. What the corpus does establish is the *separation mechanism* —
short papers are paginated in their own blocks, not interleaved. The prior pass recorded DOI
`10.1145/3704522.3704554` with the literal title prefix "**Short Paper:** Storage Reduction of
Private Blockchain…", which would be consistent with a title-prefix convention plus a separate
pagination block starting at p. 197; **I could not verify that title because that PDF is not in the
corpus.** Marked **UNVERIFIED**, not adopted.

One suggestive datapoint, and I flag it as suggestive only: `3777555.3777556.pdf p.6` says an
ablation "is omitted here due to the **6-page space constraint**" — in a paper that is 7 pages long.
Either the authors wrote to a 6-page body target with references extra, or the sentence is stale. It
is not enough to build a rule on.

---

## 2. Q2 — The real evaluation bar

### 2.1 The table (all 35 papers)

`B-quant` = distinct **named methods other than the proposed one** that appear with the proposed
method in a quantitative comparison table or figure. `B-lit` = prior published works given their own
row in a "comparison with existing work" table, quantitative or qualitative. Both counted by hand
from the comparison tables; where a paper's comparison is purely an ablation of its own system, both
are 0.

| # | File | pp | Title (short) | Contribution type | Evaluation method | B-quant | B-lit | Fig | Tab | Ref | Scale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `3704522.3704523` | 9 | WiFi RSS Automated Attendance | system impl. | real deployment, 2 rooms + Android app + added APs | 0 | 0 | 9 | 2 | 23 | 2 rooms, grid of ref. points |
| 2 | `3704522.3704524` | 8 | XAI Gender Bias in Sexism Detection | applied ML | public dataset (EDOS / SemEval-2023) | 3 | 4 | 5 | 7 | 33 | EDOS |
| 3 | `3704522.3704525` | 7 | KD + Weight Pruning, Rice Leaf | applied ML | public dataset | 2 | 4 | 3 | 4 | 31 | 6,000 samples |
| 4 | `3704522.3704526` | 8 | **EBTCM: burst-traffic clustering, mobile-sink WSN** | **novel protocol** | **simulation (MATLAB)** | **3** (BTAmm, HACDC, DPPMSBT) | 0 | 10 | 3 | 15 | **100–400 nodes swept** |
| 5 | `3704522.3704527` | 7 | Enhancing EmoBot | user study | user study | 0 | 0 | 3 | 2 | 33 | 16 participants |
| 6 | `3704522.3704528` | 8 | Confidentiality-Preserving Distributed LP | system impl. | real grid dataset on Apache Spark | 1 (lambda iteration) | 0 | 11 | 3 | 23 | 9 zones, 143 plants |
| 7 | `3704522.3704529` | 9 | Social Media Addiction, ML + XAI | applied ML | survey dataset | 2 | 0 | 4 | 4 | 43 | 943 respondents |
| 8 | `3704522.3704530` | 8 | Yarn Shade Variation, CV | system impl. | lab measurement | 14 (image metrics) | 0 | 6 | 4 | 27 | 62 samples |
| 9 | `3704522.3704531` | 9 | MonChitro: stress & depression | user study | 2-phase user study | 0 | 0 | 5 | 3 | 34 | 43 participants |
| 10 | `3704522.3704532` | 9 | Phishing URL features across datasets | measurement / security | 2 public datasets, cross-dataset transfer | 7 | 0 | 9 | 4 | 41 | 2 datasets, 647 instances |
| 11 | `3704522.3704533` | 8 | Sleep Disorder, ensemble NN | applied ML | public dataset | 3 | 4 | 8 | 3 | 18 | dataset |
| 12 | `3704522.3704534` | 7 | XAI Cyber-Attack Detection, EVCS | applied ML / security | public dataset + Raspberry Pi testbed | 3 | 1 (orig. study, 78.87%) | 4 | 3 | 29 | CICEVSE2024 |
| 13 | `3704522.3704535` | 9 | ChatGPT code generation | measurement study | LeetCode / Codeforces / HackerRank / UVa | 0 | 6 (qualitative) | 3 | 5 | 55 | problem sets |
| 14 | `3704522.3704536` | 8 | Real-time video colorization, low-end CPU | system impl. | DAVIS benchmark + CPU inference | **7** | 0 | 5 | 4 | 44 | 60 videos |
| 15 | `3704522.3704537` | 7 | WalkLM graph embeddings | applied ML | 2 datasets (PubMed, Cisco-22) | 1 | 0 | 5 | 3 | 19 | 2 datasets |
| 16 | `3704522.3704538` | 7 | Sound-based knitting-machine fault | system impl. | real hardware (Arduino + mic) | 7 | 0 | 12 | 3 | 19 | 138 samples |
| 17 | `3704522.3704539` | **10** | Mobile Money, migrant workers | user study | qualitative interviews, 6 sites | 0 | 0 | 3 | 3 | 38 | n = 40 |
| 18 | `3704522.3704540` | 8 | XLNet-CNN multi-label text | applied ML | 3 public datasets | 4 | 0 | 2 | 4 | 21 | 3 datasets |
| 19 | `3704522.3704541` | 9 | IDS via CNN colour mapping, NSL-KDD | applied ML / security | public dataset | 4 | 0 | 7 | 6 | 42 | 125,000 rows |
| 20 | `3704522.3704542` | 9 | Fuzzy contrast enhancement + metaheuristics | applied ML | images + user survey | 3 | 0 | 15 | 1 | 55 | 13–18 images |
| 21 | `3704522.3704543` | 8 | **Redundant requests in distributed systems** | **system impl. + measurement** | **real deployment: 15-node Cassandra, Amazon EC2, 5 regions, YCSB** | **3** (dynamic snitch, C3, plain dup/reissue) | 0 | 11 | 0 | 22 | **15 nodes, 5 regions** |
| 22 | `3704522.3704544` | 9 | CQI module UI design | user study / design | 3 rounds iterative evaluation | 0 | 4 (qualitative) | 7 | 2 | 43 | participants |
| 23 | `3704522.3704545` | 7 | Tollbooth workers, AI & IoT | user study | interviews + survey | 0 | 0 | 4 | 2 | **10** | toll operators |
| 24 | `3704522.3704546` | 8 | **Benchmarking FHE libraries on IoT** | **measurement study** | **testbed: Raspberry Pi 4 Model B** | 3 (OpenFHE, SEAL, Lattigo) | 4 (gap-analysis table) | 3 | 6 | 30 | 1 device, 3 schemes |
| 25 | `3777555.3777556` | 7 | ChainGraph-DL | applied ML | 2 datasets + synthetic | 4 (PC, GES, MMHC, NOTEARS) | 0 | 6 | 3 | 24 | 1,026 samples |
| 26 | `3777555.3777557` | 9 | Digital inclusion & women's healthcare | measurement / statistical | public dataset (BDHS 2022) | 0 | 0 | 6 | 2 | 43 | 30,078 respondents |
| 27 | `3777555.3777558` | 8 | XAI Parkinson's, XGBoost + SHAP + LLM | applied ML | public dataset | 6 | 0 | 11 | 2 | 20 | 195 samples |
| 28 | `3777555.3777559` | 9 | Seg2Reg-Net, cattle weight | applied ML | own dataset | 3 | 0 | 7 | 1 | 36 | 7,513 images |
| 29 | `3777555.3777560` | 9 | XLM-RoBERTa-LIME, code-mixed | applied ML | public dataset | **10** | 5 | 8 | 9 | 19 | 99,999 samples |
| 30 | `3777555.3777561` | 9 | **Energy-efficient web design** | **measurement study** | **lab testbed: 1 machine, Firefox Profiler + smart plug** | 1 (baseline site) | 4 | 8 | 2 | 21 | **8 variants × 3 runs = 24** |
| 31 | `3777555.3777562` | 9 | **USB RAID controller for ARM SBC** | **system / hardware design** | **design + cited vendor benchmarks; no own measurement** | **0** | 0 (qualitative arch. table) | 17 | 4 | 15 | 4 drives |
| 32 | `3777555.3777563` | 8 | Bypassing eKYC with deepfakes | security analysis | **live attack on commercial eKYC services** | 5 (detection tools) | 0 (qualitative table) | 13 | 2 | 28 | 12–13 videos |
| 33 | `3777555.3777564` | **6** | Zero-shot jailbreak detection | applied ML / security | own engineered dataset | 1 (62.22% baseline) | 0 | 1 | 5 | 19 | 46 held-out prompts |
| 34 | `3777555.3777565` | 8 | **DoT: throughput degradation, THz networks** | **novel attack / protocol analysis** | **simulation (ns-3 + TeraSim)** | **0** | **9 (qualitative capability matrix)** | 11 | 3 | 19 | **10/20/30 nodes, 5 iterations** |
| 35 | `3777555.3777566` | 8 | Knee osteoarthritis, quantitative severity | applied ML | dataset | 0 | 0 | 4 | 6 | 14 | 1,000 images |

### 2.2 Medians and ranges

| Metric | Median | Range | Note |
| --- | --- | --- | --- |
| Pages | **8** | 6–10 | 26/35 at 8 or 9 |
| Figures | **6** | 1–17 | `3777555.3777562` has 17; `3777555.3777564` has 1 |
| Tables | **3** | 0–9 | `3704522.3704543` has none |
| References | **27** | 10–55 | `3704522.3704545` has 10 |
| **Named quantitative baselines (B-quant)** | **3** | **0–14** | **11 of 35 (31%) have ZERO** |
| Threat / adversary model stated | — | — | **0 of 35** |
| Explicit contribution enumeration | — | — | 11 of 35 (31%) |
| Explicit limitations section or paragraph | — | — | 14 of 35 (40%) |
| Related work as its own section | — | — | 30 of 35 (86%) |

### 2.3 What a median accepted NSysS paper looks like, stated plainly

**Eight or nine pages. Six figures, three tables, 27 references. It applies an existing method to a
dataset — usually a public one, often a Bangladesh-specific one — and reports accuracy against three
named alternatives, at least one of which is an off-the-shelf classifier rather than a published
system. It has a Related Work section, first-person plural throughout, an introduction of roughly
0.6 of a page, and no threat model. It does not state its limitations, and if it does they are two
sentences before the conclusion.**

Fifteen of the 35 are applied ML on a dataset. Eight are system implementations. Five are measurement
studies. Four are user studies or HCI design. **Two are networking protocol papers**
(`3704522.3704526`, `3777555.3777565`) and both are simulation-based.

Three things in that profile are load-bearing for us and each is the opposite of what the prior pass
assumed:

**(a) Zero quantitative baselines is survivable, and the venue's own flagship networking paper has
zero.** *DoT* (`3777555.3777565`) — ns-3 simulation, co-authored by A. B. M. Alim Al Islam, who is the
NSysS 2026 general contact — compares its adversarial scenario against **nothing quantitatively**. Its
only comparison is Table 3, "Comparison with Related Studies" (`p.7`), a **9-row × 5-column
capability matrix of ticks and crosses** across prior THz MAC protocols, with the last row "DoT (Our
proposed)" the only one ticked on all five features. The accompanying text (`p.7`) is explicit:
"We can see from the table that no other work, apart from ours, has considered any exploitation of
the MAC protocols. Our work is the first approach to conduct the study on throughput degradation by
exploiting the proposed MAC protocol through an adversary." **That is the template for a paper whose
contribution has no prior art to be measured against**, and it is exactly our situation.

**(b) Small sample counts pass.** *DoT*'s headline figures are captioned "Throughput average from
**five iterations**" (Figs. 7–10, `p.6`). The energy paper (`3777555.3777561 p.5`) runs "**three
times**" per variant, 24 runs total, on one machine, and says so. The prior pass called our five
propagation samples fatal. The corpus does not support that.

**(c) Node counts, however, are checked — for simulation papers.** `3704522.3704526` sweeps
**100 to 400 sensor nodes** on the x-axis of Figs. 8–10 (`pp.6–7`). `3777555.3777565` sweeps
**10 / 20 / 30 valid nodes** against a varying adversary count. `3704522.3704543` deploys **15
Cassandra nodes across 5 EC2 regions** (`p.1`). **n = 2 is below every networking or distributed-systems
paper in the corpus.** This is the one dimension where the prior pass was right and it is the one that
survives.

### 2.4 Threat models — the finding that most changes the plan

**Not one of the 35 papers states a threat model, adversary model, attack model or security model.**
I searched every full text for all four phrases and for "adversary capabilities", "trust model",
"security model". Zero hits in a section heading or a definitional sentence.

This holds for the papers where its absence is most surprising:

- `3777555.3777563` — *Bypassing Conventional eKYC: How Far Can We Go using Deepfake?* An offensive
  paper that mounts a real attack against live commercial identity-verification services. It has no
  threat model. The word "adversarial" appears once, in the conclusion (`p.7`).
- `3777555.3777564` — *Zero-Shot Detection of Jailbreaking Attempts in LLMs*. Thirteen uses of
  "adversarial", no adversary model.
- `3777555.3777565` — *DoT*. An adversarial-behaviour paper. The adversary is defined operationally in
  §4 "Methodology of DoT" (`p.2`) — one paragraph describing what the adversary node does — and never
  as a capability set.
- `3704522.3704532`, `3704522.3704534`, `3704522.3704541`, `3704522.3704546` — phishing, EVCS
  intrusion detection, NSL-KDD intrusion detection, homomorphic encryption. None.

**Implication.** A threat model is not the venue's entry ticket and its absence is not why papers get
rejected here. It is still worth writing about half a page of one, for two reasons that have nothing
to do with meeting a norm: it is the cheapest way to stop a reviewer asking "resistant to whom?",
and it is the discipline that keeps us from claiming L4/L5. But it is **not** the fatal item the prior
pass ranked first, and it should not consume a full page of a 9-page budget.

### 2.5 House style

| Trait | Finding |
| --- | --- |
| **First person plural** | Dominant. Median 30 uses of "we" per paper, range 0–77. Only three papers avoid it (`3777555.3777557`, `.3777561`, `.3777562`) and all three are third-person/passive throughout, not first-person singular. `3777555.3777557` is single-authored and still writes "This study's contribution is threefold" rather than "I". **Use "we".** |
| **Introduction length** | Median ~4,100 characters of body text ≈ **0.6 of a page**. Range 1,620–8,552. Short. |
| **Contributions as a bulleted list** | Only **11 of 35** enumerate. Formats vary: `•` bullets (`3704522.3704531`, `3777555.3777559`, `3777555.3777565`), `(1)(2)(3)` (`3704522.3704524`, `.3704526`), `(i)(ii)(iii)` (`3777555.3777557`), inline `i) … ii)` (`3704522.3704528`), `(a)(b)(c)` (`3704522.3704523`). Two or three bullets is normal — *DoT* has exactly **two**. Do not write six. |
| **Related work** | A numbered section in **30 of 35**, almost always §2, occasionally §3 after a Background section. Woven-in related work is the exception. |
| **Limitations** | Stated in **14 of 35**, and where present usually a named section: "Limitations and Future Work" (`3704522.3704531` §7, `3777555.3777561` §7), "Discussion and Limitation" (`3704522.3704532` §4), "Limitations and Conclusion" (`3704522.3704529` §6), a standalone §6 "Limitations" (`3704522.3704546`, `3777555.3777557`). **A limitations section is a recognised, well-precedented move here.** |
| **Section count** | Typically 5–8 numbered sections. Longest: `3777555.3777562` with 11. |
| **Tone** | Plain declarative. Heavy use of "proposed" for the authors' own contribution. No hedging conventions, no explicit reproducibility or artefact statements. One paper (`3777555.3777557 p.8`) thanks "the NSysS 2025 reviewers" in an Acknowledgments section. |

**Our submission must not read as an outlier.** The practical translation: "we" throughout; a
0.6-page intro; two or three contribution bullets, not six; §2 Related Work as its own numbered
section; a named Limitations section; roughly 27 references.

### 2.6 Acceptance rate — still ABSENT

**No PDF in the corpus states an acceptance rate, a submission count, or a PC size.** I searched all
35 full texts for "acceptance rate", "acceptance ratio", "submissions were received", "N% accepted"
and "Program Committee". The only "acceptance rate" hits are in `3704522.3704535`, where the phrase
refers to **ChatGPT's code submissions being accepted by LeetCode and Codeforces judges** — 72%, 31%,
73.53% — and has nothing to do with the conference. There is no preface or frontmatter PDF in the
directory.

**The prior pass's unverifiable "21%" remains unverifiable. Do not cite it.** Mark **ABSENT**.

---

## 3. Q3 — Nearest neighbours: the previous pass's conclusion is confirmed, and hardened

The prior pass searched DBLP *titles* and found nothing. Full text is a far stronger test, and it
returns the same answer more decisively. Every one of the 35 full texts, searched for:

| Concept | Regex family | Papers with any hit | Papers with a hit in body prose (not a reference list) |
| --- | --- | --- | --- |
| Censorship, shutdown, blackout | `censorship\|shutdown\|blackout` | **0** | **0** |
| Network partition, split-brain | `network partition\|partition-toleran\|split-brain` | **0** | **0** |
| Delay/disruption tolerance, DTN, store-and-forward | `delay-toleran\|disruption-toleran\|DTN\|store-and-forward\|store-carry` | **0** | **0** |
| Offline-first, intermittent connectivity | `offline-first\|offline mode\|intermittent connectivity` | **0** | **0** |
| Opportunistic routing | `opportunistic (routing\|network\|forward)` | **0** | **0** |
| Gossip / epidemic protocols | `gossip protocol\|gossip-based\|epidemic dissemination` | **0** | **0** |
| Mesh / ad-hoc networks | `mesh\|ad-hoc network\|MANET\|VANET` | 4 | **0** |
| LoRa / LPWAN / packet radio | `LoRa\|LoRaWAN\|LPWAN\|ZigBee\|packet radio` | 1 | **1** |
| Federation | `federat(ion\|ed)\|ActivityPub\|Mastodon\|fediverse` | 4 | **0** |
| P2P / decentralised | `peer-to-peer\|P2P\|decentrali[sz]ed` | 5 | **2** |
| Blockchain | `blockchain\|smart contract\|proof-of-work` | 3 | **0** |
| Digital signatures / Merkle | `digital signature\|Ed25519\|Merkle\|public-key crypt` | 1 | **1** |

**The four "mesh" hits and the four "federation" hits are reference-list artefacts and nothing else.**
Every "mesh"/"ad hoc" hit is the string "**Ad Hoc Networks**" — the Elsevier journal name — inside a
bibliography entry (`3704522.3704526` ref [9] and [12]; `3704522.3704541` refs [15] and [22];
`3777555.3777565` ref [11]). Every "federation" hit is "**federated learning**" (`3704522.3704534`
ref [8]; `3704522.3704537` body, one clause; `3704522.3704541` refs [15] and [17];
`3704522.3704546` body, one clause about ciphertext serialisation for FL). Every blockchain hit is a
citation to someone else's blockchain paper.

**The complete list of papers that are even adjacent, with exact titles:**

| File | pp | Exact title | Adjacency, and how weak it is |
| --- | --- | --- | --- |
| `3704522.3704543` | 8 | *Performance Improvement of Redundant Requests in Distributed Systems* | **The closest paper in the corpus.** Real geo-distributed deployment (15-node Cassandra, 5 EC2 regions, YCSB), tail-latency measurement, replica selection. Shares our genre — a distributed-systems measurement paper — but nothing of our problem. Adnan (BUET). |
| `3704522.3704526` | 8 | *An Efficient Burst Traffic-Aware Clustering and Mobility Management model for mobile-sink based Heterogeneous Wireless Sensor Networks* | Multi-hop routing under an energy constraint; mobile sink as a physical relay. Closest thing to store-carry-forward in the corpus, and it is not that. |
| `3777555.3777565` | 8 | *DoT: Degradation of Throughput by the Adversarial Behavior of Nodes in Terahertz Communication Networks* | **The structural template** (§2.3a). An availability-degradation paper, adversary-driven, no quantitative baseline, capability-matrix comparison. Al Islam (BUET). |
| `3704522.3704546` | 8 | *Benchmarking Fully Homomorphic Encryption Libraries in IoT Devices* | Cryptographic primitives measured on constrained hardware (Raspberry Pi 4B), including **ciphertext serialisation size** as a first-class metric — the nearest precedent for our encoded-wire-size measurement. |
| `3704522.3704528` | 8 | *A Confidentiality-Preserving Distributed Linear Programming Model for Solving Large-Scale Economic Dispatch Problems* | Only paper in the corpus whose body prose discusses public-key cryptosystems. Confidentiality as a design constraint on a distributed computation. |
| `3777555.3777562` | 9 | *Design of a USB RAID Controller for ARM SBC cluster server* | Low-power ARM SBC as a server platform, `< 20 W`. Relevant only to our Raspberry-Pi-4 footprint constraint. |
| `3777555.3777557` | 9 | *From Connectivity to Care: How Digital Inclusion Shapes Women's Healthcare Decision-Making in Bangladesh* | Connectivity-as-infrastructure framing, Bangladesh, 30,078 respondents. Establishes that **connectivity-access framing has a constituency here**. |
| `3704522.3704539` | 10 | *Connecting Mobile Money: Understanding the Adoption and Usage of Mobile Financial Services (MFS) by Low-Income Internal Migrant Workers in Dhaka* | Same. Low-connectivity, underserved-population framing; explicitly "rural"/"underserved". |
| `3704522.3704545` | 7 | *Human-Machine Collaboration at the Tollbooth: Perceptions and Requirements of Toll Workers in the Age of AI and IoT* | Only body-prose mention of a sub-GHz radio (ZigBee) in the corpus, and it is one sentence describing someone else's tollgate system. |
| `3777555.3777563` | 8 | *Bypassing Conventional eKYC: How Far Can We Go using Deepfake?* | Adjacent only in being an adversarial systems-security paper that attacks real deployed services. Al Islam (BUET). |

**Verdict: the prior pass's conclusion stands, and full text makes it stronger.** There is no
censorship, shutdown, partition-tolerance, DTN, mesh-transport, federation, or transparency-log
constituency at this venue. Zero papers. Not one reviewer in the accepted-author population has
published on our problem.

But the corpus overturns the *pessimistic* half of that reading. It shows the venue accepts, in the
same two editions: an adversarial availability-degradation paper with no baselines (`3777555.3777565`),
a geo-distributed systems measurement paper (`3704522.3704543`), a constrained-hardware crypto
benchmark that measures serialised sizes (`3704522.3704546`), and two Bangladesh
connectivity-access papers (`3777555.3777557`, `3704522.3704539`). **Each of the four things our
paper does has a precedent here. What has no precedent is the combination.** That is a positioning
problem, not a fit problem, and it is solved by introducing every concept from zero — as the prior
pass already recommended and this corpus confirms is necessary.

---

## 4. Q4 — The finished plan

### 4.1 Title

> **Islands of Reach: Federated Content Delivery Across ISP-Level Network Partitions**

Rationale from the corpus, not from taste. Colon-separated `Short-Name: Descriptive Subtitle` is the
dominant title form among the systems papers here (`DoT: …`, `Seg2Reg-Net: …`, `ChainGraph-DL: …`,
`XLNet-CNN: …`, `MonChitro: …`, `EmoBot`). "Censorship" and "shutdown" stay out of the title: zero
papers in twelve editions use either word anywhere, and the two Bangladesh-context papers that did
land (`3777555.3777557`, `3704522.3704539`) both frame around **access and inclusion**. "Partition"
is the honest technical word for what we actually built and measured.

### 4.2 Abstract (150 words)

> Network shutdowns are not a switch but a ladder: Bangladesh's 2024 disruption combined throttling,
> platform blocking, TLS interference and a five-day national blackout. Systems built for the open
> internet stop at the first rung. We present a federated content substrate that keeps operating as
> connectivity degrades from global reach, through a national partition, to isolated ISP islands
> rejoined by a multi-homed bridge. Every mutation is a self-authenticating signed envelope validated
> by an identical nineteen-step pipeline whatever transport carried it, so peer trust bounds volume
> and never validity. Admission cost is charged at the origin and a per-peer quota protects the
> receiver, because node-local anti-abuse secrets cannot gate federated content. We evaluate on a
> container testbed with independent datastores and separate address spaces, reporting propagation
> latency, per-scope path selection, resident memory and encoded message sizes against a JSON-LD
> federation baseline, and we state exactly which ladder rungs remain unmeasured, and why.

(150 words, counted.)

### 4.3 Section outline — 9 pages, ACM `sigconf`

Budget set by §1.2 (9 pages operative) and shaped by §2.3 and §2.5.

| § | Content | Pages |
| --- | --- | --- |
| 1 | **Introduction.** The ladder, from OONI's Bangladesh 2024 measurements. The gap: internet systems stop at rung 1, mesh systems only start at rung 4. **Three contribution bullets, no more** — matching the two-to-three-bullet norm (§2.5): (a) a scope-aware federation design that spans L0–L3; (b) two federation design rules with the deployed failures that produced them; (c) a partition testbed and the first measurements of the system. Intro body ~0.6 page per §2.5. | **1.0** |
| 2 | **Related work.** Its own numbered section — 30 of 35 papers do this. Ordered: DTN/RFC 9171 as the architectural ancestor; Serval, Bridgefy, Amigo, ASMesh at the mesh rung; ActivityPub + the two Mastodon CVEs at the federation rung; **AT Protocol as the closest prior *composition*** (signed records, a Merkle tree over them, federation) and the sharpest contrast on deletion; Matrix Canonical JSON and Cosmos SDK ADR-020 as the two poles of the canonicalisation design space (§4.7); ICE/MPTCP as path-selection ancestors; Privacy Pass for issuance/verification separation. Positioned as "each occupies one or two rungs". **Budget three sentences each to introduce federation, canonical encoding and transparency logs from zero** — §3 shows the PC has no exposure to any of them. | **1.0** |
| 3 | **Design.** One write endpoint; the envelope; canonical encoding and why re-encode-and-compare rather than canonicalise-at-both-ends; the 19-step pipeline with steps 1–12 performing no writes; registry-driven dispatch. Figures 1 and 2. | **1.5** |
| 4 | **Federating across a partition.** Passthrough codec (ADR-008 §1). `(content_id, direction)` as a unique index rather than a read-then-write check (ADR-008 §2). Origin-derived identifiers (ADR-010). Cost at origin, quota at receiver (ADR-011). The multi-homed bridge between ISP islands. Figure 3. | **1.25** |
| 5 | **Adversary and scope.** Deliberately short — **half a page, not the full page the prior pass budgeted**, because §2.4 shows 0 of 35 accepted papers have one at all and the space is better spent on evaluation. States the adversary (an ISP or national operator with DPI, routing control and the ability to partition) and, more importantly, what is out of scope: no global passive adversary, no compromised-majority peer set, no endpoint compromise, no traffic-analysis resistance, no formal plane-unlinkability claim. | **0.5** |
| 6 | **Evaluation.** Testbed figure. Then: (6.1) correctness under partition — identical content IDs and origin-derived community IDs across independent datastores; (6.2) propagation latency, ≥ 8 nodes, ≥ 200 samples, CDF against fanout degree; (6.3) bridge attribution — `/proc/net/tcp` source-address evidence and per-direction accounting; (6.4) read throughput and p50/p99 at c ∈ {1, 8, 32}; (6.5) resident memory idle and under bulk crossing, against the 512 MB Pi-4 constraint; (6.6) encoded wire size against a JSON-LD `Create`/`Note` baseline. Figures 4–8, Table 1. | **2.5** |
| 7 | **Comparison with related systems.** **A capability matrix, explicitly modelled on `3777555.3777565` Table 3 (p.7)** — rows are DTN/BPv7, Serval, Bridgefy, ActivityPub/Mastodon, Matrix, **AT Protocol** and ours; columns are the ladder rungs L0–L5 plus "signed at rest", "verifies without server", "no re-encode on path", "transparency-log gossip", "federation trust states" and "tombstoned deletion". This is how the venue's own networking paper handles having no quantitative baseline, and it converts our biggest stated weakness into a conventional move. Table 2. | **0.5** |
| 8 | **Limitations.** A named section — 14 of 35 papers have one and it is a recognised move (§2.5). Explicit: no phone-to-phone LAN mesh between real handsets; no RNS reaching `running` on device; no physical radio drill; no evaluation outside containers; no formal unlinkability argument. | **0.4** |
| 9 | **Lessons.** Three, transferable: an identifier derived from the local node cannot be stable across nodes (L-17); a single-node test suite cannot see a two-node bug (L-18); a green in-process gate does not mean the deployed artefact runs (L-20). | **0.35** |
| 10 | **Conclusion.** | **0.2** |
| — | **References**, ~27 entries (the corpus median), two-column | **0.8** |

**Total 10.0 → cut 1.0 page from §3 and §4 in editing to land on 9.** The evaluation, the capability
matrix and the limitations section do not get cut.

### 4.4 Figure list

Eight figures and two tables, against a corpus median of 6 figures and 3 tables — comfortably inside
the range (max observed: 17 figures, 9 tables).

| # | Figure | Source |
| --- | --- | --- |
| 1 | The scope ladder L0–L5, annotated with which adversary cuts each rung and which rungs we measured | design |
| 2 | The 19-step ingress pipeline, with the steps 1–12 / 13–19 no-write boundary marked | design |
| 3 | Federation across the partition: two islands, the exchange network, the multi-homed bridge, and the two source addresses | design |
| 4 | Testbed topology: 4+ nodes, 3 Docker networks (two `internal: true`), per-node datastores | testbed |
| 5 | Propagation-latency CDF over an 8-node chain, 200 paced samples, by hop count | ✅ measured 2026-08-18 |
| 6 | Read throughput and p50/p99 at c ∈ {1, 8, 32} | measured, re-run at scale |
| 7 | Resident memory: idle vs. bulk crossing, with the 512 MB Pi-4 line drawn | measured |
| 8 | Encoded wire size, ours vs. a real ActivityPub baseline (n = 80), for check-in / broadcast / forum post — plot **protocol overhead**, not totals, and show the compressed pair beside it | ✅ measured 2026-08-19 |
| T1 | Per-scope path-selection and per-direction bridge accounting | measured |
| T2 | Capability matrix vs. DTN/BPv7, Serval, Bridgefy, ActivityPub, Matrix, AT Protocol | design |

### 4.5 Claim-to-evidence table

Every claim the paper will make, against the specific evidence that supports it. **A claim with no
green evidence does not go in the paper.**

| # | Claim | Evidence | Status |
| --- | --- | --- | --- |
| 1 | One canonical encoding, agreed byte-for-byte across three independent implementations | `pnpm vectors`: TS ≡ Rust ≡ Python, 16 vectors, byte-identical | ✅ verified 2026-08-15 |
| 2 | Every mutation is a self-authenticating signed envelope validated by one pipeline regardless of transport | 19-step pipeline; inbound federated envelopes re-run all 19 steps; 826 tests | ✅ verified |
| 3 | Two independent instances federate for real, with separate datastores | `pnpm ops:two-node`; FG-01…FG-10, 30/30 | ✅ verified |
| 4 | A federated identifier is derived from signed bytes, not from the projecting node | post on node-a projects on node-b with identical content ID **and origin-derived community ID** (ADR-010) | ✅ verified in deployment |
| 5 | Federation sockets leave from both configured source addresses on a multi-homed bridge | `/proc/net/tcp` inside `jb-bridge`: 10.90.1.30 and 10.90.2.30 | ✅ verified — TG-01 |
| 6 | The system operates across L0→L3 (global → national → ISP island → bridged islands) | ISP container testbed: 4 nodes, 3 networks, two `internal: true`. **`pnpm gate:isp` — every criterion passed, 19/19, 2026-08-19.** Bridged crossing measured per envelope: 0.5 / 1.2 / 2.1 s for the certificate → community → post chain with the exchange cut, against 1.5 / 1.5 / 1.9 s healthy | ✅ **verified in deployment.** Cutting the exchange no longer meaningfully degrades crossing latency — which is the property the bridge was always supposed to provide and, until L-31 was fixed, never did. |
| 7 | Propagation latency across a multi-hop federation chain | 8-node chain, 200 paced samples, zero loss: 7 hops **p50 4125 ms, p99 6115 ms, 200/200 delivered**. Per-hop model `drain/2 + fixed` confirmed at two operating points, with fixed stable at **71–89 ms across a 4× change in the drain interval** | ✅ **measured 2026-08-18** — satisfies §2.3c. Report the regime (L-29): the unpaced burst run gave hop-1 p50 10 s / p95 173 s, which is queueing plus shared-mongod contention and **not** propagation. Never average the two. |
| 8 | Read-path throughput | 228 req/s @ c=1 (p50 4.1 ms), 750 @ c=8 (9.4 ms), 688 @ c=32 (44.2 ms), keep-alive | ✅ measured; re-run on the scaled testbed |
| 9 | A federating node fits the Raspberry Pi 4 512 MB constraint | RSS 62 MiB idle, 233 MiB @ 54% CPU under bulk crossing; +147 MiB Mongo, +3.7 MiB Redis ⇒ ~384 MiB | ✅ measured — report as **tight, Mongo-dominated**, not comfortable |
| 10 | Encoded envelopes are small enough for constrained links, and materially smaller than the dominant federation protocol | ours: check-in 155 B, Bangla broadcast 243 B, forum post 220 B, incl. 64 B Ed25519. Baseline: **n = 80 real `Create`/`Note` activities** from two independent stock Mastodon instances — delivered **p50 4216 B**, authored text p50 205 B, **protocol overhead p50 4015 B**, and a **927 B `@context` alone** (identical on both hosts) | ✅ **measured 2026-08-19** via `pnpm ap:baseline`. Overhead ratio **19.5×–25.9×**; **gzipped it is 4.4×–6.9×** and our envelopes do *not* compress (a random 64 B signature is incompressible, so gzip makes them larger). Quote **both**. AP is charged **nothing** for authentication — HTTP Signatures are transport-level and a third party cannot verify a stored object — so the comparison already favours AP. |
| 11 | Admission cost is charged at origin; the receiver's protection is a per-peer per-class quota | ADR-011; quota + `backpressure_hint_ms` implemented and gated | ✅ design + tests |
| 12 | A peer's bytes are never re-encoded on the path | passthrough gRPC codec, ADR-008 §1 | ✅ design + tests |
| 13 | Deduplication is a unique index, not a read-then-write | `(content_id, direction)` unique index, ADR-008 §2 | ✅ design + tests |
| 14 | Phone-to-phone LAN mesh works | — | ❌ **NOT OBSERVED — §8 Limitations only** |
| 15 | Reticulum/RNS reaches `running` on device | — | ❌ **NOT OBSERVED — §8 Limitations only** |
| 16 | Any physical LoRa radio drill | — | ❌ **NOT OBSERVED — must not appear in the abstract** |
| 17 | Formal unlinkability of the two identity planes | — | ❌ **No adversary model, no proof — §8 Limitations only** |
| 18 | Independent nodes receiving the same signed set in **different orders** converge to identical projections | `vote-cast.handler.ts` orders by `(created_at_ms, content_id)`, both inside the signed envelope; `vote-cast.spec.ts` asserts order-independence over all permutations | ✅ **fixed and gated 2026-08-18.** Before the fix two nodes diverged permanently on both the stored vote and the post score. This is a genuine federation-correctness result and belongs in §4. |
| 19 | Deletion leaves a publicly visible tombstone (content ID, author, timestamp, acting moderator, reason) | publish-then-attest moderation; tombstone retains everything but the body | ✅ design + tests — **and it is the sharpest single contrast with AT Protocol**, whose repository spec states: *"Record deletion is supported without leaving a trace or 'tombstone' of previous contents."* |

### 4.6 What has to happen before submission, in priority order

Reordered against the prior pass, because §2 changes the ranking. **Status column added 2026-08-19**; items 1 and 2 have moved since this table was written.

| # | Item | Why it moved | Est. | Status |
| --- | --- | --- | --- | --- |
| 1 | **Get `pnpm gate:isp` to 19/19** on a stack recreated with `-v`. | §4 and §6 of the paper are *about* the bridge. Publishing a bridge evaluation while the bridge gate fails on the bridge is indefensible. | hours | ✅ **DONE 2026-08-19 — "every criterion passed".** Two real defects, not a timeout: **L-28** (a stale tree head read as a fork, BLOCKING two honest peers) took it 17→18, and **L-31** (head-of-line blocking across peers — one blackholed peer stalled delivery to every other peer in the same drain pass, including the bridge) took it 18→**19**. Bridged crossing fell from **407.6 s to 2.1 s**. Gated by `federation-outbox.spec.ts`, which fails on purpose against the serial implementation. |
| 2 | **Scale the testbed to ≥ 8 nodes and take ≥ 200 propagation samples** with a projection-time timestamp rather than a poller. | **The one criterion the corpus actually enforces** (§2.3c): every networking paper here sweeps node count — 100–400, 10/20/30, 15 across 5 regions. n = 2 is below all of them. | 2–3 d | ✅ **done 2026-08-18.** `scale-gen.ts` / `scale-measure.ts`, 8-node chain, 200 paced samples, zero loss. See claim 7 and L-29 (always report the regime). |
| 3 | **Build the capability matrix (Table 2)** against DTN/BPv7, Serval, Bridgefy, ActivityPub/Mastodon, Matrix, **AT Protocol** and ours. | **Replaces "get a quantitative baseline" as the top comparison task.** §2.3a: `3777555.3777565` p.7 does exactly this and is a networking paper by the general contact. Cheaper than a baseline and better matched to a contribution with no prior art. **AT Protocol was added 2026-08-19** — it is the closest prior *composition* and neither earlier research pass found it. | 1 d | ✅ **done 2026-08-19.** Cells in `NSYSS-2026-PAPER-S7-CAPABILITY-MATRIX.md`, every one traced to a verbatim quote in `NSYSS-2026-CAPABILITY-MATRIX-SOURCES.md` (17 corrections to common belief, incl. ActivityPub requiring **neither** HTTP nor object signatures normatively, and atproto **not** being offline-verifiable). |
| 4 | **Measure a real ActivityPub `Create`/`Note` payload** and put it beside 155 B / 243 B / 220 B. | Still worth doing — it is the one place we can produce an honest quantitative comparison, and the corpus has a precedent for size-as-a-metric (`3704522.3704546` Table 6). A supporting figure, not the load-bearing one. | 1 d | ✅ **done 2026-08-19.** `pnpm ap:baseline`, n = 80, two instances. See claim 10 and L-30. |
| 5 | **Write §5 Adversary and scope — half a page.** | **Downgraded from fatal to hygiene.** 0 of 35 accepted papers have one (§2.4), including two offensive-security papers. Worth writing to pre-empt "resistant to whom?", not worth a full page. State what is **out** of scope as clearly as what is in. | 0.5 d | ✅ **content settled 2026-08-19** in `NSYSS-2026-PAPER-S5-ADVERSARY-AND-SCOPE.md` — six in-scope attacks each mapped to something gated, eight out-of-scope limits. Prose deliberately left to the author (AI-detector screening). |
| 6 | **Strip LoRa, Reticulum and phone-mesh from the abstract and every claim.** Confine to §8. | Unchanged. Claims 14–17 are unobserved. One probing question unravels the paper. | free | 🔵 enforce at draft time |
| 7 | **Anonymise for double-blind.** No system name, no repo URL, no acknowledgements; cite OONI and any BUET-group work in the third person. | Unchanged; desk-reject risk. The two most adjacent papers (`3777555.3777565`, `3777555.3777563`) are both co-authored by the NSysS 2026 general contact — cite them in the third person, and *do* cite them, because engaging the venue's own literature is visible and cheap. | free | 🔵 enforce at draft time |
| 8 | **Write the prose by hand.** | The Author Instructions state submissions are screened with a plagiarism checker **and** an AI detector. | — | 🔵 enforce at draft time |

### 4.7 Canonicalisation is a three-position design space, settled against the specs

> **Revised 2026-08-19.** This section previously framed canonicalisation as a two-position
> contrast — Matrix versus this system. That framing is wrong by omission. It presents our rule as
> *the* alternative to Matrix's, when there is a third, well-documented position that a reviewer may
> know better than either, and whose existence changes what our contribution actually is. All three
> positions below are quoted from primary sources, read directly.

§2 and §3 both turn on this comparison, and an earlier pass in this project got the direction of the
Matrix half **backwards** — which would have put a false claim in related work. Write the paper from
the quotations below, not from memory.

The design space is not "canonicalise or don't". It is **where in the pipeline canonicalisation sits,
and what happens when it fails**.

#### Position 1 — canonicalise at verify (Matrix)

The "Checking for a signature" algorithm in the Matrix appendices
(<https://spec.matrix.org/v1.11/appendices/>) is ordered:

> 5. Removes the `signatures` and `unsigned` members of the object.
> 6. Encodes the remainder of the JSON object using the Canonical JSON encoding.
> 7. Checks the signature bytes against the encoded object using the *verification key*.

Canonicalisation happens at **step 6, inside the verifier**. An intermediary may therefore reorder
keys or change whitespace in a Matrix event without invalidating anything, because the receiver
re-derives the canonical form before checking. The verifier checks the signature against bytes **it
produced itself**, not against bytes it received.

#### Position 2 — sign the raw bytes and define no canonical form (Cosmos SDK ADR-020)

ADR-020 rejects canonicalisation outright, and says why
(<https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-020-protobuf-transaction-encoding.md>):

> Signature verification is based on comparing the raw `TxBody` and `AuthInfo` bytes encoded in
> `TxRaw` not based on any "canonicalization" algorithm which creates added complexity for clients
> in addition to preventing some forms of upgradeability

and, on the direct signing mode:

> The "direct" signing behavior is to sign the raw `TxBody` bytes as broadcast over the wire. This
> has the advantages of: requiring the minimum additional client capabilities beyond a standard
> protocol buffers implementation [and] leaving effectively zero holes for transaction malleability
> (i.e. there are no subtle differences between the signing and encoding formats which could
> potentially be exploited by an attacker)

This is **not** our position, and the difference is the whole point of §3. Cosmos signs what was sent
and verifies against what arrived — so far identical to us — but defines **no** accepted encoding at
all. Whatever bytes the sender emitted are, by construction, the contract. There is nothing to reject.

#### Position 3 — bytes as received, plus a canonical-form admission gate (this system)

We take Cosmos's verification rule and Matrix's insistence that a canonical form exists, and put them
in a different order. The signature is checked against the bytes **as they arrived**, exactly as
ADR-020 requires. Separately, and *before* verification, the decoder re-encodes and compares to
establish that those bytes are the one accepted encoding, and **rejects** them if they are not
(`decode.ts:270`, EN-02).

So canonicalisation is not in the verification path. It is an **admission predicate**, and its failure
mode is rejection rather than repair. This is the sentence that distinguishes all three positions and
belongs in the paper nearly verbatim:

> Matrix canonicalises to decide *what to verify against*; Cosmos declines to canonicalise at all;
> we canonicalise to decide *what to admit*, and verify against what arrived.

The hazard this forecloses is specific, and it is the reason the rule exists: a re-encoding
intermediary in Matrix's model silently **repairs** a malformed object into a verifiable one. In v1 of
this system that was the signature-confusion bug. In Cosmos's model the hazard cannot arise because
the question is never asked; in ours it cannot arise because the answer is "reject".

#### The three positions side by side

| | Matrix | Cosmos SDK ADR-020 | This system |
| --- | --- | --- | --- |
| The signature covers | a canonical form *derived from the parsed object* | *the raw bytes broadcast on the wire* | *the bytes as they arrived* |
| Canonicalisation happens | in every verifier, at check time | **nowhere — explicitly rejected** | once at the origin; receivers only *compare* |
| Its role | decides what to verify against | — | decides what to **admit** |
| Failure of the canonical form | cannot fail — it is re-derived | not defined | **rejection** (EN-02) |
| May an intermediary re-serialise? | yes, freely | no | no — hence the passthrough codec (ADR-008 §1) |
| Valid encodings per message | many (all canonicalise alike) | **one, implicitly** — whatever the sender emitted | **one, explicitly** — and it is checkable |
| The cost | the canonicalisation function is security-critical, must be byte-identical in every implementation, and anything outside it (`unsigned`) is unprotected | no interoperable definition of "the same message"; ADR-020 concedes it prevents "some forms of upgradeability" | strictness — a non-canonical encoder cannot talk to the network at all |
| The benefit | tolerant of sloppy relays and re-serialising middleboxes | minimum client capability; "effectively zero holes for transaction malleability" | no canonicalisation function sits between the attacker and the verifier, **and** two implementations can be proven to agree |

#### Why this makes the vector gate load-bearing rather than decorative

Position 3 is viable only if the accepted encoding is genuinely agreed across implementations —
otherwise the admission gate becomes a compatibility bug that rejects honest peers. Three independent
implementations agreeing byte-for-byte on 16 vectors is **what makes the strict choice affordable**.
Say that explicitly in §3: it converts a testing artefact into a design justification, and it answers
the obvious reviewer question, *"what happens when your Rust and TypeScript encoders disagree?"* — the
gate is the reason that question has an answer.

#### Own the upgradeability cost, because ADR-020 names it

ADR-020's objection is not only complexity; it is that canonicalisation prevents "some forms of
upgradeability". That is a real cost and the paper should concede it rather than wait to be asked. The
answer is structural and already in the design: unknown fields are not retained, so an old node cannot
silently pass through a new field it does not understand, and the response is a **version bump rather
than an in-place contract edit** (`CLAUDE.md` §7.1), with the version carried in the envelope and
checked at pipeline step 3. The cost is real — a v1 node cannot forward-carry a v2 field — and we
accept it because the alternative is exactly the ambiguity the profile exists to remove.

#### Pre-empt the protobuf objection in the same paragraph

`protobuf.dev` publishes a page titled "protobuf serialization is not canonical"
(<https://protobuf.dev/programming-guides/serialization-not-canonical/>) which states serialization
"is not (and cannot be) canonical", that "deterministic serialization is not canonical", and warns
against "comparing serialized payloads to check message equality". A reviewer who knows protobuf will
raise this against `decode.ts:270`, which does precisely that comparison.

The answer is that Google's guidance addresses a different question. It warns against using
byte-equality as a proxy for **message equality** — two encoders may legitimately emit different bytes
for the same message, so the comparison gives false negatives. This system asks a stricter and
narrower question: **is this the one accepted encoding?** A different encoding of the same meaning is
not an inconvenience to be tolerated; it is a second valid form, and rejecting it is the point
(EN-02). Protobuf declining to define a canonical form is exactly why the profile has to define one
and prove it across three implementations.

Note that Cosmos SDK reads the *same* Google guidance and draws the opposite conclusion — sign the raw
bytes, define nothing. Citing that agreement-on-premises, disagreement-on-conclusion is stronger than
citing Google alone, because it shows the design space was surveyed rather than assumed. State this in
the text **before** a reviewer states it at you; unprompted it reads as rigour, prompted it reads as a
patch.

---

## 5. Where these 35 papers contradict the previous research pass

The earlier file stays as-is. This section supersedes it on each point below.

| # | `NSYSS-2026-PAPER-RESEARCH.md` said | The 35 PDFs say | Consequence |
| --- | --- | --- | --- |
| 1 | "**Practical read: write to 8 pages.**" §2.2, §3.1 | **40% of accepted full papers exceed 8 pages.** 13 at 9, one at 10, max 10, median 8 (§1.1). The Author Instructions' 9-page limit is the operative one. | **Write to 9.** The prior recommendation discarded a page for a rule the proceedings does not enforce. |
| 2 | "**No threat model** … the standard reject … **Fatal**", ranked rejection cause #1 | **0 of 35 accepted papers state a threat model** — including an offensive deepfake-attack paper and a jailbreak-detection paper (§2.4). | Downgraded from fatal to hygiene. Half a page, not one page. The page goes to evaluation. |
| 3 | "**Zero baselines** … NSysS papers compare against 2–4 named baselines … **Fatal**", rejection cause #3 | Median is 3, but **11 of 35 (31%) have zero**, and the venue's flagship networking paper (`3777555.3777565`) has zero and substitutes a **qualitative capability matrix** (Table 3, p.7) (§2.2, §2.3a). | Reframed. Build the capability matrix as the primary comparison; the ActivityPub size baseline becomes supporting evidence. |
| 4 | "**n = 2 nodes, 5 samples** … 5 samples is a datapoint, not an evaluation … **Fatal**" | Split verdict. **5 samples is fine** — `3777555.3777565` Figs. 7–10 are "average from five iterations"; `3777555.3777561` uses 3 runs per variant (§2.3b). **n = 2 nodes is not fine** — the corpus sweeps 100–400, 10/20/30, and deploys 15 (§2.3c). | The fix is **node count**, not sample count. Both are cheap, but the priority inverts. |
| 5 | "Longest paper found anywhere: … NSysS 2021, 14 pp. … an invited/keynote-track paper" (inferred) | Not testable from this corpus, but the 2024–2025 maximum is **10**, and the distribution is tight. | The historical 5–14 range does not describe the current venue. Ignore pre-2024 page ranges. |
| 6 | "DBLP holds 36 records for 2024, 22 for 2025" | The 2024 proceedings body is **24 papers, pp. 1–196, contiguous, DOIs `.3704523`–`.3704546` with no gaps** (§0). Whatever makes up the rest starts at p. 197. | The "36 records" figure includes material outside the full-paper track. Do not use it as a full-paper count. |
| 7 | "Nearest-neighbour papers on censorship / shutdowns: **Zero in twelve editions**" (DBLP titles only) | **Confirmed and hardened by full text**: 0 papers mention censorship, shutdown, blackout, network partition, DTN, store-and-forward, offline-first, opportunistic routing or gossip anywhere, including reference lists (§3). | Stands. Conclusion unchanged, confidence raised from title-level to full-text. |
| 8 | "there is also **no reviewer constituency** … A paper that assumes familiarity with ActivityPub, Merkle transparency logs, or canonical serialisation **will not land**" | Confirmed on the transport/federation concepts. **Partially overturned on genre**: the corpus contains a 15-node geo-distributed EC2 measurement paper, a constrained-hardware crypto benchmark that measures serialised ciphertext size, an adversarial availability paper, and two Bangladesh connectivity-access papers (§3). | Each *ingredient* has a precedent; the *combination* does not. Introduce concepts from zero — but the genre fits, and the framing has a home. |
| 9 | "Acceptance rate … A '21%' figure … **UNVERIFIED**" | **Still ABSENT.** No PDF states an acceptance rate, submission count or PC size (§2.6). | Unchanged. Do not cite 21%. |
| 10 | Section outline totalling "≈ 9.75 → cut to 8", with §2 Threat Model at 1.0 page and no comparison section | Revised outline (§4.3): 9 pages, threat model 0.5, **new §7 capability matrix at 0.5**, named §8 Limitations, §2 Related Work as its own numbered section per the 30/35 norm. | The outline is replaced wholesale. |
| 11 | Title: "*Federating Through the Cut: …*" or "*Islands of Reach: A Federated Messaging Substrate That Degrades From Global Internet to ISP-Local Operation*" | The corpus's systems-paper title form is short-name-colon-subtitle, and the subtitle is short (§4.1). | Shortened to *Islands of Reach: Federated Content Delivery Across ISP-Level Network Partitions*. |

**Not contradicted, and reaffirmed:** the L0→L3 scoping with L4/L5 confined to a limitations section;
the disaster/access framing over the censorship framing; the double-blind hygiene items; the
"826 tests pass" warning; and the instruction to write the prose by hand.

---

## 6. What remains ABSENT after reading all 35

- **Acceptance rate, submission count, PC size.** Not in any PDF. No frontmatter or preface PDF exists
  in the corpus.
- **Short-paper full texts.** Zero in the corpus. Everything in §1.3 about short papers is inference
  from pagination gaps, not observation. The "Short Paper:" title-prefix convention the prior pass
  recorded from DBLP is **UNVERIFIED** here.
- **The tail of NSysS '25.** We hold pp. 1–136 with four internal gaps totalling 46 printed pages;
  what lies after p. 136 is unknown.
- **Anything after p. 196 of NSysS '24**, including DOIs ≥ `.3704547`.
- **Review guidelines, artefact evaluation, rebuttal phase.** No paper mentions any. One paper
  (`3777555.3777557` p.8) thanks "the NSysS 2025 reviewers", which confirms reviews are substantive
  enough to revise against and nothing more.
- **Whether the 9-page limit includes or excludes references.** Every paper in the corpus counts
  references inside its declared page count, which is consistent with the Author Instructions' "including
  figures, tables, references, and appendix", but no PDF states the rule.

---

## 7. Reproducing these numbers

Page counts, figure/table/reference counts, keyword incidence and style markers were extracted with
PyMuPDF over the PDF text layer; comparison-table contents, baseline counts, contribution formats and
the ACM footer blocks were read by hand from the rendered pages cited inline. Page counts were
independently confirmed against each paper's own "*N* pages" declaration — 35/35 agreement. Folio
ranges came from the printed page number on each PDF's first and last page.
