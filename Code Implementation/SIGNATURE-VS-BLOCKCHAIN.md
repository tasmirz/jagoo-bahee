# Signature-based censorship resistance vs. blockchain — novelty, prior art, and what to do about it

**Status:** Research note · 2026-08-18
**Scope:** Q1 is the envelope model novel · Q2 what blockchain solves that we do not · Q3 what we solve
that blockchain does not · Q4 how to manufacture a defensible contribution in ~1 week · Q5 bottom line
**Method:** primary sources only — protocol specifications, RFCs, W3C Recommendations, the protocols'
own repositories, and the Bitcoin whitepaper read directly from `bitcoin.org/bitcoin.pdf`. Every claim
below is either quoted from a document with a URL, derived arithmetically from a quoted constant and
labelled **DERIVED**, or labelled **UNVERIFIED** / **ABSENT**.
**Explicitly not used:** blog posts, Medium, aggregator explainers, search-engine answer boxes.
**What I could not read:** the Ethereum Yellow Paper (not fetched — every gas claim below is therefore
UNVERIFIED); `specs.ipfs.tech/cids/` returned 404 and IPFS content-addressing is cited from
`docs.ipfs.tech` instead; the ACM DL remains 403 to this agent, unchanged from the two prior passes.

---

## 0. Relationship to the two existing NSysS files — read this first

This note is a **different axis** from `NSYSS-2026-PAPER-RESEARCH.md` (venue + prior art per
contribution) and `NSYSS-2026-PAPER-PLAN.md` (the finished paper plan). Those two answer *what will
this venue accept*. This one answers *is the core mechanism new at all, and against blockchain
specifically*. Where we overlap:

| | Prior files say | This pass says | Verdict |
| --- | --- | --- | --- |
| Canonicalisation-repair hazard (`RESEARCH` §4.1, `PLAN` §4.7) | "Moderate… I found **no primary source that names** 'gateway re-encode defeats a downstream canonicality check' as an attack class." Trade-off framed as Matrix-vs-us, two positions. | **CONFLICT, and it matters.** Cosmos SDK **ADR-020** states the trade-off explicitly, as a design rationale, in a primary source: signature verification "is based on comparing the raw `TxBody` and `AuthInfo` bytes … **not based on any 'canonicalization' algorithm**". And `regen-network/canonical-proto3` states the **receiver-side** rule: "all transaction processors which receive messages with unknown fields should treat them as **not canonical**." The two-position framing is also wrong; there are **three** positions (§2.7). | **Downgrade §4.1 from Moderate to Weak-as-discovery.** Keep it, reframe it as a taxonomy (§5, Angle A). |
| Deterministic protobuf profile as a contribution | Not claimed as one; `protobuf.dev` cited as the reason a hand-written encoder is needed. | **Agrees, and hardens it.** `canonical-proto3`'s rules are near-identical to EN-01: ascending field order, defaults omitted, minimal varints. A deterministic proto3 profile for signing is **settled prior art**, published by a blockchain project. | Never present the encoder rules as novel. |
| Cross-language vector gate | `PLAN` §4.7: "converts a testing artefact into a design justification." | **Agrees and extends.** Nearest primary art is Wycheproof (crypto-primitive vectors) and frankencerts (differential testing of *validators*). I found **no** primary source doing differential testing of *canonical encoders* as a signature-confusion defence. This is the thinnest patch of prior art I found anywhere in this pass. | **Angle B — the best new-work-per-day in §5.** |
| Degradation ladder L0–L3 is the strongest angle | `RESEARCH` §4.4, `PLAN` §4.3 | **Agrees.** Nothing in this pass weakens it, and §4 gives it quantitative teeth against blockchain resource requirements it did not have. | Unchanged; still the paper. |
| Nearest neighbours | Both files search **NSysS's own corpus** and find zero. | Different question, different answer. Against the **global** protocol landscape the neighbours are dense: Nostr, Secure Scuttlebutt and **AT Protocol** are close enough that a reviewer outside NSysS would call the envelope model prior art. Neither prior file names AT Protocol at all. | **Gap in the prior passes. §2.4 is mandatory reading.** |

Nothing here changes the paper's recommended shape. It changes what may be *claimed* inside it.

---

## 1. Verdict in one screen

| Question | Answer |
| --- | --- |
| Is a self-authenticating signed envelope novel? | **No. Not remotely.** git (2005), SSB (~2014), IPFS/IPNS, Nostr NIP-01, AT Protocol all do it. |
| Is content-ID-as-hash-of-canonical-bytes novel? | **No.** git object IDs, IPFS CIDs, Nostr `id`, SSB message IDs, atproto CIDs. |
| Is "validity does not depend on a server" novel? | **No.** It is the stated design goal of Nostr, SSB and atproto, and the explicit *failure* of ActivityPub. |
| Is publish-then-attest / labels-as-signed-opinions novel? | **No.** atproto labels and Nostr NIP-32 are exactly this, specified. |
| Is the Merkle log + STH + gossip novel? | **No.** RFC 6962 (2013) / RFC 9162, including the split-view gossip argument, verbatim. |
| Is enforcing *exactly one* accepted encoding by **re-encode-and-compare at ingress** novel? | **Weakly.** Closest art is `canonical-proto3` (a heuristic about unknown fields) and Cosmos ADR-020 (raw-bytes signing, no receiver-side canonicality gate). **This is the narrowest surviving claim.** |
| Is three-implementation byte-identical differential validation of a canonical encoder novel? | **I found no primary source doing it.** ABSENT from a targeted search. Best patch of ground available. |
| Is the composition novel? | **Marginally.** Subtract atproto and you are left with: a transparency log, non-IP transports, and quota-based federation admission. That is a system-building contribution, not a mechanism contribution. |
| Does the system need blockchain? | **For posts, no. For credits, nullifiers and votes, the double-spend question is real and the system's answer is "node-local, so it does not federate."** That is a defensible choice and an admitted limitation, not an absence of the problem. |
| Is there a defensible paper? | **Yes — an availability paper, not a novelty-of-mechanism paper.** §6. |

---

## 2. Q1 — Is signature-based censorship resistance novel? Blunt answer: no.

### 2.1 Nostr — the closest single-mechanism relative

NIP-01 (`github.com/nostr-protocol/nips/blob/master/01.md`, read as raw text 2026-08-18):

> The only object type that exists is the `event` … `"id": <32-bytes lowercase hex-encoded sha256 of the serialized event data>` … `"sig": <64-bytes lowercase hex of the signature of the sha256 hash of the serialized event data, which is the same as the "id" field>`

> To obtain the `event.id`, we `sha256` the serialized event. The serialization is done over the UTF-8 JSON-serialized string … of the following structure: `[0, <pubkey…>, <created_at…>, <kind…>, <tags…>, <content…>]`

> **To prevent implementation differences from creating a different event ID for the same event, the following rules MUST be followed while serializing:** UTF-8 should be used for encoding. Whitespace, line breaks or other unnecessary formatting should not be included in the output JSON. [six escape rules follow]

Structurally this **is** the envelope: a fixed field tuple, a defined serialisation, an ID that is the
hash of that serialisation, and a signature over the same bytes. `Signatures, public key, and encodings
are done according to the Schnorr signatures standard for the curve secp256k1` — the only cryptographic
difference from Ed25519-over-canonical-protobuf is the curve and the encoding.

**What Nostr does not do, that this system does:**

- **No canonicality gate on receipt.** Nostr's ID is *recomputed by re-serialising the parsed event*.
  A relay may reformat the JSON freely; as long as the field values survive, the recomputed `id` matches.
  Nostr is therefore in the **canonicalise-at-verify** camp with Matrix and SSB, not in ours (§2.7).
- **No transparency log.** No STH, no inclusion proof, no fork detection. A relay that silently drops
  your event is undetectable by any mechanism in the NIPs I read.
- **No federation between relays.** Relays are endpoints clients fan out to; there is no server-to-server
  re-verification, no peer trust state machine, no quota. Availability is the client's problem.
- **No anti-abuse framework.** NIP-01 has none. Spam control is per-relay policy.
- **No non-IP transport story** in the core NIPs I read.

**What Nostr does that this system does not:** it is deployed at scale with an open relay ecosystem, and
its trust model is simpler — there is no peer admission decision at all.

Moderation: **NIP-09** (`.../09.md`) is deliberately weak, and honest about it — `Relays SHOULD delete or
stop publishing any referenced events`, and the spec states `it is impossible to delete events from all
relays and clients`, instructing clients to `inform the user that their request for deletion does not
guarantee deletion`. **NIP-32** (`.../32.md`) is labelling: kind-`1985` events supporting `distributed
moderation, collection management, license assignment, and content classification`, attached via `e`,
`p`, `a`, `r`, `t` tags. **That is publish-then-attest, specified, in 2023.**

### 2.2 Secure Scuttlebutt — the append-only-feed relative

`ssbc.github.io/scuttlebutt-protocol-guide`: messages are Ed25519-signed; the signing input is a
formatted JSON message under `ECMA-262 6th Edition JSON.stringify` rules (two-space indent, `\n` only,
one space after colons, no trailing newline); each message except the first carries
`"previous": [message_id_of_prior_message]` with a `sequence` incrementing from 1. The guide states the
requirement in the same words this project uses:

> for any given message there is exactly one way to serialize it as a sequence of bytes, which is
> necessary for signature verification to work

and on the absence of consensus: `no coordination or permission is required to create a new one, which
is essential to the network's design`.

**Per-author append-only signed log, one canonical serialisation, no global consensus — SSB, published
years before this project.** The differences that matter: SSB's feed is a hash chain (each message names
its predecessor), which gives *per-author* total order and equivocation detection that this system does
**not** have; and SSB has no Merkle transparency log, no federation trust states, and no anti-abuse
economy. SSB's canonicalisation is also famously brittle — it inherits V8's `JSON.stringify` behaviour,
which is a canonicalise-at-verify design with a canonicalisation function nobody can reimplement safely.
That fragility is a usable argument *for* the bytes-as-received position (§2.7), and it is the strongest
empirical support for it that I found.

### 2.3 IPFS / IPLD — content addressing without authorship

`docs.ipfs.tech/concepts/content-addressing/`: a CID encodes `the hash and the codec of the data`;
`Any difference in the content will produce a different CID`; `It doesn't indicate where the content is
stored, but it forms a kind of address based on the content itself.` **The documentation makes no claim
that a CID conveys authorship or identity, because it does not.** Authorship arrives only with IPNS:
`specs.ipfs.tech/ipns/ipns-record/` — `IPNS records provide cryptographically verifiable, mutable
pointers to objects`, signed over `ipns-signature:` ‖ `IpnsEntry.data`, where the data field `is encoded
using a strict and deterministic subset of CBOR named DAG-CBOR` and `the serialized form must be
deterministic`.

So the pattern "hash-addressed payload + deterministic encoding + signature over it" is IPNS, specified,
with the same justification. Note IPNS also signs a *deterministically re-encodable* structure, i.e.
canonicalise-at-verify.

### 2.4 AT Protocol — the closest **composition**, and the biggest threat to this paper

Neither prior research file mentions atproto. It should have. From `atproto.com/specs/repository`:

> Repositories and their contents are represented as a graph of data objects, encoded in DRISL CBOR and
> referencing each other by content hash (CID Links)

> The process for signing a commit is to populate all the data fields, and then serialize the unsigned
> commit with DRISL CBOR. The output bytes are then hashed with SHA-256, and the binary hash output …
> is then signed using the current 'signing key' for the account.

> The overall structure and shape of the MST is deterministic based on the current key/value content,
> regardless of the history of insertions and deletions … key compaction … is mandatory, to ensure that
> the MST structure is deterministic across implementations.

Verification does not depend on the host: the verification key `must be fetched from the account's DID
document`. And from `atproto.com/specs/label`, labels are `self-authenticating string annotations on
accounts or content for moderation and other purposes`, each signed by a labeler service with its own
DID and `#atproto_label` key, with clients choosing which labelers to trust via the
`atproto-accept-labelers` header.

**Line up the two systems and the overlap is uncomfortable:**

| Property | AT Protocol | This system |
| --- | --- | --- |
| Self-authenticating signed records | ✔ (DRISL CBOR + SHA-256 + account signing key) | ✔ (canonical protobuf + SHA-256 + Ed25519) |
| Content-addressed IDs | ✔ (CIDs) | ✔ (`jb1…`) |
| Deterministic encoding, mandated cross-implementation | ✔ (explicit, for MST shape) | ✔ (EN-01, three implementations) |
| Verifies without trusting the host | ✔ (key from DID doc) | ✔ (key from certificate chain) |
| Per-account append-structured log | ✔ (repo + MST + signed commits) | ✔ (per-node envelope log) |
| Moderation as additive signed third-party opinions | ✔ (labels + labelers) | ✔ (publish-then-attest) |
| Merkle **transparency log** with STH + gossip + fork detection | **✘ — MST is a state commitment, not an auditable-log gossip protocol** | ✔ |
| Removal leaves a public tombstone | **✘ — explicit: "Record deletion is supported without leaving a trace or 'tombstone' of previous contents"** | ✔ |
| Federation with peer trust states + per-peer quotas | ✘ (relay/PDS architecture, different shape) | ✔ |
| Non-IP transports / partition operation | ✘ | ✔ (claimed L0–L3, measured) |

Two of the three differences that survive — tombstones and transparency-log gossip — are the ones §5
Angle E is built on. **A reviewer who knows atproto will call the envelope model prior art and be right.
Do not fight this; cite atproto in related work and position against the three rows it fails.**

### 2.5 ActivityPub — the negative example, and it holds up

W3C Recommendation, `w3.org/TR/activitypub/`. The specification declines to specify authentication:

> Unfortunately at the time of standardization, there are no strongly agreed upon mechanisms for
> authentication.

and states the origin-fetch dependency in as many words:

> Servers should not trust client submitted content, and federated servers also should not trust content
> received from a server other than the content's origin without some form of verification.

> A server should do something at least as robust as **checking that the object appears as received at
> its origin**, but mechanisms such as checking signatures would be better if available.

That is the quote the paper wants: **authenticity by re-fetching from the origin server, which is
precisely what a shutdown removes.** The two Mastodon advisories already catalogued in
`NSYSS-2026-PAPER-RESEARCH.md` §4.1 (CVE-2024-23832, CVE-2024-25623) are what that unspecified boundary
costs in practice.

The fediverse's own fix confirms the diagnosis and lands in the canonicalise-at-verify camp: **FEP-8b32**
(`codeberg.org/fediverse/fep`, `fep/8b32/fep-8b32.md`) exists for `self-authenticating activities and
objects`, motivated because `HTTP signatures are often used for authentication during server-to-server
interactions. However, this ties authentication to activity delivery, and limits the flexibility of the
protocol.` It recommends the `eddsa-jcs-2022` cryptosuite — **JCS canonicalisation** (RFC 8785) + SHA-256
+ EdDSA. It lists `Forwarding from inbox` as a *future* use case and gives no relay guidance.

### 2.6 Certificate Transparency — the Merkle log is not ours

RFC 6962 §3.5 defines the Signed Tree Head; RFC 9162 §4.9–§4.12 defines `TreeHeadDataV2`, the signed
form, inclusion proofs (`log_id, tree_size, leaf_index, inclusion_path`) and consistency proofs. The
framing this project uses for moderation is CT's framing for misissuance, verbatim, from RFC 6962 §1:

> The logs do not themselves prevent misissue, but they ensure that interested parties (particularly
> those named in certificates) can detect such misissuance.

And the gossip argument, RFC 6962 §5 and §7.3:

> All clients should gossip with each other, exchanging STHs at least; this is all that is required to
> ensure that they all have a consistent view.

> Violation of the append-only property is detected by global gossiping, i.e., everyone auditing logs
> comparing their versions of the latest Signed Tree Heads.

RFC 9162 §1.6 is the honest caveat and applies to us identically: mechanisms to avoid `blindly trust[ing]
logs` are `outside the scope of this document`. **Our STH gossip is an instantiation of RFC 6962 §5. Cite
it as such; claiming it is a design contribution is not survivable.**

### 2.7 Matrix, Cosmos, and the three positions — the finding that changes §4.1 of the prior file

The prior pass framed this as a two-way choice. It is three-way, and the third position is already
occupied.

`spec.matrix.org/v1.11/appendices/` — Canonical JSON is `the shortest UTF-8 JSON encoding with dictionary
keys lexicographically sorted by Unicode codepoint`, floats prohibited, integers bounded. Verification
steps 5–7: **remove** `signatures`/`unsigned`, **re-encode** using Canonical JSON, **then** check. The
spec relies on this: `intermediate entities can add unsigned data such as timestamps and additional
signatures`.

Cosmos SDK **ADR-020** (`github.com/cosmos/cosmos-sdk/…/adr-020-protobuf-transaction-encoding.md`) takes
the opposite side and says why:

> The "direct" signing behavior is to sign the raw `TxBody` bytes as broadcast over the wire. This has
> the advantages of: requiring the minimum additional client capabilities beyond a standard protocol
> buffers implementation; leaving effectively zero holes for transaction malleability (i.e. there are no
> subtle differences between the signing and encoding formats which could potentially be exploited by an
> attacker)

> Signature verification is based on comparing the raw `TxBody` and `AuthInfo` bytes encoded in `TxRaw`
> **not based on any ["canonicalization"] algorithm** which creates added complexity for clients in
> addition to preventing some forms of upgradeability

ADR-020 also mandates unknown-field rejection, for our reason: `they present a malleability vulnerability
where attackers can bloat tx size by adding random uninterpreted data to unsigned content`. And
`regen-network/canonical-proto3`, the spec ADR-020 links when it says "canonicalization", defines rules
that are EN-01 with a different name — ascending field order, defaults omitted, maps excluded — plus the
receiver-side sentence:

> A recipient cannot determine if a message with unknown fields is canonical or not. Therefore all
> transaction processors which receive messages with unknown fields should treat them as not canonical.

RFC 8949 §4.2 refuses to bless the receiver-side check as a general rule — `Some protocols may want
encoders to only emit CBOR in a particular deterministic format; those protocols might also have the
decoders check that their input is in that deterministic format` — and deliberately avoids the word
canonical because `"canonicalization" is often associated with specific uses of deterministic encoding
only`. RFC 8785 states the motivation (`Cryptographic operations like hashing and signing need the data
to be expressed in an invariant format so that the operations are reliably repeatable`) and notes
canonicalisation-rule divergence `historically affecting XML signatures`.

**The taxonomy, which is the actually publishable object:**

| Position | Signature covers | May a relay re-serialise? | Receiver rejects non-canonical input? | Occupied by |
| --- | --- | --- | --- | --- |
| **P1 canonicalise-at-verify** | a canonical form derived from the parsed object | **Yes, freely** | No — a non-canonical encoding of the same values verifies | Matrix, Nostr, SSB, IPNS, FEP-8b32/JCS |
| **P2 sign-raw-bytes** | the bytes as transmitted | No (would break the signature) | **No** — a non-canonical encoding still verifies against itself | Cosmos `SIGN_MODE_DIRECT`, git (§2.8) |
| **P3 bytes-as-received + canonicality gate** | the bytes as transmitted | No | **Yes** — decode, re-encode, compare, reject on any difference (`packages/sdk-ts/src/core/decode.ts:265–271`) | **this system**; `canonical-proto3` gestures at it for unknown fields only |

The **hazard** the prior file named is real and is a property of the P1↔P3 boundary: a gateway that
decodes and re-encodes converts a P3-invalid message into a P3-valid one, i.e. **silently repairs it**.
Under P1 that repair is harmless by construction; under P3 it destroys the gate. I found **no primary
source that names this transition as an attack class** — that absence survives this pass. But ADR-020
publishes the P1-vs-P2 rationale, so the *trade-off* is not unclaimed, and the honest contribution
shrinks to "P3 exists, here is why you would pay for it, here is what it costs" (§5 Angle A).

### 2.8 git — the oldest deployed example

`git-scm.com/docs/signature-format`: for a signed tag the signed payload is `Annotated tag object` and
the signature is `appended to the unsigned tag object`; for a signed commit the payload is the
`Commit object` with the signature `embedded as a header entry named gpgsig`. A commit object names its
`tree` and `parent` by content hash. **Content-addressed DAG + author signature over the object's
serialised bytes, deployed since 2005 (objects) / 2011 (signed commits).** It is P2: git verifies against
the object bytes it stored, and there is no canonicality gate because the object serialisation has
exactly one form by construction.

### 2.9 DIDs / VCs — self-authenticating identifiers are a Recommendation

`w3.org/TR/did-1.1/`: a DID is `a globally unique persistent identifier that does not require a
centralized registration authority and is often generated and/or registered cryptographically`, and
`the design enables the controller of a DID to prove control over it without requiring permission from
any other party`. The spec `does not presuppose any particular technology or cryptography`. VC Data Model
2.0 (`w3.org/TR/vc-data-model-2.0/`) defines a verifiable credential as `a tamper-evident credential
whose authorship can be cryptographically verified`, over a verifiable data registry that may be
`trusted databases, decentralized databases, government ID databases, and distributed ledgers`.

**Both specs make the "self-authenticating, blockchain optional" position a W3C Recommendation.** Nothing
about pseudonymous keys-as-identity is claimable.

### 2.10 Q1 verdict

**Novel mechanism: none.** Every primitive — signed self-authenticating record, hash-as-ID, deterministic
encoding for signing, per-author append-only log, transparency log with STH and gossip, labels as signed
opinions, server-independent verification — is in a primary specification predating this work, most of
them in several.

**Novel composition: marginal, and AT Protocol takes most of it.** What survives the intersection is:
*(transparency log with STH gossip)* × *(tombstones instead of trace-free deletion)* × *(federation with
trust states and per-peer per-class quotas)* × *(one identical validation pipeline across IP, LAN and
radio transports)*. That is a real system, but it is a **systems-integration** contribution.

**Novel engineering discipline: this is where the honest claim lives.** Two specific practices, and only
two: (a) P3 — enforcing exactly one accepted encoding by re-encode-and-compare at every ingress including
federated ingress, with no fallback chain; and (b) validating that encoder against **three independent
implementations on a shared vector corpus** as a blocking gate. (a) is nearly-occupied ground; (b) is
the emptiest ground I found in this pass. Neither is a "mechanism". Both are defensible as *discipline
with a measured result*, which is a legitimate systems-paper contribution and is not what a reviewer
means by "novel".

---

## 3. Q2 — What blockchain actually solves, and whether we need it

All quotes from Nakamoto, *Bitcoin: A Peer-to-Peer Electronic Cash System*, `bitcoin.org/bitcoin.pdf`,
read directly, section numbers as printed.

| # | Property | Blockchain's primary-source statement | Does this system need it? |
| --- | --- | --- | --- |
| 1 | **Single global total order** | §2: "we need a system for participants to agree on **a single history of the order** in which they were received." | **Mostly no — but not universally. See §3.1.** Posts and comments: no. Votes: **yes in a weak sense, and the current handler does not provide it (§3.2).** Credits/nullifiers: yes, and the system deliberately declines (§3.3). |
| 2 | **Double-spend prevention** | Abstract: "Digital signatures provide part of the solution, but the main benefits are lost if a trusted third party is still required to prevent double-spending." §2: "the payee can't verify that one of the owners did not double-spend the coin." | **Not for content.** A post is not scarce; two copies of a signed post are one post after content-ID dedupe. **Yes for credits and epoch nullifiers**, which are exactly double-spend objects — and the system's answer is node-local scope (§3.3). |
| 3 | **Sybil-resistant scarcity / permissionless membership** | §4: "Proof-of-work is essentially **one-CPU-one-vote**… The majority decision is represented by the longest chain." §12: "They do not need to be identified, since messages are not routed to any particular place." | **We do not have it and do not claim it.** Peer admission is TOFU-at-`PROBATION` with vouch-based promotion — an admission decision, which Bitcoin has none of. Node-local PoW/credits give per-node Sybil cost only. |
| 4 | **Objective finality without trusting an operator** | §11 + §12: an attacker's catch-up probability "drop[s] off exponentially with z"; the table gives z=5 for P<0.001 at q=0.10, z=340 at q=0.45. | **No — and we substitute detection for prevention, which is strictly weaker and must be stated as such.** STH gossip + fork detection is RFC 6962's model: detect, do not prevent (§2.6). A node *can* rewrite its own log; what it cannot do is rewrite it without a peer holding a conflicting STH being able to notice. |
| 5 | **Immutable canonical history no operator can rewrite** | §4: "Once the CPU effort has been expended… the block cannot be changed without redoing the work. As later blocks are chained after it, the work to change the block would include redoing all the blocks after it." | **No, by design.** There is no canonical global history here; each node holds its own log, and §3.4 explains why that is the correct choice for this threat model rather than a compromise. |
| 6 | **A public timestamp anyone can verify** | §3: "a timestamp server works by taking a hash of a block of items… and widely publishing the hash." | **Partly needed, partly supplied.** The Merkle log + STH gives inclusion evidence relative to *one node's* log. It does not give a globally agreed time. Envelope `created_at` is author-asserted and validated only by clock-skew bounds (pipeline step 8). **A malicious author can backdate within the skew window; this is an accepted limitation, and blockchain would fix it.** |

### 3.1 Where "double spend" is not meaningless — be precise about this

The comfortable claim is "content addressing plus per-author logs make double-spend meaningless." That
is true **only for append-type content**. It is false for every domain whose projection is a *mutable
cell* or a *consumable budget*. In this system that is at least four things:

1. **Votes** — a mutable per-(author, target) cell.
2. **Credits** — a consumable balance.
3. **Epoch nullifiers** — one-shot tokens whose entire purpose is single-use.
4. **Mutable moderation and membership state** — bans, role grants, tombstones: two conflicting signed
   actions from two moderators with equal authority.

### 3.2 Votes — the concrete defect this pass found

`backend/src/features/forum/vote/vote-cast.handler.ts` gets the *replay* case exactly right and says so
in its own header comment: the projection is keyed on `(authorKey, target)` so "re-voting REPLACES rather
than accumulates," which kills the naive double-count and the same-vote-over-two-transports case. Value
is constrained to `-1, 0, +1` at validate time, and score is recomputed from a stored delta so a log
replay rebuilds identical scores.

**But the merge is arrival-order-wins, not deterministic.** `project()` reads `previous`, computes
`delta = body.value - (previous?.value ?? 0)`, and then `put`s unconditionally. `env.createdAtMs` is
stored as `updatedAtMs` and **never compared**. So if an author signs `+1` at t₁ and `-1` at t₂ and the
two envelopes reach node A and node B in different orders — which federation, an outbox drain and a
backfill make routine, not exotic — **the two nodes converge to different scores for the same author on
the same post, permanently.** Both nodes' logs are complete and correct; their projections disagree.
This is exactly the class of problem property #1 buys you, arriving in a domain that looks append-only
and is not.

The fix does not need consensus: make the cell a last-writer-wins register ordered on
`(createdAtMs, content_id)` — the author's own signed timestamp, tie-broken by a value both nodes can
compute from the bytes. That is a CRDT-shaped merge, it is ~10 lines, and it is worth doing **before**
the paper claims projection equivalence across nodes, because a reviewer who asks "do two nodes agree?"
currently gets a "no" for votes. **Cross-check the same pattern in every handler whose projection
overwrites a keyed cell** (identity profile, membership role, community settings, moderation labels) —
the vote handler is unlikely to be the only one. UNVERIFIED whether the others share the defect; I read
only this handler.

### 3.3 Credits and nullifiers — where the system concedes the point

ADR-011's rule — cost is charged at origin, node-local primitives are meaningless off-node, the
receiver's protection is quota — is correct given the primitives, and RFC 9576's issuer/origin split
explains why (already catalogued in `NSYSS-2026-PAPER-RESEARCH.md` §4.2). But state the consequence
plainly, because a reviewer will:

> An adversary who registers at *k* federating nodes obtains *k* independent credit balances and *k*
> independent nullifier spaces, and every one of those budgets buys content that federates to all the
> others. Node-local anti-abuse bounds per-node issuance; it does not bound network-wide issuance. The
> network-wide bound is the per-peer per-class quota, which is a *rate* bound, not a *cost* bound.

That is the honest statement, and it is also a genuinely interesting one (§5 Angle D). Blockchain solves
this and we do not: a global ledger makes one budget global. We decline that solution because it requires
a consensus that does not survive a partition — which is the whole argument of §4.

### 3.4 Why no global history is the right choice here, not a compromise

The threat model is an operator who can partition, not an operator who can forge. Under partition, a
system whose *validity* depends on global agreement has no validity inside the partition. Under this
design, validity is a pure function of bytes and a public key, so an island retains full write and read
capability against the same rules the rest of the network uses, and reconciles by replay when the
partition heals. Divergence in *derived state* (§3.2) is the price. **That trade is the paper.**

---

## 4. Q3 — What this system solves that blockchain does not

### 4.1 It functions under partition; a chain's *security* does not

Bitcoin tolerates partition at the *liveness-of-relay* level — §5: "New transaction broadcasts do not
necessarily need to reach all nodes… Block broadcasts are also tolerant of dropped messages," and §12:
"Nodes can leave and rejoin the network at will, accepting the proof-of-work chain as proof of what
happened while they were gone." But the safety argument in §4 and §11 is a **fraction-of-global-hashrate**
argument. A partition containing a small share of hashrate produces a chain an outside attacker
reorganises trivially: §11's table gives z=340 confirmations for P<0.001 at q=0.45. **Inside a national
blackout, a locally-mined chain has no meaningful finality.**

Ethereum's proof-of-stake case is sharper, because finality is explicit and epoch-quantised. From
`ethereum.github.io/consensus-specs/specs/phase0/beacon-chain/`, verified from the rendered constants
table 2026-08-18: `SLOT_DURATION_MS = Uint64(12000)`, `SLOTS_PER_EPOCH = Slot(2**5)` (= 32),
`MIN_EPOCHS_TO_INACTIVITY_PENALTY = Epoch(2**2)` (= 4). **DERIVED:** an epoch is 32 × 12 s = **384 s**,
so finality is quantised to 6.4-minute boundaries at best; the widely-cited "~2 epochs ≈ 12.8 min"
figure is **UNVERIFIED** here — I did not extract the justification/finalisation prose from the spec, only
the constants. The spec carries an inactivity-leak mechanism (`is_in_inactivity_leak`,
`MIN_EPOCHS_TO_INACTIVITY_PENALTY`) precisely because a chain that cannot reach a participation threshold
**does not finalise** — which is what a partitioned minority is.

**This system's contrast, measured, not asserted:** propagation is ~1 s per hop across the federation
chain (`CLAUDE.md`, and the plan's item #2 raises this to ≥ 8 nodes / ≥ 200 samples), and — the load-
bearing point — **there is no finality gate at all.** An envelope is valid the instant it is signed;
arrival adds distribution, not validity. Under a full partition the local island's write path, read path
and verification path are unchanged. **State this carefully in the paper:** Bitcoin also relays
*unconfirmed* transactions in seconds. The comparison is not propagation-vs-propagation, it is
"validity requires nothing" vs "usable state requires a quorum you may not have."

### 4.2 Resource footprint — this is the most quotable contrast available

Primary sources, both read 2026-08-18:

| | Requirement | Source |
| --- | --- | --- |
| Bitcoin full node | `2 gigabytes of memory (RAM)`; upload `at least 400 kilobits (50 kilobytes) per second`; `200 gigabytes upload or more a month`; `Download usage is around 20 gigabytes a month, plus around an additional 740 gigabytes the first time you start your node` | `bitcoin.org/en/full-node` |
| Geth (Ethereum execution) | `It is recommended to use at least 16GB RAM`; `Geth itself requires >650GB of disk space for a snap-synced full node`; `grows about 14GB/week`; `at least 25Mbps download speed` | `geth.ethereum.org/docs/getting-started/hardware-requirements` |
| **This system** | RSS **62 MiB** idle, **233 MiB** under bulk crossing; ~384 MiB including Mongo (147 MiB) and Redis (3.7 MiB); target Raspberry Pi 4 under 512 MB | `CLAUDE.md`, measured 2026-08-15 |

**DERIVED, and this is the sentence for the paper:** a Bitcoin full node's stated *first-start* download
of 740 GB is roughly **3.3 × 10⁹ times** the 220 B of a signed forum post, and its stated 200 GB/month
upload is a bandwidth budget that does not exist on the links this system targets. Ethereum's stated
14 GB/week of chain growth exceeds the entire storage a shutdown-era community node is likely to have.

**Be fair, or a reviewer will be fair for you:** Nakamoto §7 shows headers-only verification is cheap —
"A block header with no transactions would be about 80 bytes. If we suppose blocks are generated every
10 minutes, 80 bytes * 6 * 24 * 365 = 4.2MB per year." An SPV client (§8) is genuinely light. What SPV
cannot do is *write* without reaching a network that has the full chain, and §8 admits it is "more
vulnerable if the network is overpowered by an attacker." **The right comparison is full-node-to-node,
because our node is a full participant, and it must be stated in exactly those terms.**

Note the 10-minute interval is a *supposition* inside §7, not a protocol constant in the whitepaper;
§4 says only that difficulty is "determined by a moving average targeting an average number of blocks
per hour." Do not cite "10 minutes" as a specification constant.

### 4.3 Wire size, and the honest caveat

Measured (`tools/vectors/expected.json` + 64 B Ed25519, `CLAUDE.md`): check-in **155 B**, Bangla
broadcast **243 B**, forum post **220 B**. A Bitcoin block header alone is `about 80 bytes` (§7) and
conveys no application content. This is a genuine and defensible contrast for constrained links, but it
compares an application record against a consensus artefact, so **the paper's size figure must be
compared against a JSON-LD ActivityPub `Create`/`Note`** — already item #4 in `NSYSS-2026-PAPER-PLAN.md`
§4.6 — not against a block header. Keep the block header as a footnote, not a bar in the figure.

### 4.4 No asset acquisition is required to write

Writing to any public chain requires paying a fee in a native asset, which requires acquiring it, which
requires an exchange or an on-ramp — the exact infrastructure a shutdown or a sanctions regime removes
first. Anti-abuse here is memory-hard PoW, credits, blind credentials and epoch nullifiers, all of which
a fully anonymous user with no assets can satisfy, and a check-in costs zero credits and needs no
credential. **UNVERIFIED as stated:** I did not read the Ethereum Yellow Paper or execution-specs, so the
"fee is mandatory" claim has no citation in this pass. Before it goes in the paper, cite intrinsic gas
from the Yellow Paper or `ethereum/execution-specs`. Do not assert it from memory.

### 4.5 Moderation without a global rulebook

A chain's state transition function is the same for everyone; disagreement forks the chain. Here,
moderation labels are additive signed opinions a client may honour or ignore, so two communities with
opposing norms coexist on one substrate with no fork. **This is not novel** — it is atproto's composable
moderation and Nostr's NIP-32 (§2.1, §2.4). It is a difference from blockchain, not a contribution.

---

## 5. Q4 — Five angles, ranked by new-work-per-day, with rejection risks

The constraint is ~1 week to the 28 Aug 2026 deadline, on a built system. Angles are ordered by what I
would actually do.

### Angle B (do this first) — A canonicality differential corpus, and the repair rate

**What gets built.** A mutation harness that takes each of the 16 canonical vectors and emits *N*
semantically-equivalent non-canonical encodings: explicit zero fields, non-minimal varints, permuted
field order, unknown/extension fields, unpacked repeated scalars, non-NFC strings, duplicate keys. Then
three measurements:

1. **Agreement.** All three implementations (TS, Rust, Python) reject every mutant, identically, with
   the same error class. This is the existing gate extended from 16 acceptance vectors to a rejection
   corpus — the gate currently proves the encoders *agree on valid input*, not that they *agree on
   invalid input*, which is the half that matters for signature confusion.
2. **The repair rate — the number nobody has.** Push each mutant through a naive gateway (a ts-proto
   decode/re-encode round trip, i.e. what an ordinary gRPC stack does without ADR-008's passthrough
   codec) and report **what fraction of P3-invalid inputs emerge P3-valid**. My expectation is that it
   is very high, possibly 100% for the reorder/zero/varint families. If it is high, that single number
   is the empirical core of Angle A and it is currently ABSENT from every source I read.
3. **A failing-on-purpose control**, per the project's own gate rule: a compliant input must still pass.

**Why defensible.** It converts a design assertion into a measurement, on a corpus, reproducible. It also
satisfies `PLAN` §4.5's own standard that a claim without green evidence does not ship.

**Nearest prior art.** Wycheproof — `a community managed repository of test vectors that can be used by
cryptography library developers to test against known attacks, specification inconsistencies, and other
various implementation bugs` (`github.com/C2SP/wycheproof`) — but that is *primitives*, not encoders.
Frankencerts — Brubaker, Jana, Ray, Khurshid, Shmatikov, *Using Frankencerts for Automated Adversarial
Testing of Certificate Validation in SSL/TLS Implementations*, IEEE S&P 2014 (`github.com/sumanj/
frankencert`) — differential testing across independent implementations, but of *certificate validators*,
not canonical encoders. **I found no primary source applying differential testing to canonical encoders
as a signature-confusion defence.** Absence from a targeted search, not proof of absence.

**Effort.** 2–3 days: 1 day harness + mutation families, 0.5 day wiring into all three implementations,
0.5 day the gateway repair-rate run, 0.5 day figure and table.

**What gets it rejected.** "You fuzzed your own encoder and it passed." Mitigation: the deliverable is
not the pass, it is the **repair rate through a standard stack** and the three-way agreement on
rejection. Also: "16 vectors is a small corpus." Mitigation: report mutants, not vectors — a few hundred
mutants across seven families is a corpus.

### Angle A — The three-position taxonomy of signed-encoding validation

**What gets built.** No code. A design-space section: P1 canonicalise-at-verify / P2 sign-raw-bytes /
P3 bytes-as-received-plus-gate (§2.7 table), each with its occupants cited from primary specs, and a
statement of what each position costs. Plus the security argument: **neither dominates.** P1's attack
surface is the canonicalisation function itself — every verifier must implement it byte-identically, and
SSB's dependence on `JSON.stringify` quirks is the cautionary case; RFC 8785 names the same hazard as
`historically affecting XML signatures`. P3's attack surface is **path discipline** — every intermediary
on every transport must be byte-preserving, which is a global invariant that cannot be locally verified,
and one non-conforming gateway silently converts the system to P2.

**Why defensible.** The taxonomy with a named third position and cited occupants does not exist in the
sources I read, and it explains *why* this system needs a passthrough gRPC codec — a design consequence
reviewers otherwise read as an implementation quirk.

**Nearest prior art.** Cosmos ADR-020 publishes the P1-vs-P2 rationale explicitly (§2.7).
`canonical-proto3` states the receiver-side rule for unknown fields only. Matrix appendices state P1.

**Effort.** 1 day of writing. It is already 80% present in `PLAN` §4.7; this pass supplies the third
position and the Cosmos citations.

**What gets it rejected.** "This is the malleability trade-off, see Cosmos ADR-020" — and they would be
substantially right. **Do not frame it as a discovery.** Frame it as a taxonomy plus Angle B's
measurement. Alone it is half a page, not a contribution.

### Angle E — Tombstones as inclusion-provable censorship evidence

**What gets built.** A demonstration and a comparison table: a client, **with the network disabled**,
verifies (a) the tombstone envelope's signature, (b) its inclusion proof against a cached STH, and (c)
reads the retained content ID, author, timestamp, acting moderator and reason. The claim: *the removal
action is itself a first-class signed, inclusion-provable log entry, so "this was removed, by whom, and
when" is verifiable offline by the reader.*

**Why defensible.** The comparison row is unusually clean:

| System | What a removal leaves | Primary source |
| --- | --- | --- |
| AT Protocol | nothing — `Record deletion is supported without leaving a trace or 'tombstone' of previous contents` | `atproto.com/specs/repository` |
| Nostr | a kind-5 request that relays `SHOULD` honour; `it is impossible to delete events from all relays and clients` | NIP-09 |
| ActivityPub / Mastodon | implementation-defined; no specified evidence artefact | `w3.org/TR/activitypub/` |
| Certificate Transparency | the *misissuance* is evidence, but CT logs certificates, not removals; §1: logs "do not themselves prevent misissue… interested parties can detect" | RFC 6962 §1 |
| DSA Transparency Database | a "statement of reasons" per moderation decision, submitted by the platform — `allows to track the content moderation decisions taken by providers of online platforms in almost real-time`, under `Regulation (EU) 2022/2065` | `transparency.dsa.ec.europa.eu` |
| **This system** | a signed tombstone in the transparency log: content ID, author, timestamp, moderator, reason retained; body withheld | design |

The DSA database is the row that makes this honest and also the row that makes it interesting: **public
moderation records exist and are mandatory in the EU, but they are operator-self-reported and
non-cryptographic** — the operator is trusted to report, and there is no proof a record was not omitted.
The tombstone-in-a-Merkle-log version makes omission detectable by the same argument RFC 6962 §7.3 makes
for the append-only property. That is a small, specific, defensible delta.

**Effort.** 1 day, mostly measurement and the table; the mechanism is built.

**What gets it rejected.** "A signed tombstone in an append-only log is CT applied to moderation" — true,
and the paper should say so before the reviewer does. The delta is offline verifiability by the *reader*
and the DSA contrast. Also: **check before claiming** that a tombstone is actually a log-appended,
inclusion-provable envelope and not only a projection mutation. I did not verify that in the code.
**UNVERIFIED.**

### Angle D — Anti-abuse non-transferability under federation, quantified

**What gets built.** The §3.3 statement turned into an experiment on the existing testbed: register at
*k* nodes, show *k* independent budgets, show all *k* budgets' output federating network-wide, then show
the per-peer per-class quota as the only network-wide bound and measure where it binds (envelopes/s per
class before `backpressure_hint_ms` fires, and the resulting network-wide admission ceiling as a function
of *k*).

**Why defensible.** It converts ADR-011 from a design rule into a measured statement about a real
adversary, and it names a limitation before a reviewer does — which reads as rigour.

**Nearest prior art.** RFC 9576 *The Privacy Pass Architecture* (already catalogued in `RESEARCH` §4.2):
the issuer/origin split is why a token minted at A is meaningless at B, and a reviewer who knows it will
say the qualitative half is definitional. The *federation consequence* and the quantification are not in
RFC 9576.

**Effort.** 2 days, and it needs the ISP gate green first (the bridge defect is still item #1).

**What gets it rejected.** "This is the definition of an issuance context." Mitigation: lead with the
measured ceiling, not the observation.

### Angle C — Availability under partition as the evaluation frame

Already the recommended paper in `NSYSS-2026-PAPER-PLAN.md` §4.3. This pass adds the quantitative
counterparty it lacked: §4.1 (finality is quorum-dependent and epoch-quantised; a partitioned minority
does not finalise) and §4.2 (740 GB / 200 GB-month / 16 GB RAM / 14 GB-week, all quoted). **Add one
subsection contrasting availability-under-partition with immutability-under-consensus, and put the
resource table in it.** Effort: 0.5 day of writing on top of work already planned.

**What gets it rejected.** Comparing against blockchain at all can read as a straw man in a systems
venue. Mitigation: one subsection, no more; frame it as "why not a chain", which is the question every
reader of a censorship-resistance paper silently asks.

### Ranking

1. **B** (2–3 d) — the only angle producing a number that does not exist anywhere.
2. **E** (1 d) — cheapest defensible delta, mechanism already built.
3. **A** (1 d) — the framing that makes B and the passthrough codec legible.
4. **C** (0.5 d) — already planned; this pass supplies its ammunition.
5. **D** (2 d) — good, but gated behind the bridge fix and competing with `PLAN` §4.6's scale-up.

**Total for B + E + A + C ≈ 5 days**, which fits, and none of it competes with `PLAN` §4.6's items #1
(bridge fix) and #2 (scale to ≥ 8 nodes, ≥ 200 samples) — which remain higher priority than any angle
here. If time runs out, drop D, then A's write-up, never B's measurement.

Also, independent of the paper: **fix the vote merge (§3.2) before claiming cross-node projection
equivalence.** It is ~10 lines and it closes a hole a reviewer can open with one question.

---

## 6. Q5 — The bottom line, for a co-author

There is no novel mechanism here and you should stop looking for one: self-authenticating signed records
with hash-derived IDs, deterministic encoding for signing, per-author append-only logs, server-independent
verification, Merkle transparency with signed tree heads and gossip, and moderation as additive signed
opinions are each specified in primary sources that predate this work — git, SSB, IPNS, Nostr NIP-01/09/32,
AT Protocol, RFC 6962/9162, W3C DID and VC — and **AT Protocol independently occupies most of the
composition**, differing mainly in that it has no transparency-log gossip and explicitly deletes without
tombstones. The strongest single framing is therefore the one the paper plan already reached, now with a
quantitative counterparty: **an availability argument rather than an immutability one** — validity is a
pure function of bytes and a public key, so an island under a national partition retains full write, read
and verification capability, at a footprint (62–233 MiB RSS, 155–243 B messages) three orders of magnitude
below a full node of any chain whose own documentation demands 740 GB of initial sync and 200 GB of monthly
upload, and where finality is quorum-gated and epoch-quantised and simply does not arrive inside a
partition — with the security contribution being the **P3 canonicality position** (bytes-as-received plus a
re-encode-and-compare rejection gate) validated by a **three-implementation differential corpus**, which is
the emptiest patch of prior-art ground this pass found. The biggest threat is a reviewer who knows AT
Protocol or Nostr and writes "the envelope model is prior art" — which is true, and the only defence is to
cite both in related work, claim the composition and the discipline rather than the mechanism, and make the
evaluation carry the paper. The second-biggest threat is internal: the ISP gate is still 17/19, propagation
is still n=5 on n=2 nodes, and the vote projection does not deterministically converge across nodes (§3.2) —
any one of those, found by a reviewer, costs more than every novelty argument in this document is worth.

---

## 7. Source index — everything cited, all fetched 2026-08-18

**Protocol specifications**
- Nostr NIP-01 — <https://github.com/nostr-protocol/nips/blob/master/01.md> (raw text)
- Nostr NIP-09 (deletion request) — <https://github.com/nostr-protocol/nips/blob/master/09.md>
- Nostr NIP-32 (labeling) — <https://github.com/nostr-protocol/nips/blob/master/32.md>
- Secure Scuttlebutt Protocol Guide — <https://ssbc.github.io/scuttlebutt-protocol-guide/>
- AT Protocol, Repository — <https://atproto.com/specs/repository>
- AT Protocol, Labels — <https://atproto.com/specs/label>
- IPFS content addressing — <https://docs.ipfs.tech/concepts/content-addressing/> (`specs.ipfs.tech/cids/` → 404)
- IPNS Record — <https://specs.ipfs.tech/ipns/ipns-record/>
- ActivityPub, W3C Recommendation — <https://www.w3.org/TR/activitypub/>
- FEP-8b32, Object Integrity Proofs — <https://codeberg.org/fediverse/fep/src/branch/main/fep/8b32/fep-8b32.md> (raw path required; rendered path returns anti-scraper content)
- Matrix spec appendices v1.11 — <https://spec.matrix.org/v1.11/appendices/>
- git signature format — <https://git-scm.com/docs/signature-format>
- W3C DID Core 1.1 — <https://www.w3.org/TR/did-1.1/>
- W3C VC Data Model 2.0 — <https://www.w3.org/TR/vc-data-model-2.0/>

**RFCs**
- RFC 6962, Certificate Transparency — <https://www.rfc-editor.org/rfc/rfc6962.html>
- RFC 9162, CT v2.0 — <https://www.rfc-editor.org/rfc/rfc9162.html>
- RFC 8785, JSON Canonicalization Scheme — <https://www.rfc-editor.org/rfc/rfc8785.html>
- RFC 8949, CBOR §4.2 deterministic encoding — <https://www.rfc-editor.org/rfc/rfc8949.html>
- RFC 9576, Privacy Pass Architecture — <https://www.rfc-editor.org/rfc/rfc9576.html> (via `NSYSS-2026-PAPER-RESEARCH.md` §4.2)

**Blockchain primary sources**
- Nakamoto, *Bitcoin: A Peer-to-Peer Electronic Cash System* — <https://bitcoin.org/bitcoin.pdf> (read directly, all 9 pages)
- Bitcoin full-node requirements — <https://bitcoin.org/en/full-node>
- Ethereum consensus specs, phase0 beacon chain — <https://ethereum.github.io/consensus-specs/specs/phase0/beacon-chain/> (constants verified from the rendered table)
- Geth hardware requirements — <https://geth.ethereum.org/docs/getting-started/hardware-requirements>
- Cosmos SDK ADR-020, Protobuf transaction encoding — <https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-020-protobuf-transaction-encoding.md>
- Cosmos SDK ADR-027, Deterministic protobuf serialization — <https://docs.cosmos.network/main/build/architecture/adr-027-deterministic-protobuf-serialization>
- regen-network/canonical-proto3 — <https://github.com/regen-network/canonical-proto3>

**Testing / differential-validation prior art**
- Project Wycheproof — <https://github.com/C2SP/wycheproof>
- frankencert — <https://github.com/sumanj/frankencert>; Brubaker, Jana, Ray, Khurshid, Shmatikov, IEEE S&P 2014

**Other**
- protobuf serialization is not canonical — <https://protobuf.dev/programming-guides/serialization-not-canonical/> (via `NSYSS-2026-PAPER-RESEARCH.md` §4.1)
- EU DSA Transparency Database — <https://transparency.dsa.ec.europa.eu/>

**In-repo**
- `packages/sdk-ts/src/core/decode.ts:265–271` — the canonicality gate
- `backend/src/features/forum/vote/vote-cast.handler.ts` — the LWW cell and the §3.2 defect
- `proto/jagoo/v1/registry.yaml:113–123` — `jb:vote:cast:v1`, `idempotent: false`, `credit_cost: 1`
- `tools/vectors/expected.json` — 16 vectors, confirmed by count

---

## 8. What is ABSENT or UNVERIFIED after this pass

| Item | Status |
| --- | --- |
| Any primary source naming "gateway re-encode defeats a downstream canonicality check" as an attack class | **ABSENT** from a targeted search across protobuf.dev, RFC 8785, RFC 8949, Cosmos ADR-020/027, canonical-proto3, Matrix, FEP-8b32 |
| Any primary source doing differential testing of **canonical encoders** across independent implementations | **ABSENT.** Wycheproof is primitives; frankencerts is validators |
| Ethereum "transactions require a fee in the native asset" | **UNVERIFIED** — Yellow Paper / execution-specs not read. Cite before use (§4.4) |
| Ethereum "~2 epochs to finality (~12.8 min)" | **UNVERIFIED** — only the constants were extracted, not the finalisation prose (§4.1) |
| Whether other keyed-cell handlers share the §3.2 non-convergent merge | **UNVERIFIED** — only the vote handler was read |
| Whether a tombstone is a log-appended, inclusion-provable envelope (Angle E depends on it) | **UNVERIFIED** — not checked in code |
| A CT gossip **RFC** (as opposed to RFC 6962 §5's informal instruction) | **ABSENT** — `draft-ietf-trans-gossip` was not located as a published RFC in this pass |
| Acceptance-rate and full-text NSysS data | unchanged from the two prior files; ACM DL still 403 |
