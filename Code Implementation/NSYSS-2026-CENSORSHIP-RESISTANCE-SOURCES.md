# NSysS 2026 — censorship-resistant publishing: primary-source evidence for the reframed paper

**Status:** Research note · 2026-08-20
**Retrieval date for every URL below: 2026-08-20** unless stated otherwise.

## How to use this file

The paper is being reframed. Its subject is now **a censorship-resistant, pseudonymous public forum
that keeps operating through ISP-level blocking and a national blackout, using federation between
independent instances plus multi-homed ISP bridging.** Mesh, Bluetooth, LoRa and DTN are being cut
from the foreground.

This file is the evidence base for that reframing. It is the companion to
`NSYSS-2026-CAPABILITY-MATRIX-SOURCES.md` and follows the same rules:

- **Source text and analysis are separated.** Verbatim text is quoted with a locator; analytical
  consequences are labelled as such, and missing evidence is marked `NOT FOUND` /
  `COULD NOT VERIFY`. Do not turn an analytical consequence into a claim made by the cited work.
- **Primary sources only.** ACM DL / USENIX / IEEE / IACR ePrint / arXiv author PDFs, IETF RFC text
  from `rfc-editor.org`, W3C Recommendations, project specifications served as raw bytes, and UN
  document PDFs. No blog summaries, no Wikipedia, no secondary write-ups, no search-engine answer
  boxes.
- Where I could reach only an abstract page and not the full text, the entry says so.

**The organising question for §1 and §4 is one distinction, and it is the paper's whole argument:**

> Does the system survive **takedown of a server** (a legal or physical attack on a host), or does it
> survive a **national partition** (the reader can no longer reach anything outside the country)?

The classic censorship-resistance systems primarily answer the first. Several recommend
cross-jurisdictional placement, but that does **not** prove that every replica is abroad or that the
system necessarily stops during every national partition. The narrower, sourced contrast is that
their specifications provide no invariant ensuring that enough replicas, relays, or key shares remain
reachable *inside each resulting partition*. Section 1 records the source text; the partition verdicts
below are explicitly analyses of that text.

**Two findings that need action before anything else is written:**

1. **`ooni2024` in `references.bib` points at a URL that returns HTTP 404.**
   `https://ooni.org/post/2024-bangladesh-internet-shutdowns/` → **404** (verified 2026-08-20).
   It must be replaced by the OONI/Digitally Right report of 2025-07-31 (§3.1 below), which returns
   200 and is a far stronger source — it is a full technical report, not a blog post, and it contains
   the mechanism sentence the paper's entire L1/L2 ladder rests on.
2. **`albrecht2022collective` is cited in `main.tex` for a claim it does not make.** See §9.

---

## 1. Censorship-resistant publishing systems

| Work | Venue · Year | Locator |
| --- | --- | --- |
| Anderson, *The Eternity Service* | Pragocrypt 1996 | <https://www.cl.cam.ac.uk/~rja14/Papers/eternity.pdf> |
| Waldman, Rubin, Cranor, *Publius* | 9th USENIX Security Symposium, 2000, pp. 59–72 | <https://www.usenix.org/conference/9th-usenix-security-symposium/publius-robust-tamper-evident-censorship-resistant-and> · PDF mirror: <https://crysp.uwaterloo.ca/courses/pet/F07/cache/www.cs.nyu.edu/~waldman/publius/publius.pdf> |
| Clarke, Sandberg, Wiley, Hong, *Freenet* | Designing Privacy Enhancing Technologies (PET), LNCS 2009, 2001, pp. 46–66 | DOI `10.1007/3-540-44702-4_4` · author PDF: <https://www.cs.cornell.edu/people/egs/615/freenet.pdf> |
| Dingledine, Freedman, Molnar, *The Free Haven Project* | Designing Privacy Enhancing Technologies (PET), LNCS 2009, 2001, pp. 67–95 | DOI `10.1007/3-540-44702-4_5` · author HTML: <https://www.freehaven.net/paper/onepaper.html> |
| Waldman, Mazières, *Tangler* | ACM CCS 2001, pp. 126–135 | DOI `10.1145/501983.502002` · author PDF: <https://www.scs.stanford.edu/~dm/home/papers/waldman:tangler-large.pdf> |

No successor to Publius/Tangler/Free Haven was located in the non-exhaustive 2020–2026 search
recorded here. This is a search result, not evidence that no successor exists; do not make an absence
claim in the paper without a systematic-review protocol. GhostPost (§1.6) is earlier but directly
addresses deletion of social-media posts and was missing from the first pass.

### 1.1 The Eternity Service (Anderson, 1996)

**(a) What it does.** Proposes a distributed file store in which a paid-for file is scattered
redundantly across many independently owned servers worldwide, with anonymity mechanisms so that no
identifiable party can be coerced into deleting any identifiable file. It is the architectural
ancestor of Publius, Tangler and Free Haven, all of which cite it as such.

**(b) The claim we can cite it for.** Eternity's resilience is *jurisdictional* — it comes from the
servers being in many countries — and Anderson explicitly considers and dismisses the national-ban
case, in a way that concedes exactly our point: the service survives, but the users in the banning
country do not get to use it.

**(c) Verbatim.** §4.1 ("What it does"):

> Copies of the file will be stored on a number of servers round the world. Like the Internet, this
> service will depend on the cooperation of a large number of systems whose only common element will
> be a protocol; there will be no head office which could be coerced or corrupted, and the diversity
> of ownership and implementation will provide resilience against both error and attack.

Same section, the jurisdictional claim stated outright:

> External attacks will be made expensive by arranging things so that a file will survive the
> physical destruction of most of the participating file servers, as well as a malicious conspiracy
> by the system administrators of quite a few of them. If the servers are dispersed in many
> jurisdictions, with the service perhaps even becoming an integral part of the Internet, then a
> successful attack could be very expensive indeed — hopefully beyond even the resources of
> governments.

§4.3 ("A simple design") repeats it as the core mechanism:

> Even if the protection mechanisms are simple, the use of a large number of servers in a great many
> jurisdictions will give a high degree of resilience.

**And the national-ban passage, §4.2 ("The threat model") — this is the one to quote in the paper:**

> There might always be local bans: Israeli agents might put up a file containing derogatory
> statements about the Prophet Mohammed, and thus get eternity servers banned in much of the Muslim
> world. If it led to a rejection of the Internet, this might provide an effective attack on Muslim
> countries' ability to develop; but it would not be an effective attack on the Eternity Service
> itself, any more than the Australian government's ban on sex newsgroups has any effect on the US
> campuses where many of the more outré postings originate.

Read that carefully. Anderson is right that the *service* survives a national ban — and he is
conceding, in the same sentence, that the people inside the banning country lose access. That is the
gap the reframed paper occupies, stated by the field's founding paper.

**(d) Survives a national partition?** **Not guaranteed.** Cross-jurisdictional replication does not
imply that no replica is domestic. A partitioned reader succeeds if a usable replica is already
inside the reachable component; the design states no placement invariant that ensures one. Anderson
discusses local bans as harm to users rather than failure of the global service.

**(e) Verdict.** **Cite** in Related Work as the origin of the takedown-resistance framing, and
quote the "local bans" passage — it is the cleanest available concession that the classic model
answers a different question from ours. Do **not** put in the capability table (1996 proposal, never
specified to the level where cells can be checked).

### 1.2 Publius (Waldman, Rubin, Cranor, USENIX Security 2000)

**(a) What it does.** A publisher encrypts a document under a symmetric key, splits that key into
`n` Shamir shares such that any `k` reconstruct it, and places the ciphertext plus one share on each
of `n` servers drawn deterministically from a fixed global server list. A reader fetches the
ciphertext plus `k` shares and tamper-checks against a self-certifying URL.

**(b) The claim we can cite it for.** Three, all load-bearing:
(i) its design goals contain no availability-under-partition goal at all;
(ii) it assumes a **static, system-wide server list**;
(iii) its own answer to a state adversary is, again, *different countries*.

**(c) Verbatim.** §1.1 ("Design Goals"), the nine goals in full — note that "censorship resistant" is
defined purely as resistance to *modification and deletion*:

> **Censorship resistant** Our system should make it extremely difficult for a third party to make
> changes to or force the deletion of published materials.
> **Tamper evident** Our system should be able to detect unauthorized changes made to published
> materials.
> **Source anonymous** There should be no way to tell who published the material once it is published
> on the web. (This requires an anonymous transport mechanism between publishers and web servers.)
> **Updateble** [sic] … **Deniable** … **Fault tolerant** Our system should still work even if some of
> the third parties involved are malicious or faulty. **Persistent** … **Extensible** … **Freely
> available** …

There is no reachability or availability-under-network-attack goal in the list.

§3.1 ("Overview"), the server-list assumption and the retrieval requirement:

> We assume that there is a static, system-wide list of available servers. Publius content is
> encrypted by the publisher and spread over some of the web servers. In our current system, the set
> of servers is static.

> To browse content, a retriever must get the encrypted Publius content from some server and *k* of
> the shares.

§5.2 (attacks and tradeoffs) is candid that the tradeoff is about *corrupt* servers, not unreachable
ones:

> Requiring retrievers to download all *n* shares and *n* copies of the document is one extreme that
> favors censorship resistance over performance. Settling for only the first *k* shares opens the
> user up to a set of corrupt, collaborating servers.

And the jurisdictional answer, §5.4:

> Of course the adversary could try to force the appropriate server administrators to delete the
> Publius Content he wants censored. However when Publius Content is distributed across servers
> located in different countries and/or jurisdictions such an attack can be very expensive or
> impractical.

The denial-of-service section, §5.3, is about **disk exhaustion**, not network blocking:

> Publius, like all Web services, is susceptible to denial of service attacks. An adversary could use
> Publius to publish content until the disk space on all servers is full.

**A corroborating characterisation from a third party, useful because it is precise about the
threshold:** the Freenet paper's related work, §2, says of Publius:

> Publius[30] enhances availability by distributing files as redundant shares among *n* webservers,
> only *k* of which are needed to reconstruct a file; however, since the identity of the servers
> themselves is not anonymized, an attacker might remove information by forcing the closure of
> *n−k*+1 servers.

**(d) Survives a national partition?** **Not guaranteed.** A reader needs to reach at least `k`
servers on the static list. The paper recommends multiple countries/jurisdictions but does not state
that all servers are foreign to every reader. A partition succeeds against a particular reader only
when fewer than `k` listed servers remain in that reader's reachable component.

**(e) Verdict.** **Cite and compare.** Publius is the single best foil for the paper's thesis,
because its design-goal list is short, explicit, and demonstrably silent on reachability. Quote the
"static, system-wide list of available servers" line against our origin-derived identifiers and TOFU
peer admission.

### 1.3 Freenet (Clarke, Sandberg, Wiley, Hong, PET 2001)

**(a) What it does.** An adaptive peer-to-peer overlay in which identical nodes pool storage, files
are named by content/signed-subspace keys, and requests are routed by steepest-ascent hill-climbing
over per-node routing tables with a hops-to-live bound, caching along the reply path.

**(b) The claim we can cite it for.** Freenet is the closest classic system to ours in *shape*
(content-addressed, self-certifying keys, no central index) and the furthest in *guarantee*: it
explicitly declines to guarantee persistence, and its data availability is a function of aggregate
network participation, not of any local invariant.

**(c) Verbatim.** §1, the five design goals — note goal 3, which is takedown/DoS framed, not
partition framed:

> • Anonymity for both producers and consumers of information • Deniability for storers of
> information • Resistance to attempts by third parties to deny access to information • Efficient
> dynamic storage and routing of information • Decentralization of all network functions

Same section, the non-guarantee:

> It is not intended to guarantee permanent file storage, although it is hoped that a sufficient
> number of nodes will join with enough storage capacity that most files will be able to remain
> indefinitely.

§3.4 ("Storage and cache management"), the decisive sentence for a partition argument:

> Strictly speaking, the datastore is not a cache, since the set of datastores is all the storage
> that there is. That is, there is no "permanent" copy which is being replicated in a cache. Once all
> the nodes have decided, collectively speaking, to drop a particular file, it will no longer be
> available to the network. In this respect, Freenet differs from systems such as Eternity and Free
> Haven which seek to provide guarantees of file lifetimes.

§3.1 and §3.5, on bootstrapping — the out-of-band dependency:

> No node is privileged over any other node, so no hierarchy or central point of failure exists.
> Joining the network is simply a matter of first discovering the address of one or more existing
> nodes through out-of-band means, then starting to send messages.

> A new node can join the network by discovering the address of one or more existing nodes through
> out-of-band means, then starting to send messages. As mentioned previously, the request mechanism
> naturally enables new nodes to learn about more of the network over time. However, in order for
> existing nodes to discover them, new nodes must somehow announce their presence.

**(d) Survives a national partition?** **Partially, and not by design.** Freenet has no notion of
network locality: routing-table neighbours are keyspace-adjacent, not topology-adjacent, so a
partition that removes most nodes removes most of the routing table's usefulness and, per §3.4,
removes the only copies of anything the surviving nodes did not happen to cache. **The specification
contains no partition analysis, no locality-preserving routing, and no statement about behaviour
under a network split — `NOT FOUND` on `partition`, `disconnect`, and `fragment` in the full text.**
Do not claim Freenet "fails" under partition as though the paper says so; claim, accurately, that the
paper does not address it and that §3.4 makes availability a function of aggregate participation.

**(e) Verdict.** **Cite.** Use it for the honest statement that content-addressing plus
self-certifying keys is old, which the paper already concedes in its Introduction, and for the
"there is no permanent copy" line. **Optionally compare** — but if it goes in the table its
partition cell must be `nf` (specification silent), not `○`.

### 1.4 Free Haven (Dingledine, Freedman, Molnar, PET 2001)

**(a) What it does.** A "servnet" of servers that trade shares of documents with one another, with an
expiration-date contract enforced by a reputation/trust network, layered over an anonymous
communications channel.

**(b) The claim we can cite it for.** Free Haven's dependency on an external anonymous channel is
architectural and stated as such, and retrieval is a **broadcast to the servnet** answered through
remailers — both of which a national blackout removes outright.

**(c) Verbatim.** "The Free Haven Design — Overview":

> The overall system consists of the publication system, which is responsible for storing and serving
> documents; and the communications channel, which is responsible for providing confidential and
> anonymous communications between parties. This paper focuses on the design of the publication
> system as a back-end for the communications channel.

> The agents in our publication system are the author, the server, and the reader. These agents are
> layered over the communications channel; currently they communicate with one another via addresses
> which are implemented as remailer reply blocks.

"Retrieval" — the broadcast, and the remailer dependency in the return path:

> Readers must locate (or be running) a server which performs the document request. … The servnet
> server does a broadcast of "{`request`, PK_doc, PK_client, reply block}" to all servnet nodes that
> it knows about.

> Each server that receives the query will check to see if it has any shares with the requested
> PK_doc, and if it does it will encrypt each share in the enclosed public key PK_client, and then
> send the encrypted share through the remailer to the enclosed address.

"Communications Channel" — the named dependency:

> The Free Haven design requires a means of anonymously passing information between agents. One such
> means is the remailer network, including the Mixmaster remailers first designed by Lance Cottrell.
> … The first implementation of the Free Haven design will use the Cypherpunk and Mixmaster remailers
> as its anonymous channel.

**(d) Survives a national partition?** **Not guaranteed.** Retrieval requires reachable servnet and
remailer nodes. The paper provides no locality rule ensuring enough of either remain in each
component, but its text does not prove that every such node is outside the country.

**(e) Verdict.** **Cite** for the general point that the classic designs delegate reachability to a
lower layer and then assume that layer works. It is the most explicit instance of that pattern. Do
**not** put in the capability table — the design was never fully deployed and several cells would be
`nf`.

### 1.5 Tangler (Waldman & Mazières, CCS 2001)

**(a) What it does.** Splits documents into blocks and *entangles* new blocks with randomly chosen
previously published blocks via secret sharing, so that storing a block serves several documents at
once and a server has a plausible reason to retain any given block. Blocks live in a public pool on a
self-policing server network; an entangled data block is recoverable from any three of its four
server blocks.

**(b) The claim we can cite it for.** **Tangler names the network-blocking attack explicitly and its
only answer is, again, "many different countries and judicial domains."** This is the single most
quotable sentence in the whole classic literature for our purposes, because it is the one place a
classic paper writes down the exact attack the reframed paper is about — and then hands it off to
jurisdictional diversity.

**(c) Verbatim.** §2.2 ("Document Deletion") — quote both sentences together:

> The most obvious way to censor a published document is to delete it from all hosting servers. **An
> attack with the same end result is to simply force the hosting servers off the network so that
> potential readers cannot contact the servers.**

> An adversary can use threats or the legal system to force individual server administrators to
> delete certain documents. In addition, the adversary can attempt to remove the servers from the
> network by threatening the server's network provider. These attacks clearly show how the power of
> the adversary can affect the censorship resistance properties of a system. While a single individual
> or company might not be able to successfully remove a document from all participating servers, a
> government certainly might possess such power.

> The main way of dealing with these types of attacks is to highly replicate the published documents.
> **Ideally, the replicated documents would be stored on servers in many different countries and
> judicial domains.** This clearly makes these sorts of adversarial attacks harder to execute
> successfully.

The retrieval threshold and the network assumption — §4.5 ("Retrieval"):

> For example, an entangled data block requires only three of the four server blocks recorded for it
> in the inode. Once the necessary server blocks are retrieved, the reconstruction algorithm
> (Section 5.3) is applied to the blocks.

§3.2, the membership assumption, which matters because it rules out an island operating alone:

> While Tangler assumes that all servers know of each other, most peer-to-peer systems are designed
> to scale to the point that not every node knows about all other nodes.

**(d) Survives a national partition?** **Not guaranteed.** A reader must reach at least three of four
holders of each block, drawn from a fully-known server set. The network-blocking attack is explicit;
the proposed jurisdictional diversity does not guarantee three reachable holders within every
partition.

**(e) Verdict.** **Cite, and quote §2.2 in the Introduction.** "An attack with the same end result is
to simply force the hosting servers off the network so that potential readers cannot contact the
servers" is the sentence that makes the paper's gap real rather than rhetorical: the field saw the
attack in 2001 and answered it with geography.

### 1.6 Summary table for §1 — the distinction the paper turns on

| System | Survives takedown of one server? | Survives a **national partition**? | The primary-source sentence that settles it |
| --- | --- | --- | --- |
| Eternity | Yes (by design) | **Not guaranteed** | "the use of a large number of servers in a great many jurisdictions" (§4.3); "local bans … would not be an effective attack on the Eternity Service itself" (§4.2) |
| Publius | Yes (`k`-of-`n`) | **Not guaranteed** | "a static, system-wide list of available servers" (§3.1); "distributed across servers located in different countries and/or jurisdictions" (§5.4) |
| Freenet | Yes (caching, replication) | **Specification silent** | "the set of datastores is all the storage that there is … it will no longer be available to the network" (§3.4) |
| Free Haven | Yes (trading, `k`-of-`n`) | **Not guaranteed** | retrieval is a "broadcast … to all servnet nodes"; channel is "the Cypherpunk and Mixmaster remailers" |
| Tangler | Yes (entanglement, 3-of-4) | **Not guaranteed** | "force the hosting servers off the network so that potential readers cannot contact the servers" (§2.2) |

---

## 2. Anonymous / pseudonymous forum and microblogging systems

| Work | Venue · Year | Locator |
| --- | --- | --- |
| Nostr, NIP-01 *Basic protocol flow description* | Project specification, `draft` `mandatory` | <https://github.com/nostr-protocol/nips/blob/master/01.md> |
| Nostr, NIP-77 *Negentropy Syncing* | Project specification, `draft` `optional` | <https://github.com/nostr-protocol/nips/blob/master/77.md> |
| Tarr, Lavoie, Meyer, Tschudin, *Secure Scuttlebutt* | ACM ICN 2019, pp. 1–11 | DOI `10.1145/3357150.3357396` |
| *Scuttlebutt Protocol Guide* | Project specification | <https://ssbc.github.io/scuttlebutt-protocol-guide/> |
| Corrigan-Gibbs, Boneh, Mazières, *Riposte* | IEEE S&P 2015 | DOI `10.1109/SP.2015.27` · extended version arXiv:1503.06115 |
| Aether | — | **COULD NOT VERIFY — see §11** |

### 2.1 Nostr

**(a) What it does.** Every object is an `event`: a JSON structure with a public key, timestamp,
kind, tags, content and a Schnorr/secp256k1 signature, whose `id` is the SHA-256 of a strictly
specified JSON serialisation. Clients publish events to, and subscribe to events from, relays over
WebSocket.

**(b) The claim we can cite it for.** Two, and they cut in opposite directions, which is exactly why
Nostr is the right comparison:
(i) Nostr already does content-addressed, signed-at-rest, offline-verifiable events with a canonical
serialisation — the paper is right to concede this in its Introduction;
(ii) **base Nostr has no relay-to-relay protocol at all.** Every message type in NIP-01 is
client↔relay. Reach across a partition is therefore a property of *clients* connecting to relays on
both sides, which a national blackout removes.

**(c) Verbatim.** NIP-01, "Events and signatures":

> To obtain the `event.id`, we `sha256` the serialized event. The serialization is done over the
> UTF-8 JSON-serialized string (which is described below) of the following structure: `[0, <pubkey,
> as a lowercase hex string>, <created_at, as a number>, <kind, as a number>, <tags, as an array of
> arrays of non-null strings>, <content, as a string>]`

> To prevent implementation differences from creating a different event ID for the same event, the
> following rules MUST be followed while serializing: — UTF-8 should be used for encoding. —
> Whitespace, line breaks or other unnecessary formatting should not be included in the output JSON.

NIP-01, "Communication between clients and relays" — note that the entire message taxonomy is
client↔relay:

> Relays expose a websocket endpoint to which clients can connect. Clients SHOULD open a single
> websocket connection to each relay and use it for all their subscriptions.

The `nostr-protocol/nostr` README, on the architecture:

> It doesn't rely on any trusted central server, hence it is resilient; it is based on cryptographic
> keys and signatures, so it is tamperproof; **it does not rely on P2P techniques, and therefore it
> works.**

> It's a very simple idea: each person can publish their notes to multiple relays (which are just
> simple servers), and people who follow them can connect to these relays and fetch the notes.

**Relay-to-relay sync does exist, but it is `draft` and `optional`** — NIP-77, header and
introduction:

> `draft` `optional` `relay`

> This document describes a protocol extension for syncing events. It works for both client-relay
> and relay-relay scenarios.

There is no admission control, peer-trust state, quota model, or transparency-log fork detection in
NIP-01 or NIP-77. NIP-77 itself is a reconciliation protocol, so absence of the word `gossip` is not
evidence that relays cannot exchange events.

**(d) Survives a national partition?** **Partially, and only by accident.** A Nostr relay inside the
partition keeps serving the clients that can reach it, and every event it holds stays independently
verifiable — that much genuinely survives. What does not survive is *reach*: two relays on opposite
sides of a cut do not exchange anything in the base protocol. A bridge can nevertheless behave as a
client of both relays and copy signed events; NIP-77 also specifies efficient client–relay and
relay–relay reconciliation, though it remains draft and optional. Cross-island reach therefore
depends on a process that can reach both sides, not on whether base NIP-01 names a server role.

**(e) Verdict.** **Cite and compare — Nostr should replace one of the mesh rows in the capability
table.** It is the strongest "signed at rest, verifiable offline" prior art at the forum-workload
scale, and its `○` in a server-to-server / bridging column is honest, checkable, and directly
supports the paper's contribution.

### 2.2 Secure Scuttlebutt

**(a) What it does.** Each identity is an Ed25519 key whose *feed* is a hash-chained append-only log
of that identity's messages. Peers replicate feeds within a follow-graph horizon over any transport,
discovering each other by UDP broadcast on the local network and by invite to "pubs".

**(b) The claim we can cite it for.** SSB is the closest prior art to our availability goal, and the
one system in this file that genuinely operates under a partition — but it is a **follow-graph
replication model, not a community/forum model**, and its reach beyond the local segment depends on
"pubs", which are publicly-reachable internet hosts.

**(c) Verbatim.** *Scuttlebutt Protocol Guide*, "Introduction":

> Scuttlebutt is a protocol for building decentralized applications that work well offline and that
> no one person can control. Because there is no central server, Scuttlebutt clients connect to their
> peers to exchange information.

"Discovery — Local network" — this is the mechanism that gives it real partition tolerance:

> Peers constantly broadcast UDP packets on their local network advertising their presence. The body
> of each packet is a string containing the peer's IP address, port and base64-encoded public key.

"Feeds — Structure":

> The messages in a feed form an append-only log, meaning that once a message is posted it cannot be
> modified. Each message (except the first one) references the ID of the previous message, allowing a
> chain to be constructed back to the first message in the feed.

"Following — Follow graph" — the replication horizon, which is the limit for a forum workload:

> One implementation, Patchwork, shows messages up to 2 hops out by default. Messages from feeds 3
> hops out are replicated to help keep them available for others, but not directly shown in the user
> interface.

"Pubs" — the internet dependency for anything beyond local reach:

> Invite codes help new users get connected to their first *pub*, which is a Scuttlebutt peer that is
> publicly accessible over the internet.

**(d) Survives a national partition?** **Yes among mutually reachable, already discoverable
peers.** Automatic discovery documented here is LAN-local: its packet exposes the peer's IP, port,
and public key. Regional operation needs configured addressing or rendezvous, commonly pubs. This is
offline-capable pseudonymous replication, not network anonymity.

**(e) Verdict.** **Cite and compare — and be generous about it.** SSB beats us on the lower rungs and
the paper should say so plainly, the way it currently does for DTN and Serval. Where we differ is the
unit of replication: SSB replicates *feeds you follow*, we replicate *communities a peer subscribes
to*, which is what a public forum with moderation needs. Note also that SSB has no transparency-log
gossip and no equivocation detection across peers — **`NOT FOUND` on `tree head`, `gossip`,
`transparency` in the Protocol Guide** — so its fork-detection cell is `nf`, not `○`.

### 2.3 Riposte (and the Riffle / Talek family)

**(a) What it does.** A traffic-analysis-resistant anonymous **bulletin board**: clients submit
secret-shared write requests to a small set of non-colluding servers using distributed point
functions, so no server learns which slot a client wrote.

**(b) The claim we can cite it for.** That the peer-reviewed anonymous-bulletin-board line solves a
*different* problem from ours — traffic-analysis resistance, which our paper explicitly excludes —
at a cost in write throughput and in trust assumptions that a partitioned forum cannot pay.

**(c) Verbatim.** Abstract:

> This paper presents Riposte, a new system for anonymous broadcast messaging. Riposte is the first
> such system, to our knowledge, that simultaneously protects against traffic-analysis attacks,
> prevents anonymous denial-of-service by malicious clients, and scales to million-user anonymity
> sets. … For latency-tolerant workloads with many more readers than writers (e.g. Twitter,
> Wikileaks), we demonstrate that a three-server Riposte cluster can build an anonymity set of
> 2,895,216 users in 32 hours.

§1, the trust assumption:

> Our system, called Riposte, allows a large number of clients to anonymously post messages to a
> shared "bulletin board," maintained by a small set of minimally trusted servers. (As few as three
> non-colluding servers are sufficient).

§1 ("Experiments"), the measured throughput:

> When the servers maintain a database table large enough to fit 65,536 160-byte Tweets, the system
> can process 32.8 client write requests per second. … When using a larger 377 MB database table
> (over 2.3 million 160-byte Tweets), a Riposte cluster can process 1.4 client write requests per
> second.

**(d) Survives a national partition?** **Not guaranteed.** A write requires reaching the configured
server set. A partition prevents writes when it separates a client from a required server; geographic
co-location and operator collusion are separate questions. The source does not say that all servers
inside one country share an operator.

The measurements do **not** prove that Riposte cannot carry a forum: 32.8 writes/s is roughly
2.8 million writes/day and suitability depends on workload, latency, and board size.

**(e) Verdict.** **Cite in one sentence, do not compare in the table.** The correct framing is:
"a separate line of peer-reviewed work builds anonymous bulletin boards with traffic-analysis
resistance [riposte]; we explicitly exclude that property (§Adversary and Scope) because its trust
and throughput requirements are incompatible with operating inside a partition." That sentence both
credits the literature and defends our exclusion — and the exclusion is currently asserted in the
paper without a citation, which a reviewer will notice.

**Riffle (PoPETs 2016) and Talek (USENIX ATC 2020) were not retrieved in full text for this note.**
Both are in the same family (verifiable shuffles / private messaging with a non-colluding server
set), and on the evidence of Riposte the same verdict applies, but **I did not verify their texts and
the paper should not cite them for a specific technical claim on my say-so.** Recorded in §11.

---

## 3. Internet shutdowns as a measured phenomenon

| Work | Venue · Year | Locator |
| --- | --- | --- |
| Raso, Afrin, Chowdhury, Xynou, Yachmeneva, *The Longest Silence: Internet Shutdowns During Bangladesh's 2024 Uprising* | Digitally Right + OONI research report, **2025-07-31** | <https://ooni.org/post/2025-bangladesh-report/> |
| Belson, *A recent spate of Internet disruptions* (Cloudflare Radar) | Cloudflare blog, **2024-08-01** | <https://blog.cloudflare.com/a-recent-spate-of-internet-disruptions-july-2024> |
| Bischof, Pitcher, Carisimo, Meng, Nunes, Padmanabhan, Roberts, Snoeren, Dainotti, *Destination Unreachable: Characterizing Internet Outages and Shutdowns* | **ACM SIGCOMM 2023**, 14 pp. | DOI `10.1145/3603269.3604883` |
| Padmanabhan, Filastò, Xynou, Sundara Raman, Middleton, Zhang, Madory, Roberts, Dainotti, *A multi-perspective view of Internet censorship in Myanmar* | **ACM SIGCOMM FOCI 2021**, pp. 27–36 | listed as [48] in the SIGCOMM'23 bibliography; **full text not retrieved — see §11** |
| IODA (Internet Outage Detection and Analysis), Georgia Tech Internet Intelligence Lab | Live measurement platform | <https://ioda.inetintel.cc.gatech.edu/> |

### 3.1 OONI / Digitally Right, *The Longest Silence* (2025-07-31) — **the replacement for `ooni2024`**

**(a) What it does.** A full technical report reconstructing a verified timeline of the July–August
2024 Bangladesh shutdowns, combining OONI Probe measurements, IODA, Cloudflare Radar and Google
traffic data with operator interviews.

**(b) The claim we can cite it for.** **The mechanism.** This report says, from operator accounts,
*where in the topology the cut was made* — and it was made at the international gateway. That single
sentence is the empirical foundation of the paper's L1 (national partition) and L2 (ISP island)
rungs, and the currently-cited 404'd blog post does not contain it.

**(c) Verbatim.** Section "How are Shutdowns Implemented?" / the July 18 analysis:

> [The shutdown] was implemented in two stages: the shutdown of mobile internet and the suspension of
> broadband connectivity. According to operator accounts and public reports, the mobile network
> suspension was carried out through directives from the BTRC and NTMC. **The broadband shutdown was
> executed upstream, through instructions issued to International Terrestrial Cable (ITC) operators,
> the Submarine Cable Company, and IIG providers — effectively cutting off bandwidth to ISPs
> nationwide.**

Executive Summary — scope, duration and the layering:

> Bangladesh witnessed its worst internet shutdown during the July–August 2024 student-led uprising,
> which ultimately led to the fall of the Sheikh Hasina government. Over a 22-day period, from mid-July
> to early August, the shutdowns coincided with mass protests, the killing of hundreds of
> demonstrators, and widespread human rights violations, as documented by domestic and international
> observers, including United Nations reports. The scale and complexity of the shutdown were
> unprecedented. **Multiple layers of control were deployed, ranging from nationwide blackouts to
> bandwidth throttling, cache server deactivations, and targeted blocking of social media and VPNs.**

Executive Summary — the two blackouts, named:

> **Unprecedented scale and duration:** The shutdown with two full national blackouts (July 18-23 and
> August 5), bandwidth throttling and targeted blocking was the longest and most geographically
> widespread in Bangladesh's history.

> **Network disruption aligned with political escalation:** The most severe disruptions, including the
> five-day blackout and the August 5 blackout, broadly coincided with the deadliest phases of unrest.
> Between July 18-23 alone, media reports documented at least 143 deaths, while August 4-5 saw 223
> more, highlighting how shutdowns paralleled spikes in violence.

The mobile-only platform blocking that preceded the blackout — the L0→L1 transition, measured:

> Independent OONI Probe network tests conducted by Digitally Right's network measurement fellows on
> July 16 and 17 in six districts — including Dhaka, Sylhet, Tangail, Mymensingh, and Rangpur —
> suggested that Facebook was blocked across all major mobile networks by the night of July 16. …
> **Importantly, at this time, Facebook remained accessible via broadband connections.**

> While OONI data collected from multiple networks in Bangladesh throughout July 2024 indicates that
> Facebook was accessible on most networks, access to "www.facebook.com" appears to have been blocked
> on the AS24432 (Axiata) and AS24389 (Grameenphone) networks, starting from 16th July 2024.

The measurement method, quoted so the paper can state what "TLS interference" means here — OONI
methodology section:

> Specifically, OONI's Web Connectivity test is designed to measure the accessibility of URLs by
> performing the following steps: Resolver identification; DNS lookup; TCP connect to the resolved IP
> addresses; TLS handshake to the resolved IP addresses; HTTP(s) GET request following redirects.

VPN blocking — relevant to §4 of this file, because it shows circumvention tools were themselves
targeted *before* the blackout:

> A representative from ProtonVPN confirmed via email that "there is currently a crackdown on VPN
> services in Bangladesh".

**(d) Survives a national partition?** N/A — measurement source.

**(e) Verdict.** **Cite, and make it the paper's primary motivating source.** Replace `ooni2024`
entirely. The abstract's current phrasing ("throttling, then blocked platforms, then interference
with TLS handshakes, and finally a five-day national blackout") is **supported** by this report and
should now carry its citation rather than the dead one.

**One correction to the current draft.** `main.tex` §1 says the sequence was followed by "a period in
which domestic connectivity returned while international transit did not." **I could not find that
claim in this report.** What the report supports is that the *cut* was executed at the international
gateway (ITC / submarine cable / IIG), and that restoration was staged and prioritised by sector. The
inference that domestic reachability survived while international transit did not is *plausible given
the stated mechanism* but is **NOT stated in the source**, and the sentence should be rewritten to
say what the source says: that the broadband shutdown was imposed upstream at the international
gateways. Flagged again in §11.

### 3.2 Cloudflare Radar (Belson, 2024-08-01)

**(a) What it does.** Per-AS traffic and BGP announced-address-space observations for the July 2024
disruptions, including Bangladesh.

**(b) The claim we can cite it for.** That the July 2024 event included **BGP withdrawal**, not only
data-plane filtering — and the per-AS timing, which is what makes the "ISP island" rung concrete
rather than hypothetical.

**(c) Verbatim.** Bangladesh section:

> Internet traffic in Bangladesh dropped to near zero just before 21:00 local time (15:00 UTC).
> Announced IP address space from the country dropped to near zero at that time as well.

Per-operator, the operators went dark at *different times*. This establishes heterogeneous outage
timing, not that surviving domestic ASes remained mutually reachable or formed usable ISP islands:

> AS24389 (Grameenphone): A complete Internet outage started at 01:30 local time on July 18 (19:30
> UTC on July 17), with a total loss of both Internet traffic and announced IP address space.

> AS25245 (Banglalink): [outage] started at 02:15 local time on July 18 (20:15 UTC on July 17) as
> both Internet traffic and announced IP address space dropped to zero.

> AS24432 (Robi Axiata): An Internet outage was observed starting around 06:30 local time on July 18
> (00:30 UTC), with both Internet traffic and announced IP address space disappearing at that time.

Recovery, staged and sector-prioritised:

> Broadband Internet services providers in Bangladesh began to restore connectivity on July 23. The
> initial restoration was characterized as a "trial run", prioritizing banking, commercial sectors,
> technology firms, exporters, outsourcing providers and media outlets.

> Traffic on mobile providers did not begin to recover until around 15:00 local time (09:00 UTC) on
> July 28.

**(e) Verdict.** **Cite** alongside the OONI report as the routing-plane corroboration. Two
independent measurement sources on the same event is worth the extra bibliography line. The per-AS
staggering motivates heterogeneous failure schedules, but is not evidence that the real network had
the same island topology as the testbed.

### 3.3 Bischof et al., *Destination Unreachable* (SIGCOMM 2023) — **the peer-reviewed anchor**

**(a) What it does.** The first comprehensive longitudinal analysis of government-ordered shutdowns
versus spontaneous outages, merging curated shutdown datasets (Access Now KeepItOn), IODA outage
data, and sociopolitical indicators.

**(b) The claim we can cite it for.** That shutdowns are a *studied, characterised class of event*
with distinct temporal properties — which lets the paper stop treating the Bangladesh event as an
anecdote. Specifically: shutdowns are longer than spontaneous outages, and they cluster on days of
political mobilisation.

**(c) Verbatim.** Abstract:

> In this paper, we provide the first comprehensive longitudinal analysis of government-ordered
> Internet shutdowns and spontaneous outages (i.e., disruptions not ordered by the government). …
> However, we find that government-ordered shutdowns are many more times likely to occur on days of
> mobilization, coinciding with elections, protests, and coups. Our study also characterizes the
> temporal characteristics of Internet shutdowns and finds that they differ significantly in terms of
> duration, recurrence interval, and start times when compared to spontaneous outages.

§7 ("Event duration"):

> We first look at how shutdowns and spontaneous outages compare in terms of duration. Figure 10 shows
> the CDF of event durations for each category. We find that spontaneous outages tend to have shorter
> durations, with a **median duration of 2 hours for spontaneous outages and 5.5 hours for
> shutdowns**.

§4, a methodological caveat the paper should honour if it cites IODA-derived figures:

> although IODA is able to monitor publicly routable IPv4 networks, its ability to monitor the
> connectivity of networks that heavily utilize Network Address Translation (NAT), such as mobile
> networks, is limited.

This is a measurement limitation. It does not support an application-layer CGNAT/no-inbound claim;
that claim needs separate protocol evidence and evaluation.

**(d) Survives a national partition?** N/A — measurement source.

**(e) Verdict.** **Cite.** This is the citation that turns "internet shutdowns happen" from an
assertion into a peer-reviewed fact at a top-tier networking venue, which is what an NSysS reviewer
will want. Note that the median-duration figure (5.5 h) makes the Bangladesh five-day blackout an
extreme outlier — worth one sentence.

### 3.4 Access Now / #KeepItOn

**COULD NOT VERIFY.** I did not retrieve a primary Access Now #KeepItOn annual report PDF for 2024 or
2025 in this session; search returned only coalition letters and secondary coverage. The KeepItOn
dataset *is* used as a primary input by Bischof et al. (SIGCOMM 2023 §3), which is a peer-reviewed
endorsement of the dataset — so **cite the SIGCOMM paper for the dataset's existence and use, and do
not cite an Access Now report you have not opened.** See §11.

---

## 4. Circumvention and its limits under a full blackout

**This is the section the reframed paper most needs, and it turned out better than expected: all four
systems state their own reachability assumption in their own words.** No inference is required
anywhere in this section.

| Work | Venue · Year | Locator |
| --- | --- | --- |
| Dingledine, Mathewson, Syverson, *Tor: The Second-Generation Onion Router* | 13th USENIX Security Symposium, 2004 | <https://svn.torproject.org/svn/projects/design-paper/tor-design.pdf> |
| Dingledine, Mathewson, *Design of a blocking-resistant anonymity system* | Tor Project technical report, **November 2006** | <https://svn.torproject.org/svn/projects/design-paper/blocking.pdf> |
| Fifield, Lan, Hynes, Wegmann, Paxson, *Blocking-resistant communication through domain fronting* | PoPETs 2015(2), pp. 46–64 | DOI `10.1515/popets-2015-0009` |
| Wustrow, Wolchok, Goldberg, Halderman, *Telex: Anticensorship in the Network Infrastructure* | 20th USENIX Security Symposium, 2011 | <https://www.usenix.org/legacy/event/sec11/tech/full_papers/Wustrow.pdf> |
| Bocovich, Breault, Fifield, Serene, Wang, *Snowflake, a censorship circumvention system using temporary WebRTC proxies* | 33rd USENIX Security Symposium, 2024 | <https://www.usenix.org/system/files/usenixsecurity24-bocovich.pdf> |

### 4.1 Tor — the assumption is stated in the first paragraph of the blocking-resistance report

**(b) The claim we can cite it for.** Tor's blocking-resistant design *explicitly assumes the censor
will not turn the Internet off*, and says so as an adversary assumption, not as a caveat.

**(c) Verbatim.** *Design of a blocking-resistant anonymity system*, §1 — the general framing:

> Historical anonymity research has focused on an attacker who monitors the user (call her Alice) and
> tries to discover her activities, yet lets her reach any piece of the network. In more modern threat
> models such as Tor's, the adversary is allowed to perform active attacks … **But these systems still
> assume that Alice can eventually reach the anonymizing network.**

Abstract, the failure mode named:

> But if the censor simply denies access to the Tor network itself, blocked users can no longer
> benefit from the security Tor offers.

**§2 ("Adversary assumptions") — this is the sentence to put in the paper:**

> The censors (or their governments) would like to have a working, useful Internet. **There are
> economic, political, and social factors that prevent them from "censoring" the Internet by outlawing
> it entirely, or by blocking access to all but a tiny list of sites.** Nevertheless, the censors are
> willing to block innocuous content (like the bulk of a newspaper's reporting) in order to censor
> other content distributed through the same channels.

§5.1 ("Bridge relays") — and note where the bridges are:

> They can rate limit relayed connections to 10 KB/s (almost nothing for a broadband user **in a free
> country**, but plenty for a user who otherwise has no access at all) …

**(d) Survives a national partition?** **No, and the design says so.** A blackout is precisely the
"outlawing it entirely" case that §2 assumes away.

**(e) Verdict.** **Cite `torblocking2006` for the §2 quote.** Cite the 2004 design paper only if the
paper needs Tor's anonymity properties, which under the reframing it probably does not.

### 4.2 Domain fronting

**(c) Verbatim.** §1, the parenthetical — small, easy to miss, and decisive:

> Circumventors, at a natural disadvantage because the censor controls the network, have a point
> working in their favor: the censor's distaste for "collateral damage," incidental overblocking
> committed in the course of censorship. Collateral damage is harmful to the censor, because the
> overblocked content has economic or social value, so the censor tries to avoid it. **(Any censor not
> willing to turn off the Internet completely must derive some benefit from allowing access, which
> overblocking harms.)** One way to win against censorship is to entangle circumvention traffic with
> other traffic whose value exceeds the censor's tolerance for overblocking.

§2 ("Threat model"), the success condition:

> Our threat model includes four actors: the censor, the censored client, the intermediate web
> service, and the covert destination (a proxy server). **Circumvention is achieved when the client
> reaches the proxy**, because the proxy grants access to any other destination.

§8, the honest scoping:

> Domain fronting derives its strength from the collateral damage that results from blocking the front
> domain. **It should not — nor should any other circumvention technique — be thought of as
> unblockable**; rather, one should think of what it costs the censor to block it.

**(d) Survives a national partition?** **No.** The entire mechanism is a cost argument that
presupposes the censor wants the Internet on. When the Internet is off, the cost calculus the
technique exploits no longer exists.

**(e) Verdict.** **Cite `fifield2015fronting`.** The parenthetical is the single most economical
sentence in the literature for the paper's argument.

### 4.3 Telex / decoy routing — states the exclusion outright

**(c) Verbatim.** §2.1 ("Threat model"), the paragraph that ends the argument:

> **Some governments may choose to deny their citizens Internet connectivity altogether, or disconnect
> entirely in times of crisis. These are outside our threat model; the best approaches to censors like
> these likely involve different approaches than ours, and entail much steeper performance
> trade-offs.** Instead, our goal is to make access to any part of the global Internet sufficient to
> access every part of it. In other words, we aim to make connecting to the global Internet an
> all-or-nothing proposition for national governments.

Same section, the adversary's reach:

> The censor has very limited abilities outside its network. It does not control any external network
> infrastructure or any popular external websites the client may use when communicating with Telex
> stations.

And §1, the strategy in one line:

> Rather than attempting to win the cat-and-mouse game of finding open proxies, we **leverage censors'
> unwillingness to completely block day-to-day Internet access.**

**(d) Survives a national partition?** **No, by the authors' own declaration.**

**(e) Verdict.** **Cite `wustrow2011telex`, and quote the §2.1 exclusion in full.** It is the
strongest possible support for the paper's framing because it is not a limitation a reviewer
extracted — it is the authors saying "someone should build the other thing." That is the paper's
opening, handed over by the decoy-routing literature itself.

### 4.4 Snowflake (USENIX Security 2024) — the recent work, same assumption

**(c) Verbatim.** §2 ("Threat model"):

> **As is usual in circumvention research**, we assume a threat model in which clients reside in a
> network controlled by a censor. The censor has the power to inspect and interfere with traffic that
> **crosses the border of its network**; typical real-world censor behaviors include inspecting IP
> addresses and hostnames, checking packet contents for keywords, blocking IP addresses, and injecting
> false DNS responses and TCP RST packets. **The client wants to communicate with some destination
> outside the censor's network**, possibly with the aid of third-party proxies.

§3, the proxy population's location:

> Proxies may contact the broker directly, because **they are assumed to be uncensored**. But clients
> must use an indirect, blocking-resistant channel, because any direct connection to the broker would
> be easily blocked by a censor.

**(d) Survives a national partition?** **No.** The success condition is reaching a destination
outside the censor's network; the proxy pool is by construction outside it.

**(e) Verdict.** **Cite `bocovich2024snowflake`** as recent deployed circumvention work. It does not
supersede the distinct designs above, and four examples do not justify a claim about every
circumvention system.

### 4.5 The one-line synthesis, fully sourced

Each of the four circumvention systems examined here defines success using a path to infrastructure
outside the censored region; three say so in their threat-model sections:

| System | Its own words | Blackout in scope? |
| --- | --- | --- |
| Tor (blocking-resistant) | "factors that prevent them from 'censoring' the Internet by outlawing it entirely" (§2) | **No** |
| Domain fronting | "Any censor not willing to turn off the Internet completely…" (§1) | **No** |
| Telex | "These are outside our threat model" (§2.1) | **No — explicitly** |
| Snowflake | "The client wants to communicate with some destination outside the censor's network" (§2) | **No** |

---

## 5. Federated / decentralized social infrastructure — measurement and security analyses

| Work | Venue · Year | Locator |
| --- | --- | --- |
| Raman, Joglekar, De Cristofaro, Sastry, Tyson, *Challenges in the Decentralised Web: The Mastodon Case* | **ACM IMC 2019**, pp. 217–229 | DOI `10.1145/3355369.3355572` · arXiv:1909.05801 |
| Balduf, Sokoto, Ascigil, Tyson, Scheuermann, Korczyński, Castro, Król, *Looking AT the Blue Skies of Bluesky* | **ACM IMC 2024**, pp. 76–91 | DOI `10.1145/3646547.3688407` · arXiv:2408.12449 |
| Albrecht, Celi, Dowling, Jones, *Practically-exploitable Cryptographic Vulnerabilities in Matrix* | **IEEE S&P 2023** | DOI `10.1109/SP46215.2023.10351027` · IACR ePrint 2023/485 |
| Matrix Specification (event signing, redaction, state res) | v1.19 as of 2026-08-19 | already covered in `NSYSS-2026-CAPABILITY-MATRIX-SOURCES.md` §5 |

### 5.1 Raman et al., IMC 2019 — **the highest-value new citation in this file**

**(a) What it does.** A measurement study of Mastodon covering instance deployment, hosting
concentration, and — the part we need — what happens to the federated graph when ASes go down.

**(b) The claim we can cite it for.** **Peer-reviewed, measured evidence that federation over IP
fragments under AS-level outage, with a number.** The reframed paper currently argues that federated
social systems "assume L0 and become unavailable at L1" by reading specifications. This paper
*measured* it.

**(c) Verbatim.** §1 ("Main Findings"), finding 3:

> There are infrastructure-driven pressures towards centralisation. Due to the simplicity and low
> costs, there is notable co-location of instances within a small set of hosting providers. **We find
> that failures in these ASes can create a ripple effect that fragments the wider federated graph. For
> example, the Largest Connected Component (LCC) in the social follower graph reduces from 92% of all
> users to 46% by outages in five ASes. We observe 6 cases of these AS-wide outages within our
> measurement period.**

§1, finding 2 — user-driven concentration:

> There are user-driven pressures towards centralisation. Popularity in Mastodon is heavily skewed
> towards a few instances, driving implicit forms of centralisation. **10% of instances host almost
> half of the users.**

§4, geographic and AS concentration:

> 89.1% of all toots reside on instances in Japan, the US, and France.

> That said, due to the varying popularity of these instances, the top three ASes account for almost
> two thirds (62%) of all global users, with the largest one (Amazon) hosting more than 30% of all
> users — even though it only is used by 6% of instances.

**(d) Survives a national partition?** N/A. The measurement shows concentration risk: outages in
five ASes reduced the measured largest connected component substantially. It does not establish that
ActivityPub categorically fails under every AS-scale or national partition.

**(e) Verdict.** **Cite, prominently, and consider promoting it into the Introduction.** It converts
the paper's central premise from a specification-reading argument into a measured one, and it does so
from IMC — a venue an NSysS reviewer will respect. It also gives the paper a number to compare its
own bridged-crossing result against.

### 5.2 Balduf et al., IMC 2024 — the AT Protocol measurement

**(b) The claim we can cite it for.** That the AT Protocol's decomposition, whatever its design
intent, is deployed with single points of dependency — the PLC directory and the default relay — both
operated by one company. This is the empirical backing for the capability table's `○` on "verify
without server" for atproto.

**(c) Verbatim.** §2:

> There are currently two supported DID schemata: PLC and WEB. They differ in how the DID Document
> are retrieved: **(1) for PLC DIDs, the associated document is downloaded from the `plc.directory`
> service, which is operated by Bluesky PBC.**

> To streamline the process, **a centralized Relay aggregates user interactions across PDSes. This is
> a central store that replicates the repo data structures from all known PDSes.** … Bluesky PBC runs
> the default Relay and Firehose at `bsky.network`. However, other providers could offer a competing
> service if they wish.

§5, handle infrastructure concentration:

> We find a high degree of centralization of domain handles. While we identify 39,403 registered
> domains spread across 249 registrars, 50% of the domains are registered in just four registrars.

**(d) Survives a national partition?** **Fresh verification of the current identity-to-key binding
is not guaranteed.** It requires resolving the DID document from `plc.directory` (already established verbatim in
`NSYSS-2026-CAPABILITY-MATRIX-SOURCES.md` §6.1: *"That information must be fetched from the account's
DID document."*). A cached DID document/key can still cryptographically verify an already obtained
signed repository object. This IMC paper adds that the live directory is one company's service.

**(e) Verdict.** **Cite** as the measurement companion to the specification quotes already collected.
Together they make the atproto row in the capability table unassailable.

### 5.3 Albrecht et al., IEEE S&P 2023 — Matrix

**(b) The claim we can cite it for.** That a federated system's *specified* cryptography can be
invalidated by exactly the failure classes our canonical-encoding admission gate exists to foreclose
— the paper's own abstract names "protocol confusion" and "lack of domain separation."

**(c) Verbatim.** Abstract:

> We report several practically-exploitable cryptographic vulnerabilities in the Matrix standard for
> federated real-time communication and its flagship client and prototype implementation, Element.
> These, together, invalidate the confidentiality and authentication guarantees claimed by Matrix
> against a malicious server. This is despite Matrix' cryptographic routines being constructed from
> well-known and -studied cryptographic building blocks. **The vulnerabilities we exploit differ in
> their nature (insecure by design, protocol confusion, lack of domain separation, implementation
> bugs)** and are distributed broadly across the different subprotocols and libraries that make up the
> cryptographic core of Matrix and Element.

§I-C / §IV, on the domain-separation attack specifically:

> The attack enables a mallory-in-the-middle (MITM) attack breaking confidentiality and authenticity
> of the underlying Olm channels (and thus also Megolm channels). **This attack is enabled by an
> insecure implementation choice permitted by the specification which does not enforce domain
> separation.**

**(d) Survives a national partition?** N/A — security analysis.

**(e) Verdict.** **Cite** under protocol domain separation and cross-context confusion. Do not call
this the same bug class as canonicalisation/normalisation flaws: those are distinct cryptographic
concerns.

---

## 6. Decentralized moderation and "publish-then-attest"

| Work | Venue · Year | Locator |
| --- | --- | --- |
| Anaobi, Raman, Castro, Zia, Ibosiola, Tyson, *Will Admins Cope? Decentralized Moderation in the Fediverse* | **ACM Web Conference (WWW) 2023** | DOI `10.1145/3543507.3583487` · arXiv:2302.05915 |
| Balduf et al., *Looking AT the Blue Skies of Bluesky* (labeler ecosystem) | ACM IMC 2024 | DOI `10.1145/3646547.3688407` |
| Activity Streams 2.0 `Tombstone`; Matrix redaction algorithm; atproto deletion semantics | W3C REC 2017 / Matrix v1.19 / atproto | already fully quoted in `NSYSS-2026-CAPABILITY-MATRIX-SOURCES.md` §4.1, §5.3, §6.4 |

### 6.1 Anaobi et al., WWW 2023

**(a) What it does.** Measures the moderation burden on Pleroma/Mastodon instance administrators and
proposes `WatchGen` to flag instances needing attention.

**(b) The claim we can cite it for.** That decentralised moderation in deployed federated systems is
**slow and unevenly resourced**, with a measured latency figure. This motivates low-cost, locally
enforceable moderation tools; it does not establish that immutable publish-then-attest labels are
sufficient or preferable to deletion or blocking.

**(c) Verbatim.** Abstract:

> We study the overhead of moderation on the administrators. We observe a diversity of administrator
> strategies, with evidence that administrators on larger instances struggle to find sufficient
> resources.

§1, main findings, item 2:

> This seems to impact moderation. For example, **it takes an average of 82.3 days for an
> administrator to impose a policy against an instance after it first encounters it, even for
> well-known and highly controversial ones (e.g. gab.com).**

**(d) Survives a national partition?** N/A — measurement source. The paper does not measure
moderation under network partition, so do not extrapolate the 82.3-day figure to that condition.

**(e) Verdict.** **Cite.** The paper's moderation position is currently argued from first principles
in `CLAUDE.md` §9 and only gestured at in `main.tex`. This gives it an empirical foundation, and it
is a top-tier venue.

### 6.2 Bluesky labelers — the deployed instance of "additive signed opinions"

**(c) Verbatim.** Balduf et al. §2:

> **(5) Labelers:** To facilitate content moderation, anybody can develop a Labeler which assigns
> labels (e.g. hate speech) to objects, including posts and accounts. **These can also be used locally
> by clients to decide content that should be filtered.**

This quote establishes labels and client-side filtering, not signatures. For the cryptographic
claim cite the AT Protocol Label specification, <https://atproto.com/specs/label>: service-to-service
label objects include a signature, while hydrated client responses may omit it. Accordingly, call
these **signed opinions** only when discussing the signed service representation.

**(e) Verdict.** **Cite** as concurrent, independently-arrived-at prior art for the labelling half of
publish-then-attest. **This is a claim of ours that is not novel and the paper should say so**, the
same way it already concedes content-addressing to Nostr and SSB. Being first to concede is cheaper
than being caught.

### 6.3 Tombstoning and redaction semantics

Already fully sourced in the companion file; nothing new was found in 2020–2026 peer-reviewed work
on redaction semantics for decentralised social networks. The three relevant primary positions are:
Activity Streams 2.0 defines a `Tombstone` type that Mastodon does not serve; Matrix redaction
preserves the event in the DAG with `sender`, `origin_server_ts`, `hashes` and `signatures`; and the
AT Protocol states that "record deletion is supported without leaving a trace or 'tombstone' of
previous contents." **`NOT FOUND`: peer-reviewed work analysing tombstone/redaction semantics as a
censorship-evidence mechanism.** Recorded in §11 — this may be a genuine gap and a defensible novelty
claim, but I could not prove a negative from the searches performed.

---

## 7. Sybil resistance and anti-abuse without identity

| Work | Venue · Year | Locator |
| --- | --- | --- |
| Davidson, Goldberg, Sullivan, Tankersley, Valsorda, *Privacy Pass* | PoPETs 2018(3), pp. 164–180 | DOI `10.1515/popets-2018-0026` — **already in `references.bib`** |
| Davidson, Iyengar, Wood, *The Privacy Pass Architecture* | **RFC 9576**, Informational, June 2024 | DOI `10.17487/RFC9576` |
| Pauly, Valdez, Wood, *The Privacy Pass HTTP Authentication Scheme* | **RFC 9577**, Informational, June 2024 | DOI `10.17487/RFC9577` |
| Celi, Davidson, Valdez, Wood, *Privacy Pass Issuance Protocols* | **RFC 9578**, Informational, June 2024 | DOI `10.17487/RFC9578` |
| Kaye, *Report of the Special Rapporteur … encryption, anonymity, and the human rights framework* | **UN Human Rights Council, A/HRC/29/32**, 22 May 2015 | <https://www.ohchr.org/en/documents/thematic-reports/ahrc2932-report-encryption-anonymity-and-human-rights-framework> |
| Dwork, Naor, *Pricing via Processing or Combatting Junk Mail* | CRYPTO '92, LNCS 740, pp. 139–147 | DOI `10.1007/3-540-48071-4_10` — **metadata only, full text not retrieved (§11)** |
| Chaum, *Blind Signatures for Untraceable Payments* | CRYPTO '82, pp. 199–203 | DOI `10.1007/978-1-4757-0602-4_18` — **metadata only, full text not retrieved (§11)** |

### 7.1 Privacy Pass RFCs — the 2024 work that supersedes the 2018 paper

**(b) The claim we can cite it for.** Two:
(i) the architecture separates *attestation* from *issuance* from *redemption*, which is the property
our design borrows;
(ii) the architecture defines four logical roles (Client, Origin, Attester, Issuer), permits roles to
be co-located, and separates fresh issuance from later redemption. Fresh issuance needs the configured
issuance deployment; cached compatible tokens may still be redeemed while an Issuer is unreachable.

**(c) Verbatim.** RFC 9576 §1:

> Instead of presenting linkable state-carrying information to servers, e.g., a cookie indicating
> whether or not the Client is an authorized user or has completed some prior challenge, Clients
> present unlinkable proofs that attest to this information. These proofs, or tokens, are private in
> the sense that a given token cannot be linked to the protocol interaction where that token was
> initially issued.

> At a high level, the Privacy Pass architecture consists of two protocols: redemption and issuance.
> The redemption protocol, described in [AUTHSCHEME], runs between Clients and Origins (servers). It
> allows Origins to challenge Clients to present tokens for consumption. Origins verify the token to
> authenticate the Client — without learning any specific information about the Client — and then make
> an authorization decision on the basis of the token verifying successfully or not.

RFC 9576 §3.1 step 3, the attestation step — note it is deployment-specific and can be a CAPTCHA, i.e. an
online interaction:

> Before issuance, the Client runs the deployment-specific attestation process that is required for
> the designated Issuer. Client attestation can be done via proof of solving a CAPTCHA, checking
> device or hardware attestation validity, etc.

RFC 9576 §6 is titled "Privacy Considerations" and includes §6.2 "Partitioning by Issuance
Consistency" — note that **"partitioning" in Privacy Pass means anonymity-set partitioning, not
network partition.** Do not conflate the two in the paper; a reviewer who knows the RFC will catch
it. **`NOT FOUND` in RFC 9576: any discussion of Issuer *availability* or behaviour when the Issuer
is unreachable.**

**(d) Survives a national partition?** **Fresh issuance is not guaranteed, and the RFC does not
consider the question.** New token issuance requires reaching the configured issuance deployment;
cached compatible tokens can be redeemed without a new issuance round. Key consistency requires a discovery mechanism
(`draft-ietf-privacypass-key-consistency`, cited as work-in-progress in RFC 9576 §9.2).

**(e) Verdict.** **Cite RFC 9576 alongside the existing `davidson2018privacypass`**, and use the
Issuer-availability gap as *support* for ADR-011's "cost is charged at origin" rule. The paper
currently asserts that anti-abuse secrets are "deliberately keyed to one node" without citing
anything; RFC 9576's three-party architecture is the citation.

### 7.2 "Requiring identity to stop spam is a censorship lever" — the primary source

The paper asserts this in §Adversary and Scope with **no citation**. A reviewer will ask. The
citable primary source is the UN Special Rapporteur's 2015 report.

**(c) Verbatim.** A/HRC/29/32, ¶47:

> Anonymity has been recognized for the important role it plays in safeguarding and advancing privacy,
> free expression, political accountability, public participation and debate. The Universal
> Declaration and the International Covenant on Civil and Political Rights do not address anonymity.
> During negotiation of the Covenant, it was proposed to include in article 19 (1) the phrase,
> "anonymity is not permitted". However, this was rejected "on the grounds, among others, that
> anonymity might at times be necessary to protect the author".

¶49:

> Prohibition of anonymity online interferes with the right to freedom of expression. Many States ban
> it regardless of any specific government interest.

**¶50 — the sentence that makes the paper's claim, in the source's own words:**

> Certain States have passed laws that require real-name registration for online activity, **a kind of
> ban on anonymity.** In the Russian Federation, bloggers with 3,000 or more daily readers must
> register with the media regulator and identify themselves publicly, and cybercafe users reportedly
> must provide identification to connect to public wireless facilities. China reportedly announced
> regulations requiring Internet users to register real names for certain websites and avoid spreading
> content that challenges national interests. South Africa also requires real name registration for
> online and mobile telephone users.

¶51 — and the mobile-specific form, which is directly relevant to a Bangladesh deployment:

> Likewise, Governments often require SIM card registration; for instance, nearly 50 countries in
> Africa require or are in the process of requiring the registration of personally identifiable data
> when activating a SIM card. … **Such policies directly undermine anonymity, particularly for those
> who access the Internet only through mobile technology. Compulsory SIM card registration may provide
> Governments with the capacity to monitor individuals and journalists well beyond any legitimate
> government interest.**

¶52 — states attack the tools too, which links §7 back to §4:

> States have also attempted to combat anonymity tools, such as Tor, proxies and VPNs, by denying
> access to them.

**(e) Verdict.** **Cite `unhrc2015anonymity`.** It converts the paper's most ideological-sounding
sentence into a sourced one, and ¶50's phrase "a kind of ban on anonymity" is precisely the lever
argument. Note honestly in the paper that this is a human-rights instrument, not a systems paper —
that is the right kind of source for a normative claim, and mislabelling it as a technical result
would be worse than not citing it.

### 7.3 Proof of work, blind signatures, rate-limiting nullifiers

- **Dwork & Naor (CRYPTO '92)** is the canonical origin of computational cost as an admission
  control. **I retrieved metadata only** (the Weizmann author page did not serve over TLS in this
  session). Cite for the idea; do **not** attribute a specific quotation to it.
- **Chaum (CRYPTO '82)** is the canonical blind signature. **Metadata only** — `chaum.com` returned
  404 for the PDF. Same caution.
- **Hashcash (Back)** — **not retrieved**, `hashcash.org` TLS failed. The paper does not currently
  cite it and does not need to; Dwork & Naor covers the concept and Privacy Pass covers the deployed
  form.
- **Rate-limiting nullifiers (RLN)** — **NOT FOUND as a stable primary specification.** The vac/PSE
  RFC path I tried returned 404. `CLAUDE.md` mentions "epoch nullifiers" as an implemented mechanism;
  if the paper names RLN it needs a specification URL I have not been able to supply. Recorded in
  §11. Safest course: describe the mechanism functionally ("epoch-scoped nullifiers bound the rate at
  which one credential may act") and cite nothing, rather than cite a moving GitHub file.

---

## 8. Transparency logs under partition

| Work | Venue · Year | Locator |
| --- | --- | --- |
| Laurie, Langley, Kasper, *Certificate Transparency* | RFC 6962, June 2013 | DOI `10.17487/RFC6962` — **already in `references.bib`** |
| Laurie, Messeri, Stradling, *Certificate Transparency Version 2.0* | **RFC 9162**, Experimental, December 2021 | DOI `10.17487/RFC9162` |
| Nordberg, Gillmor, Ritter, *Gossiping in CT* | IETF Internet-Draft `draft-ietf-trans-gossip-05`, January 2018 | <https://www.ietf.org/archive/id/draft-ietf-trans-gossip-05.txt> |
| Chuat et al.; Dahlberg & Pulls | CNS 2015; ARES 2018 | **already in `references.bib`** |

### 8.1 The consistency proof is a network round trip — sourced two ways

The paper's §Fork detection claims that resolving an ambiguous pair of tree heads "costs a round trip
to the peer whose reachability is already in doubt." That is currently asserted. Here it is, twice.

**RFC 9162 §5.3 ("Retrieve Merkle Consistency Proof between Two STHs"):**

> `GET <Base URL>/ct/v2/get-sth-consistency`
>
> Inputs:
>    `first`: The tree_size of the older tree, in decimal.
>    `second`: The tree_size of the newer tree, in decimal (optional).

**`draft-ietf-trans-gossip-05` §7, the auditor↔log interaction diagram — quoted verbatim:**

> ```
> #   Auditor                        Log
> [1] |--- get-sth ------------------->|
>     |<-- STH ------------------------|
> [2] |--- leaf hash + tree size ----->|
>     |<-- index + inclusion proof --->|
> [3] |--- tree size 1 + tree size 2 ->|
>     |<-- consistency proof ----------|
> ```

Step [3] *is* the round trip. Cite either; both is better.

### 8.2 What the gossip literature says to do when the proof cannot be fetched

**This is the finding that most strengthens the paper's §Fork contribution, and it should be quoted
rather than paraphrased.** The CT gossip draft anticipates the unfetchable-proof case — and its
answer is *another network round trip, to a further third party*.

`draft-ietf-trans-gossip-05` §11.1.2 ("Responding to possible blocking"):

> In some circumstances a client may have a piece of data that they have attempted to share (via SCT
> Feedback or STH Pollination), but have been unable to do so: with every attempt they receive an
> error. These situations are: … 2. The client has an STH, and attempts to resolve it to a newer STH
> via a consistency proof — but receives an error on every attempt.

> In the case of 1 or 2, it is conceivable that the reason for the errors is that the log acted
> improperly, either through malicious actions or compromise. **A proof may not be able to be fetched
> because it does not exist (and only errors or timeouts occur).**

> If an STH has attempted to be resolved to a newer STH via a consistency proof multiple times, and
> each time has failed, a client MAY share the STH with an **"Auditor of Last Resort"** even if the
> STH in question is no longer within the validity window. This auditor may be pre-configured in the
> client … **The Auditor of Last Resort itself represents a point of failure and privacy concerns**,
> so if implemented, it SHOULD connect using public key pinning and not consider an item delivered
> until it receives a confirmation.

The expired CT gossip draft proposes escalation to a further reachable party when consistency
proofs repeatedly fail. During a partition, signed timestamps can support a deterministic *local
display/tie-break policy* without another round trip, but they do **not** replace a Merkle
consistency proof: a malicious log chooses its timestamps and can sign incompatible heads with equal
or manipulated times. Timestamp ordering neither proves append-only consistency nor identifies the
honest branch. RFC 9162 leaves gossip as active research rather than standardising this draft.

### 8.3 A terminology trap the paper must avoid

**In the CT literature, "partitioning attack" means a log presenting a split view — an equivocation
attack — not a network partition.** `draft-ietf-trans-gossip-05` §2:

> When a log provides different views of the log to different clients this is described as a
> partitioning attack. Each client would be able to verify the append-only nature of the log but, in
> the extreme case, each client might see a unique view of the log.

The paper uses "partition" in the network sense throughout. **Add one clarifying clause the first
time the two meet in §Fork detection**, or a CT-literate reviewer will read the contribution as
confused. This is a cheap fix that prevents an expensive misreading.

---

## 9. Works currently cited that should be dropped or demoted

Read against the reframing, where the subject is a censorship-resistant public forum surviving
national partition and ISP islands, and mesh/DTN/radio is out of scope.

| Key | Current role in `main.tex` | Verdict under the reframing |
| --- | --- | --- |
| `fall2003dtn` | §Related Work ¶"Delay-tolerant networking"; §Introduction gap argument; capability table row | **Demote to one clause.** DTN is no longer a comparison peer once L4/L5 leave the foreground. Keep a single sentence acknowledging store-and-forward ancestry. Remove the table row. |
| `rfc9171` | Same paragraph; the "BPv7 covers our entire ladder" concession | **Drop from the table, keep at most in the out-of-scope sentence.** The ladder the paper now measures is L0–L3; a claim that BPv7 spans L0–L5 is no longer a concession the paper needs to make, and making it invites "why not just use BPv7?" |
| `rfc9172` | BPSec integrity argument | **Drop.** The BIB/HMAC nuance is excellent work (companion file §1.3) but it argues about *bundle* integrity, which the reframed paper no longer compares against. |
| `rfc9173` | Default security context is symmetric HMAC | **Drop**, same reason. |
| `gardnerstephen2011serval` | §Related Work ¶"Mesh messaging"; capability table row; "beats us on the lower rungs" | **Demote to the out-of-scope sentence.** Serval remains the best prior art for *serverless verification* and that one point is still worth a clause — but as a mesh system it is no longer the right comparison for a forum under ISP partition. |
| `albrecht2021bridgefy` | §Related Work; capability table row | **Drop entirely.** Bridgefy is a Bluetooth mesh messenger with no content model, no forum, no federation. Under the reframing it compares against nothing the paper claims. |
| `albrecht2022collective` | Cited for "broadcast messages were still unauthenticated in follow-up analysis" | **Drop — and note the defect independently of the reframing.** The bib entry is *Collective Information Security in Large-Scale Urban Protests: the Case of Hong Kong*, 30th USENIX Security Symposium, 2021. That is a qualitative study of protester security practices. **The finding the sentence attributes to it is from a different paper**: Albrecht, Eikenberg, Paterson, *Breaking Bridgefy, again: Adopting libsignal is not enough*, 31st USENIX Security Symposium, 2022, pp. 269–286, §4.2 — "Broadcast messages continued to be unauthenticated; an adversary can exploit this to mount impersonation attacks" (verbatim, per `NSYSS-2026-CAPABILITY-MATRIX-SOURCES.md` §3.3). If any Bridgefy content survives the cut, it must cite the 2022 paper. If Bridgefy is cut, this entry goes with it. |
| `signalx3dh` | §Related Work, deniability vs verifiability | **Drop.** It exists solely to qualify the Bridgefy claim. Without Bridgefy it has no referent. |
| `rfc8445`, `rfc8684` | §Introduction "mechanisms are not new"; §Related Work ¶"Path selection" | **Keep both.** ICE and MPTCP support the scope-preference argument, which is now *more* central, not less — it is how the system stays warm on the ISP-island path. |
| `activitystreams` | Tombstone cell justification | **Keep.** Moderation and tombstoning move up in importance under the reframing. |
| `ooni2024` | §Abstract, §Introduction | **Replace — the URL 404s.** Use the 2025-07-31 OONI/Digitally Right report (§3.1). |

**The single out-of-scope sentence I would write**, placed at the end of Related Work:

> A separate literature addresses connectivity where no infrastructure exists at all — delay-tolerant
> networking [fall2003dtn], and mesh systems such as Serval, whose bundle identifier is itself the
> verification key. Those systems begin where ours ends, supply no content, identity or moderation
> model of the kind a public forum needs, and are out of scope here; our lowest measured rung is an
> ISP island rejoined by a bridging operator, not a bare radio link.

That keeps `fall2003dtn` and one clause of Serval credit, and drops five entries.

---

## 10. Proposed capability-comparison table rows

The current table compares against DTN, Serval, Bridgefy, ActivityPub, Matrix and AT Protocol. Under
the reframing, three of those (DTN, Serval, Bridgefy) compare against claims the paper no longer
makes, and two systems that genuinely belong (Nostr, SSB) are absent.

**Proposed modern row set: ActivityPub · Matrix · AT Protocol · Nostr · Secure Scuttlebutt · This work.**
After the second audit, **Netnews and FETHR must also be compared in Related Work**; add them to the
table only if the column definitions can be scored from RFC 5536/5537/3977 and FETHR §3 without
guessing. They are closer application-level ancestors than DTN, Serval, or Bridgefy.
Six rows, all of them signed-content public-posting systems, all with checkable specifications.

**Proposed columns**, dropping `L4–L5 span` (out of scope) and adding one that now carries weight:

`L0–L3 span` · `no inbound` · `signed at rest` · `verify w/o srv` · `no re-encode` · `log gossip` ·
`tombstone` · **`svr↔svr`** (does the specification define a server-to-server exchange at all?)

| System | L0–L3 | no inbound | signed at rest | verify w/o srv | no re-encode | log gossip | tombstone | svr↔svr | Source for the non-obvious cells |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ActivityPub | ◐ | ○ | ◐ | ○ | ○ | ○ | ◐ | ● | `signed at rest` ◐: authentication lives entirely in Appendix B, which opens "This section is non-normative" (companion §4.2). `L0–L3` ◐ and the fragility behind it: Raman et al. IMC 2019 — LCC "reduces from 92% of all users to 46% by outages in five ASes" (§5.1 above). `tombstone` ◐: AS2 defines the type; Mastodon serves no such object (companion §4.1, §4.3). |
| Matrix | ◐ | ○ | ● | ● | ○ | ○ | ● | ● | `no re-encode` ○: Matrix canonicalises at verification time (companion §5). `log gossip` ○: "exactly one hit across both documents, and it is about TLS" (companion §5.1). `tombstone` ●: the redaction algorithm preserves `event_id`, `sender`, `origin_server_ts`, `hashes`, `signatures`, `prev_events` (companion §5.3). |
| AT Protocol | ○ | ○ | ● | ○ | ● | ○ | ○ | ● | `verify w/o srv` ○: "That information must be fetched from the account's DID document" (companion §6.1) + `plc.directory` "is operated by Bluesky PBC" (Balduf et al. §2, §5.2 above). `tombstone` ○: "Record deletion is supported without leaving a trace" (companion §6.4). |
| Nostr | ◐ | ● | ● | ● | ◐ | ○ | ○ | **◐** | `signed at rest`/`verify w/o srv` ●: NIP-01 event `id` is SHA-256 over a strictly specified serialisation with a Schnorr signature (§2.1). `no inbound` ●: clients dial relays; nothing is pushed to a client. `no re-encode` ◐: NIP-01 mandates serialisation rules but does not require a receiver to *reject* a non-conforming re-encoding. **`svr↔svr` ◐: relay-to-relay sync exists only as NIP-77, marked `draft` `optional`** (§2.1). `log gossip` ○: `NOT FOUND` in NIP-01/NIP-77. |
| Secure Scuttlebutt | ◐ | ● | ● | ● | nf | ○ | ○ | ● | `L0–L3` ◐ **and better than us below it**: local UDP broadcast discovery means two peers on one segment replicate with no infrastructure (§2.2). `signed at rest` ●: hash-chained append-only feed, "once a message is posted it cannot be modified". `no re-encode` **nf**: the Protocol Guide specifies a signing encoding but I did not verify a normative rejection rule — do not score this ● or ○ without reading `ssb-validate`. `log gossip` ○: `NOT FOUND` on `gossip`/`tree head`/`transparency`. |
| **This work** | ● | ● | ● | ● | ● | ● | ● | ● | as currently evidenced in the paper |

**Three cells that cut against us, and the paper should say so, replacing the current four:**

1. **SSB beats us below L1.** Two SSB peers on one LAN replicate with zero infrastructure and zero
   configuration; our lowest *measured* rung needs a configured bridging operator. Say it in the same
   voice the paper currently uses for DTN.
2. **Nostr's `no inbound` is structurally simpler than ours.** Nostr clients never receive a push, so
   the CGNAT property we spend a subsection asserting is free in Nostr's architecture. We get more
   (server-to-server reach) but not more cheaply.
3. **ActivityPub, Matrix and atproto all define a real server-to-server protocol and we are late to
   it.** Our `svr↔svr` ● is table stakes for three of five peers, not a differentiator. What is
   differentiating is the *conjunction* of `svr↔svr` with `no inbound` and `log gossip` — which is
   the claim the paper should make, and the only column combination no row but ours holds.

**A note on the `L0–L3` column.** The current table scores this by reading specifications. With
Raman et al. in hand, the ActivityPub cell can now be justified by measurement instead — "five AS
outages halve the connected component" is a much harder cell to argue with than "the specification
assumes a named remote host." Consider adding the number to the caption.

---

## 11. Open questions / could not verify

Recorded so nobody re-searches them, and so nothing here gets quietly filled in by inference later.

1. **`main.tex` §1 claims a period "in which domestic connectivity returned while international
   transit did not."** **NOT FOUND in the OONI 2025 report.** The report supports that the broadband
   cut was executed *upstream at the ITC / submarine cable / IIG layer*, and that restoration was
   staged by sector. The domestic-survives-international-doesn't inference is plausible from that
   mechanism but is not stated. **Either rewrite the sentence to the mechanism the source states, or
   find a source that says it.** This is the highest-priority item in this list because it is a
   factual claim about Bangladesh in a paper being submitted in Bangladesh.

2. **Access Now #KeepItOn annual report — not retrieved.** Do not cite one you have not opened. The
   KeepItOn dataset's legitimacy is attested by Bischof et al. (SIGCOMM 2023) using it as a primary
   input; cite that instead if a dataset citation is needed.

3. **Padmanabhan et al., *A multi-perspective view of Internet censorship in Myanmar* (SIGCOMM FOCI
   2021) — metadata only.** It appears as [48] in the SIGCOMM'23 bibliography and is very likely the
   closest peer-reviewed methodological precedent for the OONI+IODA+Radar triangulation used in the
   Bangladesh report. **Worth 20 minutes to retrieve before submission** — if it does what I expect,
   it belongs in §3.

4. **Riffle (PoPETs 2016) and Talek (USENIX ATC 2020) — not retrieved.** Grouped with Riposte on
   family resemblance only. Do not cite either for a specific technical claim without reading them.

5. **Aether — COULD NOT VERIFY, and I recommend not citing it.** The `aethereans/aether-app` README
   is the only primary artefact I reached, and it contains no protocol description. It does contain,
   verbatim: *"This is a developer preview, a pre-alpha. It is unstable and untested. It is not
   production-ready."* Searches for a technical specification returned several unrelated projects
   also named Aether. **There is no specification against which capability-table cells could be
   checked**, so it must not appear in the table, and a Related Work mention would rest on nothing.

6. **Rate-limiting nullifiers — no stable primary specification located.** The vac/PSE RFC path
   returned 404. If the paper names RLN it needs a URL I could not supply. Describe the mechanism
   functionally instead.

7. **Dwork & Naor (CRYPTO '92), Chaum (CRYPTO '82), Back (Hashcash) — metadata only.** All three
   fetches failed on TLS or 404. Cite Dwork & Naor and Chaum for the *ideas* (their attribution is
   not in dispute) but attribute no quotation to them from this file.

8. **SSB `no re-encode` cell is `nf` and I could not resolve it.** The Protocol Guide specifies a
   signing encoding; whether a conforming implementation *rejects* a re-serialised message or
   normalises it requires reading `ssb-validate`, which I did not do. Scoring this cell either way
   without that read would be a guess.

9. **No 2020–2026 successor to the Publius/Tangler/Free Haven line was located.** I searched ACM DL,
   USENIX and PETS listings via general search rather than exhaustively browsing proceedings. The
   absence is probably real — the field moved to circumvention and to federated social — but **it is
   a negative result from a non-exhaustive search** and the paper should not claim "no subsequent
   work exists."

10. **No peer-reviewed work on tombstone/redaction semantics as a censorship-evidence mechanism was
    found.** Same caveat as item 9: this may be a genuine gap and therefore a defensible novelty
    claim, or it may be a search failure. If the paper wants to claim novelty here, spend the time to
    make the search exhaustive first.

11. **Freenet's behaviour under network partition is `NOT FOUND` in the paper**, not "○". The words
    `partition`, `disconnect` and `fragment` do not appear in the LNCS text. Score it `nf` and say
    the specification is silent; do not assert that Freenet fails.

12. **The first pass omitted Netnews/Usenet, FETHR, GhostPost, twister and #h00t.** These are now
    recorded in §13. Netnews and FETHR are closer architectural comparisons than the removed
    mesh/DTN rows; GhostPost is direct prior work on preserving deleted social-media posts.

---

## 12. Recommended citation set for the reframed paper

BibTeX below matches the existing `references.bib` conventions exactly: key is
`lastname` + `year` + `shortword` for papers, a bare slug for specifications and standing documents;
`@techreport` with `number` + `institution` + `doi` for RFCs; `@misc` with `howpublished` + `note` +
`\url{}` for web specifications; braces around acronyms and proper nouns to protect capitalisation.

### 12.1 Add — censorship-resistant publishing (§1)

```bibtex
@inproceedings{anderson1996eternity,
  author    = {Anderson, Ross J.},
  title     = {The Eternity Service},
  booktitle = {Proceedings of the 1st International Conference on the Theory
               and Applications of Cryptology (Pragocrypt)},
  pages     = {242--252},
  year      = {1996}
}

@inproceedings{waldman2000publius,
  author    = {Waldman, Marc and Rubin, Aviel D. and Cranor, Lorrie Faith},
  title     = {Publius: A Robust, Tamper-Evident, Censorship-Resistant Web
               Publishing System},
  booktitle = {Proceedings of the 9th {USENIX} Security Symposium},
  pages     = {59--72},
  year      = {2000}
}

@inproceedings{clarke2001freenet,
  author    = {Clarke, Ian and Sandberg, Oskar and Wiley, Brandon and
               Hong, Theodore W.},
  title     = {Freenet: A Distributed Anonymous Information Storage and
               Retrieval System},
  booktitle = {Designing Privacy Enhancing Technologies},
  series    = {Lecture Notes in Computer Science},
  volume    = {2009},
  pages     = {46--66},
  year      = {2001},
  doi       = {10.1007/3-540-44702-4_4}
}

@inproceedings{dingledine2001freehaven,
  author    = {Dingledine, Roger and Freedman, Michael J. and Molnar, David},
  title     = {The Free Haven Project: Distributed Anonymous Storage Service},
  booktitle = {Designing Privacy Enhancing Technologies},
  series    = {Lecture Notes in Computer Science},
  volume    = {2009},
  pages     = {67--95},
  year      = {2001},
  doi       = {10.1007/3-540-44702-4_5}
}

@inproceedings{waldman2001tangler,
  author    = {Waldman, Marc and Mazi{\`e}res, David},
  title     = {Tangler: A Censorship-Resistant Publishing System Based on
               Document Entanglements},
  booktitle = {Proceedings of the 8th {ACM} Conference on Computer and
               Communications Security (CCS)},
  pages     = {126--135},
  year      = {2001},
  doi       = {10.1145/501983.502002}
}
```

### 12.2 Add — shutdown measurement (§3)

```bibtex
@misc{ooni2025bangladesh,
  author       = {Raso, Tohidul Islam and Afrin, Suhadha and
                  Chowdhury, Miraj Ahmed and Xynou, Maria and
                  Yachmeneva, Elizaveta},
  title        = {The Longest Silence: Internet Shutdowns During
                  {Bangladesh}'s 2024 Uprising},
  howpublished = {Digitally Right and Open Observatory of Network Interference},
  year         = {2025},
  note         = {\url{https://ooni.org/post/2025-bangladesh-report/}}
}

@misc{belson2024disruptions,
  author       = {Belson, David},
  title        = {A Recent Spate of Internet Disruptions},
  howpublished = {Cloudflare Radar},
  year         = {2024},
  note         = {\url{https://blog.cloudflare.com/a-recent-spate-of-internet-disruptions-july-2024}}
}

@inproceedings{bischof2023shutdowns,
  author    = {Bischof, Zachary S. and Pitcher, Kennedy and
               Carisimo, Esteban and Meng, Amanda and
               Nunes, Rafael Bezerra and Padmanabhan, Ramakrishna and
               Roberts, Margaret E. and Snoeren, Alex C. and
               Dainotti, Alberto},
  title     = {Destination Unreachable: Characterizing Internet Outages and
               Shutdowns},
  booktitle = {Proceedings of the {ACM} {SIGCOMM} 2023 Conference},
  pages     = {608--621},
  year      = {2023},
  doi       = {10.1145/3603269.3604883}
}
```

> **Note on `bischof2023shutdowns` page numbers.** The ACM Reference Format string inside the PDF
> gives "14 pages" and the DOI but not a page range; `608--621` is the range listed by ACM DL for the
> proceedings entry. **Verify against ACM DL before submission**, or drop the `pages` field — the
> `.bst` renders correctly without it.

### 12.3 Add — circumvention reachability assumptions (§4)

```bibtex
@techreport{torblocking2006,
  author      = {Dingledine, Roger and Mathewson, Nick},
  title       = {Design of a Blocking-Resistant Anonymity System},
  number      = {2006-11-001},
  institution = {The Tor Project},
  year        = {2006},
  note        = {\url{https://svn.torproject.org/svn/projects/design-paper/blocking.pdf}}
}

@article{fifield2015fronting,
  author  = {Fifield, David and Lan, Chang and Hynes, Rod and
             Wegmann, Percy and Paxson, Vern},
  title   = {Blocking-Resistant Communication Through Domain Fronting},
  journal = {Proceedings on Privacy Enhancing Technologies},
  volume  = {2015},
  number  = {2},
  pages   = {46--64},
  year    = {2015},
  doi     = {10.1515/popets-2015-0009}
}

@inproceedings{wustrow2011telex,
  author    = {Wustrow, Eric and Wolchok, Scott and Goldberg, Ian and
               Halderman, J. Alex},
  title     = {Telex: Anticensorship in the Network Infrastructure},
  booktitle = {Proceedings of the 20th {USENIX} Security Symposium},
  year      = {2011}
}

@inproceedings{bocovich2024snowflake,
  author    = {Bocovich, Cecylia and Breault, Arlo and Fifield, David and
               Serene and Wang, Xiaokang},
  title     = {Snowflake, a Censorship Circumvention System Using Temporary
               {WebRTC} Proxies},
  booktitle = {Proceedings of the 33rd {USENIX} Security Symposium},
  pages     = {2635--2652},
  year      = {2024}
}
```

> **Note on `bocovich2024snowflake`.** The author list on the PDF is alphabetical and includes a
> mononymous author, "Serene". The entry above reproduces that. `pages` is taken from the USENIX
> proceedings listing — **verify or omit.**

### 12.4 Add — federated systems, measured (§5, §6)

```bibtex
@inproceedings{raman2019mastodon,
  author    = {Raman, Aravindh and Joglekar, Sagar and
               De Cristofaro, Emiliano and Sastry, Nishanth and
               Tyson, Gareth},
  title     = {Challenges in the Decentralised Web: The {Mastodon} Case},
  booktitle = {Proceedings of the Internet Measurement Conference (IMC)},
  pages     = {217--229},
  year      = {2019},
  doi       = {10.1145/3355369.3355572}
}

@inproceedings{balduf2024bluesky,
  author    = {Balduf, Leonhard and Sokoto, Saidu and Ascigil, Onur and
               Tyson, Gareth and Scheuermann, Bj{\"o}rn and
               Korczy{\'n}ski, Maciej and Castro, Ignacio and Kr{\'o}l, Micha{\l}},
  title     = {Looking {AT} the Blue Skies of {Bluesky}},
  booktitle = {Proceedings of the 2024 {ACM} on Internet Measurement
               Conference (IMC)},
  pages     = {76--91},
  year      = {2024},
  doi       = {10.1145/3646547.3688407}
}

@inproceedings{albrecht2023matrix,
  author    = {Albrecht, Martin R. and Celi, Sof{\'\i}a and
               Dowling, Benjamin and Jones, Daniel},
  title     = {Practically-Exploitable Cryptographic Vulnerabilities in
               {Matrix}},
  booktitle = {2023 {IEEE} Symposium on Security and Privacy (SP)},
  pages     = {164--181},
  year      = {2023},
  doi       = {10.1109/SP46215.2023.10351027}
}

@inproceedings{anaobi2023moderation,
  author    = {Anaobi, Ishaku Hassan and Raman, Aravindh and
               Castro, Ignacio and Zia, Haris Bin and
               Ibosiola, Damilola and Tyson, Gareth},
  title     = {Will Admins Cope? Decentralized Moderation in the Fediverse},
  booktitle = {Proceedings of the {ACM} Web Conference 2023 (WWW)},
  pages     = {3109--3120},
  year      = {2023},
  doi       = {10.1145/3543507.3583487}
}
```

### 12.5 Add — pseudonymous forum systems (§2)

```bibtex
@misc{nostrnip77,
  author       = {{Nostr Protocol}},
  title        = {{NIP-77}: Negentropy Syncing},
  year         = {2026},
  note         = {\url{https://github.com/nostr-protocol/nips/blob/master/77.md}}
}

@misc{ssbprotocolguide,
  author       = {{Secure Scuttlebutt Consortium}},
  title        = {{Scuttlebutt} Protocol Guide},
  year         = {2026},
  note         = {\url{https://ssbc.github.io/scuttlebutt-protocol-guide/}}
}

@inproceedings{corrigangibbs2015riposte,
  author    = {Corrigan-Gibbs, Henry and Boneh, Dan and Mazi{\`e}res, David},
  title     = {Riposte: An Anonymous Messaging System Handling Millions of
               Users},
  booktitle = {2015 {IEEE} Symposium on Security and Privacy (SP)},
  pages     = {321--338},
  year      = {2015},
  doi       = {10.1109/SP.2015.27}
}
```

`nostr` and `tarr2019ssb` are already in `references.bib` and stay.

### 12.6 Add — anti-abuse and transparency (§7, §8)

```bibtex
@techreport{rfc9576,
  author      = {Davidson, Alex and Iyengar, Jana and Wood, Christopher A.},
  title       = {The Privacy Pass Architecture},
  number      = {RFC 9576},
  institution = {Internet Engineering Task Force},
  year        = {2024},
  doi         = {10.17487/RFC9576}
}

@techreport{rfc9162,
  author      = {Laurie, Ben and Messeri, Eran and Stradling, Rob},
  title       = {Certificate Transparency Version 2.0},
  number      = {RFC 9162},
  institution = {Internet Engineering Task Force},
  year        = {2021},
  doi         = {10.17487/RFC9162}
}

@misc{nordberg2018ctgossip,
  author       = {Nordberg, Linus and Gillmor, Daniel Kahn and Ritter, Tom},
  title        = {Gossiping in {CT}},
  howpublished = {Internet-Draft draft-ietf-trans-gossip-05,
                  Internet Engineering Task Force},
  year         = {2018},
  note         = {\url{https://datatracker.ietf.org/doc/draft-ietf-trans-gossip/05/}}
}

@techreport{unhrc2015anonymity,
  author      = {Kaye, David},
  title       = {Report of the {Special Rapporteur} on the Promotion and
                 Protection of the Right to Freedom of Opinion and
                 Expression},
  number      = {A/HRC/29/32},
  institution = {United Nations Human Rights Council},
  year        = {2015},
  note        = {\url{https://www.ohchr.org/en/documents/thematic-reports/ahrc2932-report-encryption-anonymity-and-human-rights-framework}}
}

@inproceedings{dworknaor1993pricing,
  author    = {Dwork, Cynthia and Naor, Moni},
  title     = {Pricing via Processing or Combatting Junk Mail},
  booktitle = {Advances in Cryptology --- {CRYPTO} '92},
  series    = {Lecture Notes in Computer Science},
  volume    = {740},
  pages     = {139--147},
  year      = {1993},
  doi       = {10.1007/3-540-48071-4_10}
}

@inproceedings{chaum1983blind,
  author    = {Chaum, David},
  title     = {Blind Signatures for Untraceable Payments},
  booktitle = {Advances in Cryptology --- {CRYPTO} '82},
  pages     = {199--203},
  year      = {1983},
  doi       = {10.1007/978-1-4757-0602-4_18}
}
```

### 12.7 Remove

`fall2003dtn` (demote to one clause — keep the entry, cut the paragraph and the table row),
`rfc9171`, `rfc9172`, `rfc9173`, `albrecht2021bridgefy`, `albrecht2022collective`, `signalx3dh`,
`ooni2024`. `gardnerstephen2011serval` may stay if the out-of-scope sentence in §9 is used verbatim;
otherwise remove it too.

### 12.8 Net effect on the bibliography

The first-pass arithmetic was 24 entries, minus 7 and plus 22, for 39. Section 13 identifies
additional missing work, so **39 is no longer a final target count**. This is a large bibliography for a
conference paper, but every added entry either (a) replaces an argument the paper currently makes
without a citation, or (b) replaces a mesh/DTN citation that no longer refers to anything the paper
claims. If space forces a cut, the first-pass minimum was:
`waldman2001tangler`, `waldman2000publius`, `ooni2025bangladesh`, `bischof2023shutdowns`,
`torblocking2006`, `wustrow2011telex`, `fifield2015fronting`, `raman2019mastodon`,
`nordberg2018ctgossip`, `unhrc2015anonymity`. After the audit, add at least `rfc5537`,
`sandler2009fethr`, `douglas2016ghostpost`, and `rao2000pseudonymity`; they cover the closest forum
ancestor, signed federated micropublishing, deletion restoration, and content deanonymisation.

---

## 13. Audit addendum: missing closest prior art and threat coverage

This addendum records material omissions found in a second primary-source audit. It also narrows the
paper's defensible headline claim:

> **Supported claim:** the system continues serving and accepting locally reachable content within
> surviving domestic components. Cross-component propagation resumes, or crosses the cut, only when
> at least one authorised bridge can reach both sides and the required content/identity state is
> already available.

Federation, signatures, and multi-homing do not create connectivity. They preserve useful operation
over paths and replicas that still exist.

### 13.1 Netnews/Usenet — the missing historical baseline

| Work | Status | Locator |
| --- | --- | --- |
| Allbery & Lindsey, *Netnews Architecture and Protocols* | IETF Standards Track, RFC 5537 (2009) | <https://www.rfc-editor.org/rfc/rfc5537.html> |
| Feather, *Network News Transfer Protocol* | IETF Standards Track, RFC 3977 (2006) | <https://www.rfc-editor.org/rfc/rfc3977.html> |
| Murchison et al., *Netnews Article Format* | IETF Standards Track, RFC 5536 (2009) | <https://www.rfc-editor.org/rfc/rfc5536.html> |
| Baeuerle, *Cancel-Locks in Netnews Articles* | IETF Standards Track, RFC 8315 (2018) | <https://www.rfc-editor.org/rfc/rfc8315.html> |

**Why it belongs.** RFC 5537 §1.1 defines topic-grouped public discussion whose articles are flooded
through participating servers. §1.5 defines separate injecting, relaying, serving, posting, reading,
moderator and gateway roles. §3.1 makes acceptance a local-policy decision: *"No Netnews agent is
ever required to accept any article."* RFC 3977 §6.3.2 says a dropped connection or timeout during
transfer is treated as retryable. This is federated, store-and-forward forum infrastructure decades
before ActivityPub.

**Security gap.** RFC 5536 §5 says the base article format provides no confidentiality, sender
authentication, or non-repudiation. It also warns that predictable Message-IDs permit pre-emption of
an article. RFC 8315 authenticates cancellation authority, not the article as a whole. Thus Netnews
is the closest application/replication baseline, while this work's signed content and transparency
evidence are the differentiators.

**Partition verdict.** **Conditional, not guaranteed.** Readers can continue with servers and
articles already reachable in their component; RFC 5537 provides no partition-local replica
placement or multi-ISP bridge invariant. Compare it in prose and, if space allows, in the capability
table.

```bibtex
@techreport{rfc5537,
  author      = {Allbery, Russ and Lindsey, Charles H.},
  title       = {Netnews Architecture and Protocols},
  number      = {RFC 5537},
  institution = {Internet Engineering Task Force},
  year        = {2009},
  doi         = {10.17487/RFC5537}
}

@techreport{rfc3977,
  author      = {Feather, Clive D. W.},
  title       = {Network News Transfer Protocol ({NNTP})},
  number      = {RFC 3977},
  institution = {Internet Engineering Task Force},
  year        = {2006},
  doi         = {10.17487/RFC3977}
}

@techreport{rfc5536,
  author      = {Murchison, Kenneth and Lindsey, Charles H. and Kohn, Dan},
  title       = {Netnews Article Format},
  number      = {RFC 5536},
  institution = {Internet Engineering Task Force},
  year        = {2009},
  doi         = {10.17487/RFC5536}
}

@techreport{rfc8315,
  author      = {Baeuerle, Michael},
  title       = {Cancel-Locks in Netnews Articles},
  number      = {RFC 8315},
  institution = {Internet Engineering Task Force},
  year        = {2018},
  doi         = {10.17487/RFC8315}
}
```

### 13.2 FETHR, GhostPost, twister and #h00t

| Work | What the primary source establishes | Relevance / limit |
| --- | --- | --- |
| Sandler & Wallach, *Birds of a FETHR* (IPTPS 2009), <https://www.usenix.org/conference/iptps-09/birds-fethr-open-decentralized-micropublishing> | §3 requires decentralisation, independent verification of authenticity/integrity/completeness, signed updates, subscriber gossip, hash-chain gap detection, and explicit reply links. | Very close prior art for signed federated social posts and suppression evidence. Canonical publisher URLs and a global HTTP ecosystem provide no national-partition guarantee. |
| Douglas & Caesar, *GhostPost* (FOCI 2016), <https://www.usenix.org/conference/foci16/workshop-program/presentation/douglas> | A distributed system that restores posts deleted from social media; its simulations preserve a majority of desired posts after censor deletion in an established deployment. | Direct prior work for the deletion threat. Unlike an audit receipt alone, it aims to restore readable content. It does not solve loss of all paths among observers. |
| Freitas, *twister — a P2P microblogging platform* (2013), <https://arxiv.org/abs/1312.7152> | Bitcoin-derived user registration/authentication, DHT resource storage, BitTorrent-style follower swarms, and proof-of-work incentives/admission. | The closest match to "Bitcoin-like identity + PoW + public posts"; it must be discussed even if excluded from the final table. DHT peer placement and bootstrap reachability make partition survival conditional. |
| Bachrach et al., *#h00t* (2011), <https://arxiv.org/abs/1109.6874> | Short deliberate hash collisions and group-derived encryption make keyword-selective filtering impose collateral damage. | Handles content-selective censorship on an existing carrier, not a national loss of reachability to that carrier. |

Ready-to-paste entries:

```bibtex
@inproceedings{sandler2009fethr,
  author    = {Sandler, Daniel R. and Wallach, Dan S.},
  title     = {Birds of a {FETHR}: Open, Decentralized Micropublishing},
  booktitle = {8th International Workshop on Peer-to-Peer Systems (IPTPS)},
  year      = {2009},
  note      = {\url{https://www.usenix.org/conference/iptps-09/birds-fethr-open-decentralized-micropublishing}}
}

@inproceedings{douglas2016ghostpost,
  author    = {Douglas, Frederick and Caesar, Matthew},
  title     = {{GhostPost}: Seamless Restoration of Censored Social Media Posts},
  booktitle = {6th {USENIX} Workshop on Free and Open Communications on the Internet (FOCI)},
  year      = {2016},
  note      = {\url{https://www.usenix.org/conference/foci16/workshop-program/presentation/douglas}}
}

@misc{freitas2013twister,
  author       = {Freitas, Miguel},
  title        = {twister: A {P2P} Microblogging Platform},
  year         = {2013},
  howpublished = {arXiv:1312.7152},
  note         = {\url{https://arxiv.org/abs/1312.7152}}
}

@misc{bachrach2011h00t,
  author       = {Bachrach, Dustin and Nunu, Christopher and Wallach, Dan S. and Wright, Matthew},
  title        = {{\#h00t}: Censorship Resistant Microblogging},
  year         = {2011},
  howpublished = {arXiv:1109.6874},
  note         = {\url{https://arxiv.org/abs/1109.6874}}
}
```

### 13.3 Threats the anonymity claim must cover or explicitly exclude

| Threat | Primary evidence | What the design does / does not establish |
| --- | --- | --- |
| End-to-end timing/volume correlation; global or ISP-level observation | Dingledine, Mathewson, Syverson, *Tor: The Second-Generation Onion Router*, §3.1 and §7, <https://svn-archive.torproject.org/svn/projects/design-paper/tor-design.html> | Tor states that practical low-latency systems do not defeat a global passive adversary and that observing both ends enables confirmation. Optional Tor improves network-layer unlinkability only within Tor's threat model. A state able to observe client access and bridge egress remains a deanonymisation threat. |
| Stylometry and content-based identity leakage | Rao & Rohatgi, *Can Pseudonymity Really Guarantee Privacy?*, USENIX Security 2000, <https://www.usenix.org/conference/9th-usenix-security-symposium/can-pseudonymity-really-guarantee-privacy> | No-email public-key identities prevent account-database disclosure; they do not stop linguistic/stylometric linkage. Call the base system **pseudonymous**, not unqualified anonymous, and state that content anonymity is unsolved. |
| Sybil/eclipse/route capture | Castro et al., *Secure Routing for Structured P2P Overlay Networks*, OSDI 2002, §3.1–3.3, <https://www.usenix.org/legacy/publications/library/proceedings/osdi02/tech/full_papers/castro/castro_html/> | The paper shows that a small malicious set can mediate a victim or control replicas, and that puzzles only moderate acquisition because difficulty must remain tolerable for slow honest nodes. PoW/epochs raise spam cost but do not by themselves defeat a well-resourced state, compromised seeds, or targeted eclipse. |
| Censor deletes already-published posts | Douglas & Caesar, GhostPost, above | Content hashes expose modification, and receipts prove prior observation; neither alone restores deleted content. Federation/backfill resists deletion only if another reachable replica retained the bytes. GhostPost is the direct comparison. |
| Bridge discovery, coercion, seizure, and targeted DoS | Hasan et al., *Building Dissent Networks*, FOCI 2013, <https://www.usenix.org/conference/foci13/workshop-program/presentation/hasan> | The paper makes user safety, innocuous components, blackout resilience, and meaningful scale joint requirements. This work deliberately excludes mesh/off-grid links, but its ISP bridge is identifiable infrastructure and therefore a coercion/chokepoint target. Multiple independently operated bridges, pre-positioned peer state, quotas and failover mitigate availability; they do not make the operator anonymous or legally immune. |
| Moderation labour and delayed response | Anaobi et al., WWW 2023, §1, DOI `10.1145/3543507.3583487` | Local policy and portable clients distribute authority, but volunteer overload remains. The measurement motivates assistance and locally enforceable controls; it does not validate immutable labels as a complete remedy. |
| Harmful content spreads; signatures authenticate falsehoods | Anaobi et al. introduction; FETHR §3.4 | A valid signature proves origin and integrity, not truth, legality, or safety. Open policies and signed moderation actions improve accountability, while spam, brigading, disinformation, harassment, and illegal-content retention remain governance threats. |
| Defederation fragments the audience and context | RFC 5537 §3.1 local rejection; Anaobi et al. federation policies | Server choice preserves access only to content reachable from the chosen server. Divergent blocklists can create incompatible community views; migration is not a proof that social ties, moderation history, or the full conversation remain portable. |

```bibtex
@inproceedings{rao2000pseudonymity,
  author    = {Rao, Josyula R. and Rohatgi, Pankaj},
  title     = {Can Pseudonymity Really Guarantee Privacy?},
  booktitle = {Proceedings of the 9th {USENIX} Security Symposium},
  year      = {2000},
  note      = {\url{https://www.usenix.org/conference/9th-usenix-security-symposium/can-pseudonymity-really-guarantee-privacy}}
}
```

### 13.4 Scope citation for deliberately excluding mesh/off-grid communication

Hasan et al. is the right citation for the boundary, not a long mesh comparison. Its abstract argues
that mesh proposals face scaling and user-safety problems; §2 also states that Tor, VPNs and proxies
assume underlying connectivity and therefore provide no blackout resistance. Cite it to distinguish:

- **this work:** application continuity on surviving ISP infrastructure plus authorised multi-homed
  bridging; from local service within a reachable component through inter-ISP exchange where a bridge
  retains both paths;
- **out of scope:** creating a replacement last-mile/physical network when no IP path exists (mesh,
  LoRa, Bluetooth, Reticulum, sneakernet, satellite, or off-grid radio).

```bibtex
@inproceedings{hasan2013dissent,
  author    = {Hasan, Shaddi and Ben-David, Yahel and Fanti, Giulia and
               Brewer, Eric and Shenker, Scott},
  title     = {Building Dissent Networks: Towards Effective Countermeasures
               against Large-Scale Communications Blackouts},
  booktitle = {3rd {USENIX} Workshop on Free and Open Communications on the Internet (FOCI)},
  year      = {2013},
  note      = {\url{https://www.usenix.org/conference/foci13/workshop-program/presentation/hasan}}
}
```
