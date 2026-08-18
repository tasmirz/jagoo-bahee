# §5 Adversary and scope — content specification

**Status:** content settled 2026-08-19. **Prose deliberately not written here.**

The Author Instructions state submissions are screened with an AI detector, so the paragraphs must
be written by hand, in the author's voice. What follows is the hard part — every technical decision,
boundary and citation fixed — so that writing it is a matter of phrasing, not of deciding. Do not
paste any of this into the paper as-is.

**Budget: 0.5 page.** §2.4 of the plan found that **0 of 35 accepted NSysS papers have a threat model
at all**, including two offensive-security papers. This section is therefore *hygiene*, not a gate: it
exists to pre-empt the reviewer question "resistant to whom, exactly?" and to stop an over-reading of
the availability claims. It must not read like a security paper's threat model, and it must not grow.

The single most valuable thing this section does is **state what is out of scope as clearly as what is
in**. That is what converts a paper making broad-sounding resilience claims into a paper making narrow,
checkable ones.

---

## 5.1 The adversary

Ground the capability list in the measured event, not in imagination. The 2024 Bangladesh disruption
is documented by OONI and combined **throttling, platform blocking, TLS interference, and a five-day
national blackout** — cite OONI directly and in the third person (double-blind).

**Assume the adversary can:**

- control routing within its own AS, and withdraw or null-route prefixes;
- perform DPI on transit traffic it carries, and block by SNI, IP or DNS;
- throttle selectively, including to the point where a protocol times out but does not fail cleanly;
- **partition** — separate the country from the global internet, or one ISP from another;
- run its own nodes and federate with honest ones, i.e. it is a legitimate participant, not only an
  observer;
- observe volume and timing of federation traffic crossing links it controls.

**Assume the adversary cannot:**

- break Ed25519 or SHA-256;
- compromise a participant's device or extract a signing key from it;
- act as a *global* passive adversary correlating traffic across every network simultaneously;
- compromise a majority of the federating peer set.

State these four as assumptions, not as claims. Each one is load-bearing and each is a place a
reviewer may reasonably push.

## 5.2 Trust model — one short paragraph, but it carries §4

The rule to state, because it is the one that most differentiates the design and it is already gated
in the implementation (FD-03):

> **Peer trust bounds volume, never validity.** An inbound envelope re-runs all nineteen validation
> steps whatever its source; a `TRUSTED` peer's forged envelope is rejected exactly as a stranger's
> is. Trust determines quota and traffic class, nothing else.

Add, briefly:

- operators choose their peers; admission is TOFU at `PROBATION`, with vouch-based promotion (no
  admin allowlist, because during a shutdown volunteers stand up relays and cannot wait for manual
  approval);
- the client verifies signatures and inclusion proofs **on device**, and does not trust a server's
  assertion about either;
- a node operator is trusted to run the software they run — a *peer* is not trusted at all.

## 5.3 In scope — what the paper claims to resist

Keep to these six. Each maps to something implemented and gated, so each is defensible.

| # | Attack | The property that resists it | Where |
| --- | --- | --- | --- |
| 1 | A server silently suppresses content by withholding approval | Publish-then-attest: content is valid the instant its author signs it. Withheld approval is indistinguishable from a network error, so it is removed as a mechanism rather than policed. Moderation is an additive signed opinion. | §3 |
| 2 | A relaying node tampers with content in flight | The signature covers **the bytes as they arrived**; no intermediary re-encodes them (passthrough codec, ADR-008 §1); a non-canonical encoding is **rejected**, never repaired (EN-02) | §3, §4 |
| 3 | A peer rewrites its own history | Signed tree heads gossiped between peers, with fork detection | §4 |
| 4 | An invalid-envelope flood amplifies into database load | Pipeline steps 1–12 perform **no writes** | §3 |
| 5 | An ISP- or nation-level partition cuts reach | Scope-aware path selection preferring the narrowest working scope, and a multi-homed bridge between islands | §4, §6 |
| 6 | One peer frames another to get it silenced | A check that can `BLOCK` must verify the claim **belongs to** the peer it names *and* is **current** — an older reading of remote state is not evidence (L-22, L-28) | §4, §9 |

Row 6 is worth the space: it is the only one of the six discovered by a deployed failure rather than
designed in, and §9 already tells that story.

## 5.4 Out of scope — write this list at full strength, it is the section's real contribution

Do not hedge these. A frankly stated limit is stronger than a soft one, and every item here is
something the system genuinely does not do.

1. **No global passive adversary, and no traffic-analysis resistance.** There is no cover traffic, no
   mixing, no timing-correlation defence. An observer positioned on both islands can correlate flows.
2. **No metadata protection at the transport layer.** An ISP sees *that* a node federates, roughly
   *with whom*, and *how much*. Volume and timing are not concealed.
3. **No endpoint compromise resistance.** A seized or malware-infected device loses its keys.
   Revocation exists, but revocation only helps once it reaches peers — and reaching peers is exactly
   what the adversary is attacking.
4. **No compromised-majority peer set.** Fork detection assumes at least one honest observer gossips
   a conflicting head. A peer set the adversary dominates defeats it.
5. **No formal unlinkability proof between the two identity planes.** The separation is
   *architectural* — separate root mnemonics, per-community derived keys, blind credentials, epoch
   nullifiers — and is **not** accompanied by a proof or an anonymity-set analysis. Say this plainly;
   it is claim 17 in the evidence table and it is unobserved.
6. **No Sybil resistance derived from identity, deliberately.** Cost — memory-hard PoW, credits,
   blind credentials, epoch nullifiers — is the anti-abuse primitive, because requiring identity to
   stop spam hands the adversary a censorship lever. This bounds the *rate* of abuse, not the
   *number* of identities, and that is a design choice with a cost.
7. **No availability guarantee under total physical shutdown.** With every link cut and no radio path
   available the system stores and forwards; it does not deliver.
8. **No claim for the mesh and radio rungs.** L4/L5 are implemented and unit-gated but have never
   been observed working end to end (§8 Limitations).

## 5.5 Close with why the list is this long

One or two sentences, no more. The argument:

> Each item above could be bought, and each would be bought with availability — the property this
> system exists to preserve — or with the ability to run on a single-board computer over a shared,
> intermittent link. The goal ordering is explicit and availability under partition is first, so
> where a defence and reach conflict, reach wins and the limit is stated rather than hidden.

This paragraph is what makes §5.4 read as *engineering judgement* rather than as a list of things the
authors did not get to. Without it the out-of-scope list is a weakness; with it, it is a position.

---

## Notes for whoever writes the prose

- **Double-blind:** no system name anywhere. "The system", "our node", "the substrate". Cite OONI and
  any BUET-group work in the third person.
- **Do not import the word "censorship" into the section title.** Zero papers in twelve editions of
  this venue use it; "partition" is the honest technical word and §4.1 of the plan already settled
  the title on that basis.
- **Three sentences maximum** introducing what a threat model *is*. §3 of the plan established the PC
  has little exposure to federation, canonical encoding or transparency logs, so define terms — but
  this section is not where the page budget goes.
- Cross-reference rather than restate: §5.3 rows point at §3, §4 and §9, which are already written by
  the time a reader reaches here.
