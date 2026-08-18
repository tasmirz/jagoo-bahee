# §7 Capability matrix — Table 2, built from verified primary sources

**Status:** cells settled 2026-08-19. Every cell traces to a verbatim quote in
[`NSYSS-2026-CAPABILITY-MATRIX-SOURCES.md`](NSYSS-2026-CAPABILITY-MATRIX-SOURCES.md); the §-refs in
the footnotes are into that file. Prose to be written by hand (AI-detector screening).

Modelled on `3777555.3777565` Table 3 (p.7) — a networking paper at this venue by the NSysS 2026
general contact, which handles having no quantitative baseline in exactly this way. That precedent
is the reason this is a defensible move rather than an evasion, and it is worth one sentence in the
text.

**Legend.** ● = provided and specified · ◐ = partial, optional, or non-normative · ○ = not provided
· ◑ = implemented here but **never observed end to end** (§8 Limitations) · — = not applicable ·
**NF** = spec is silent (recorded as NOT FOUND, not inferred)

---

## Table 2a — The resilience ladder

| System | L0 global | L1 national cut | L2 ISP island | L3 bridged islands | L4 local mesh | L5 radio |
| --- | --- | --- | --- | --- | --- | --- |
| DTN / BPv7 | ● | ● | ● | ● | ● | ● |
| Serval (Rhizome) | ◐ | ● | ● | ○ | ● | ● |
| Bridgefy | ○ | ○ | ○ | ○ | ● | ○ |
| ActivityPub / Mastodon | ● | ◐ | ◐ | ○ | ○ | ○ |
| Matrix | ● | ◐ | ◐ | ○ | ○ | ○ |
| AT Protocol | ● | ○ | ○ | ○ | ○ | ○ |
| **This system** | ● | ● | ● | ● | ◑ | ◑ |

**Do not overclaim this table — DTN dominates it, and saying so is the point.** BPv7 is the
architectural ancestor and covers every rung, because store-and-forward over arbitrary bearers is
precisely what it was designed for. What it does not supply is a content model, an identity model,
or any application semantics — a DTN deployment still has to answer every question §3 and §4 of this
paper answer. The honest framing for the text: *we are not the first system to span this ladder; we
are addressing what a system must additionally provide to carry a moderated, publicly-readable
forum across it.* A reviewer who knows DTN will respect that sentence and distrust its absence.

The ◐ for ActivityPub and Matrix at L1/L2 is deliberate and should be explained in one clause: a
homeserver or instance keeps serving **its own** users inside a partition, so it is not simply ○ —
but federation across the cut stops entirely, which is the property under test.

---

## Table 2b — Integrity, verifiability and governance

| System | signed at rest | verifies w/o server | no re-encode on path | transparency-log gossip | federation trust states | tombstoned deletion |
| --- | --- | --- | --- | --- | --- | --- |
| DTN / BPv7 | ◐ ⁽¹⁾ | ○ ⁽²⁾ | NF | NF ⁽³⁾ | NF ⁽³⁾ | — |
| Serval (Rhizome) | ● ⁽⁴⁾ | ● ⁽⁵⁾ | NF | NF | NF | ○ ⁽⁶⁾ |
| Bridgefy | ○ ⁽⁷⁾ | ○ ⁽⁷⁾ | — | ○ | ○ | — |
| ActivityPub / Mastodon | ◐ ⁽⁸⁾ | ○ ⁽⁸⁾ | ○ | ○ | ◐ ⁽⁹⁾ | ◐ ⁽¹⁰⁾ |
| Matrix | ● | ● ⁽¹¹⁾ | ○ ⁽¹²⁾ | ○ ⁽¹³⁾ | ◐ ⁽¹⁴⁾ | ● ⁽¹⁵⁾ |
| AT Protocol | ● | ○ ⁽¹⁶⁾ | ● | ○ ⁽¹⁷⁾ | NF | ○ ⁽¹⁸⁾ |
| **This system** | ● | ● | ● | ● | ● | ● |

### Footnotes — each is a quotable primary source

1. **BPv7 gives no payload integrity of its own.** CRC type 0 — "no Cyclic Redundancy Check (CRC) is
   present" — is valid on any non-primary block including the payload. Integrity is delegated
   entirely to BPSec, and *using* BPSec on any given bundle is optional even though *implementing*
   it is a MUST: "A Bundle Protocol Agent (BPA) that sources, cryptographically verifies, and/or
   accepts a bundle MUST implement support for BPSec. Use of BPSec for any single bundle is
   optional." (§1.1, §1.2)
2. **A default-context BIB is not a signature.** RFC 9171 §8 calls it a "signature block", but the
   sole default security context (RFC 9173 §3.1) is **HMAC-SHA2 with symmetric keys**, so it is not
   third-party verifiable and not non-repudiable. The RFC's own prose overstates its specification —
   flag this in the text; it is the kind of correction a reviewer enjoys. (§1.3)
3. NOT FOUND — no peer trust states, no transparency or audit log anywhere in BPv7 or BPSec. (§1.4, §1.5)
4. **Signed, but not by an author key.** Rhizome bundles are signed by a *randomly generated
   per-bundle keypair*; authorship is deliberately unrecoverable — "Rhizome nodes that do not possess
   the unlocked author identity cannot derive the SID of the author, *even if the SID is already
   known to them through other means*". A Rhizome signature proves **update authority over a Bundle
   ID**, not who wrote it. (§2.1)
5. **The strongest cell in the table, and it is not ours.** The Bundle ID *is* the verification key,
   so verification needs no infrastructure whatever. Say this plainly. Note the counterweight:
   "validity does not require that the manifest's signature be *verified*." (§2.1, §2.2)
6. Local store eviction only; it does not propagate, and a deleted bundle is re-fetchable from any
   peer that still holds it. `tombstone` appears nowhere in the Rhizome or MeshMS documentation. (§2.3)
7. **Signal protocol makes this ○ by design, not by omission.** X3DH §4.4: "X3DH doesn't give either
   Alice or Bob a publishable cryptographic proof of the contents of their communication or the fact
   that they communicated." Deniability is the goal, so **no third party can verify any Bridgefy
   message**. Also cite the 2020 vendor claim ("A third person will no longer be able to impersonate
   any other user") *together with* its USENIX Security 2022 refutation ("Broadcast messages
   continued to be unauthenticated"). (§3.2–§3.4)
8. **ActivityPub requires neither HTTP Signatures nor object signatures.** The entire authentication
   discussion is Appendix B, which opens "This section is non-normative" and concedes "at the time of
   standardization, there are no strongly agreed upon mechanisms for authentication." Fediverse
   interoperable auth is convention, not specification. This is the single most load-bearing
   correction in the table. (§4.2)
9. Instance-level allow/deny lists. No probationary state, no vouching.
10. **The trap cell.** ActivityStreams 2.0 *does* define a `Tombstone` type, and Mastodon *does* have
    a `tombstones` table — but it holds only `uri`, `account_id`, `by_moderator` and timestamps,
    nothing serves it, no AS2 `Tombstone` is emitted, and the status row is `destroy!`ed. Its only
    reader is a replay guard. The naming collision does all the work in the common belief. Score ◐
    and explain in the caption, or a reviewer who knows either fact will think the table is careless.
    (§4.1, §4.3)
11. For events a server already holds. It does **not** let you detect withholding.
12. Canonicalise-at-verify: an intermediary may re-serialise freely. This is the Matrix half of the
    three-position taxonomy in the plan's §4.7 — cite it here and cross-reference §3.
13. **NOT FOUND, and the spec concedes the gap:** "Currently, the only way to determine noncompliant
    hosts is to check the prev_events of leaked events." The only occurrence of "transparency" in
    either API document refers to TLS Certificate Transparency. (§5.1)
14. `m.room.server_acl` is a per-room binary allow/deny glob list, cooperatively enforced — "Server
    ACLs are only effective if every server in the room honours them" — with no probation, no
    vouching and no global peer state. (§5.2)
15. **Matrix scores ● here and we should say so.** Redaction leaves the event in the DAG with
    `event_id`, `sender`, `origin_server_ts`, `prev_events`, `auth_events`, `hashes` and `signatures`
    intact. Note that `m.room.tombstone` is a *room upgrade*, unrelated to content removal — do not
    conflate them. (§5.3)
16. **The sharpest single contrast in the table.** atproto is self-certifying as to *content* but not
    as to *keys*: "neither the signature itself nor the signed commit indicate either the type of key
    used (curve type), or the specific public key used. That information must be fetched from the
    account's DID document." Verification therefore requires resolving `plc.directory` or DNS —
    infrastructure a shutdown removes. Put this beside footnote 5 (Rhizome) in the text: the two
    systems sit at opposite ends of the axis this paper cares most about. (§6.1)
17. `prev` is "largely unused" and "virtually always null"; the `since`/`prevData` consistency fields
    are "neither authenticated (signed) nor self-certifying"; and the prescribed response to a broken
    chain is to refetch and adopt the new state. A rewriting PDS is detectable as a discontinuity but
    not disprovable, and the observation is never shared between consumers. (§6.1, §6.3)
18. Verbatim, third sentence of the Repository specification: **"Record deletion is supported without
    leaving a trace or 'tombstone' of previous contents."** The MST's shape-determinism makes this
    structural rather than incidental. (§6.4)

---

## How to use this in the paper

**Two tables or one?** The budget is 0.5 page. If both do not fit, **cut Table 2a, not 2b.** The
ladder is already carried by Figure 1 and by §6's measurements; Table 2b is the part that cannot be
shown any other way, and it is where the composition argument actually lives.

**The paragraph that must accompany it.** The plan's §4.7 and `SIGNATURE-VS-BLOCKCHAIN.md` both
conclude the mechanism is not novel. This table is the evidence for the claim that *is* defensible,
and the sentence should be close to:

> No column here is new. Signed content at rest is Serval and Nostr; verification without a server
> is Serval; transparency-log gossip is Certificate Transparency; probationary peer trust is a
> conventional reputation design; tombstoned deletion is Matrix redaction. What no prior system in
> this table does is hold all six simultaneously **while spanning the ladder in Table 2a**, and the
> engineering cost of that combination — not its novelty — is what this paper reports.

**Three places to be visibly fair, because each one costs nothing and buys credibility:**

- DTN dominates Table 2a. Say so in the caption.
- Serval beats us on footnote 5 — its Bundle ID *is* the key, which is simpler than our certificate
  chain and strictly better under a total shutdown.
- Matrix scores ● on tombstoned deletion, and its redaction preserves more than most readers expect.

**Our own two ◑ cells are the honest ones.** L4 and L5 are implemented and unit-gated but have never
been observed end to end — no phone-to-phone mesh between real handsets, no RNS `running` on device,
no radio drill. They must render differently from ● in the printed table and be named in §8. A
reviewer who spots an unqualified ● there and then reads §8 stops trusting the rest of the table.
