# NSysS 2026 — venue research, prior-art positioning, and a recommended angle

**Status:** Research note · 2026-08-18
**Scope:** Q1 venue standards · Q2 CFP mechanics · Q3 prior art · Q4 recommendation
**Method:** primary sources only — the conference's own pages under `cse.buet.ac.bd`, DBLP's venue
index and search API, IETF RFC text at `rfc-editor.org`, W3C/Matrix/protobuf specification pages,
GitHub Security Advisories, IACR ePrint, arXiv abstracts, and OONI's own report.
**Explicitly not used:** blog summaries, aggregator write-ups, vendor marketing, ResearchGate/Academia
mirrors, or search-engine answer boxes. Where a claim reached me only through a search snippet and I
could not trace it to the source that owns it, it is labelled **UNVERIFIED** and not used in the
recommendation.

**What I could not read:** the ACM Digital Library returns HTTP 403 to this agent
(`https://dl.acm.org/doi/proceedings/10.1145/3704522`, `https://dl.acm.org/doi/pdf/10.1145/3629188.3629190`).
Everything below about NSysS papers is therefore derived from **DBLP metadata** (titles, authors,
page ranges, DOIs) and the conference's own pages — **not from reading full texts**. That is a real
limit on Q1's "evaluation depth" answer and is flagged again in §2.3.

---

## 1. Summary of findings, in one screen

| Question | Answer | Confidence |
| --- | --- | --- |
| Page limit | **Conflicting on the conference's own site**: CFP says 6–8 pages, Author Instructions say 9 (full) / 5 (short). Both fetched 2026-08-18. | Verified as a conflict; the true limit is unresolved |
| Template | ACM `sample-sigconf.tex` (LaTeX) / `interim-layout.docx` (Word), double-column | Verified |
| References count | Yes — "including all figures, tables, appendices, and references" | Verified |
| Review model | **Double-blind**, submission via Microsoft CMT | Verified |
| Typical accepted length | 7–8 pages recent; historically 5–12 | Verified from DBLP page ranges |
| Volume | NSysS 2025 accepted **11 full + 10 short = 21**; DBLP holds 36 records for 2024, 22 for 2025 | Verified |
| Acceptance rate | **Not published anywhere I could reach.** A "21%" figure appeared in a search snippet and does **not** appear on either source page it was attributed to. | UNVERIFIED — do not cite |
| Nearest-neighbour papers on censorship / shutdowns | **Zero in twelve editions.** | Verified (DBLP venue-scoped search) |
| Nearest-neighbour on DTN | Two, both ≥ 2015/2016, both IEEE-era | Verified |
| Best angle | System-implementation + measurement paper on **L0→L3 degradation (global → national → ISP island → bridged islands)** with the container testbed as the evaluation | — |
| Most likely rejection cause | **No threat model, and n=2 nodes with 5 samples is not an evaluation** | — |

---

## 2. Q1 — What NSysS actually accepts

### 2.1 The venue's full publication history

DBLP indexes twelve editions under `conf/nsyss`
(<https://dblp.org/db/conf/nsyss/index.html>):

| Ed. | Year | Publisher | Location |
| --- | --- | --- | --- |
| 1st | 2015 | IEEE | Dhaka |
| 2nd | 2016 | IEEE | Dhaka |
| 3rd | 2017 (Jan) | IEEE | Dhaka |
| 4th | 2017 (Dec) | IEEE | Dhaka |
| 5th | 2018 | IEEE | Dhaka |
| 6th | 2019 | ACM | Dhaka |
| 7th | 2020 | ACM | Dhaka |
| 8th | 2021 | ACM | Cox's Bazar |
| 9th | 2022 | ACM | Cox's Bazar |
| 10th | 2023 | ACM | Khulna |
| 11th | 2024 | ACM | Khulna |
| 12th | 2025 | ACM | Sylhet |

**The venue changed its name in 2025** and the 2026 site carries the new one. DBLP's 2025 volume is
titled *"Proceedings of the 12th International Conference on **Next Generation Computing,
Communication, Systems and Security**, NSysS 2025"*, and the 2026 CFP page
(<https://cse.buet.ac.bd/nsyss2026/cfp>) uses the same expanded name. The acronym is unchanged. This
matters for a related-work section: searching "Networking, Systems and Security" misses the newest
edition.

The publisher switched IEEE → ACM at the 6th edition (2019), so all DOIs from 2019 onward are
`10.1145/*` and everything earlier is `10.1109/NSYSS.*`.

### 2.2 Length

From DBLP page ranges (verified per-paper, not estimated):

| Edition | Observed range | Modal length |
| --- | --- | --- |
| 2020 | 6–11 pp. (e.g. pp. 12–17; pp. 89–99) | ~8–10 |
| 2021 | 5–14 pp. (pp. 60–64; pp. 106–119) | ~10 |
| 2022 | 7–11 pp. | ~10 |
| 2023 | 8–10 pp. | ~8 |
| 2024 | 7–8 pp. | **~8** |
| 2025 | 5–9 pp. | **~7** |

The trend is clearly downward and consistent with an 8- or 9-page cap taking hold in the ACM era.
Longest paper found anywhere: *MGD: A Utility Metric for Private Data Publication*, NSysS 2021,
pp. 106–119 (14 pp.), DOI `10.1145/3491371.3491385` — an invited/keynote-track paper, since the
2021 volume's last four entries (Bertino & Karim; Li et al.; Han et al.; Hossain et al.) are all
by non-Bangladeshi senior groups and sit after the main body.

**Practical read: write to 8 pages of ACM `sigconf`, references included.** That satisfies the CFP's
"6 to 8" and is inside the Author Instructions' 9.

### 2.3 Evaluation depth — what a median accepted paper does

**Honesty first: I could not read a single NSysS full text** (ACM DL 403). What follows is inferred
from title semantics, page budget and author groups, and should be treated as a strong prior rather
than a measured finding.

The 2025 accepted list (<https://cse.buet.ac.bd/nsyss2025/papers>) is 11 full papers, of which the
titles indicate: 6 applied ML/DL on a domain dataset, 1 HCI/survey study, 1 measurement of web
front-end energy, 1 hardware build, 1 LLM-security detection study, 1 network-simulation study
(*DoT: Degradation of Throughput by the Adversarial Behavior of Nodes in Terahertz Communication
Networks*, Arefin & Al Islam, `10.1145/3777555.3777565`).

The same shape holds in 2024 (<https://dblp.org/db/conf/nsyss/nsyss2024.html>): of the papers DBLP
exposes, the large majority are supervised-learning studies over a dataset —
*Explainable Deep Learning for Cyber Attack Detection in EV Charging Stations*
(`10.1145/3704522.3704534`), *XLNet-CNN* (`10.1145/3704522.3704540`),
*Enhancing Sleep Disorder Diagnosis…* (`10.1145/3704522.3704533`) — with a thin systems minority:
*Benchmarking Fully Homomorphic Encryption Libraries in IoT Devices*
(`10.1145/3704522.3704546`) and *An Efficient Burst Traffic-Aware Clustering and Mobility Management
model for mobile-sink based Heterogeneous WSNs* (`10.1145/3704522.3704526`).

The networking papers that do get in are overwhelmingly **simulation-based protocol work**:
*IT-SBA: An Improved Timer-based Scalable Broadcast Algorithm for Wireless Ad-hoc Networks*
(Siddik & Rahman, NSysS 2023, `10.1145/3629188.3629190`) — 8 pp., and the 2023 Best Paper per
<https://cse.buet.ac.bd/nsyss2023/bestpapers/>; *Construction of connected dominating set to reduce
contention in wireless ad-hoc network* (NSysS 2019, `10.1145/3362966.3362975`);
*Fault tolerant optimized broadcast for wireless Ad-Hoc networks* (NSysS 2016,
`10.1109/NSYSS.2016.7400690`); *Delay and Cost Aware Adaptive Deployment and Migration of Service
Function Chains in 5G* (NSysS 2023, `10.1145/3629188.3629196`, Best Student Paper).

**What this implies for the bar.** The venue's own CFP asks for "original technical papers
articulating novel ideas, protocols, and algorithms with ground-breaking results"
(<https://cse.buet.ac.bd/nsyss2026/cfp>), and the accepted set is dominated by papers that compare a
proposed method against **2–4 named baselines on a quantitative metric**. A real multi-container
testbed with `/proc/net/tcp` evidence is **above** the median NSysS evaluation in fidelity and
**below** it in the one dimension reviewers here reliably check: *comparison against a baseline*.
That asymmetry is the single most important input to Q4.

I found **no evidence** of an artifact-evaluation track, a reproducibility badge programme, or
published review guidelines for NSysS. Treat that as ABSENT, not as "no".

### 2.4 Nearest neighbours — the search that matters

Venue-scoped DBLP full-text search (`stream:streams/conf/nsyss:` + term, via
`https://dblp.org/search/publ/api`), run 2026-08-18:

| Query | Hits |
| --- | --- |
| `censorship` | **0** |
| `shutdown`, `blackout` | 0 (no hit distinct from the below) |
| `lora`, `lorawan` | **0** |
| `mesh` | **1** — *Strategic Placement of Intrusion Detection Systems in IoT Mesh Networks through Machine Learning*, NSysS 2023, `10.1145/3629188.3629195` (IDS placement, not mesh transport) |
| `delay tolerant` | **2** — *On bounded message replication in delay tolerant networks*, Sadat, Mohiuddin & Uddin, NSysS 2015, `10.1109/NSYSS.2015.7042952`; *Impact of mobile nodes for few mobility models on delay-tolerant network routing protocols*, Hossen & Rahim, NSysS 2016, `10.1109/NSYSS.2016.7400704` |
| `ad hoc` / `manet` / `vanet` | 5, all routing/broadcast/channel-assignment (2016–2023), listed in §2.3 |
| `blockchain` | **5** — incl. *Sociala: An Incentivized Decentralized Social Media for writers based on Blockchain using modified Delegated Proof of Stake*, Hasan et al., NSysS 2023, `10.1145/3629188.3629198`; *Short Paper: Storage Reduction of Private Blockchain with Sharding and Community Based Clustering*, NSysS 2024, `10.1145/3704522.3704554`; *Quantum-Resistant FOTA: End-to-End Decentralized Firmware Updates for IoT Using Blockchain and CRYSTALS-Dilithium*, NSysS 2025, `10.1145/3777555.3777569` |
| `anonymity` / `anonymous` / `tor` / `privacy` (combined) | 0 |

**Read this carefully — it cuts both ways.**

- *Good:* there is no NSysS paper on censorship resistance, internet shutdowns, or federated social
  systems. Nothing to be scooped by; nothing to be measured against unfavourably.
- *Bad:* there is also no reviewer constituency. The nearest thing to a peer for this work is
  **Sociala** (decentralised social media, blockchain, 2023) and the **two DTN papers from a decade
  ago**. A PC drawn from the accepted-paper population is mostly applied-ML and WSN/ad-hoc-routing
  people. A paper that assumes familiarity with ActivityPub, Merkle transparency logs, or canonical
  serialisation **will not land**. Every such concept must be introduced from zero inside the 8-page
  budget.

Disaster/emergency-response work does have a track record and is clearly welcome:
*Sign of life: A system for escalating post-disaster rescue missions in ready-made garment
factories*, Khan et al., NSysS 2015, `10.1109/NSYSS.2015.7043522`;
*Super-savior: An Independent Open Platform Wearable for Generating Emergency Alarms*, NSysS 2018,
`10.1109/NSYSS.2018.8631372`; *AI-Driven Disaster Warning System…*, NSysS 2024,
`10.1145/3704522.3704549`. **Framing the work as crisis/disaster communication resilience is a
better-supported frame at this venue than framing it as censorship circumvention.**

### 2.5 BUET / Bangladeshi groups and the 2024 shutdown

**A. B. M. Alim Al Islam (BUET CSE)** is both the NSysS 2026 general contact
(<https://cse.buet.ac.bd/nsyss2026/contact/>) and by a wide margin the most frequent author in the
proceedings — co-author on papers in 2015, 2016, 2018, 2020, 2021, 2022, 2023, 2024 and 2025 across
the DBLP listings above. **Ashikur Rahman (BUET CSE)** owns the ad-hoc broadcast line (2016, 2020,
2021, 2023). **Muhammad Abdullah Adnan (BUET CSE)** owns a distributed-systems line (2020, 2022,
2024). These three are the likely reviewers for anything networking-flavoured. Double-blind means
you cannot cite yourself openly, but you *can* and probably should cite Rahman's broadcast work and
the two DTN papers — engaging the venue's own literature is cheap and visible.

**On the 2024 Bangladesh shutdown itself I found no NSysS paper.** The authoritative primary source
is OONI + Digitally Right, *The Longest Silence: Internet Shutdowns During Bangladesh's 2024
Uprising*, published 2025-07-31 — <https://ooni.org/post/2025-bangladesh-report/>, full PDF at
<https://ooni.org/documents/2025-bd-report-en.pdf>. Its verified specifics, which are exactly the
motivation paragraph this paper needs:

- Disruptions over **15 July – 5 August 2024**, affecting 20 of those 22 days.
- **18–23 July: a five-day nationwide blackout** of both mobile and broadband.
- Layered controls, not a single switch: bandwidth throttling, targeted social-media/messaging/VPN
  blocking, **TLS interference**, IP-level blocks, and on 4–5 August a **complete blackout with Meta
  cache-server shutdown**.

That layering is the empirical justification for the degradation-ladder framing: the adversary did
not go from "on" to "off", it descended a ladder, and each rung had a different technical shape.
Cite OONI directly; it is a measurement organisation reporting its own data.

Two further primary sources worth citing for the general phenomenon:
Aceto, Persico & Pescapè, *Iran's January 2026 Internet Shutdown: Public Data, Censorship Methods,
and Circumvention Techniques*, arXiv:2603.28753 (12 pp., multi-source measurement methodology); and
Evans & Barradas, *Cache to the Future: A Distributed Webpage Archive for Internet Blackouts*,
arXiv:2606.17245 (16 pp., 18 figures, evaluated by **city-scale simulation** across benign and
adversarial scenarios, uses digital signatures and proofs-of-work).

### 2.6 Acceptance rate — UNVERIFIED, and a warning

I could not find an acceptance rate stated by the conference, the ACM DL front matter (403), the
best-papers page, or any author's institutional page. A search snippet asserted "**an acceptance
rate of 21%**" for NSysS 2023 and attributed it to <https://hstu.ac.bd/teacher/abubakar>; I fetched
that page and **the string does not appear there** — the profile lists the IT-SBA paper with no award
and no rate. **Do not put 21% in the paper or in any planning document.** If the number matters,
email the general chair (§3.4).

What *is* verified is the volume: **NSysS 2025 accepted 21 papers (11 full, 10 short)**
(<https://cse.buet.ac.bd/nsyss2025/papers>), and DBLP holds 36 records for 2024 and 22 for 2025
(counts from the DBLP publication API with `year:` filters; these include front matter and short
papers).

---

## 3. Q2 — CFP mechanics

### 3.1 The page-limit conflict (blocking)

The conference states two different limits on two of its own pages, both fetched 2026-08-18:

> **CFP** (<https://cse.buet.ac.bd/nsyss2026/cfp>): "The papers should be **6 to 8 pages (double
> column),** including all figures, tables, appendices, and references in ACM format."

> **Author Instructions** (<https://cse.buet.ac.bd/nsyss2026/authors>): Full Papers — "**9 pages**
> (Including figures, tables, references, and appendix)"; Short Papers — "**5 pages** (Including
> figures, tables, references, and appendix)".

The 9/5 split matches NSysS 2025's own author page, which search results confirm carried the same
9-page full / 5-page short wording. **Resolution: write to 8 pages.** It is inside both. Do not plan
a structure that only works at 9.

### 3.2 What is unambiguous

- **Template:** "the new Standard ACM Conference Proceedings Template"; LaTeX users use
  `sample-sigconf.tex`, Word users use `interim-layout.docx`
  (<https://www.acm.org/binaries/content/assets/publications/word_style/interim-template-style/interim-layout.docx>),
  source <https://www.acm.org/publications/proceedings-template>. Overleaf template linked from the
  sibling 2025 CFP: <https://www.overleaf.com/latex/templates/acm-conference-proceedings-primary-article-template/wbvnghjbzwpc>.
- **References count toward the limit.** So do appendices. There is no "unlimited references" escape
  hatch — budget ~0.75 page for ~25 references in two columns.
- **Double-blind, strictly:** "All papers submitted to the 13th NSysS 2026 need to be double-blind,
  i.e., no author name should appear in the submitted papers." And: "There must not be any
  references that may reveal the author's identity."
- **Submission:** Microsoft CMT — <https://cmt3.research.microsoft.com/NSysS2026>. PDF only,
  electronic only.
- **Screening:** "All submissions will be verified using plagiarism checker and AI detector." Take
  this literally. Prose that reads as LLM-generated is a stated screening criterion at this venue.
- **Publication:** ACM International Conference Proceedings Series; article processing charges may
  apply depending on the institution's ACM Open status.
- **Dates:** submission 28 Aug 2026 (AoE); notification 30 Oct; camera-ready 6 Nov; **poster
  submission 20 Nov, poster notification 27 Nov**; conference 17–19 Dec 2026, Cox's Bazar.

### 3.3 What the site does not state

- **Detailed poster/short-paper track rules.** The dates page has poster deadlines and the author
  page has a 5-page short-paper limit, but I found no page describing what distinguishes a short
  paper from a poster, whether short papers are reviewed in the same round, or whether a rejected
  full paper is auto-considered as short. ABSENT.
- **Any statement of review load, PC size, rebuttal phase, or acceptance rate.** ABSENT.
- **Artifact evaluation.** ABSENT.

### 3.4 Who to email

General contact, from <https://cse.buet.ac.bd/nsyss2026/contact/>:

- **A. B. M. Alim Al Islam**, Dept. of CSE, BUET — `alim_razi AT cse DOT buet DOT ac DOT bd`
- Administrative: **Engr. Samsul Arifin**, Adjunct Office Secretary — `arifin@cse.buet.ac.bd`,
  +88 02 55155097 ext. 6432, Room 304 (CSE Office)

**Send one short email now**, before drafting, asking exactly three things: (1) is the full-paper
limit 8 or 9 pages, since the CFP and Author Instructions disagree; (2) do short papers go through
the same 28 August round or a later one; (3) is there a rebuttal phase. Nothing else in the CFP is
ambiguous enough to be worth a question.

---

## 4. Q3 — Prior-art positioning, contribution by contribution

Ratings: **Weak** = the observation exists in primary literature under another name; **Moderate** =
the observation is new in this framing but a reviewer can name a close relative; **Defensible** = I
found no primary source making this claim, having looked in the places that would own it.

### 4.1 Canonicalisation repair at a federation gateway — **Moderate, and only as a design rule**

*Claim:* a relay that decodes a signed payload into objects and re-encodes it silently normalises
non-canonical bytes, defeating a downstream "re-encode and compare" canonicality check.

**The general problem is documented by the protobuf project itself**, which is the strongest possible
source and also the one that most limits the novelty claim. `protobuf.dev` has a page whose entire
purpose is this: <https://protobuf.dev/programming-guides/serialization-not-canonical/>. Verbatim:
"protobuf serialization is not (and cannot be) canonical"; "Deterministic serialization is not
canonical. The serializer can generate different output for many reasons"; "hashes of serialized
protos are fragile and not stable across time or space". It names unknown-field handling and
deliberately-undefined field ordering as the two structural barriers. **This page is a mandatory
citation** — it is simultaneously the justification for `jb-core`'s hand-written canonical encoder
and the reason a reviewer will say "known".

**The attack-shape has well-known relatives, all of which a reviewer may raise:**

- **XML Signature Wrapping** — an attacker relocates signed elements so the verifier and the
  consumer disagree about which bytes were signed. Canonical academic statement: Somorovsky et al.,
  *On Breaking SAML: Be Whoever You Want to Be*, USENIX Security 2012 — primary text at
  <https://www.usenix.org/conference/usenixsecurity12/technical-sessions/presentation/somorovsky>.
- **ActivityPub/Mastodon identity confusion at the ingest boundary.** Two GitHub Security Advisories
  from the Mastodon project itself, both about the *server trusting a representation it fetched
  rather than the bytes' provenance*:
  - CVE-2024-23832, *Remote user impersonation and takeover*, CVSS 9.4 —
    <https://github.com/mastodon/mastodon/security/advisories/GHSA-3fjr-858r-92rw>. Root cause,
    verbatim: "In some code paths, vulnerable versions of Mastodon would not correctly check the
    `id` property of remote ActivityPub objects such as posts and accounts."
  - CVE-2024-25623, *Lack of media type verification of Activity Streams objects allows
    impersonation of remote accounts*, CVSS 8.5 —
    <https://github.com/mastodon/mastodon/security/advisories/GHSA-jhrq-qvrm-qr36>. "Mastodon's
    `FetchRemoteStatusService` did not check that the response from the remote server had a
    `Content-Type` header value of the Activity Streams media type."
- **The Matrix contrast, which is the most useful citation of the five.** Matrix does *not* have this
  problem, and the reason is a genuine design-space distinction worth a paragraph. Its spec defines
  Canonical JSON — "the shortest UTF-8 JSON encoding with dictionary keys lexicographically sorted
  by Unicode codepoint" — and signs the *canonicalisation of the object*, not the received bytes:
  "JSON is signed by encoding the JSON object without `signatures` or keys grouped as `unsigned`,
  using the canonical encoding described above"
  (<https://spec.matrix.org/latest/appendices/>). Because both ends canonicalise, an intermediary
  **may** re-serialise safely; the spec explicitly relies on this, noting "intermediate entities can
  add unsigned data such as timestamps and additional signatures". Jagoo signs the *exact bytes* and
  establishes canonicality by re-encode-and-compare (ADR-008 §1) — which is stricter, but makes any
  intermediary re-encode a repair. **That trade is a publishable observation.** Matrix pays for its
  safety with a mandatory canonicalisation pass at every hop and a signature that does not cover the
  whole document; Jagoo pays for its safety by forbidding re-encoding anywhere on the path, which
  forces a passthrough codec through the entire gRPC stack.

**Verdict.** I found **no primary source that names "gateway re-encode defeats a downstream
canonicality check" as an attack class** — not in the protobuf docs, not in the Mastodon advisories,
not in RFC 8949/9052 (CBOR/COSE deterministic encoding), not in RFC 8785 (JSON Canonicalization
Scheme). That is an absence of evidence from a targeted search, not proof of absence, and I would
not stake a paper's novelty on it. **Use it as a design rule with the Matrix contrast as the
interesting part, not as a claimed new attack class.** A reviewer who knows XML Signature Wrapping
will otherwise write "this is DSig wrapping with protobuf" and be roughly right.

### 4.2 Node-local anti-abuse secrets cannot gate federated content — **Weak as discovery, Moderate as design rule**

*Claim (ADR-011, L-23):* PoW / credit ledger / blind credential / nullifier are each keyed to one
node, so a proof minted at A is meaningless at B; re-charging on arrival makes gated domains
unfederatable; cost must be an admission charge at origin, and the receiver's protection is a
per-peer quota.

**The unlinkability-and-origin-binding half is fully covered by Privacy Pass.** RFC 9576, *The
Privacy Pass Architecture*, June 2024, Informational —
<https://www.rfc-editor.org/rfc/rfc9576.html>. It separates Client / Attester / Issuer / Origin and
states four unlinkability goals including Origin-Client and Issuer-Client unlinkability. The
architecture exists precisely because a token's meaning is bound to an issuance context, and the
whole document is about who may verify what a token means. A reviewer familiar with RFC 9576 will
say the "meaningless at B" observation is the definition of the issuer/origin split, and they will
be right.

**What I did not find stated in a primary source** is the *federation consequence*: that in a
system where every mutation is gated by a node-local cost, charging on arrival makes the gated
domains structurally unfederatable, so the cost must be an admission charge levied once at origin
and the receiver's protection must be a per-peer, per-class quota rather than a per-message price.
Neither the ActivityPub Recommendation nor the Matrix spec states a spam-cost model of any kind —
ActivityPub famously leaves anti-abuse to implementations, which is why the Mastodon advisories in
§4.1 exist at the ingest boundary rather than at a cost boundary.

**Verdict.** Do not claim discovery. Claim the **design rule** — "in a federated system, admission
cost and relay admission are different problems and must use different primitives" — and cite RFC
9576 as the reason the first half is unsurprising. This is worth about half a page, not a paper.

### 4.3 Narrowest-working-scope path selection — **Weak**

*Claim:* prefer `LAN > ISP_LOCAL > NATIONAL > GLOBAL` during normal operation so the fallback stays
warm.

This is the weakest of the five, and I want to be blunt about why.

- **ICE already does the preference half.** RFC 8445, July 2018, Standards Track —
  <https://www.rfc-editor.org/rfc/rfc8445.html>. Candidate priority is computed from a type
  preference with recommended values "126 for host candidates, 110 for peer-reflexive candidates,
  100 for server-reflexive candidates, and 0 for relayed candidates". Host candidates are the
  local-network ones. **That is narrowest-scope-first, standardised eight years ago**, and ICE also
  performs connectivity checks on *all* pairs, not just the preferred one.
- **MPTCP already does the keep-it-warm half.** RFC 8684, March 2020 —
  <https://www.rfc-editor.org/rfc/rfc8684.html>. The MP_JOIN "B" (backup) flag requests "that the
  other host only send data on this subflow if there are no available subflows where B=0", MP_PRIO
  re-prioritises mid-connection, and "a host MUST NOT close all functioning subflows unless it is
  safe to do so". Backup subflows are established and maintained, not discovered at failover.
- **Happy Eyeballs is *not* the right citation and cuts against the claim.** RFC 8305, December
  2017 — <https://www.rfc-editor.org/rfc/rfc8305.html> — races attempts at connection setup and
  then says all other attempts "SHOULD be canceled". It does nothing to keep alternates warm and
  says nothing about post-connection path health.

**Verdict.** As a novelty claim this will not survive a networking reviewer. What *is* defensible is
the **generalisation across heterogeneous transports at different administrative scopes** — ICE and
MPTCP both operate over IP paths between two endpoints; the ladder here spans IP federation,
LAN-scoped mesh, and packet radio, where "narrower scope" is a *jurisdictional* property (which
adversary can cut it) rather than a topological one. Present it as an instantiation, cite RFC 8445
and RFC 8684 openly as the ancestors, and spend the space on the telemetry instead
(`/v1/transport/scope`, `/v1/admin/metrics`) — measured per-scope selection behaviour is a
contribution the RFCs do not provide.

### 4.4 The degradation ladder as a design axis — **Defensible. This is the strongest of the five.**

*Claim:* L0 full internet → L1 national-only → L2 ISP island → L3 bridged islands → L4 LAN/mesh →
L5 LoRa, spanned by one system.

The prior art is a set of systems that each occupy **one or two rungs**:

| System | Rungs covered | Primary source |
| --- | --- | --- |
| DTN Bundle Protocol v7 | store-carry-forward overlay for intermittent links; convergence-layer adapters abstract the underlying transport | RFC 9171, Jan 2022, Standards Track — <https://www.rfc-editor.org/rfc/rfc9171.html> |
| Serval Mesh | infrastructure-free phone-to-phone; Mesh Extender adds UHF packet radio | Gardner-Stephen, Challans, Lakeman & Bettison, *The Serval Mesh: A Platform for Resilient Communications in Disaster & Crisis*, IEEE GHTC 2013 — <https://ieeexplore.ieee.org/document/6713674/>; project docs <http://developer.servalproject.org/dokuwiki/doku.php?id=content%3Aabout> |
| Bridgefy | phone mesh — and comprehensively broken | Albrecht, Blasco, Jensen & Mareková, *Mesh Messaging in Large-scale Protests: Breaking Bridgefy*, CT-RSA 2021 — <https://eprint.iacr.org/2021/214>. Verbatim: "permitted its users to be tracked, offered no authenticity, no effective confidentiality protections and lacked resilience against adversarially crafted messages" |
| Amigo | secure group mesh messaging for protest settings | Inyangson, Radway, Jois, Fazio & Mickens, ACM CCS 2025, DOI `10.1145/3719027.3765133` (metadata verified via DBLP; ACM DL 403, abstract unread — **treat the content characterisation as unverified**) |
| ASMesh | anonymous double ratchet for mesh | ACM CCS 2023, DOI `10.1145/3576915.3616615` (metadata only) |
| *Cache to the Future* | blackout-time web archive, city-scale simulation | Evans & Barradas, arXiv:2606.17245 |

**RFC 9171 is the closest architectural relative and should be cited as such**, because the
convergence-layer adapter is structurally the same idea as the `Transport` port here: "the interface
between the Bundle Protocol and a specific underlying protocol is termed a 'convergence-layer
adapter'". The honest positioning is *not* "we invented transport abstraction" — it is "DTN
abstracts the link; we abstract the **administrative scope**, because the adversary in a shutdown
cuts by jurisdiction, not by link quality."

**I found no primary-source paper that evaluates a single system across a full degradation ladder.**
Every system above is evaluated at its own rung: Serval at mesh, Bridgefy/Amigo/ASMesh at mesh,
*Cache to the Future* at blackout by simulation, and the shutdown-measurement papers (OONI,
arXiv:2603.28753) measure the adversary rather than a countermeasure. That gap is real and it is
the paper.

**The catch, stated plainly:** Jagoo has not been evaluated across the full ladder either. L4 (LAN
mesh between two real handsets) and L5 (LoRa/RNS on device) are **unobserved**. A paper claiming
L0–L5 will be refuted by its own evaluation section. **Claim L0–L3 and say why L4–L5 are future
work.** L0–L3 is still a wider span than any system in the table above, and it is the span the
container testbed actually covers.

### 4.5 Two cryptographically unlinkable identity planes — **Weak. Fold in; do not claim.**

Separate deterministic key hierarchies from independent seeds is standard practice with a
specification that predates this work: BIP-85, *Deterministic Entropy From BIP32 Keychains* —
<https://github.com/bitcoin/bips/blob/master/bip-0085.mediawiki>. Unlinkability of credentials is
the subject of RFC 9576 (§4.2). Nothing about "two mnemonics, two hierarchies, two vaults" is novel
cryptography.

What is unusual, and worth two sentences rather than a contribution bullet, is the **product-level
constraint**: one application ships both a pseudonymous plane and an identified plane and its UI is
forbidden from ever offering linkage between them (CLAUDE.md §6). I found no primary source
describing a deployed application with that constraint. But there is also **no formal unlinkability
argument** in this repo — no adversary model, no proof, no measurement of what a colluding
node-plus-network observer learns. Making it a headline claim invites exactly the reviewer question
the project cannot answer.

---

## 5. Q4 — Recommendation

### 5.1 The angle

**Write a system-implementation-and-measurement paper on L0→L3: a federated forum that keeps working
as the network is cut down from global, to national, to ISP islands, to islands bridged by a
multi-homed relay — evaluated on a container testbed with per-scope measurement.**

Why this one, against the alternatives:

- **vs. the canonicalisation-repair security paper (§4.1):** that paper needs a broken real system to
  be credible. We have a *guarded* system, not a *broken* one. "We designed a defence against an
  attack we did not demonstrate against anyone" is a reject at any security-flavoured venue.
- **vs. the two-planes privacy paper (§4.5):** requires a threat model and an unlinkability argument
  that do not exist. Weeks of work, high risk.
- **vs. an experience/pitfalls paper on the L-17…L-26 lessons:** genuinely novel and nearly free —
  the ADRs are already written — but the CFP asks for "novel ideas, protocols, and algorithms with
  ground-breaking results" and the accepted-paper population contains no experience papers. High
  reject risk on fit alone. **Fold the best three lessons into the system paper's discussion
  section instead**; they are the most interesting page in the paper and cost nothing.
- **vs. going for the 5-page short paper:** viable fallback, but the evaluation already exceeds what
  5 pages can hold. Aim full; the 20 Nov poster deadline is a soft landing if rejected.

The measured assets — 4 nodes, 3 Docker networks, a multi-homed bridge, `/proc/net/tcp` evidence
that federation sockets leave from **both** configured source addresses, per-scope telemetry, and
first-ever propagation/throughput/RSS numbers — are above the venue's median evaluation fidelity
(§2.3). The gap is baselines and scale, and both are cheap to close (§5.5).

### 5.2 Title

> **Federating Through the Cut: Scope-Aware Content Federation Across ISP-Level Network Partitions**

Alternate, if the crisis framing is preferred for PC fit (§2.4 argues it is):

> **Islands of Reach: A Federated Messaging Substrate That Degrades From Global Internet to ISP-Local Operation**

Avoid the words "censorship" and "shutdown" in the *title*. Keep them in the abstract's motivating
sentence, backed by the OONI citation. The venue has zero censorship papers and a solid line of
disaster-resilience papers; lead with the frame that has a constituency.

### 5.3 Abstract (150 words)

> Network shutdowns are not a switch but a ladder: Bangladesh's 2024 disruption combined throttling,
> platform blocking, TLS interference and a five-day national blackout. Systems built for the
> internet fail at the first rung; mesh systems only work at the last. We present a federated
> content substrate that operates continuously as connectivity degrades from global reach, through a
> national partition, to isolated ISP islands rejoined by a multi-homed bridge. Every mutation is a
> self-authenticating signed envelope validated by an identical nineteen-step pipeline regardless of
> the transport that carried it, so peer trust bounds volume and never validity. Cost is charged at
> the origin and quota protects the receiver, because node-local anti-abuse secrets cannot gate
> federated content. We evaluate on a container testbed with independent stores and separate
> address spaces, reporting propagation latency, per-scope path selection, memory footprint, and
> encoded message sizes, and we report which ladder rungs remain unmeasured.

(150 words exactly, counted.)

### 5.4 Section outline for 8 pages, ACM `sigconf`

| § | Content | Pages |
| --- | --- | --- |
| 1 | **Introduction.** The ladder, from OONI's Bangladesh 2024 measurements. The gap: internet systems die at rung 1, mesh systems only live at rung 5, nothing spans. Three contributions, stated as (a) a scope-aware federation design, (b) two federation design rules with the failures that produced them, (c) a partition testbed and first measurements. | 1.0 |
| 2 | **Background and threat model.** *This section does not currently exist and is the paper's precondition.* Adversary: an ISP or national operator with DPI, routing control, and the ability to partition — **not** a global passive adversary, **not** a majority of compromised peers, **not** endpoint compromise. What is in scope: availability under partition, authenticity under relay. What is out: traffic analysis, plane unlinkability under a global observer. State the out-of-scope items explicitly; a reviewer who finds them unstated assumes you did not think of them. | 1.0 |
| 3 | **Design.** One write endpoint; the envelope; canonical encoding and why re-encode-and-compare (cite protobuf.dev, contrast Matrix Canonical JSON); the 19-step pipeline with steps 1–12 doing no writes; registry-driven dispatch. **Two figures**: pipeline, and the scope ladder with which adversary cuts each rung. | 1.75 |
| 4 | **Federation across a partition.** Passthrough codec (ADR-008 §1). `(content_id, direction)` as a unique index, not a check (ADR-008 §2). Origin-derived identifiers (ADR-010). Cost at origin, quota at receiver (ADR-011, cite RFC 9576). The bridge: multi-homed relay between ISP islands. | 1.5 |
| 5 | **Evaluation.** Testbed figure (nodes, networks, bridge). Then, in order: (5.1) correctness under partition — identical content IDs and origin-derived IDs across independent stores; (5.2) propagation latency CDF at ≥ 8 nodes with ≥ 200 samples; (5.3) bridge attribution — `/proc/net/tcp` source-address evidence and per-direction accounting; (5.4) read throughput and p50/p99 at c ∈ {1,8,32}; (5.5) footprint — RSS idle and under bulk crossing, against the Pi-4 512 MB constraint; (5.6) encoded sizes vs an ActivityPub JSON-LD baseline. **Five figures, one table.** | 2.25 |
| 6 | **What we did not observe.** Explicit: no phone-to-phone LAN mesh between real handsets, no RNS `running` on device, no physical radio drill, no evaluation beyond the container testbed. **Half a page, and it makes the paper stronger, not weaker** — a reviewer who finds an unstated gap rejects; one who finds a stated gap trusts the rest. | 0.4 |
| 7 | **Lessons.** The three most transferable: an identifier derived from the local node cannot be stable across nodes (L-17); a one-node suite cannot see a two-node bug (L-18); a green in-process gate does not mean the deployed artefact runs (L-20). | 0.4 |
| 8 | **Related work.** RFC 9171 (DTN), Serval, Bridgefy/Amigo/ASMesh, ActivityPub + the Mastodon CVEs, Matrix, ICE/MPTCP, Privacy Pass, *Cache to the Future*. Positioned as "each occupies one rung". | 0.5 |
| 9 | **Conclusion.** | 0.2 |
| — | **References**, ~25 entries, two-column | 0.75 |

Total ≈ 9.75 → cut §3 and §4 by 0.75 page each in editing to land on 8. The evaluation and threat
model do not get cut.

### 5.5 What would get this rejected — and the cheapest fix for each

Ordered by how likely each is to be the actual rejection reason.

| # | Rejection cause | Severity | Cheapest fix | Est. |
| --- | --- | --- | --- | --- |
| 1 | **No threat model.** A censorship/resilience paper without an explicit adversary is the standard reject. ABSENT today. | Fatal | Write §2 as one page. State the adversary's capabilities and, more importantly, what is out of scope. No new code. | 1 day |
| 2 | **n=2 nodes, 5 samples.** "623–857 ms over 5 samples, median ~790 ms" is a datapoint, not an evaluation, and it is self-described as an upper bound because the poller costs an HTTP round trip. | Fatal | Extend `ops/isp-compose.yml` to 8–12 nodes. Replace polling with a projection-time log timestamp on both nodes and take ≥ 200 samples. Report a CDF against fanout degree. | 2–3 days |
| 3 | **Zero baselines.** §2.3: NSysS papers compare against 2–4 named baselines. This one currently compares against nothing. | Fatal | One is enough and the cheapest is size: measure a real ActivityPub `Create`/`Note` payload from a live Mastodon instance and compare against the verified canonical sizes (check-in 155 B, Bangla broadcast 243 B, forum post 220 B, incl. 64 B Ed25519). A second, if time: propagation latency against a two-instance Mastodon federation pair. | 1–2 days for the first |
| 4 | **The ISP gate is 17/19 and the failing criterion is the bridge itself** — the thing §4/§5.3 of the paper is about. Publishing a bridge evaluation while the bridge persists 1 of 3 configured peers is indefensible. It is a known L-21-shape defect between parse and persist. | Fatal | Fix the last-write-wins collapse; re-run `pnpm ops:isp && pnpm gate:isp` for 19/19 on a stack recreated with `-v`. | hours |
| 5 | **Overclaiming the ladder.** Any sentence implying LoRa or phone mesh works invites one probing question that unravels the paper. | Fatal if present | Claim L0–L3. §6 states L4–L5 as unobserved. Remove "Reticulum" and "LoRa" from the abstract entirely. | free |
| 6 | **Test counts presented as evaluation.** "826 tests pass" is a software-quality statement; reviewers discount it and some read it as padding. | Moderate | One sentence in §5's preamble, no table, no figure. The cross-language vector gate (TS ≡ Rust ≡ Python, 16 vectors, byte-identical) *is* worth a sentence because it substantiates the canonical-encoding claim. | free |
| 7 | **Double-blind leakage.** The project name, the repo, any URL, "Jagoo Bahee", and a Bangladesh-2024 framing next to a BUET-adjacent submission are all deanonymising. The venue states double-blind twice. | Fatal, and it is a desk reject | Anonymise the system name for submission (e.g. "the system"), no repo URL, no acknowledgements, cite OONI as a third party, and cite BUET-group work in the third person. | free |
| 8 | **Prose reads as machine-generated.** The Author Instructions state submissions are checked with "plagiarism checker and AI detector". | Fatal if triggered | Write the prose by hand. Do not paste generated paragraphs. | — |
| 9 | **Related work assumes federation literacy.** §2.4: the PC has no censorship/federation constituency. | Moderate | Budget 3 sentences each introducing federation, canonical encoding, and transparency logs from zero. Cut design detail to pay for it. | free |
| 10 | **Novelty attacked on §4.1/§4.3.** A reviewer names XML Signature Wrapping or ICE candidate priority. | Moderate | Cite them yourself, first, and state the difference (bytes-signed vs canonicalise-at-both-ends; administrative scope vs topological locality). Pre-empting is cheaper than rebutting. | free |

**Total critical path: roughly 5–7 working days** (items 1–5), all of which are things the project
should do anyway. That is the ratio argument for this angle: nothing on the list is speculative
research, and item 4 is a known bug with a known shape.

### 5.6 Where the project is below the venue bar, named precisely

Exactly two dimensions, and neither is depth of engineering:

1. **Comparative evaluation.** Every dimension is measured in absolute terms against nothing. NSysS
   accepted papers are, near-uniformly, comparisons. Cheapest fix: the encoded-size baseline against
   ActivityPub (item 3).
2. **Scale.** n=2 for federation, n=4 for the ISP testbed, 5 samples for the headline latency number.
   The venue's simulation papers routinely sweep tens to hundreds of nodes. Cheapest fix: containers
   are free — 8–12 nodes and 200 samples is a compose-file change plus a measurement harness
   (item 2).

Everything else — implementation completeness, cross-language verification, deployment realism,
honest reporting of unobserved behaviour — is at or above the bar.

---

## 6. Explicit gaps in this research

Recorded so no one re-derives them as facts.

- **NSysS acceptance rate: not found in any primary source.** The "21%" that appears in search
  results is not present on the page it is attributed to. Email the general chair if it matters.
- **No NSysS full text was read.** ACM DL returns 403. The evaluation-depth characterisation in §2.3
  is inferred from titles, page ranges and author groups. If precision matters, obtain 3–4 PDFs
  through an institutional subscription and re-check figure counts and baseline counts.
- **Full DBLP listings for 2024 and 2025 were truncated** by the fetch. Counts (36 records for 2024,
  22 for 2025) come from the DBLP API `@total` field and include front matter and short papers.
- **NSysS 2019, 2018, 2017, 2016, 2015 listings were only sampled** via keyword search, not
  enumerated. If a full historical topic census is needed, walk
  `https://dblp.org/db/conf/nsyss/nsyss<year>.html` for each.
- **Amigo (CCS 2025) and ASMesh (CCS 2023) abstracts were not read** — ACM DL 403. Only DBLP
  metadata (title, authors, venue, year, DOI) is verified. Read both before writing §8; Amigo in
  particular is 2025 protest-mesh work and could be closer than it looks.
- **Short-paper vs. poster track rules for NSysS 2026 are not stated on the site.** ABSENT.
- **No search was made for NSysS papers in IEEE Xplore's own index** beyond what DBLP mirrors; DBLP
  is complete for this venue as far as I can tell, but that is an assumption.
- **The 2026 page-limit conflict is unresolved** and is a blocking input to §5.4's page budget.

---

## 7. Source index

Conference (all fetched 2026-08-18):
<https://cse.buet.ac.bd/nsyss2026/> ·
<https://cse.buet.ac.bd/nsyss2026/cfp> ·
<https://cse.buet.ac.bd/nsyss2026/authors> ·
<https://cse.buet.ac.bd/nsyss2026/contact/> ·
<https://cse.buet.ac.bd/nsyss2025/papers> ·
<https://cse.buet.ac.bd/nsyss2023/bestpapers/> ·
<https://cmt3.research.microsoft.com/NSysS2026>

Index: <https://dblp.org/db/conf/nsyss/index.html> and the per-year `nsyss<year>.html` pages;
venue-scoped queries via `https://dblp.org/search/publ/api?q=stream:streams/conf/nsyss:+<term>`

Standards: RFC 8305 · RFC 8445 · RFC 8684 · RFC 9171 · RFC 9576 (all at `rfc-editor.org`) ·
<https://spec.matrix.org/latest/appendices/> ·
<https://protobuf.dev/programming-guides/serialization-not-canonical/> ·
<https://github.com/bitcoin/bips/blob/master/bip-0085.mediawiki>

Security: <https://github.com/mastodon/mastodon/security/advisories/GHSA-3fjr-858r-92rw> (CVE-2024-23832) ·
<https://github.com/mastodon/mastodon/security/advisories/GHSA-jhrq-qvrm-qr36> (CVE-2024-25623) ·
<https://eprint.iacr.org/2021/214> (Breaking Bridgefy) ·
<https://www.usenix.org/conference/usenixsecurity12/technical-sessions/presentation/somorovsky> (On Breaking SAML)

Measurement and systems: <https://ooni.org/post/2025-bangladesh-report/> and
<https://ooni.org/documents/2025-bd-report-en.pdf> · arXiv:2603.28753 · arXiv:2606.17245 ·
<https://ieeexplore.ieee.org/document/6713674/> (Serval Mesh) ·
<http://developer.servalproject.org/dokuwiki/doku.php?id=content%3Aabout>

Repo grounding: `CLAUDE.md` · `Code Implementation/BUILD-LOG.md` (L-01…L-27) ·
`ADR-008-FEDERATION-DEDUPE-AND-ORIGIN.md` · `ADR-010-COMMUNITY-ORIGIN.md` ·
`ADR-011-ANTI-ABUSE-IS-CHARGED-AT-ORIGIN.md`
