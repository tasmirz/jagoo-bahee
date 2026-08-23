# Detailed Qualitative and Quantitative Comparison of Related Work

## 1. Purpose and comparison method

This document compares the ten papers collected in this directory with the Jagoo Bahee project.
It complements `literature_review.md`: that document provides a paper-by-paper critical review,
whereas this document aligns the systems on common dimensions and places their reported numbers
side by side.

The comparison includes:

1. Anix;
2. Rangzen;
3. Moby;
4. Twimight;
5. _Designing Networks for Large-Scale Blackout Circumvention_;
6. Secure Scuttlebutt (SSB);
7. FETHR;
8. Dolphin;
9. GhostPost;
10. Publius; and
11. the Jagoo Bahee project, labeled **This project** in the tables.

### 1.1 Interpretation rules

The papers do not evaluate the same problem. Their measurements must not be treated as entries in
one performance leaderboard.

- **Mobile delay-tolerant systems** measure encounters among phones after ordinary packet routing
  disappears. Their latency is dominated by human mobility and contact opportunities.
- **Server and replication systems** assume some IP, LAN, overlay, or storage-transfer path exists.
  Their principal questions are addressability, replication, consistency, and operator autonomy.
- **Alternate-channel systems** preserve a narrow path to an external party through a different
  carrier, such as cellular voice.
- **Restoration and persistent-publishing systems** protect content after publication; they do not
  necessarily preserve a live social service during a routing partition.
- **Analytical work** identifies design constraints without claiming a newly measured system.

The notation used below is:

- **Yes**: the property is an explicit part of the design or implementation.
- **Partial**: the work provides a related but narrower property.
- **No**: the property is outside the design.
- **NR**: the paper does not report a directly usable value.
- **N/A**: the metric or property does not meaningfully apply.
- **Measured**: observed on real devices, carriers, processes, or deployed software.
- **Simulated**: produced by a model or trace-driven simulation.
- **Derived**: calculated in this document from values reported by the source.

Where a paper supplies several configurations, the table retains the condition attached to the
number. A favorable configuration is not silently generalized to the whole system. Likewise, a
reported operational community size is not treated as an experimental sample size.

## 2. Comparison by operating regime

The most important qualitative distinction is what communication substrate remains available.

| Work               | Failure or censorship condition                                                                  | Substrate that remains                                     | Unit of operation                             | Primary service objective                                                | Position relative to this project                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Anix               | Internet infrastructure unavailable inside a country                                             | Bluetooth and Wi-Fi Direct encounters                      | Individual phone/user                         | Anonymous public microblogging with endorsements                         | Handles a more severe below-IP condition, but does not preserve server federation             |
| Rangzen            | Internet and cellular infrastructure unavailable                                                 | Bluetooth data plus Wi-Fi Direct discovery                 | Individual phone/user                         | Anonymous public broadcast with socially weighted propagation            | Complements the project when no domestic packet path survives                                 |
| Moby               | Wide-area packet routing unavailable after pre-outage setup                                      | Bluetooth and Wi-Fi Direct encounters                      | Individual phone/contact pair                 | Private, anonymous, forward-secret messaging                             | Stronger private-message and anonymity goal; no public forum federation                       |
| Twimight           | Disaster damages or congests Internet access                                                     | Bluetooth encounters; Twitter returns later                | Individual phone/Twitter account              | Disaster tweets and encrypted direct messages                            | Shares signed store-and-forward content, but uses phones and freezes membership during outage |
| Hasan              | General national blackout design space                                                           | Any proposed dissent-network substrate                     | Network/operator design                       | Explain scale, safety, capacity, and deployability trade-offs            | Supplies evaluation criteria rather than a competing implementation                           |
| Secure Scuttlebutt | Intermittent connectivity and absence of a central service                                       | IP overlay, LAN, pubs, or alternate transfer               | User identity and its append-only log         | Subjective social applications over selectively replicated signed logs   | Closest prior work for signed offline-first social replication                                |
| FETHR              | Central provider dependence, with routable HTTP still available                                  | Addressable HTTP publishers and subscribers                | Publisher/provider                            | Provider-independent signed micropublishing                              | Closest reviewed provider-federation design, but assumes reachable subscriber URLs            |
| Dolphin            | Packet data shutdown while cellular voice remains                                                | Speech-band data over a phone call                         | Caller and trusted outside callee/cloud       | Low-rate access to email, news, or Twitter outside the shutdown          | Restores a narrow external path rather than domestic federation                               |
| GhostPost          | A platform admits a post and later deletes it                                                    | Weibo, browser observers, HTTPS, and circumvention         | Browser user plus central restoration service | Restore previously visible censored posts                                | Addresses post-publication deletion, not loss of federation reachability                      |
| Publius            | Hosts may remove or modify static Web content                                                    | Enough reachable Web replica servers                       | Publisher, server set, and retrieval proxy    | Censorship-resistant, tamper-evident static publishing                   | Strong persistence prior art; lacks live discussion and partition routing                     |
| This project       | Global transit or direct inter-ISP routes are removed, but scoped domestic IP components survive | ISP-local IP plus optional source-bound multi-homed bridge | Independently operated forum server           | Preserve signed public-discussion federation across surviving components | Targets the middle regime between globally connected federation and total packet loss         |

### 2.1 Consequence of the regime distinction

Anix, Rangzen, Moby, and Twimight can continue without ordinary IP because they build a new
phone-to-phone delay-tolerant network. This project cannot do that. Its advantage is conditional:
when domestic packet paths remain, it can reuse servers, databases, moderation state, and normal
application semantics, and it can propagate usable forum state in seconds rather than waiting for
physical encounters. The lower latency is primarily a consequence of the surviving substrate, not
proof that the project is a superior solution to total disconnection.

Dolphin makes the opposite trade. It retains access to external services at very low bit rates and
through a trusted outside callee. This project preserves richer domestic communication without
requiring a path outside the affected region, but it does not restore the global Web.

GhostPost and Publius are availability and persistence systems. Their censorship event occurs
after material has been published or distributed. This project instead focuses on continuing the
admission, replication, and projection of new objects while routes change.

## 3. Detailed qualitative comparison

### 3.1 Architecture, replication, and recovery

| Work               | Data model and granularity                                                                 | Dissemination model                                                                                 | Local/offline readability                                    | Recovery after missed contact                                             | Addressability assumption                                                    | Administrative model                                                        |
| ------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Anix               | Short public messages, one-time pseudonyms, and signed votes                               | Epidemic exchange during phone encounters                                                           | Yes, from the phone's local queue                            | Later encounters spread retained messages and votes                       | Nearby discovery, not IP server addressability                               | Every user operates a peer                                                  |
| Rangzen            | Anonymous public messages with noisy social-priority values                                | Epidemic store-carry-forward                                                                        | Yes                                                          | Later encounters continue propagation; low-priority items may be evicted  | Nearby phone encounter                                                       | Every user operates a peer                                                  |
| Moby               | Pairwise encrypted ciphertext without explicit source/destination fields                   | Epidemic DTN queues                                                                                 | Yes, for locally available ciphertext and delivered messages | Later contacts relay queued ciphertext until TTL/queue policy removes it  | Nearby phone encounter; secure state bootstrapped earlier                    | Every user operates a peer                                                  |
| Twimight           | Signed public disaster tweets and encrypted direct messages                                | Bluetooth epidemic exchange; own tweets later uploaded to Twitter                                   | Yes                                                          | Continued encounters plus eventual upload when Twitter returns            | Nearby phone encounter; preloaded Twitter/TDS identity                       | Central identity preparation with peer forwarding during disaster           |
| Hasan              | N/A; design framework                                                                      | Compares mesh, directional, multi-radio, planned, and DTN choices                                   | Depends on proposed design                                   | Depends on proposed design                                                | Warns that topology and operator assumptions dominate feasibility            | Evaluates operator and user roles as first-class constraints                |
| Secure Scuttlebutt | Complete single-writer signed hash-chained logs; blobs stored separately                   | Selective log replication and gossip                                                                | Yes; applications read local replicas                        | Peers exchange sequence positions and missing log suffixes                | Some peer, LAN, pub, or transfer path must eventually exist                  | User-centric, subjective replicas; pubs are optional rendezvous             |
| FETHR              | Complete signed micropublishing updates with per-author hash chains and cross-author links | Publisher push plus optional subscriber gossip                                                      | Yes for already received updates                             | Gaps can be detected; subscriber can contact the publisher                | Publishers and subscriber callback URLs are assumed routable                 | Independent publishers/providers                                            |
| Dolphin            | Small application requests and responses encoded into audio chunks                         | Reliable request/response over a voice call                                                         | Only previously returned data                                | Chunk sequence, acknowledgements, retransmission, and in-order reassembly | Reachable phone number and trusted outside callee/cloud                      | Caller depends on an external gateway operator                              |
| GhostPost          | Copies of observed Weibo posts and deletion observations                                   | Browser clients report to a central service; extension reinserts text                               | Partial; restoration depends on service/path                 | Central database can serve an observed deleted post                       | Weibo plus access to GhostPost are required                                  | Central restoration service plus distributed observers                      |
| Publius            | Encrypted static document plus Shamir key shares                                           | Publisher writes to multiple Web servers; proxy retrieves any usable threshold                      | Partial; retrieval requires enough reachable replicas        | Client tries additional replicas/shares                                   | At least one encrypted copy and at least _k_ shares must be reachable        | Independent storage servers coordinated by publisher/client proxy           |
| This project       | Canonical raw signed typed objects with content IDs and dependencies                       | Durable server outbox, outbound delivery, receive stream, backfill, and optional cross-uplink relay | Yes for locally stored/projected objects                     | Durable cursor, content-ID deduplication, requested backfill, and retry   | A server may be no-inbound, but it must be able to initiate a path to a peer | Independent community servers plus deliberately configured bridge operators |

### 3.2 Identity, confidentiality, and user safety

| Work               | Authorship/integrity                                                                                  | Author or endpoint anonymity                                                                        | Payload confidentiality                                                                                         | Exposure that remains                                                                                   | Revocation or compromise response                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Anix               | One-time pseudonym signatures and anonymously signed endorsements                                     | Strongest public-message anonymity in the corpus; selected contacts can link temporary identities   | Trust and identity-control messages are protected; public posts are intended to spread                          | Application use, nearby radio activity, followed-user behavior, and revealing content remain observable | Soft revocation excludes selected contacts; hard revocation addresses compromised identity lineages               |
| Rangzen            | Encrypted peer exchange, but public messages intentionally lack stable author attribution             | Plausible authorship deniability with noise in priority propagation                                 | Encounter channel is protected; broadcast content is distributed to peers                                       | App use, local encounters, message content, and compromised friend-graph fragments remain exposed       | Users can remove friendships; no attributable public author key to revoke                                         |
| Moby               | Intended recipient authenticates ratcheted ciphertext                                                 | Sender and receiver identifiers are hidden from intermediate relays                                 | End-to-end encryption and forward secrecy for private messages                                                  | Link-layer broadcasts reveal use; a global local-radio observer is outside the model                    | Double Ratchet limits past-key exposure; targeted device compromise remains outside the core guarantee            |
| Twimight           | Public tweets are signed under TDS-issued certificates                                                | No dissident anonymity; ordinary Twitter identity is retained                                       | Direct messages are encrypted; public disaster tweets are not                                                   | Identity, Bluetooth participation, public content, and stale revocation state remain visible            | Cached CRL and certificates with 14-day lifetime; no new enrollment during outage                                 |
| Hasan              | Distinguishes integrity/encryption from anonymity                                                     | Treats deniability and operator safety as essential design goals                                    | Depends on proposed system                                                                                      | Purpose-built hardware and visible operators may increase physical/legal risk                           | N/A                                                                                                               |
| Secure Scuttlebutt | Ed25519 signature, sequence number, and previous-message hash per log entry                           | Stable pseudonymous identity, not anonymity                                                         | Peer transport can be encrypted, but replicated social history is readable by recipients                        | Immutable signed history, social graph, and identity linkage can endanger users                         | Forked feed is stopped; key migration and multi-device identity remain difficult                                  |
| FETHR              | Signed updates, per-author hash-chain continuity, and cross-author hashes                             | No dedicated anonymity design                                                                       | No content-confidentiality mechanism for public micropublishing                                                 | Publisher URLs, subscriptions, graph, and message contents are observable                               | Not a central focus; continuity detects missing/changed history                                                   |
| Dolphin            | End-to-end secure channel plus reliable integrity checks                                              | Does not hide that a call occurs; data modulation aims to be difficult to classify                  | Yes, between caller and callee                                                                                  | Call metadata, callee number, active probing, and learned acoustic features remain risks                | Fresh channel keys; censor can still block numbers or disrupt calls                                               |
| GhostPost          | Observer signs its restoration claim, not the original author's object                                | Friend-only restoration can narrow exposure, but platform and service retain substantial visibility | HTTPS protects transport to the service                                                                         | The platform sees posts/users; a bait post can identify an observer                                     | User can restrict recipients; no cryptographic recovery of original-author intent                                 |
| Publius            | Hash-derived addressing detects content/share tampering; no author signature is required              | Publisher anonymity requires a separate anonymous upload path and non-identifying content           | Document is encrypted at storage servers; client reconstructs the key                                           | Connection logs, hyperlinks, and retained update passwords may identify/coerce publisher                | Password-authorized update/delete; threshold choice controls resilience                                           |
| This project       | Content-derived ID, canonical bytes, author signature, key status, authorization, and semantic checks | Pseudonymous attribution, not anonymity                                                             | Public forum objects are verifiable rather than secret; private messaging is outside the partition contribution | Server endpoints, peer graph, timing, volume, bridge use, public author key, and content remain visible | Key/certificate mechanisms exist, but the evaluated partition path does not establish coercion or metadata safety |

### 3.3 Trust, abuse control, and malicious participants

| Work               | How trust is represented                                                   | Spam/flood control                                                                                          | Behavior of an untrusted or malicious relay                                                                    | Sybil/misinformation treatment                                                                                         | Main residual weakness                                                                                     |
| ------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Anix               | One-way trust, reciprocal trust, referrals, and endorsements               | Receivers rank content by trusted anonymous votes                                                           | Relays cannot forge valid message/vote signatures, but can omit or locally observe traffic                     | Designed to reduce Sybil vote influence; outcome depends on attackers' ability to gain social trust and user awareness | A socially well-connected or coercive attacker can still influence ranking; broad jamming remains possible |
| Rangzen            | Mutual-friend intersection produces a social score                         | Noisy score, priority decay, and bounded storage protect scarce queues                                      | Relay can drop traffic but cannot easily make low-trust propaganda dominate under assumed graph conditions     | Sybils do not help unless they acquire honest friends                                                                  | Security depends heavily on social-graph and attacker-connectedness assumptions                            |
| Moby               | Direct and optional one-/two-hop social trust                              | Queue reservation/preferences retain trusted messages under injected load                                   | Intermediate node cannot read endpoints/payload, but can drop or flood                                         | Outsider flooding is constrained; compromised trusted users remain damaging                                            | Delivery still falls sharply under attack; no formal global anonymity proof                                |
| Twimight           | Certificate validity establishes identity                                  | At most 500 tweets per encounter, with up to 250 positions reserved for sender-originated content           | Invalid signatures can be rejected; relay omission is unavoidable                                              | Quota limits one encounter but does not solve coordinated identities or false signed content                           | Security extensions were not exercised in the reported experiment                                          |
| Hasan              | N/A                                                                        | Recommends capacity-aware and limitation-tolerant design                                                    | Highlights operator capture, congestion, and physical targeting                                                | Warns that cryptography alone does not create safe participation                                                       | Framework supplies constraints but no evaluated defense                                                    |
| Secure Scuttlebutt | Social graph selects which logs to replicate; local blocking is subjective | Selective replication and local blocks limit unwanted data                                                  | Invalid or out-of-order log entries are rejected; relay can eclipse or omit                                    | No global Sybil authority; subjective trust limits relevance locally                                                   | Eclipse, onboarding, complete-log growth, and immutable abuse records                                      |
| FETHR              | Explicit subscriptions and provider choice                                 | Subscription choice is the principal filter; no detailed resource defense                                   | Signature/hash-chain checks expose modification or gaps; subscriber gossip can improve availability            | No developed Sybil or misinformation defense                                                                           | Addressability and push fanout become bottlenecks; no receiver quotas are evaluated                        |
| Dolphin            | Bootstrap secret and trusted callee                                        | Narrow bandwidth and known callee restrict access; not a social-spam design                                 | Callee is trusted with external operations; channel corruption triggers retransmission                         | N/A for public social content                                                                                          | Callee numbers and modulation can be blocked; gateway is a chokepoint                                      |
| GhostPost          | User-selected friends may receive restored posts                           | Recipient restriction limits exposure, not service-wide load                                                | Central service can omit, observe, or become unavailable                                                       | Targeted bait attacks can identify observers                                                                           | Requires the post to be visible first and cannot prove refused admission                                   |
| Publius            | Threshold independence across replica servers                              | Proof of work and per-address storage limits are proposed, not implemented                                  | Some bad servers are tolerated if enough correct copies/shares remain                                          | No social identity or misinformation model                                                                             | Storage/network DoS and server collusion can defeat availability                                           |
| This project       | Peer trust controls eligibility, accepted classes, and quotas              | Origin admission plus receiver-side per-peer/per-class envelope and byte limits; bulk gets reduced capacity | Every relayed/backfilled object re-enters cryptographic and semantic validation; relay can still omit or delay | Valid spam is quota-bounded, not eliminated; no complete Sybil or misinformation solution                              | A compromised origin can create valid spam; a bridge is observable/coercible and can selectively censor    |

### 3.4 Availability, federation, and audit capability matrix

| Work               | No packet IP required                      | Live independent server federation | Full participation without inbound listener              | Explicit reconnect/backfill                     | Scoped endpoint/path selection | Source-bound multi-homed bridge          | Content survives one origin's loss/deletion   | Admission acknowledgement/audit                     |
| ------------------ | ------------------------------------------ | ---------------------------------- | -------------------------------------------------------- | ----------------------------------------------- | ------------------------------ | ---------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| Anix               | Yes                                        | No                                 | N/A                                                      | Partial: later encounters                       | No                             | No                                       | Partial: copies persist on phones             | No                                                  |
| Rangzen            | Yes                                        | No                                 | N/A                                                      | Partial: later encounters                       | No                             | No                                       | Partial: queued copies persist until eviction | No                                                  |
| Moby               | Yes after pre-outage setup                 | No                                 | N/A                                                      | Partial: DTN retry until TTL/eviction           | No                             | No                                       | Partial: ciphertext replicas in queues        | No                                                  |
| Twimight           | Yes after pre-outage provisioning          | No                                 | N/A                                                      | Partial: encounters and eventual Twitter upload | No                             | No                                       | Partial: phone replicas                       | No                                                  |
| Hasan              | Discussed                                  | N/A                                | N/A                                                      | Discussed                                       | No specific protocol           | No specific protocol                     | Discussed                                     | No                                                  |
| Secure Scuttlebutt | Partial: alternate transfer can replace IP | No server-operator federation      | Partial                                                  | Yes: sequence-based suffix synchronization      | No routing scope               | No                                       | Yes for replicated logs                       | No server admission receipt                         |
| FETHR              | No                                         | Yes                                | No: subscriber callback URL is assumed                   | Partial: gaps detected and publisher contacted  | No                             | No                                       | Yes for already pushed full updates           | No                                                  |
| Dolphin            | Uses voice instead of local packet IP      | No                                 | N/A                                                      | Yes at chunk level                              | No                             | External voice gateway, not an IP bridge | Only returned application data                | No                                                  |
| GhostPost          | No                                         | No                                 | N/A                                                      | Restoration from central database               | No                             | No                                       | Yes if an observer captured the post          | No proof of original admission/refusal              |
| Publius            | No                                         | Replica set, not live federation   | No                                                       | Retrieval retries across replicas               | No                             | No                                       | Yes while enough documents/shares survive     | No                                                  |
| This project       | No                                         | Yes                                | Yes: caller-initiated push, receive stream, and backfill | Yes: durable cursor, outbox, deduplication      | Yes                            | Yes                                      | Yes for replicated accepted objects           | Yes for acknowledged acceptance, not silent refusal |

### 3.5 Operational trade-offs

| Work               | Principal strength                                                    | Cost paid for that strength                                                      | Deployment dependency                                                | Most important failure outside its model                                            |
| ------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Anix               | Anonymous public communication and endorsements without Internet      | Long encounter-driven delay, continuous radio work, complex identity/trust state | Sufficient user adoption, mobility, and local radio availability     | Global monitoring/jamming or targeted tracking of a followed user                   |
| Rangzen            | Anonymous broadcast and social resistance to low-trust propaganda     | Hour-scale propagation and reliance on social-graph assumptions                  | Preinstalled app, in-person friendship exchange, citywide encounters | Adversary with many genuine social links or wide jamming coverage                   |
| Moby               | Private, forward-secret, sender/receiver-anonymous messaging          | Pre-outage bootstrap, large DTN queues, hour-scale delay                         | Signal relationship before outage and sufficient mobility            | Global local-radio observer, targeted malware, or many compromised trusted users    |
| Twimight           | Familiar Twitter identities and simple disaster-mode transition       | Central pre-provisioning, no new users, weak anonymity                           | TDS-issued state cached before outage                                | Long outage beyond certificate/revocation assumptions or active political adversary |
| Hasan              | Realistic scale and safety constraints                                | No directly deployable protocol                                                  | Designers must choose among conflicting goals                        | Incorrect operational assumptions invalidate the design                             |
| Secure Scuttlebutt | Offline-first local reads and self-certifying author histories        | Complete-log growth, stable pseudonyms, difficult key/multi-device evolution     | At least one eventual replication path and social onboarding         | Eclipse or future persecution using immutable signed history                        |
| FETHR              | Lightweight provider-independent signed micropublishing               | Inbound URL/addressability and publisher fanout                                  | Routable HTTP publishers/subscribers                                 | Network partition or NAT that removes subscriber reachability                       |
| Dolphin            | External communication when only cellular voice survives              | ~64 bit/s data rate, minute-scale setup, detectable/blockable phone endpoint     | Voice service and outside callee/cloud                               | Learned classifier, active disruption, or number blocking                           |
| GhostPost          | Restores posts deleted after a visibility window                      | Central service, prior circumvention, and uneven coverage                        | Post must first appear and be observed                               | Instant refusal/deletion or targeted bait observation                               |
| Publius            | Threshold resistance to removal and storage-server inspection         | Complex URLs, replica dependence, static-content focus, weak DoS defense         | Enough independent reachable servers and shares                      | Removal/corruption of enough copies or shares                                       |
| This project       | Preserves rich server-side public discussion over surviving scoped IP | Fails under complete packet loss and exposes bridge/server metadata              | At least one domestic path and correctly configured peers/uplinks    | Protocol whitelisting/DPI, total disconnection, bridge coercion, or eclipse         |

## 4. Detailed quantitative comparison

### 4.1 Evaluation-design overview

| Work               | Evidence type                                                   | Evaluated scale                                                                    | Workload or duration                                                              | Adversarial condition in evaluation                                                   | Main reported quantitative result                                                                               | Important quantitative limitation                                                                   |
| ------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Anix               | Android microbenchmarks plus simulation                         | 2 phones; 600 simulated users in a 25 x 25 grid                                    | 120 one-hour steps; device exchange of 100 messages per phone plus 10,000 votes   | Default 2% adversarial nodes; appendices consider 5%, 10%, and 25%                    | >90% dissemination in ~23 hours under the default case; 11.58 s device exchange                                 | Citywide result is simulated and sensitive to trust, voting, mobility, and attacker assumptions     |
| Rangzen            | Android prototype plus mobility/social simulation               | Device benchmarks; main discussed community of 400 simulated nodes                 | Encounter benchmark with 100 messages and 30 friends; plots averaged over 40 runs | Propaganda coalitions and modeled jamming                                             | >80% honest-message reach in 24-48 hours in evaluated settings; favorable summary reports >90% within ~24 hours | Population, popularity, noise, and social graph materially change delivery                          |
| Moby               | Android energy benchmark plus large trace-driven simulation     | Source trace 268,596 users; principal plots 78,486 users; 786 towers over ~180 km2 | Up to 30,000 messages over 3 simulated days                                       | High-volume injected messages and compromised-user cases                              | 50.73% no-attack broad delivery; under attack 13.96% vs 1.15% epidemic baseline                                 | Tower records are a coarse mobility proxy; favorable >0.8 delivery uses selected queue/TTL settings |
| Twimight           | Small real-world prototype experiment                           | 5 people on two office floors                                                      | Longest experiment 2 days; 915 tweets                                             | No adversarial experiment; proposed security extensions excluded                      | ~30% delivered within 4 minutes; almost all within ~2 hours; 51% multihop                                       | Very small, workplace-specific sample with partly generated tweets                                  |
| Hasan              | Analytical thesis and prior evidence synthesis                  | No new deployed system                                                             | N/A                                                                               | N/A                                                                                   | No new end-to-end performance number                                                                            | Provides design constraints, not a quantitative baseline                                            |
| Secure Scuttlebutt | Protocol account plus operational experience                    | Reported community >10,000 users                                                   | Ongoing real use; message maximum 4 KB                                            | No controlled adversarial or partition benchmark                                      | Demonstrates sustained operation and multiple applications                                                      | No latency, delivery, outage, or resource distribution suitable for direct comparison               |
| FETHR              | Trace analysis plus small prototype                             | Trace of 472,735 users and 4,917,042 public messages                               | 3-week Twitter trace; prototype processed ~120,000 author-related messages        | No route failure or adversarial relay experiment                                      | Shows workload skew and prototype feasibility                                                                   | No delivery latency, partition recovery, NAT, or resource percentile data                           |
| Dolphin            | Repeated device/carrier experiments plus real-shutdown anecdote | 4 cellular providers and multiple 2G/3G/4G combinations                            | Each application experiment repeated 30 times                                     | Noise, perturbation, probing, replay, and classification discussed/evaluated in parts | Stable ~64 bit/s with <~2% raw error; 500-character email ~102 s data time                                      | Low-rate application and carrier-specific results; anecdote is not a controlled field trial         |
| GhostPost          | Prototype plus event simulation                                 | 1,000,000 simulated Weibo users                                                    | Adoption 0.05%-2%; checks average 5 per hour; censor means 0.5-24 hours           | Modeled deletion censor; targeted bait discussed separately                           | ~1.5% adoption defeats the majority of post-view suppression even for 30-minute mean deletion                   | Coverage is simulated, view-weighted, and depends on posts first becoming visible                   |
| Publius            | Implementation plus algorithmic threat analysis                 | ~1,500 lines of Perl; no deployment population                                     | Static publication/retrieval algorithms                                           | Server deletion, corruption, and collaboration analyzed                               | Threshold rule: one document copy plus _k_ shares are needed; loss of all copies or _n-k+1_ shares censors      | No reported large-scale latency, throughput, storage, or live censorship experiment                 |
| This project       | Controlled container route-removal gate plus chain benchmark    | 4-node multi-network topology; separate 8-node chain                               | 19 gate checks; 3-object dependency chain; 200 paced posts to hop 7               | One blackholed peer; route cut; bridge quota/failover checks                          | 19/19 checks; 3 objects at 0.5/1.2/2.1 s; 200/200, p50 4.125 s and p99 6.115 s at hop 7                         | One physical host, virtual networks, small topology, and no real shutdown/inter-AS deployment       |

### 4.2 Mobile blackout systems: quantitative detail

These four systems are the most comparable subset because all use phone encounters after ordinary
packet infrastructure is unavailable. Even here, the populations, mobility inputs, message types,
and adversaries differ.

| Metric                                     | Anix                                                                                                              | Rangzen                                                                                  | Moby                                                                         | Twimight                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Communication purpose                      | Public anonymous microblog                                                                                        | Public anonymous broadcast                                                               | Private pairwise messaging                                                   | Public disaster tweets plus DMs                                                          |
| Physical device study                      | 2 Android phones                                                                                                  | Stock Android devices                                                                    | Nexus 5 energy/PSI benchmark                                                 | 5 Nexus One users                                                                        |
| Simulation/field population                | 600 simulated users                                                                                               | Main discussed 400-node community; mobility/social model                                 | 268,596-user source trace; 78,486 in principal plots                         | No city simulation; 5-person office experiment                                           |
| Geographic abstraction                     | 25 x 25 grid                                                                                                      | Real mobility trace overlaid with generated social graph                                 | 786 towers over ~180 km2                                                     | Two office floors                                                                        |
| Evaluation duration                        | 120 one-hour simulation steps                                                                                     | Up to 48 hours in main delivery discussion; 40-run averages                              | 3 simulated days; messages introduced in first 48 hours                      | 2 days in longest experiment                                                             |
| Message workload                           | Device test: 100 messages per device plus 10,000 votes, ~1,300 KB                                                 | Encounter test: 100 messages and 30 friends                                              | Up to 30,000 messages                                                        | 915 tweets, some automatically generated                                                 |
| Default/primary adversary                  | 2% nodes; extended to 5%, 10%, 25%                                                                                | Propaganda coalition and jamming scenarios                                               | High-volume injected traffic; compromised-user cases                         | None in experiment                                                                       |
| Coverage/delivery without main attack      | >90% in ~23 hours under default simulated case                                                                    | >80% in 24-48 hours across evaluated settings; >90% in a favorable summary case          | 50.73% in broad no-attack comparison; >0.8 under favorable queue/TTL choices | ~30% in 4 minutes; almost all in ~2 hours                                                |
| Coverage/delivery under highlighted attack | >90% dissemination reported with 2% non-forwarding adversarial nodes; misinformation ranking evaluated separately | Honest messages remain favored under chosen low-social-connectivity attacker assumptions | 13.96% Moby vs 1.15% epidemic/FireChat under injected load                   | NR                                                                                       |
| End-to-end latency                         | Encounter-driven; ~23 hours to >90% population coverage                                                           | Encounter-driven; 24-48 hours for broad coverage                                         | Favorable high-delivery configurations average 15-17.5 hours                 | 4-minute early delivery; ~2 hours for almost all                                         |
| Local discovery/exchange                   | ~1.8 s discovery; 11.58 s for the stated ~1,300 KB exchange; paper reports ~1.28 Mbit/s                           | 6.61 s average encounter for 100 messages and 30 friends                                 | PSI with 100 inputs takes ~3 s CPU                                           | Controlled by scan interval; encounter transfer details not reported as one aggregate    |
| Energy                                     | 87.68 mAh/hour, reported as 1.5% of 6,000 mAh battery                                                             | ~5.5% battery/hour under continuous encounters every 10 s                                | PSI with 100 inputs consumes ~2.5 J                                          | Estimated uptime: 41 h at 1-minute scans, 58 h at 2-minute scans, 68 h at 4-minute scans |
| Multihop evidence                          | Population-spread simulation                                                                                      | Population-spread and jammer simulations                                                 | Trace-driven epidemic delivery                                               | 51% of delivered tweets used more than one hop                                           |

#### Interpretation

- Anix reports the lowest percentage-per-hour battery figure of the two papers that report that
  form directly: 1.5%/hour versus Rangzen's 5.5%/hour. This is not a controlled head-to-head test:
  the devices, scan schedules, workloads, code bases, and battery capacities differ.
- Twimight exposes the scan-versus-energy trade-off directly. Extending the scan interval from one
  to four minutes increases estimated uptime from 41 to 68 hours, while necessarily reducing how
  quickly encounters can be discovered.
- Moby has the largest trace basis. Its adversarial result shows both the value and limit of
  trust-reserved queues: 13.96% delivery is much better than 1.15%, but is still a large drop from
  the no-attack result.
- Rangzen and Anix evaluate public dissemination, Moby evaluates pairwise delivery, and Twimight
  reports receipt timing in a five-user workplace. Their percentages do not use the same
  denominator and should not be plotted as if they did.

### 4.3 Server, replication, restoration, and publishing systems

| Metric                          | Secure Scuttlebutt                                           | FETHR                                                                                | GhostPost                                                                                                                     | Publius                                                            | This project                                                                                 |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Primary unit                    | Author log/peer                                              | Publisher/provider                                                                   | Observing browser user                                                                                                        | Static document and replica set                                    | Independent forum server                                                                     |
| Reported population/workload    | >10,000 operational users                                    | 472,735 trace users; 4,917,042 trace messages; ~120,000 prototype-processed messages | 1,000,000 simulated users                                                                                                     | No population; ~1,500-line implementation                          | 4-node topology and 8-node chain                                                             |
| Time horizon                    | Ongoing operational community; no benchmark duration         | 3-week workload trace                                                                | Censor mean deletion time 0.5-24 h; clients check ~5 times/h                                                                  | Static retrieval; no timing evaluation                             | Seconds-scale gate plus 200 paced chain samples                                              |
| Payload/data bound              | 4 KB maximum log message; blobs separate                     | Full signed update; no single benchmark size stated                                  | Text restoration; initial prototype omits images                                                                              | Arbitrary encrypted static files, subject to server/storage policy | Signed envelope limits defined by protocol; evaluated objects are certificate/community/post |
| Recovery unit                   | Missing suffix of one author's log                           | Missing signed publisher update                                                      | Previously observed deleted post                                                                                              | Encrypted document plus any _k_ key shares                         | Missing typed objects selected by cursor/backfill                                            |
| Delivery/availability result    | No controlled delivery percentage                            | No controlled delivery percentage                                                    | ~1.5% adoption preserves a majority of relevant views against a 30-minute mean censor; at 1%, >70% daytime and ~90% nighttime | Analytical threshold, no measured availability percentage          | 200/200 posts reached hop 7; dependency chain became renderable at 2.1 s after cut           |
| Failure injection               | None reported                                                | None reported                                                                        | Simulated deletion timing                                                                                                     | Analytical server deletion/corruption                              | Direct path removal, one blackholed peer, bridge failover/quota checks                       |
| Latency distribution            | NR                                                           | NR                                                                                   | Coverage versus deletion window, not transport latency                                                                        | NR                                                                 | Hop-7 p50 4.125 s; p99 6.115 s                                                               |
| Inbound-free full participation | Partial peer/client behavior, not server-operator federation | No                                                                                   | N/A                                                                                                                           | No                                                                 | Yes                                                                                          |
| Routing-scoped bridge           | No                                                           | No                                                                                   | No                                                                                                                            | No                                                                 | Yes, with source-address binding checked in the gate                                         |

#### Interpretation

SSB is the strongest qualitative predecessor for signed offline-first social replication. Its
reported >10,000-user community is stronger operational evidence than the project's small
topology, but the SSB paper does not supply a controlled route-removal latency or delivery
distribution.

FETHR supplies the largest observed public-microblog workload in this subset. Its 4.9 million
messages motivate fanout and gossip, but do not establish behavior when publishers or subscriber
callback URLs become unreachable. The project's controlled failure evidence is stronger for that
narrow condition, while FETHR's workload grounding is much broader.

GhostPost's one-million-user result is entirely simulated and depends on a post being visible
before deletion. It measures recovered post-views, not live federation delivery. Publius gives a
formal threshold condition for static retrieval but no latency or deployment distribution. These
systems should be compared to the project's persistence and audit claims, not to its route-cut
latency.

### 4.4 Dolphin's alternate-channel performance

Dolphin is quantitatively distinct enough to deserve a separate table.

| Measure                | Reported result                                                | Meaning                                                     | Comparison boundary                                                                       |
| ---------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Selected data rate     | 64 bit/s, equal to 8 raw bytes/s                               | Stable speech-band operating point used for applications    | Not comparable with Bluetooth or IP throughput because the carrier is a voice call        |
| Raw error              | <~2% at rates up to 64 bit/s in the highlighted experiments    | Reliability layer can repair a manageable error rate        | Error rises materially at higher encoding rates; ~20% is shown at 256 bit/s in one result |
| Secure-channel setup   | ~1 minute on average                                           | Cost before useful application transfer                     | Setup can dominate a short request                                                        |
| 280-character tweet    | Under 1 minute after setup                                     | Small social post is feasible                               | Does not include ordinary Internet-scale media                                            |
| 500-character email    | ~102 s data-transfer time; ~160 s average case including setup | Text email completes in a few minutes                       | Requires the external callee/cloud to perform the Internet operation                      |
| News retrieval         | 10 short news items in ~2 minutes                              | Low-rate reading is possible                                | Result depends on compact application representation                                      |
| Repetitions            | 30 per application experiment                                  | Better repetition discipline than a single illustrative run | Still limited to selected carriers, devices, and routes                                   |
| Real shutdown anecdote | ~300-character email in about 1 minute during a Delhi shutdown | Shows feasibility outside the lab                           | One anecdote is not a controlled or statistically representative field evaluation         |

The project and Dolphin should not be ranked by raw latency. Dolphin works in a regime where the
project may have no path at all; the project carries richer forum replication only because a
domestic packet path survives.

### 4.5 Within-study derived quantities

These calculations use values reported by the respective work. They are included to make effect
sizes explicit, not to normalize unlike experiments.

| Work         | Derived calculation                | Result                                                                             | Correct interpretation                                                                          |
| ------------ | ---------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Anix         | 87.68 mAh / 6,000 mAh x 100        | 1.46%, consistent with the paper's rounded 1.5%/hour                               | Device-specific continuous-exchange battery cost, not universal phone lifetime                  |
| Moby         | 13.96% / 1.15%                     | 12.14x delivery ratio relative to epidemic/FireChat under the stated attack values | Relative improvement under one attack comparison; absolute delivery remains only 13.96%         |
| Moby         | 13.96% - 1.15%                     | +12.81 percentage points                                                           | Absolute gain is often more informative than the large ratio over a very low baseline           |
| Twimight     | (68 h / 41 h - 1) x 100            | 65.85% longer estimated uptime                                                     | Achieved by changing scan interval from 1 to 4 minutes, which trades discovery speed for energy |
| FETHR        | 4,917,042 messages / 472,735 users | 10.40 trace messages per observed user over 3 weeks                                | Simple mean hides the follower/activity skew that motivates the design                          |
| GhostPost    | 1.5% x 1,000,000 users             | 15,000 modeled adopters                                                            | Simulation scale implied by the majority-restoration result; not a real deployment count        |
| GhostPost    | 1% x 1,000,000 users               | 10,000 modeled adopters                                                            | Population corresponding to the reported >70% daytime and ~90% nighttime view restoration       |
| This project | 407.6 s / 2.1 s                    | 194.10x lower completion time after the scheduling correction                      | Within the same controlled topology; not a speedup over another paper                           |
| This project | (407.6 s - 2.1 s) / 407.6 s x 100  | 99.48% reduction                                                                   | Measures removal of cross-peer head-of-line blocking in one configuration                       |
| This project | 200 / 200                          | 100% observed delivery to hop 7                                                    | Zero loss in a paced 200-sample chain is not a statistical guarantee of perfect delivery        |

## 5. Evaluation-quality comparison

### 5.1 Coverage of important evidence types

| Work               | Real device/process implementation | Large trace or population model              | Controlled adversary                                             | Controlled network failure                            | Repeated trials/distribution                                                | Real outage/carrier evidence                 | Explicit external-validity warning           |
| ------------------ | ---------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| Anix               | Yes                                | Yes, 600 simulated users                     | Yes                                                              | No route-level experiment                             | Yes for microbenchmarks/simulation configurations                           | No                                           | Yes                                          |
| Rangzen            | Yes                                | Yes                                          | Yes                                                              | Jamming is modeled, not routed infrastructure         | 40-run plot averages                                                        | No                                           | Yes                                          |
| Moby               | Yes                                | Yes, very large trace basis                  | Yes                                                              | No server/network-route experiment                    | Multiple configurations                                                     | No                                           | Yes                                          |
| Twimight           | Yes                                | No                                           | No                                                               | Real opportunistic contacts, not an induced partition | Limited small experiment                                                    | No                                           | Yes; security extensions excluded            |
| Hasan              | N/A                                | Uses prior evidence                          | Analytical                                                       | Analytical                                            | N/A                                                                         | Deployment observations from prior work      | Yes, central to thesis                       |
| Secure Scuttlebutt | Yes, operational ecosystem         | Operational population, not controlled trace | No                                                               | No controlled partition                               | No performance distribution                                                 | Real community use, not outage-specific      | Yes                                          |
| FETHR              | Yes, prototype                     | Yes, large Twitter trace                     | No                                                               | No                                                    | No failure distribution                                                     | No                                           | Yes                                          |
| Dolphin            | Yes                                | No large population model                    | Partial active attacks                                           | Carrier variation, not route partition                | 30 repetitions for application tests                                        | Yes, carrier tests and one shutdown anecdote | Yes                                          |
| GhostPost          | Yes, prototype                     | Yes, 1,000,000-user simulation               | Modeled censor                                                   | Deletion timing, not network failure                  | Multiple censor/adoption settings                                           | No                                           | Yes                                          |
| Publius            | Yes                                | No                                           | Analytical malicious servers                                     | Analytical replica loss                               | No                                                                          | No                                           | Yes                                          |
| This project       | Yes                                | Small chain only                             | Blackholed peer and quota checks, but no broad attacker campaign | Yes, controlled route removal                         | p50/p99 for 200 samples; cut-path chain is one controlled run/configuration | No                                           | Yes; one-host container confound is explicit |

### 5.2 Evidence strengths by category

- **Best mobility-scale grounding:** Moby, because its simulator is based on a 268,596-user
  cellular trace, although tower-level observations and normal-period movement remain imperfect
  proxies for blackout encounters.
- **Strongest anonymity-focused public design:** Anix, with Rangzen as its closest predecessor.
  Anix adds revocable, selectively linkable identities and anonymous endorsements.
- **Strongest private-message security goal:** Moby, because it combines endpoint anonymity,
  end-to-end encryption, and forward secrecy.
- **Strongest actual carrier-path evidence:** Dolphin, which tests several providers and includes
  one real-shutdown episode.
- **Strongest operational decentralized-social evidence:** SSB, which reports a community of more
  than 10,000 users, but without controlled partition metrics.
- **Largest public-social workload trace:** FETHR, with 4,917,042 messages from 472,735 users.
- **Largest restoration simulation:** GhostPost, with one million modeled users.
- **Clearest static threshold argument:** Publius, whose availability condition follows from the
  number of surviving document copies and Shamir shares.
- **Strongest controlled routing-failure evidence in this corpus:** This project, because it
  removes the direct path, verifies actual source-uplink use, exposes a blackholed-peer failure,
  and measures the correction. Its external validity is nevertheless weaker than a multi-site or
  real-ISP deployment.

## 6. Why direct numerical ranking would be invalid

### 6.1 Delivery percentages use different denominators

- Anix and Rangzen measure the fraction of a simulated public population that receives a message.
- Moby measures pairwise-message delivery before TTL/queue expiry.
- Twimight reports timing among five co-located participants.
- GhostPost weights recovered post-views, not messages or users.
- This project measures whether paced objects reach a specific final server hop.

Therefore, `>90%`, `50.73%`, `~90%`, and `200/200` describe different events. They cannot be
placed on one y-axis without redefining and rerunning a common workload.

### 6.2 Latency reflects the surviving substrate

The project's seconds-scale values occur over surviving virtual IP paths. The mobile systems'
hour-scale values include waiting for people to encounter one another. Dolphin's minute-scale
values reflect a 64 bit/s audio modem and secure-channel setup. The difference is architectural,
not merely implementation optimization.

### 6.3 Scale is defined differently

- Moby's 268,596 users are records in a source mobility trace, not simultaneously running phones.
- GhostPost's one million users are simulated events.
- FETHR's 472,735 users are accounts observed in an historical workload trace.
- SSB's >10,000 users are an operational-community report, not an experiment cohort.
- This project's 4 and 8 nodes are active controlled instances, but all are on one physical host.

Counting all of these as equivalent "nodes tested" would substantially misrepresent the evidence.

### 6.4 Adversary intensity is not normalized

Anix varies the fraction of adversarial users, Rangzen models social coalitions and jammers, Moby
injects high-volume traffic, GhostPost varies censor deletion speed, Publius reasons about replica
collusion, and this project blackholes one peer while checking quotas and relay policy. These tests
exercise different resources and success criteria.

### 6.5 Statistical reporting is uneven

Rangzen averages plots across 40 runs, Dolphin repeats application experiments 30 times, and the
project reports a 200-sample hop distribution. The project's three-object cut-path crossing is a
controlled demonstration, not a reported multi-run confidence interval. The compact paper should
not imply equal statistical weight for those results.

## 7. Project-relative gap comparison

| Gap dimension                           | Closest reviewed prior work                                                    | What the prior work already establishes                                                             | What this project adds                                                                                            | What still remains unsolved                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Operate during disruption               | Anix, Rangzen, Moby, Twimight, Dolphin                                         | Communication can move to nearby radios or cellular voice when packet data fails                    | Exploits surviving domestic IP to retain a full server service                                                    | Total packet loss, protocol whitelisting, and DPI can still stop it                                       |
| Signed decentralized social replication | Secure Scuttlebutt and FETHR                                                   | Signed author histories, gap detection, delayed sync, gossip, and local reads are established ideas | Typed forum objects, server administration, and route-partition-specific evaluation                               | No claim to a new signature, log, gossip, or federation primitive is justified                            |
| No-inbound participation                | SSB-style peer dialing and client-to-relay systems conceptually precede it     | Outbound connections can traverse many NAT/firewall conditions                                      | One server initiates push, receive stream, and backfill while remaining a full federation participant             | Discovery of an honest reachable peer and long-lived outbound-path blocking remain operational risks      |
| Scoped path selection                   | General multi-homing and path-selection literature                             | A host can possess multiple interfaces and source addresses                                         | Endpoints carry reachability scope; gRPC channels are keyed and bound to the chosen source uplink                 | Real ISP policy, asymmetric routing, DNS, certificate, and OS variations need field evaluation            |
| Multi-ISP bridge correctness            | Dolphin has a gateway, but over voice; mobile DTNs relay among contacts        | Relaying and gateways are established mechanisms                                                    | An ordinary validating server relays only across configured uplink pairs and verifies actual source-interface use | Bridge coercion, capture, traffic analysis, and redundancy are not solved                                 |
| Dependency-complete forum state         | FETHR threads and SSB application logs                                         | Social objects can carry continuity and cross-object structure                                      | Measures certificate, community, and post arrival until the remote post becomes renderable                        | Larger dependency graphs, concurrent edits, and long disconnections need evaluation                       |
| Trust separated from validity           | Anix, Rangzen, and Moby distinguish social trust for prioritization            | Trust can allocate scarce capacity without being equivalent to truth                                | Every peer's object re-enters one validation pipeline; trust only limits class and volume                         | Valid spam, Sybil identities, and misinformation survive within quota                                     |
| Failure isolation across peers          | DTN queues and retry literature broadly motivate independent progress          | Store-and-forward systems should avoid coupling unrelated paths                                     | Deployed route cut exposes 407.6 s head-of-line blocking; concurrent groups reduce it to 2.1 s                    | Scheduler deadline does not necessarily cancel underlying socket work; broader fault campaigns are needed |
| Bounded bridge capacity                 | Twimight reservations; Rangzen/Moby priority queues                            | Scarce disruption capacity needs reservations or priority                                           | Per-pair/per-class byte and envelope buckets reserve capacity from bulk traffic                                   | No proof against distributed valid floods or malicious bridge scheduling                                  |
| Persistence/accountability              | Publius, GhostPost, SSB, transparency logs                                     | Replication, tamper evidence, and witnessed histories have strong prior art                         | Signed acceptance receipts and replicated objects support evidence of acknowledged admission                      | Cannot prove silent refusal, force future serving, guarantee erasure, or detect every split view          |
| Evaluation under route removal          | No exact primary-corpus match; Dolphin is closest in real-path experimentation | Related systems show device, carrier, trace, or operational feasibility                             | Reproducible controlled topology jointly tests cut, bridge, source binding, quota, dependencies, and failover     | Separate physical hosts, real ASes/ISPs, repeated cut trials, and field shutdowns remain necessary        |

## 8. Overall comparative findings

### 8.1 Where the related systems are stronger

The project should explicitly acknowledge the dimensions on which prior work is stronger:

- **Anix and Rangzen** provide public-message anonymity and operate when ordinary packet IP is
  absent.
- **Moby** provides private-message confidentiality, forward secrecy, and endpoint anonymity,
  supported by a much larger mobility trace.
- **Twimight** provides a small but real human mobility experiment and evaluates battery life under
  multiple scanning intervals.
- **Hasan** treats operator safety, radio capacity, and deployability more deeply than the current
  project.
- **Secure Scuttlebutt** has far stronger evidence of sustained use by a real decentralized social
  community.
- **FETHR** is grounded in a much larger real social workload.
- **Dolphin** has actual carrier experiments and an example during a real shutdown.
- **GhostPost** studies adoption and censor response at a simulated million-user scale.
- **Publius** gives a clearer analytical threshold for static-content survival across malicious or
  failed storage servers.

### 8.2 Where this project is distinct

No reviewed paper jointly evaluates all of the following:

1. independently administered public-discussion servers;
2. continued operation over surviving but scoped IP components;
3. full push, receive, and recovery behavior from caller-initiated connections;
4. byte-preserved author-signed objects passing through one receiver validation pipeline;
5. a multi-homed application bridge whose connections are bound to explicit source uplinks;
6. cross-uplink relay policy with per-class resource reservations;
7. dependency-complete forum projection after a route cut; and
8. failure isolation when an unrelated peer is blackholed.

This is a conjunction and evaluation claim. It is not evidence that any individual mechanism is
new.

### 8.3 Quantitative claim that is supportable

The strongest quantitative statement is narrow:

> In a controlled four-node, one-host container topology, the deployed gate passed 19 of 19
> separation, path, bridge, quota, crossing, and failover checks. After the direct exchange path
> was removed, the author certificate, community object, and dependent post arrived after 0.5,
> 1.2, and 2.1 seconds. A prior serial outbox required 407.6 seconds because one blackholed peer
> blocked the healthy bridge path; concurrent per-peer draining reduced the observed completion
> time by 99.48% in that configuration. Separately, 200 of 200 paced posts reached hop seven in an
> eight-node chain, with 4.125-second median and 6.115-second p99 latency.

The statement must retain "controlled," "one-host," and "in that configuration." It should not be
rewritten as proof of national-shutdown performance.

### 8.4 Qualitative claim that is supportable

The strongest qualitative statement is:

> The reviewed blackout systems predominantly replace failed packet routing with mobile encounters
> or a narrow alternate carrier, while the reviewed social-replication systems do not evaluate
> reachability-scoped server federation and a source-bound multi-ISP bridge under route removal.
> This project addresses that intermediate operating regime, conditional on at least one surviving
> domestic IP path.

## 9. Recommended comparison material for the compact paper

For a short conference paper, the most useful condensed comparison is a six-column table with the
following rows:

| Work/family                | Surviving substrate                                          | Server federation                 | No-inbound full participation | Source-bound bridge   | Evaluation most relevant to claim                                    |
| -------------------------- | ------------------------------------------------------------ | --------------------------------- | ----------------------------- | --------------------- | -------------------------------------------------------------------- |
| Anix/Rangzen/Moby/Twimight | Nearby phone radios                                          | No                                | N/A                           | No                    | Mobility simulation/device studies; hour-scale dissemination         |
| Secure Scuttlebutt         | Intermittent IP/LAN/alternate transfer                       | Not independent server federation | Partial                       | No                    | >10,000-user operational community; no route-cut benchmark           |
| FETHR                      | Routable HTTP                                                | Yes                               | No                            | No                    | 4.9M-message trace and prototype; no partition experiment            |
| Dolphin                    | Cellular voice to outside peer                               | No                                | N/A                           | External gateway only | ~64 bit/s carrier tests and one shutdown anecdote                    |
| GhostPost/Publius          | Platform plus restoration path, or reachable replica servers | No live federation                | No/N/A                        | No                    | Million-user deletion simulation, or analytical threshold storage    |
| This project               | Surviving scoped domestic IP                                 | Yes                               | Yes                           | Yes                   | 19-check route-cut gate, 2.1 s dependency crossing, 200-sample chain |

The accompanying prose should then state that SSB and FETHR are the closest architectural
neighbors, while Anix, Rangzen, Moby, and Dolphin are complementary systems for more severe or
different connectivity failures.

## 10. Source index

1. Sina Kamali and Diogo Barradas, "Anix: Anonymous Blackout-Resistant Microblogging with
   Message Endorsing," IEEE S&P 2025. [Local PDF](01-anix-blackout-resistant-microblogging.pdf) -
   [DOI](https://doi.org/10.1109/SP61157.2025.00015).
2. Adam Lerner et al., "Rangzen: Anonymously Getting the Word Out in a Blackout," 2016.
   [Local PDF](02-rangzen-blackout-broadcast.pdf) -
   [arXiv](https://arxiv.org/abs/1612.03371).
3. Amogh Pradeep et al., "Moby: A Blackout-Resistant Anonymity Network for Mobile Devices,"
   PoPETs 2022. [Local PDF](03-moby-blackout-resistant-anonymity-network.pdf) -
   [DOI](https://doi.org/10.56553/popets-2022-0071).
4. Theus Hossmann et al., "Twitter in Disaster Mode: Security Architecture," ACM SWID 2011.
   [Local PDF](04-twimight-twitter-in-disaster-mode.pdf) -
   [DOI](https://doi.org/10.1145/2079360.2079367).
5. Shaddi Hasan, "Designing Networks for Large-Scale Blackout Circumvention," UCB/EECS-2013-230.
   [Local PDF](05-designing-networks-for-large-scale-blackout-circumvention.pdf) -
   [Official record](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2013/EECS-2013-230.html).
6. Dominic Tarr et al., "Secure Scuttlebutt: An Identity-Centric Protocol for Subjective and
   Decentralized Applications," ACM ICN 2019. [Local PDF](06-secure-scuttlebutt.pdf) -
   [DOI](https://doi.org/10.1145/3357150.3357396).
7. Daniel R. Sandler and Dan S. Wallach, "Birds of a FETHR: Open, Decentralized
   Micropublishing," IPTPS 2009. [Local PDF](07-birds-of-a-fethr.pdf) -
   [USENIX](https://www.usenix.org/conference/iptps-09/birds-fethr-open-decentralized-micropublishing).
8. Piyush Kumar Sharma et al., "Dolphin: A Cellular Voice Based Internet Shutdown Resistance
   System," PoPETs 2023. [Local PDF](08-dolphin-internet-shutdown-resistance.pdf) -
   [DOI](https://doi.org/10.56553/popets-2023-0034).
9. Frederick Douglas and Matthew Caesar, "GhostPost: Seamless Restoration of Censored Social
   Media Posts," USENIX FOCI 2016. [Local PDF](09-ghostpost-restoration-of-censored-posts.pdf) -
   [USENIX](https://www.usenix.org/conference/foci16/workshop-program/presentation/douglas).
10. Marc Waldman, Aviel D. Rubin, and Lorrie Faith Cranor, "Publius: A Robust, Tamper-Evident,
    Censorship-Resistant Web Publishing System," USENIX Security 2000.
    [Local PDF](10-publius-censorship-resistant-publishing.pdf) -
    [USENIX](https://www.usenix.org/conference/9th-usenix-security-symposium/publius-robust-tamper-evident-censorship-resistant-and).

## 11. Bottom line

Qualitatively, the related papers are stronger in several individual dimensions: mobile operation
without IP, anonymity, forward secrecy, real user communities, carrier testing, large mobility
traces, or threshold persistence. Quantitatively, their reported outcomes range from seconds-long
device encounters to hour-scale city dissemination, million-user simulations, and operational
populations above 10,000. These values measure different success events and cannot support a
single rank ordering.

The project's narrower strength is that it measures a combination absent from the reviewed
evaluations: full server federation over surviving scoped IP, no-inbound bidirectional sync,
source-correct multi-homed bridging, uniform validation, bounded relay classes, and
dependency-complete delivery after direct route removal. Its 19/19 gate, 2.1-second post-cut
dependency completion, and 200/200 hop-seven delivery support mechanism feasibility. They do not
establish anonymity, total-blackout operation, Internet-scale capacity, or field-proven resilience
to a national censor.
