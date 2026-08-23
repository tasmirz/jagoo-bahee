# Detailed Literature Review and Research-Gap Analysis

## Partition-Resilient Federation Across Surviving ISP Islands

## 1. Purpose and scope

This review develops the literature basis for the Jagoo Bahee paper. It is intended as a
source document from which a shorter related-work and research-gap section can later be
derived. It therefore does three things in detail:

1. establishes the precise systems problem addressed by this project;
2. studies the ten locally collected papers in terms of their threat model, architecture,
   security properties, evaluation evidence, and limitations; and
3. identifies the gap that the implemented and evaluated project addresses, without claiming
   novelty for mechanisms that are already well known.

The primary corpus is the ten papers in `related-papers/`. All ten were read as full papers.
The two project drafts, the implementation, and the two supplied research reports were used to
keep the comparison aligned with what the system actually implements and what the current
evaluation can support. Additional work from `paper/references.bib` and the reports is used as
context where it defines the operating condition, conventional federation, circumvention, or
transparency mechanisms. Those contextual works should not be confused with the ten-paper
deep-read corpus.

This is a focused review, not a claim that every paper on decentralized social networks,
delay-tolerant networking, censorship circumvention, or Internet-outage measurement has been
surveyed. Accordingly, the strongest defensible gap formulation is "not jointly addressed in
the reviewed systems and adjacent literature," not "the first system ever."

## 2. The project problem, stated precisely

The two draft papers describe overlapping but differently scoped projects. The broader draft,
`paper/main.tex`, presents a censorship-resistant federated forum with author-signed objects,
anti-abuse admission, additive moderation, transparency receipts, multiple transports, and
partition-aware federation. The narrower IEEE draft,
`ieee paper/IEEE-conference-template-062824/iccit2026-paper.tex`, makes the more defensible
central claim: conventional server federation stops when servers become mutually unreachable,
yet a national shutdown does not necessarily eliminate every domestic IP path. The project
asks whether federation can continue over those surviving components and whether a normal
multi-homed, verifying node can reconnect otherwise separated ISP-local components.

The core research question is therefore:

> Given at least one surviving domestic IP path, can independently operated public-discussion
> servers continue to exchange author-authenticated objects after global transit or direct
> inter-ISP reachability is removed, including when a node cannot accept inbound connections;
> and can a source-bound, multi-homed validating server restore exchange between separated
> ISP-local components with bounded relay resource use?

This question is deliberately conditional. The system does not create a physical path where
none exists. Its operating regimes are:

- **R0 - global reachability:** servers have ordinary global Internet connectivity.
- **R1 - domestic reachability after external transit loss:** domestic servers can still reach
  each other even though external destinations are unavailable.
- **R2 - separated ISP-local components:** servers within each component communicate, but
  there is no direct route between components.
- **R3 - bridged recovery:** a deliberately configured multi-homed server has one surviving
  path into each component and relays validated objects between them. R3 is a recovery
  mechanism, not a more severe failure level.

The word _island_ needs careful handling. Baltra et al. use _island_ for public addresses that
are partitioned from the Internet core but remain mutually connected. This project additionally
uses _ISP island_ for components that may be separated from one another. The paper should
define this local use explicitly and avoid implying that the measurement literature uses the
same finer-grained taxonomy.

### 2.1 Implemented mechanism under review

The code supports the following description of the system:

- Each content object has strictly parsed canonical bytes, a content-derived identifier, and
  an author signature. The receiver validates version, domain, plane, size, algorithm, time,
  signature, key status, replay status, authorization, body semantics, and storage constraints.
- Locally submitted and federated objects converge on the same admission pipeline. Federation
  does not turn peer trust into validity. A federated object skips the origin node's local
  payment step because that payment credential is node-local, but it is still parsed,
  authenticated, authorized, validated, deduplicated, stored, projected, and witnessed.
- Relays preserve the stored raw bytes instead of decoding and re-encoding a signed object.
  This prevents an intermediate encoder from silently changing the byte string covered by the
  author's signature.
- A durable outbox, receiver-initiated live stream, and requested backfill allow a node to both
  send and receive through connections that it initiated. Such a node needs no public listening
  port, port forwarding, or inbound connection through carrier-grade NAT.
- Endpoints carry reachability scopes. Path selection prefers the narrowest usable endpoint and
  can bind an outbound gRPC socket to a selected uplink's source address. This binding is
  essential on a bridge: without it, the operating system's default route can collapse both
  logical sides onto one interface.
- The bridge is an ordinary federating server plus cross-uplink policy. It receives an object
  through the normal validating pipeline, never returns it through the incoming uplink, and
  relays it only across configured uplink pairs and allowed priority classes. Per-pair,
  per-class envelope and byte buckets bound resource use; bulk traffic receives at most half
  the grant so higher-priority traffic retains capacity.
- Peer trust controls eligibility, accepted classes, and quotas. It does not authorize a peer
  to inject invalid content.
- Outbox delivery is isolated per peer/plane group. The implementation drains groups
  concurrently and places a scheduler deadline around each delivery attempt. This corrects an
  observed head-of-line failure in which a blackholed peer delayed every healthy peer in a
  serial drain.

### 2.2 Evidence currently available

The project has stronger mechanism evidence than deployment evidence:

- a four-node, multi-network container gate passed 19 of 19 checks for separation, uplink
  selection, source binding, bridge policy, quotas, crossing, and failover;
- after the simulated exchange route was removed, an author certificate, community object, and
  dependent post crossed at 0.5 s, 1.2 s, and 2.1 s respectively;
- the initial serial outbox implementation produced a 407.6 s post-cut crossing because it
  waited on a blackholed peer; concurrent per-peer draining reduced the same final crossing to
  2.1 s;
- in an eight-node chain, all 200 paced samples reached hop seven, with 4.125 s median and
  6.115 s p99 end-to-end latency; and
- the broader test inventory verifies canonicalization, signatures, replay handling, byte
  preservation, federation, bridge policy, and cross-language vectors.

These results demonstrate mechanism feasibility under controlled route removal. They are not
evidence of operation during a real national shutdown, of real inter-AS forwarding behavior,
of resistance to protocol whitelisting or DPI, or of Internet-scale performance. All containers
also ran on one physical host; logically separate services sometimes shared the same physical
database and cache processes. The literature comparison must retain that boundary.

### 2.3 Claim-to-implementation traceability

The following map separates implemented behavior from claims that appear only in prose. It is
also a guide to the evidence that should be cited or described when the compact paper is revised.

| Project property                                     | Primary implementation or contract                                                                   | Verification/evidence location                                                            | What the evidence establishes                                                                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uniform local/federated validation                   | `backend/src/core/app/ingress.ts`                                                                    | `backend/src/core/app/ingress.spec.ts`, `backend/src/federation/federation.e2e.spec.ts`   | Federated content is not trusted merely because a peer sent it; it re-enters the admission path.                                                               |
| Durable outbound delivery and peer failure isolation | `backend/src/core/app/federation-outbox.ts`                                                          | `backend/src/core/app/federation-outbox.spec.ts`, `Code Implementation/BUILD-LOG.md`      | Peer/plane groups drain concurrently; the deployment log records the 407.6 s to 2.1 s correction.                                                              |
| Outbound push, receive stream, and backfill          | `backend/src/adapters/outbound/grpc/federation-client.ts`, `backend/src/core/app/federation-sync.ts` | `proto/jagoo/v1/federation.proto`, `backend/src/federation/federation.e2e.spec.ts`        | A caller can push, receive a server stream, and request missed objects through connections it initiated.                                                       |
| Uplink-aware source binding                          | `backend/src/adapters/outbound/transport/uplink-resolver.ts`                                         | `backend/src/cli/isp-gate.ts`                                                             | The deployed gate inspects bridge-container connections and requires use of both configured source interfaces.                                                 |
| Validating cross-uplink relay                        | `backend/src/core/app/bridge-relay.ts`, `backend/src/core/domain/transport/bridge-policy.ts`         | `backend/src/core/domain/transport/bridge-policy.spec.ts`, `backend/src/cli/isp-gate.ts`  | Relay eligibility, no-return-to-source behavior, crossing, and failover are exercised in the isolated topology.                                                |
| Per-class resource reservation                       | `backend/src/core/domain/federation/quota.ts`, bridge policy/configuration                           | `backend/src/core/domain/federation/quota.spec.ts`, `backend/src/cli/isp-gate.ts`         | Bulk traffic receives a smaller grant and the bridge gate checks quota behavior; this does not establish semantic spam resistance.                             |
| Multi-hop propagation                                | `backend/src/cli/scale-measure.ts`                                                                   | `PROJECT-OVERVIEW.md`, `Code Implementation/BUILD-LOG.md`                                 | The reported eight-node, 200-sample latency distribution is a controlled paced chain, not an Internet-scale load test.                                         |
| Log consistency primitives                           | `backend/src/core/domain/merkle.ts`                                                                  | `backend/src/core/domain/merkle.spec.ts`, `backend/src/federation/federation.e2e.spec.ts` | Inclusion/consistency operations and selected contradictory-head cases are tested; complete split-view detection still needs proof exchange and honest gossip. |

This mapping matters because the broader draft describes more subsystems than the partition
experiment evaluates. The literature-gap claim should be anchored primarily to the federation,
path-selection, bridge, and route-removal rows above. Moderation, receipts, alternate transports,
and transparency remain supporting features unless accompanied by their own comparative
evaluation.

## 3. Literature taxonomy

The reviewed work falls into six different problem families. Treating all six as interchangeable
"blackout systems" would produce a misleading gap claim.

| Family                                       | Representative reviewed papers                                      | What remains available                              | Primary objective                                                         |
| -------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| Mobile opportunistic/DTN communication       | Anix, Rangzen, Moby, Twimight                                       | Nearby phones and Bluetooth/Wi-Fi Direct encounters | Communicate after ordinary IP infrastructure is absent                    |
| Blackout design critique                     | Hasan's _Designing Networks for Large-Scale Blackout Circumvention_ | Conceptual design space                             | Explain scale, safety, and deployability trade-offs                       |
| Offline-first signed social replication      | Secure Scuttlebutt                                                  | Intermittent overlay, LAN, or transferable storage  | Replicate selected signed author logs without global consensus            |
| Decentralized Internet micropublishing       | FETHR                                                               | Routable HTTP publishers/subscribers                | Remove the centralized microblog provider and preserve timeline integrity |
| Alternate path to the outside Internet       | Dolphin                                                             | Cellular voice plus an external peer                | Carry low-rate Internet requests across a data shutdown                   |
| Persistence against post-publication removal | GhostPost, Publius                                                  | Existing platform/path or reachable replica servers | Restore deleted posts or keep static Web content retrievable              |

The project occupies a different point: it retains IP and the server-operator model but relaxes
the assumption that all servers share a single globally connected routing domain. Its closest
conceptual prior work is Secure Scuttlebutt; its closest conventional federation proposal in the
primary corpus is FETHR; and the mobile blackout systems are the closest in motivation but not
in substrate or operational model.

## 4. Detailed paper-by-paper study

### 4.1 Anix: Anonymous Blackout-Resistant Microblogging with Message Endorsing

**Problem and contribution.** Kamali and Barradas address anonymous, one-to-many communication
when Internet infrastructure is unavailable. Their central observation is that existing mobile
mesh applications rarely provide all three of anonymity, wide dissemination, and a useful way
to assess the trustworthiness of authors and messages. Anix adds remote trust establishment,
anonymous message endorsement, and revocable identities to a mobile epidemic network.

**Operating and adversary model.** Anix assumes that the adversary can disable Internet
infrastructure within a country and that users have no safe external network. Phones therefore
exchange messages through Bluetooth and Wi-Fi Direct encounters. The adversary can deploy Sybil
nodes, observe and drop nearby traffic, fabricate or modify messages, cultivate social trust,
spread misinformation, coerce users, and seize devices. It is nevertheless local rather than a
global monitor of every encounter, is computationally bounded, and has limited ability to form
trusted relationships with honest users. Anix targets a medium-risk political environment. It
does not hide the fact that a person uses the application, protect a specifically followed user,
or defeat broad radio jamming.

**Architecture and security.** Each public message uses a one-time pseudonym containing
encryption and signing keys. A key-blinding signature links that pseudonym to a temporary
identity only for a party that already knows the corresponding identity key. One-way-trust
messages let a user reveal an identity key privately to a selected author; reciprocal exchange
creates bidirectional trust. Referrals introduce two users without automatically forcing either
to trust the other. Soft revocation moves selected trusted contacts to a fresh identity while
excluding a distrusted party. Hard revocation attempts to invalidate an identity lineage after
device compromise. Anonymous signed votes propagate with messages, allowing a receiver to rank
content using endorsements from contacts it trusts rather than only global vote totals that Sybil
nodes can inflate.

**Evaluation.** The prototype comprises an Android implementation and a simulator. The authors
benchmark two phones and simulate 600 users in a 25 by 25 city grid over 120 one-hour steps. The
default adversary controls 2% of nodes, with appendices extending this to 5%, 10%, and 25%.
Reported measurements include about 1.8 s discovery time, 11.58 s to exchange 100 public messages
plus 10,000 votes (about 1.3 MB), and 87.68 mAh or 1.5% of a 6,000 mAh battery during an hour of
continuous exchange. Cryptographic microbenchmarks are tens to hundreds of milliseconds. In the
default simulation, messages reach more than 90% of users in roughly 23 one-hour steps despite
2% non-forwarding adversarial nodes. The endorsement experiments show that results depend
substantially on assumed user awareness, adversarial social connectedness, and voting behavior.

**Limitations and comparison.** Anix is stronger than this project on author anonymity,
post-compromise identity management, and trust-aware treatment of misinformation. It also works
when no IP routing survives. It does not preserve a federation of independently administered
servers, model ISP-local reachability, support outbound-only server synchronization, or study a
source-bound multi-homed bridge. Its city-scale findings come from modeled mobility and social
behavior rather than a field deployment. Thus Anix addresses the below-IP, user-to-user rung that
the present project explicitly leaves out; the present project instead addresses lower-latency
public-discussion federation when domestic IP components remain.

### 4.2 Rangzen: Anonymously Getting the Word Out in a Blackout

**Problem and contribution.** Rangzen is an anonymous, one-to-many message system for a blackout
that removes both Internet and cellular infrastructure. It combines smartphone store-carry-forward
communication with a social-graph-based priority score. Its key tension is that anonymity hides
the author while resistance to spam and propaganda appears to need identity or reputation.

**Operating and adversary model.** Rangzen targets medium-risk regions, assumes commodity,
unrooted Android phones, and treats high latency as acceptable. The adversary can inject messages,
form Sybils, jam local regions, seize some devices, and attempt to recover the trust graph. It is
not assumed able to monitor or jam the entire city. The authors explicitly treat user education
as necessary because message content can disclose the author even when the protocol does not.

**Architecture and security.** Wi-Fi Direct beacons discover a nearby phone and expose the
Bluetooth address needed for an interaction-free RFCOMM connection. During an encounter, peers
establish an encrypted channel, compute the cardinality of their mutual-friend intersection with
a private-set-intersection protocol, and exchange queued messages. The receiver combines the
received priority with the social trust score, adds noise to improve deniability and propagation,
and drops the lowest-priority messages when storage is full. A message contains no stable author
identity. This provides plausible authorship deniability but deliberately cannot provide the
author-attributable signature semantics used by this project. Friend identifiers are exchanged
in person, stored as hashes, and vulnerable to limited chosen-input inference after compromise.

**Evaluation.** The Android implementation contains more than 17,000 lines of Java plus more
than 4,000 lines of tests. On stock devices, an encounter containing 100 messages and 30 friends
took a measured average of 6.61 s including discovery, connection, data, and private-intersection
work. Continuous encounters every ten seconds used about 5.5% of a Nexus 5 battery per hour. The
city-scale evaluation replays mobility traces, overlays modeled social graphs, and averages plots
over 40 runs. It reports more than 80% honest-message reach in 24-48 hours in the evaluated
settings and describes more than 90% reach within about a day in its summary. Popularity changes
delivery substantially; a popular author's message can reach 90% much earlier than an unpopular
author's. Simulated jamming and propaganda coalitions reduce service but do not dominate the
socially prioritized queue under the chosen assumptions.

**Limitations and comparison.** Rangzen provides a much more ambitious anonymity goal and a
below-IP path, but at delay-tolerant timescales and with modeled citywide deployment. It does not
provide server federation, forum dependencies, receiver backfill, reachability scopes, a
multi-homed bridge, server-side quotas, or operator moderation. Its resistance to propaganda
depends on attackers having comparatively few honest friends. The present project should cite
Rangzen as a complementary solution for a more severe connectivity failure, not as a baseline
that the server system supersedes.

### 4.3 Moby: A Blackout-Resistant Anonymity Network for Mobile Devices

**Problem and contribution.** Moby targets private, pairwise messaging after wide-area IP routing
has stopped. It combines a secure Internet channel before the blackout with an ad hoc mobile
channel during the blackout. Its contributions are end-to-end encryption, forward secrecy,
sender-receiver anonymity, and trust-aware queue management against flooding.

**Operating and adversary model.** Moby requires a secure wide-area channel at some point before
the outage to bootstrap contact and cryptographic state. The adversary is global and active
against wide-area infrastructure but only local against short-range Moby encounters. It can
monitor some encounters, inject or modify messages, jam regions, or coerce users. Moby is not
steganographic: its link-layer broadcasts reveal application use. It excludes targeted physical
attacks, malware, and a global passive observer over the entire ad hoc network.

**Architecture and security.** The implementation extends Signal. Before a blackout, contacts
use Signal to establish Moby state. During the outage, Wi-Fi Direct advertises Bluetooth
addresses, Bluetooth carries messages, and an epidemic protocol stores and forwards ciphertext.
Payloads use a reduced Double Ratchet construction and omit explicit source and destination
identifiers; only the intended endpoint can recognize and authenticate its message. Trust is
derived from direct contacts and, optionally, one- or two-hop mutual contacts using private set
intersection. Trusted traffic receives queue preference, preventing an arbitrary outsider's flood
from evicting all legitimate traffic.

**Evaluation.** The trace-driven study uses cellular call-detail records covering 268,596 users,
with principal plots using 78,486 sufficiently active users, 786 towers over roughly 180 square
kilometers, 30,000 messages, and three simulated days. Without an adversary, Moby and ordinary
epidemic routing each achieve a reported 50.73% delivery ratio in the broad comparison. Under a
high-volume injected-message attack, epidemic/FireChat delivery falls to about 1.15%, while Moby
reaches 13.96% with indirect trust - about a 14-fold relative improvement, but still far below
normal operation. In favorable queue/TTL configurations, no-attack delivery exceeds 0.8 with
15-17.5 hour average latency. A simplified compromised-user study leaves 3.92%-10.61% of users
denied service across the evaluated initial compromises. On Nexus 5 devices, a private-set
intersection with 100 inputs consumes about 2.5 J and three seconds of CPU time.

**Limitations and comparison.** Moby is stronger on private-message confidentiality, forward
secrecy, and sender-receiver anonymity. Its evaluation is also informed by a much larger mobility
trace than the present project. However, cell-tower observations are coarse, ordinary mobility is
used as a proxy for blackout mobility, and the anonymity argument is heuristic rather than
formal. Moby does not support public forum federation, online server operators, no-inbound server
sync, ISP-local scopes, a source-bound bridge, or audit receipts. It solves communication after
IP failure; this project solves continuity of a server service while some IP routing remains.

### 4.4 Twimight: Twitter in Disaster Mode - Security Architecture

**Problem and contribution.** Twimight augments an existing Twitter client with an opportunistic
"disaster mode." When connectivity disappears, a phone stores locally authored tweets and
epidemically exchanges them over Bluetooth. When Twitter becomes reachable again, the phone
uploads its own disaster tweets. The paper concentrates on carrying familiar social-media
semantics into a natural-disaster setting and rebuilding authenticity, integrity,
confidentiality, and spam control without a live central service.

**Operating and adversary model.** Twimight assumes that security state can be provisioned before
the disaster. A Twimight Disaster Server acts as a certificate authority during normal operation;
phones cache certificates, public keys, and a revocation list before losing connectivity. New
users cannot join during the outage. Unlike Anix, Rangzen, and Moby, the primary motivation is
infrastructure damage and congestion rather than a government actively hunting protocol users.

**Architecture and security.** Public disaster tweets are digitally signed and carry the
sender's certificate. Receivers validate creation time, certificate validity, cached revocation
state, and the signature. Direct messages are additionally encrypted to a cached recipient key.
Certificates expire after 14 days to constrain the offline revocation list. Epidemic forwarding
is public and best effort. A simple exchange quota transmits at most 500 tweets per peer encounter
and reserves at most 250 positions for the sending peer's own content, preserving room for
relayed material. The approach retains the ordinary Twitter identity, which helps usability but
does not provide dissident anonymity.

**Evaluation.** A preliminary experiment involved five people carrying Nexus One phones over two
office floors. The longest run lasted two days and included 915 tweets, some automatically
generated. About 30% of daytime tweets arrived within four minutes, almost all arrived within
roughly two hours, and 51% of deliveries used more than one hop. A one-minute Bluetooth scan
interval yielded about 41 hours of battery life; two minutes yielded 58 hours and four minutes
68 hours. The authors explicitly state that the experiment evaluated basic opportunistic
functionality without the proposed security extensions.

**Limitations and comparison.** Twimight demonstrates an important design pattern reused by later
work: prepare identity state while the Internet is healthy, then operate from local state. Its
evaluation is small and non-adversarial; membership freezes during disruption, and certificates
remain centralized in normal operation. It does not preserve live server federation or route
through ISP-local components. The present project shares signed, store-and-forward public
objects and reserved relay capacity, but places these mechanisms between servers over surviving
IP rather than between phones over Bluetooth.

### 4.5 Designing Networks for Large-Scale Blackout Circumvention

**Problem and contribution.** Hasan challenges the common assumption that an organic wireless
mesh is automatically an effective answer to a national blackout. The thesis defines a _dissent
network_ as one that is resistant to communications blackouts, safe for users and operators, and
capable of meaningful scale. Its primary value for this project is not a competing implementation
but a set of constraints for evaluating any blackout claim.

**Argument.** Multi-hop wireless capacity falls as a network grows because neighboring
transmissions contend for the same half-duplex channel. Directional antennas, multiple radios,
planned topology, centralized management, smaller networks, or delay-tolerant applications can
improve performance, but each sacrifices deployability, inconspicuousness, decentralization,
coverage, or user experience. The thesis therefore recommends limitation-tolerant applications
and ubiquitous, innocuous hardware, while treating operator and user safety as first-order
requirements. It also distinguishes encryption from anonymity and warns that purpose-built radio
equipment can make operators easier to locate or prosecute.

**Evidence.** The work is an analytical design critique supported by prior scaling results,
operational mesh examples, and deployment observations. It does not implement or quantitatively
evaluate a new blackout network. Its contribution is to reveal a trade-off space and expose
unsafe assumptions.

**Limitations and comparison.** The present project makes a choice that the thesis's framework
helps justify: when domestic IP infrastructure survives, reuse it instead of replacing it with a
citywide mobile mesh. That choice can yield seconds rather than hours of delay and can preserve
existing server-side forum semantics. It also means the system fails when IP disappears and does
not inherit the anonymity possible in a carefully designed mobile DTN. A multi-homed bridge is
an identifiable operator and potential chokepoint, so bridge coercion and operator safety must be
listed as limitations. The thesis is therefore a foundation for narrowing the project's claim,
not evidence that the project solves the full dissent-network challenge.

### 4.6 Secure Scuttlebutt: An Identity-Centric Protocol for Subjective and Decentralized Applications

**Problem and contribution.** Secure Scuttlebutt (SSB) is the closest conceptual neighbor in the
primary corpus. It builds social applications from selectively replicated, self-certifying,
single-writer append-only logs. Every peer can publish; applications consume local replicas; and
the system deliberately avoids global consensus or a mandatory central service.

**Architecture and security.** Each identity is an Ed25519 key pair. Its messages include the
author key, sequence number, previous-message hash, claimed timestamp, payload, and signature.
Messages are limited to 4 KB; larger blobs are content addressed and fetched separately. A relay
accepts only the next valid link in an author's chain. Competing successors form a fork, after
which the relay stops accepting that log. Over an encrypted peer overlay, relays exchange the
highest sequence numbers they hold and transfer missing suffixes; new entries can then be pushed
over a spanning-tree optimization. Complete logs are selectively replicated according to the
reader's social graph. "Pubs" provide highly available rendezvous, LAN multicast supports local
discovery, and the logical data format can also be moved over alternate replication mechanisms or
sneakernet.

SSB's _subjective reader_ is a fundamental design decision. Different peers possess different
logs and can interpret the same events differently. Application state is computed locally, often
with map/reduce-style indexes and coordination-free data structures. This avoids a global
moderator, total order, or canonical directory. Offline operation is consequently a normal case
of delayed replication rather than a separate emergency mode.

**Evidence.** The paper is primarily an architecture and protocol account, illustrated by an
operational community reported as more than 10,000 users and by applications such as social
feeds, code hosting, chess, and event organization. It does not present a controlled partition
experiment, latency distribution, adversarial benchmark, or server-to-server blackout topology.

**Limitations.** Complete-log verification requires linear history and storage; partial
replication, cryptographic migration, and multi-device publishing remain difficult. Onboarding
requires another party to request a new log. The gossip overlay does not inherently prevent an
eclipse attack. Stable signed identities, non-repudiation, and immutable messages can expose
users to serious retaliation; the authors explicitly say anonymity conflicts with their
identity-centric model. Subjective application semantics also complicate shared moderation and
global coordination.

**Comparison.** SSB already establishes that signed author histories, delayed replication,
transport independence, and fully local reads can tolerate partitions. The project must not
claim those ideas as new. The difference is operational and conjunctive:

- SSB peers replicate author logs according to social interest; this project federates
  independently administered community servers and projects typed forum objects.
- SSB makes offline local operation foundational; this project focuses on retaining
  server-to-server service over scoped surviving IP paths.
- The project explicitly supports full push/pull participation by a server with no inbound
  endpoint, chooses an uplink and source address per peer, and evaluates an application-layer
  multi-ISP bridge. Those concerns are not evaluated in the SSB paper.
- The project includes server admission, peer quotas, priority reservations, moderation objects,
  and signed server acknowledgements. SSB deliberately favors subjective interpretation and
  avoids a comparable server-operator role.

The correct positioning is therefore "different network and operator model," not "more
decentralized" or "more partition tolerant."

### 4.7 Birds of a FETHR: Open, Decentralized Micropublishing

**Problem and contribution.** FETHR is the closest reviewed predecessor for provider-independent
microblog federation. It seeks to connect otherwise isolated microblog services through a
lightweight HTTP protocol while retaining authenticity, continuity, and open provider choice.

**Architecture and security.** A publisher exposes a canonical URL, accepts subscription
requests, and pushes complete signed updates to subscribers with HTTP POST. Popular publishers
may send only to a subset and ask subscribers to gossip the update, trading redundant epidemic
traffic for availability. Each publisher hash-chains its entries so a subscriber can detect a
missing or retroactively modified update. Cross-author hash references entangle timelines into a
directed acyclic graph, providing verifiable partial ordering and explicit conversation threads.
Because subscribers store full messages rather than notifications, old material remains readable
when the publisher is temporarily unavailable.

**Evaluation.** The design is informed by a three-week 2008 Twitter trace containing 4,917,042
public messages from 472,735 users. The authors use the skewed follower distribution to motivate
subscriber-assisted gossip. Their Birdfeeder and Twitter-gateway prototypes total about 1,500
lines of Python and had processed about 120,000 author-related messages. The paper does not
provide a failure-injection experiment, propagation percentiles, adversarial relay study, NAT
experiment, or deployment across independently routed networks.

**Limitations and comparison.** FETHR assumes that publishers and subscriber endpoints are
addressable over the Internet. A subscriber must POST its canonical URL and the publisher is
responsible for pushing updates to it, so full participation by a no-inbound server is not
established. The design has no reachability scopes, durable receiver backfill, source-bound
multi-homing, bridge policy, per-peer admission pipeline, or relay quotas. It also leaves privacy,
group communication, and attention management as future work. Nevertheless, FETHR is strong
prior art for signed pushed microblog objects, hash-chain continuity, subscriber-assisted gossip,
and provider interoperability. The present contribution is the evaluated adaptation of this
general federation idea to partial routing and no-inbound operation, not the idea of signed
federated micropublishing itself.

### 4.8 Dolphin: A Cellular Voice Based Internet Shutdown Resistance System

**Problem and contribution.** Dolphin carries lightweight Internet applications over the
cellular voice channel when packet data is disabled but ordinary voice calls remain available.
It is an alternate-path circumvention system: a caller inside the shutdown reaches a trusted
callee outside it, which performs email, Twitter, or news operations on the caller's behalf.

**Architecture and security.** A computer encodes encrypted data as speech-band audio, streams
it through a Bluetooth-paired phone call, and the callee demodulates and forwards the request.
A TCP-like reliability layer supplies chunks, sequence information, acknowledgements,
retransmission, integrity checks, and in-order delivery because real-time voice provides no
recovery. A secure-channel setup derives end-to-end keys. A cloud/telephony-automation mode can
answer calls without a human callee. The design assumes that a government retains voice service
for operational reasons and that a telecom operator can record calls or selectively block
numbers but cannot economically perform perfect real-time analysis of every call.

**Evaluation.** Across four cellular providers and several 2G/3G/4G combinations, the authors
find that 64 bit/s is a practical stability point with less than about 2% raw error in the
evaluated transfers; 128 and 256 bit/s produce sharply higher error. A secure channel takes about
one minute on average. A 280-character tweet takes under a minute after setup; a 500-character
email takes about 102 s for data and about 160 s including setup; ten short news items take about
two minutes. Experiments are repeated 30 times, include long-distance and international calls,
and include cloud automation. The system was also exercised during an actual shutdown in Delhi,
where a 300-character email transferred in about a minute.

**Threats and limitations.** Dolphin analyzes periodic perturbation, continuous noise, active
probing, replay, and offline audio classification. Superimposing data under human speech and
adding silence can make classification harder, but imposes further overhead and is not a proof
of undetectability. The paper acknowledges that a determined censor may eventually learn better
features, block callee numbers, or actively disrupt traffic. Dolphin also requires voice service,
an external peer or cloud service, a computer and phone, low-bandwidth applications, and user
knowledge of the callee's bootstrap secret.

**Comparison.** Dolphin is useful precisely where this project may fail: domestic data routing
can be gone while voice survives. Conversely, it provides a narrow proxy path to external
applications rather than a domestic federation of independent community servers. Its trusted
callee is an external gateway and potential block target; the project's bridge stays within the
surviving IP topology and validates replicated forum objects. The two systems are complementary
and rely on different surviving infrastructure.

### 4.9 GhostPost: Seamless Restoration of Censored Social Media Posts

**Problem and contribution.** GhostPost addresses deletion after a post has briefly appeared on
Sina Weibo. A distributed set of browser clients observes posts of interest, notices later
deletion, and restores censored material into the user's normal Weibo page. Its insight is that
the censor's finite response time creates a replication window.

**Architecture and security.** A Chrome extension records the posts a user sees and reports
deletions to a central GhostPost server over HTTPS. Restored text is inserted into the existing
Weibo interface. A client signs the posts it claims to have resurrected; this authenticates the
observer's claim, not the original Weibo author's intent. Friends can verify keys out of band.
Users may restrict their restorations to trusted recipients to reduce the risk that the censor
infers which viewer captured a post. The system assumes users already employ traditional
circumvention because the central GhostPost server is expected to be blocked.

**Evaluation.** The event simulation contains one million scale-free users. GhostPost adoption
varies from 0.05% to 2%, clients inspect followed accounts about five times per hour, and modeled
censors remove posts with mean lifetimes from 0.5 to 24 hours. Coverage is weighted by potential
views rather than raw post count. With about 1.5% adoption, even a modeled censor deleting posts
after 30 minutes on average fails to suppress a majority of relevant post-views. With 1% adoption,
the model restores over 70% against the approximate daytime censor and nearly 90% against the
slower nighttime censor. Coverage is unequal: highly followed or GhostPost-participating authors
are much better preserved.

**Limitations and comparison.** A post must first be admitted and visible long enough for a
client to observe it. GhostPost cannot prove refusal to publish, keep Weibo available during a
routing shutdown, or avoid a central restoration service. The prototype initially omits images
even though many deleted posts contain them. A targeted censor can show a unique bait post to a
suspected user and then query GhostPost; trusted-recipient restriction reduces reach while
improving safety. GhostPost is therefore prior work for deletion persistence and user-visible
restoration, not for partition-resilient federation. It also reinforces an important limitation
of this project: a receipt can prove an acknowledged acceptance, but no replication mechanism
can prove a server silently refused an unacknowledged write.

### 4.10 Publius: A Robust, Tamper-Evident, Censorship-Resistant Web Publishing System

**Problem and contribution.** Publius protects static Web publication from host-level removal,
tampering, and source discovery. It distributes encrypted content and threshold key shares among
multiple ordinary Web servers so that no single server can read or remove the document. It also
supports password-authorized update and deletion, distinguishing it from immutable eternity
services.

**Architecture and security.** The publisher encrypts a document under a random symmetric key,
splits the key into _n_ Shamir shares requiring any _k_ for reconstruction, and sends every
selected server the encrypted document plus one share. A content/share hash determines storage
names and is embedded in a special Publius URL. A client-side proxy retrieves an encrypted copy
and enough shares, reconstructs the key, decrypts the document, and recomputes the names to detect
tampering. Per-server password hashes permit the author to delete or redirect a document without
letting one malicious server learn a credential usable at all other servers. The proxy hides this
complexity from a normal browser.

**Evidence.** The implementation consists of roughly 1,500 lines of Perl and supplies command-line
and browser-facing tools. The paper provides algorithmic and adversarial analysis but no
large-scale latency, availability, storage, or censorship experiment. Its resilience therefore
follows from the threshold model under assumed independent servers, not from measured behavior
under a network partition.

**Threats and limitations.** Deleting all encrypted copies or enough key shares censors the
document. Collaborating servers can corrupt update redirects; choosing _k_ trades performance
against the number of malicious servers needed. The service is vulnerable to storage-filling and
network DoS; proof of work and per-address storage limits are proposed but were not implemented.
Publius itself does not hide the publisher's connection, so a separate anonymity system is
required. Author-identifying content or hyperlinks also break anonymity, and coercion can force
an author who retained the update/delete password to remove material.

**Comparison.** Publius is strong prior art for replication against server removal, tamper-evident
content addressing, and the tension between persistence and authorized deletion. It is not a
social or federated discussion protocol: it lacks live subscriptions, dependency-aware forum
objects, server admission, backfill, moderation, scoped reachability, and multi-homed bridging.
Its servers must also remain reachable to a retriever. The present project should cite Publius to
avoid presenting replication or tamper evidence as new; its distinct question is whether live
federation continues among reachable domestic components after routing changes.

## 5. Cross-paper comparison

### 5.1 Operating model and evidence

| Work               | Unit of deployment                       | Surviving substrate after disruption        | External path needed after disruption?                 | Main communication style                                       | Strongest reported evidence                                                                |
| ------------------ | ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Anix               | Phone/user                               | Bluetooth and Wi-Fi Direct encounters       | No                                                     | Anonymous public epidemic microblog                            | Two-phone benchmarks; 600-node modeled city; >90% reach in about 23 h under default attack |
| Rangzen            | Phone/user                               | Bluetooth plus Wi-Fi Direct discovery       | No                                                     | Anonymous public epidemic broadcast                            | Android prototype; encounter and battery tests; mobility/social simulation                 |
| Moby               | Phone/user                               | Bluetooth plus Wi-Fi Direct discovery       | No, but pre-outage bootstrap required                  | Private encrypted DTN messaging                                | 268,596-user trace basis; attack/no-attack simulations; Android energy study               |
| Twimight           | Phone/user                               | Bluetooth encounters                        | No, but pre-outage PKI required                        | Public disaster tweets and encrypted DMs                       | Five users, two days, 915 tweets; security not included in experiment                      |
| Hasan              | Network design                           | Any proposed dissent-network substrate      | N/A                                                    | Analytical framework                                           | Scaling/safety synthesis; no new system experiment                                         |
| Secure Scuttlebutt | User identity/relay                      | Intermittent IP, LAN, or alternate transfer | No for local/offline operation                         | Selective complete-log replication                             | Operational community and applications; no controlled partition benchmark                  |
| FETHR              | Publisher or provider                    | Routable HTTP                               | Yes for ordinary cross-provider operation              | Signed push plus subscriber gossip                             | 4.9M-message workload trace; small prototype; no partition test                            |
| Dolphin            | Caller plus outside callee               | Cellular voice                              | Yes - trusted outside peer/cloud                       | Low-rate request/response proxy                                | Multi-provider experiments and one real shutdown anecdote                                  |
| GhostPost          | Browser user plus central service        | Existing Weibo and circumvention path       | Yes                                                    | Observe deletion and restore text                              | One-million-user event simulation; prototype                                               |
| Publius            | Publisher, replica servers, client proxy | Reachable Web servers                       | Yes to enough replicas                                 | Threshold replicated static publishing                         | Implemented algorithms and threat analysis; no deployment measurement                      |
| This project       | Independent forum server                 | Surviving scoped IP components              | No for domestic exchange; yes only for global services | Signed server federation with push, pull, backfill, and bridge | 19-check isolated topology; measured post-cut dependency chain; 8-node chain               |

### 5.2 Capability matrix

Legend: **Yes** means the paper or implementation explicitly supports the property; **Partial**
means a related but materially narrower property; **No** means absent; **N/A** means the dimension
does not fit the work's purpose. The evidence table above should be used separately to determine
whether a supported property was also experimentally evaluated.

| Work               | Public one-to-many             | Author-verifiable stored object                         | Operates with no IP                  | Independent server federation    | Full no-inbound participation      | Reconnect/backfill                    | Explicit scoped path selection | Source-bound multi-homed bridge       | Relay trust separate from validity | Abuse/resource control                     | Server acknowledgement/audit     |
| ------------------ | ------------------------------ | ------------------------------------------------------- | ------------------------------------ | -------------------------------- | ---------------------------------- | ------------------------------------- | ------------------------------ | ------------------------------------- | ---------------------------------- | ------------------------------------------ | -------------------------------- |
| Anix               | Yes                            | Yes, unlinkable pseudonym scheme                        | Yes                                  | No                               | N/A                                | Partial, epidemic encounters          | No                             | No                                    | N/A                                | Partial, endorsements/trust                | No                               |
| Rangzen            | Yes                            | No author attribution; peer exchange is protected       | Yes                                  | No                               | N/A                                | Partial, epidemic encounters          | No                             | No                                    | N/A                                | Yes, social priority/decay                 | No                               |
| Moby               | No, pairwise                   | Yes to endpoints, hidden from relays                    | Yes                                  | No                               | N/A                                | Partial, DTN queues                   | No                             | No                                    | N/A                                | Yes, trust-reserved queues                 | No                               |
| Twimight           | Yes                            | Yes, certificate-bound signature                        | Yes                                  | No                               | N/A                                | Partial, epidemic plus later upload   | No                             | No                                    | N/A                                | Partial, encounter quota                   | No                               |
| Hasan              | N/A                            | N/A                                                     | Discussed                            | N/A                              | N/A                                | Discussed                             | No                             | No                                    | N/A                                | Discussed                                  | No                               |
| Secure Scuttlebutt | Yes                            | Yes, signed hash-chained log                            | Partial; alternate transfer possible | No server-operator federation    | Partial; LAN/pubs and peer overlay | Yes, sequence-based suffix sync       | No                             | No                                    | Partial, social selection          | Partial, selective replication/blocking    | No server admission receipt      |
| FETHR              | Yes                            | Yes, signature and hash chain                           | No                                   | Yes                              | No                                 | Partial, detect gap/contact publisher | No                             | No                                    | No explicit separation             | Partial, opt-in subscriptions              | No                               |
| Dolphin            | Partial, application-dependent | Channel integrity, not author-signed social object      | Uses no packet IP locally            | No                               | N/A                                | Yes, chunk retransmission             | No                             | External voice gateway, not IP bridge | N/A                                | Partial, number/bootstrap secret           | No                               |
| GhostPost          | Yes, restored platform posts   | Observer-signed restoration, not original-author object | No                                   | No                               | N/A                                | Partial, restoration database         | No                             | No                                    | N/A                                | Partial, recipient restriction             | No                               |
| Publius            | Static publication             | Tamper-evident content, not an author signature         | No                                   | Replica set, not live federation | No                                 | Retrieval from threshold replicas     | No                             | No                                    | No                                 | Proposed, not implemented                  | No                               |
| This project       | Yes, forum/community scope     | Yes, content-derived ID plus author signature           | No                                   | Yes                              | Yes                                | Yes, durable cursor/backfill          | Yes                            | Yes                                   | Yes                                | Yes, origin admission plus receiver quotas | Yes, for acknowledged acceptance |

This table reveals why a conjunction claim is stronger than a feature claim. Signed objects,
store-and-forward delivery, gossip, trust-based prioritization, threshold replication,
multi-homing, and transparency logs all predate this system. The gap is that the reviewed work
does not combine server federation, scoped surviving IP reachability, no-inbound bidirectional
sync, source-correct bridging, uniform relay verification, and a measured route-removal topology.

## 6. Thematic synthesis

### 6.1 Different shutdown systems preserve different substrates

Anix, Rangzen, Moby, and Twimight assume packet routing is unavailable and create a new local
store-carry-forward network among phones. Dolphin instead assumes cellular voice remains and
uses it to reach an external proxy. GhostPost assumes the censored platform and a path to a
restoration service remain. Publius assumes enough globally reachable replica servers remain.
SSB tolerates intermittent connectivity because every application reads local replicas, but it
does not evaluate routing-defined ISP components. FETHR assumes ordinary addressable HTTP
publishers and subscribers.

The project's premise is between these cases: packet IP is damaged but not absent. That regime
is plausible but conditional, and the system should say so every time it uses the phrase
"shutdown resistant." The project does not replace Anix/Rangzen/Moby under total packet loss or
Dolphin when voice is the only remaining channel. It exploits a less severe but underused
condition to preserve richer server semantics with far lower delay.

### 6.2 Identity and integrity are not the same as anonymity

The mobile-blackout papers treat user safety as central. Rangzen removes author attribution;
Moby hides sender and receiver from relays; Anix creates selectively linkable pseudonyms and
revocable identity compartments. This project takes the opposite cryptographic position for its
forum plane: the author's key and signature make an accepted object attributable to that
pseudonym and non-repudiable. That is valuable for integrity and independent verification, but
dangerous if the key is linked to a physical person.

The literature therefore prohibits an argument that signatures provide censorship safety by
themselves. They prevent a relay from forging authorship; they do not hide application use,
network metadata, an author's key, or a revealing writing style. SSB explicitly warns that the
combination of stable pseudonyms, signatures, and immutable history may expose users to future
persecution. Hasan likewise treats safety and deniability as design requirements. The present
system should describe author authentication and transport-independent verification, not
anonymity.

### 6.3 Replication granularity determines application semantics

Publius replicates encrypted static documents and threshold shares. GhostPost replicates
observed copies of already published platform posts. Rangzen and Anix circulate short public
messages; Moby circulates private ciphertext. FETHR and SSB are closer to social federation:
FETHR distributes signed timeline entries and SSB distributes complete author logs.

The project distributes typed forum objects with dependencies: a post may require an author
certificate and community definition before it can be rendered. Durable raw-object storage and
backfill therefore matter independently of transport availability. The post-cut certificate to
community to post measurement is more informative than timing one isolated payload because it
tests usable application state. Neither the static-publishing nor mobile-broadcast papers
evaluate this form of dependency-preserving server projection.

### 6.4 Trust and anti-abuse are local policies, not global truth

Rangzen and Moby use social ties to prefer legitimate traffic under scarce mobile storage. Anix
adds anonymous endorsements and remote trust formation. Twimight uses a simple per-encounter
reservation. Publius proposes proof of work or address limits to deter storage exhaustion. These
systems demonstrate that decentralized dissemination without resource control lets attackers
consume the very capacity needed during a crisis.

The present design separates two concerns:

- cryptographic and semantic validity is evaluated for every object regardless of peer; and
- peer trust determines which classes and how many bytes/envelopes a peer may consume.

This separation is important. A trusted peer can still be compromised or malicious, so it must
not bypass verification. Conversely, a valid signature does not grant unlimited relay capacity.
The origin node performs its local anti-abuse payment/admission step once; a downstream receiver
cannot replay that node-local credential and instead applies peer quotas. A malicious but
protocol-valid origin can therefore originate spam up to downstream quota limits. The project
should claim bounded resource exposure, not elimination of spam or Sybil identities.

### 6.5 Availability, persistence, and accountability are distinct

Publius makes content hard to remove from a set of replica servers. GhostPost recovers material
that a centralized service accepted and later deleted. FETHR and SSB make signed histories
replicable and gaps detectable. These are availability or persistence properties. A signed
server receipt and inclusion proof in this project instead provide evidence that a particular
server acknowledged a particular object at a log position.

That evidence has strict limits:

- it cannot prove that a server received and silently refused an unacknowledged request;
- it cannot compel the server to continue serving the object;
- a transparency observer can withhold its own observations;
- a signed tree head with a greater size requires a consistency proof before growth can be
  called append-only; and
- the implemented stale-head/same-size-root checks do not detect every rewrite-with-growth or
  every split view without an honest gossip path.

Certificate Transparency and log-gossip work are the correct intellectual ancestors for these
mechanisms. The project should call its existing rule stale-head suppression plus limited
same-size/regression detection, not complete fork detection.

### 6.6 Evaluation strength differs across the corpus

The mobile systems offer broader mobility simulations but often rely on strong behavioral
assumptions and hour-scale location data. Twimight has a small real experiment. Dolphin has
low-rate experiments across actual carriers and one real shutdown episode. SSB reports a living
community but no controlled partition benchmark. FETHR, Publius, and GhostPost emphasize design,
workload traces, or simulation rather than routing failure injection.

The project contributes a controlled deployed failure story: route removal exposes a 407.6 s
head-of-line blocking defect that unit-level reasoning did not reveal, and per-peer concurrency
reduces the crossing to 2.1 s. That is credible evidence for implementation-level failure
isolation. It remains a single-host container experiment, so it must not be presented as stronger
external evidence than Dolphin's carrier tests or Moby's large trace-driven study.

## 7. Adjacent literature required for correct positioning

The ten-paper corpus alone does not completely define the project's gap. The drafts, bibliography,
and supplied reports identify five additional clusters that should appear in the eventual compact
related-work section.

### 7.1 Partial-reachability measurement

Baltra, Saluja, Pradkin, and Heidemann define the Internet core through bidirectional reachability
and distinguish _peninsulas_ (partial reachability) from _islands_ (addresses separated from the
core but internally connected). Follow-on measurement work develops methods for detecting these
conditions. Bischof et al. characterize outages and shutdowns from multiple measurement sources.
These papers establish that "unreachable from outside" need not mean powered off or mutually
unreachable from inside.

They do not build an application that continues operating inside such a component. This creates
a clean division of labor: measurement literature names and observes the network condition; this
project evaluates a server protocol designed to use it. However, the project's topology is
simulated, so those studies do not prove that the exact required cross-ISP domestic paths survive
in Bangladesh or another target country.

### 7.2 Conventional federation and decentralized social systems

ActivityPub, Matrix, AT Protocol, Netnews, Nostr, Mastodon, and Bluesky show multiple ways to
federate or relay social data. ActivityPub's server-to-server delivery normally targets inboxes,
and conventional deployments assume addressable servers. Empirical Mastodon work shows that
decentralization at the protocol level can coexist with concentration in hosting and providers.
Matrix and AT Protocol add different consistency, identity, and repository choices; Nostr uses
signed events and client-to-relay connections.

These systems invalidate any claim that server federation, signed social events, pull sync, or
decentralized moderation is itself new. The relevant narrower question is what happens when
reachability scopes shrink, inbound server addressability disappears, or peer groups occupy
different surviving components. The compact paper should compare the protocol's behavior under
that failure, not simply count decentralization features.

### 7.3 Circumvention through infrastructure beyond the censor

Telex, domain fronting, and Snowflake make blocked destinations reachable through decoy routing,
front domains, or temporary WebRTC proxies. They are designed for censorship at or above a still
usable path to infrastructure beyond the censor. Dolphin similarly reaches an outside peer over
voice. If external connectivity is withdrawn entirely, these techniques need some other surviving
external path.

The project asks a narrower domestic question: can local public discussion continue without
reaching infrastructure beyond the censor? This is not a replacement for circumvention because
it does not restore the global Web. Tor can be complementary at R0/R1 but cannot manufacture
connectivity after all paths to relays disappear.

### 7.4 Delay-tolerant networking and alternate transports

Bundle Protocol v7 supplies general store-carry-forward semantics for disrupted networks, and
mobile systems such as Rangzen/Moby instantiate DTN concepts on phones. ICE and Multipath TCP
address NAT traversal and multiple paths in normally connected networks. These are important
mechanism ancestors for retry, backfill, path choice, and multi-homing.

The project should not claim invention of delay tolerance or multi-homing. Its contribution is
the integration of durable typed federation, default outbound-only participation, signed-object
verification, scoped endpoints, and a source-bound application bridge, plus the controlled
evaluation of that integration.

### 7.5 Transparency, accountability, and moderation

Certificate Transparency, gossip extensions, PeerReview, CoSi, and accountable replicated-state
systems provide stronger conceptual foundations for detecting equivocation or preserving evidence
than an ordinary signed receipt. Fediverse moderation studies show that decentralizing the
transport does not remove human workload, policy divergence, appeals, harassment, or legal risk.

The project's signed acceptance receipt and local audit-log export are useful supporting
mechanisms, but the partition-resilient paper should not make them the core novelty unless it
evaluates consistency proofs, split-view detection, and independent observer behavior. Likewise,
signed moderation opinions and tombstones are a policy substrate, not proof that moderation is
fair, globally consistent, or socially sustainable.

## 8. Detailed research-gap finding

### Gap 1: the operating-regime gap

Most reviewed blackout systems jump from ordinary Internet operation to no usable packet IP and
therefore move communication onto phones, Bluetooth, Wi-Fi Direct, or cellular voice. Most
federated social systems assume servers remain mutually addressable through the Internet. Between
these assumptions lies a distinct regime: global transit or some inter-ISP routes are gone, yet
domestic or ISP-local IP components still operate.

**Project response:** define scoped reachability and continue ordinary server federation inside
the surviving components. This preserves existing servers, storage, moderation, dependencies,
and familiar clients instead of constructing a new citywide phone mesh.

**Claim boundary:** the reviewed literature supports the plausibility of partial reachability,
not the presence of the required path in every shutdown. The system fails under complete
disconnection.

### Gap 2: the public-discussion service gap

Anix and Rangzen disseminate public micro-messages, Moby provides private messaging, Twimight
provides disaster tweets, Dolphin proxies low-rate applications, and Publius persists documents.
None of those papers evaluates an independently administered forum with typed, dependent objects
such as author credentials, community definitions, posts, comments, votes, and moderation state
while routes are removed.

**Project response:** replicate raw signed forum objects through one validation pipeline and
measure a dependency chain that becomes renderable only after its certificate and community
arrive.

**Claim boundary:** author signatures and typed objects are engineering composition, not novel
cryptography. SSB and FETHR already provide signed social histories.

### Gap 3: the no-inbound federation gap

Conventional server push assumes a target inbox/listening endpoint. FETHR also has publishers
push to subscriber URLs. Home and community servers behind carrier-grade NAT may initiate
connections but cannot accept them, leaving them second-class participants unless the protocol
has a symmetric outbound workflow.

**Project response:** the same node initiates `Deliver` to push, `StreamActivities` to receive,
and `Backfill` to recover missed objects. A durable cursor and content-ID deduplication make
overlap safe. No public listener is required for full participation.

**Claim boundary:** client-to-relay systems such as Nostr and peer systems such as SSB already use
outbound connections. The gap is full no-inbound participation in this server-federation and
partition model, not the invention of outbound connectivity.

### Gap 4: the bridge path-correctness gap

"Use a multi-homed node" is incomplete. If both peer connections follow the operating system's
default route, the node may appear multi-homed while every flow exits one interface. None of the
primary reviewed systems studies this application-level failure in a partitioned server
federation.

**Project response:** associate endpoints with scope/ASN/uplink information, select a path per
peer, create a channel keyed by source address and destination, and bind the socket to the chosen
uplink's source address. Apply cross-uplink relay policy only after normal validation.

**Claim boundary:** source binding, policy routing, multi-homing, ICE, and MPTCP are established
mechanisms. The contribution is their use and verification in this failure-specific federation
composition.

### Gap 5: the validation-versus-trust gap

Mobile blackout systems often use social trust to prioritize content; conventional federation
often uses instance allow/block decisions. Conflating trust with validity creates a dangerous
shortcut: a trusted peer can inject malformed or forged content, while a valid but untrusted peer
can consume unlimited resources.

**Project response:** every federated and backfilled object follows the same cryptographic and
semantic checks, while peer trust only controls permitted classes and quotas. Origin-side payment
is not replayed downstream; receivers enforce their own resource policy.

**Claim boundary:** a malicious origin can create valid spam and is bounded only by policy and
quota. This is resource isolation, not Sybil prevention or misinformation detection. Anix,
Rangzen, and Moby solve richer social-trust questions than this project.

### Gap 6: the failure-isolation gap in multi-peer draining

Protocol descriptions often state that delivery is retried independently, but deployed scheduling
can reintroduce coupling. The project's serial outbox allowed a blackholed peer to stall delivery
to all later peers for 407.6 s, including the only healthy bridge path.

**Project response:** group leased outbox entries by peer and plane, drain groups concurrently,
and bound scheduler waiting per delivery attempt. The post-cut dependency chain then completed in
2.1 s.

**Claim boundary:** the deadline currently bounds the scheduler's wait but does not cancel the
underlying socket work because the sender API lacks an `AbortSignal`. This result is one
configuration and one deployment topology, not a general proof of bounded latency.

### Gap 7: the bounded bridge-resource gap

A bridge that reconnects components can become a scarce chokepoint. Pure epidemic forwarding or
one shared quota lets bulk backlog exhaust emergency capacity.

**Project response:** bridge only configured, mutually trusted uplink pairs; exclude disallowed
classes; never relay back through the arrival uplink; account per pair, direction, and class; and
reserve half of pair capacity from bulk traffic.

**Claim boundary:** quotas control volume, not truth. A coercible or compromised bridge can omit,
delay, observe, or selectively censor all traffic it carries. Redundant bridges and disjoint
operators remain future deployment work.

### Gap 8: the evidence gap

The literature contains strong mobile simulations, protocol descriptions, and isolated
prototypes, but fewer controlled experiments that combine server reachability loss, dependency
ordering, no-inbound nodes, source-bound multi-homing, quotas, and failover. Conversely, the
current project lacks real shutdown and real inter-AS evidence.

**Project response:** provide a reproducible route-removal testbed, end-to-end gate, measured
failure/fix narrative, and multi-hop chain.

**Remaining gap:** reproduce on separate physical hosts or network namespaces with independent
datastores; introduce real routers/AS emulation; measure repeated trials and confidence intervals;
test asymmetric and protocol-specific filtering; deploy across real ISPs; and compare against a
conventional federation baseline under the same cuts.

## 9. What is and is not novel

### 9.1 Mechanisms with clear prior art

The paper should not present any of the following in isolation as novel:

- author signatures or self-certifying content;
- hash-linked histories, Merkle trees, or consistency proofs;
- store-and-forward queues, epidemic dissemination, or backfill;
- federation or pushed microblog updates;
- outbound connections through NAT;
- multi-homing, source-address binding, or path selection;
- social or operator trust levels;
- proof of work, quotas, or priority reservations;
- signed receipts or transparency logs; or
- replicated/tombstoned moderation opinions.

### 9.2 Defensible contribution statement

The strongest statement supported by the corpus and implementation is:

> This work evaluates a composition for public-discussion federation over surviving domestic IP
> components: byte-preserved author-signed objects re-enter one validating pipeline; a server with
> no inbound endpoint participates through outbound push, pull, and backfill; and a validating
> multi-homed node binds federation connections to explicit uplink source addresses and relays
> across configured ISP-local components under class-separated quotas. A controlled route-removal
> testbed exposes and corrects cross-peer head-of-line blocking and demonstrates delivery of a
> dependent forum object chain after the direct inter-component path is removed.

The novelty is in the system composition, explicit failure model, and measured behavior, not in
the individual cryptographic or networking primitives.

## 10. Residual gaps the project does not solve

A credible literature review must separate gaps addressed by the system from gaps it leaves open.

1. **No surviving path.** If every domestic, cross-ISP, LAN, mesh, voice, and physical-transfer
   path is gone, the system cannot deliver. A mobile DTN or alternate carrier is required.
2. **Protocol whitelisting and DPI.** An ISP can allow domestic IP while blocking unfamiliar
   gRPC/HTTP2 patterns or specific endpoints. The current evaluation removes routes but does not
   model application whitelists or active protocol fingerprinting.
3. **Traffic analysis and user safety.** Signatures do not hide authors, communities, endpoints,
   timing, volume, or bridge use. The system provides no formal anonymity or resistance to a
   global passive observer.
4. **Bridge coercion and capture.** A bridge can selectively omit or delay valid objects and may
   be an identifiable operational target. Quotas and signatures do not solve this.
5. **Eclipse and discovery.** A node whose entire peer view is attacker-controlled can be isolated
   even when paths exist. Pre-positioned directories help availability but do not prove an honest
   peer is present.
6. **Admission refusal.** A signed acceptance receipt proves acknowledged admission. The absence
   of a receipt does not prove that a server received and censored a request.
7. **Complete log equivocation detection.** Stale-head suppression and same-size root comparison
   catch only some contradictions. Growth requires consistency proofs, and split views require
   honest gossip or independent witnesses.
8. **Sybil identities and valid spam.** Origin pricing and receiver quotas bound resource use but
   do not limit the number of identities or distinguish truthful from false signed content.
9. **Global erasure.** Replication conflicts with a promise of universal deletion. Tombstones can
   express policy and suppress display; they cannot force every replica to erase bytes.
10. **Field validity and scale.** The evidence comes from containers on one host and a small
    topology. ISP routing, power, DNS, certificate, clock, and operational behavior during a real
    shutdown may differ substantially.

## 11. Distillation-ready related-work argument

A compact paper section can be derived from the following four-paragraph logic.

**Paragraph 1 - shutdown and alternate-path systems.** Measurement work shows that shutdowns and
partial reachability have multiple forms. Telex, domain fronting, Snowflake, and Dolphin retain a
path to infrastructure beyond the censor, while Anix, Rangzen, Moby, and Twimight replace failed
IP with phone-to-phone delay-tolerant communication. These systems either recover outside access
or handle a more severe below-IP regime; they do not study ordinary server federation within
surviving but mutually separated domestic IP components.

**Paragraph 2 - federated and signed social systems.** ActivityPub/Mastodon, Matrix, AT Protocol,
Nostr, Netnews, FETHR, and SSB demonstrate federation, relays, signed events, author logs, gossip,
and offline replication. SSB is the closest conceptual system because signed append-only author
logs and delayed replication make offline operation normal. FETHR is the closest reviewed
provider-federation design. Neither reviewed paper evaluates full no-inbound server participation,
reachability-scoped endpoints, or a source-bound multi-ISP application bridge under route removal.

**Paragraph 3 - persistence and accountability.** Publius and GhostPost protect already published
content from removal; transparency systems make acknowledged history auditable. Those goals differ
from preserving live forum federation and do not prove that a server admitted an unacknowledged
write. The present system uses author-signed objects and receipts as supporting integrity evidence,
not as a complete solution to censorship or equivocation.

**Paragraph 4 - gap and response.** The reviewed literature leaves a systems-integration gap at
the intersection of surviving domestic IP, independently administered public-discussion servers,
outbound-only bidirectional sync, and correctly source-bound bridging between ISP-local
components. The project addresses that conjunction and evaluates it under controlled route
removal, while explicitly excluding total disconnection, traffic-analysis resistance, bridge
coercion, and real-shutdown generalization.

## 12. Claim-language guardrails

### Safe formulations

- "When at least one domestic IP path survives, the system continues federation within that
  reachable component."
- "In the reviewed corpus, blackout applications predominantly use mobile ad hoc communication
  or an alternate path to an external peer, whereas conventional federation assumes mutually
  addressable servers."
- "We evaluate the conjunction of outbound-only bidirectional federation, scoped endpoints, and
  a source-bound multi-homed validating bridge."
- "Peer trust bounds classes and volume; it does not waive content validation."
- "The controlled testbed demonstrates mechanism feasibility under route removal."
- "The signed receipt is evidence of acknowledged acceptance."

### Formulations to avoid

- "The system works during Internet shutdowns" without the surviving-path condition.
- "The first censorship-resistant federated social network."
- "Signatures prevent censorship" or "signatures remove server approval."
- "The bridge defeats a national censor."
- "The system is anonymous" or "metadata private."
- "The flood experiment proves DoS resistance."
- "Tree-head timestamps detect forks" or "all equivocation is detected."
- "Tombstones guarantee deletion from every replica."
- "Container networks are equivalent to real ISPs."

## 13. References and source links

### 13.1 Primary deep-read corpus

1. Sina Kamali and Diogo Barradas. "Anix: Anonymous Blackout-Resistant
   Microblogging with Message Endorsing." _2025 IEEE Symposium on Security and Privacy_,
   pp. 1381-1399. [DOI](https://doi.org/10.1109/SP61157.2025.00015) -
   [local PDF](related-papers/01-anix-blackout-resistant-microblogging.pdf).
2. Adam Lerner, Giulia Fanti, Yahel Ben-David, Jesus Garcia, Paul Schmitt, and Barath
   Raghavan. "Rangzen: Anonymously Getting the Word Out in a Blackout." arXiv:1612.03371, 2016. [arXiv](https://arxiv.org/abs/1612.03371) -
   [local PDF](related-papers/02-rangzen-blackout-broadcast.pdf).
3. Amogh Pradeep, Hira Javaid, Ryan Williams, Antoine Rault, David Choffnes, Stevens Le
   Blond, and Bryan Ford. "Moby: A Blackout-Resistant Anonymity Network for Mobile
   Devices." _Proceedings on Privacy Enhancing Technologies_, 2022(3), pp. 247-267.
   [DOI](https://doi.org/10.56553/popets-2022-0071) -
   [local PDF](related-papers/03-moby-blackout-resistant-anonymity-network.pdf).
4. Theus Hossmann, Paolo Carta, Dominik Schatzmann, Franck Legendre, Per Gunningberg,
   and Christian Rohner. "Twitter in Disaster Mode: Security Architecture." _ACM SWID
   2011_. [DOI](https://doi.org/10.1145/2079360.2079367) -
   [local PDF](related-papers/04-twimight-twitter-in-disaster-mode.pdf).
5. Shaddi Hasan. "Designing Networks for Large-Scale Blackout Circumvention." Technical
   Report UCB/EECS-2013-230, University of California, Berkeley, 2013.
   [official record](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2013/EECS-2013-230.html) -
   [local PDF](related-papers/05-designing-networks-for-large-scale-blackout-circumvention.pdf).
6. Dominic Tarr, Erick Lavoie, Aljoscha Meyer, and Christian Tschudin. "Secure
   Scuttlebutt: An Identity-Centric Protocol for Subjective and Decentralized Applications."
   _ACM ICN 2019_, pp. 1-11. [DOI](https://doi.org/10.1145/3357150.3357396) -
   [local PDF](related-papers/06-secure-scuttlebutt.pdf).
7. Daniel R. Sandler and Dan S. Wallach. "Birds of a FETHR: Open, Decentralized
   Micropublishing." _IPTPS 2009_.
   [USENIX](https://www.usenix.org/conference/iptps-09/birds-fethr-open-decentralized-micropublishing) -
   [local PDF](related-papers/07-birds-of-a-fethr.pdf).
8. Piyush Kumar Sharma, Rishi Sharma, Kartikey Singh, Mukulika Maity, and Sambuddho
   Chakravarty. "Dolphin: A Cellular Voice Based Internet Shutdown Resistance System."
   _Proceedings on Privacy Enhancing Technologies_, 2023(1), pp. 589-607.
   [DOI](https://doi.org/10.56553/popets-2023-0034) -
   [local PDF](related-papers/08-dolphin-internet-shutdown-resistance.pdf).
9. Frederick Douglas and Matthew Caesar. "GhostPost: Seamless Restoration of Censored
   Social Media Posts." _6th USENIX Workshop on Free and Open Communications on the
   Internet_, 2016.
   [USENIX](https://www.usenix.org/conference/foci16/workshop-program/presentation/douglas) -
   [local PDF](related-papers/09-ghostpost-restoration-of-censored-posts.pdf).
10. Marc Waldman, Aviel D. Rubin, and Lorrie Faith Cranor. "Publius: A Robust,
    Tamper-Evident, Censorship-Resistant Web Publishing System." _9th USENIX Security
    Symposium_, 2000, pp. 59-72.
    [USENIX](https://www.usenix.org/conference/9th-usenix-security-symposium/publius-robust-tamper-evident-censorship-resistant-and) -
    [local PDF](related-papers/10-publius-censorship-resistant-publishing.pdf).

### 13.2 High-value contextual references from the drafts and reports

- Guillermo Baltra, Tarang Saluja, Yuri Pradkin, and John Heidemann. "Reasoning About
  Internet Connectivity." arXiv:2407.14427, 2024.
  [arXiv](https://arxiv.org/abs/2407.14427).
- Zachary S. Bischof et al. "Destination Unreachable: Characterizing Internet Outages and
  Shutdowns." _ACM SIGCOMM 2023_. [DOI](https://doi.org/10.1145/3603269.3604883).
- Christopher Lemmer Webber et al. "ActivityPub." W3C Recommendation, 2018.
  [specification](https://www.w3.org/TR/activitypub/).
- Aravindh Raman et al. "Challenges in the Decentralised Web: The Mastodon Case."
  _ACM IMC 2019_. [DOI](https://doi.org/10.1145/3355369.3355572).
- Cecylia Bocovich et al. "Snowflake, a Censorship Circumvention System Using Temporary
  WebRTC Proxies." _33rd USENIX Security Symposium_, 2024.
  [USENIX](https://www.usenix.org/conference/usenixsecurity24/presentation/bocovich).
- Scott Burleigh et al. "Bundle Protocol Version 7." RFC 9171, 2022.
  [RFC](https://doi.org/10.17487/RFC9171).
- Ben Laurie, Adam Langley, and Emilia Kasper. "Certificate Transparency." RFC 6962, 2013. [RFC](https://doi.org/10.17487/RFC6962).
- Rasmus Dahlberg and Tobias Pulls. "Aggregation-Based Certificate Transparency Gossip."
  _ARES 2018_. [DOI](https://doi.org/10.1145/3230833.3230869).

## 14. Bottom-line finding

The reviewed literature does not reveal a missing primitive. It reveals a missing systems
composition and evaluation regime. Mobile DTNs communicate when IP disappears, external-relay
systems regain a narrow path beyond the censor, censorship-resistant stores keep documents from
being removed, and signed decentralized protocols replicate author histories across intermittent
peers. Conventional federation, meanwhile, generally assumes servers remain addressable.

The project's defensible gap is the intersection of these areas: maintaining an independently
operated public-discussion service over surviving but scoped IP components, including servers
that cannot accept inbound connections, and reconnecting separated ISP-local components through
a validating multi-homed node whose application connections are demonstrably bound to the
correct uplinks. The controlled evaluation supports feasibility and exposes a real multi-peer
failure mode. It does not support an unconditional claim of censorship resistance, anonymity,
operation through total disconnection, or field-proven national-shutdown resilience.
