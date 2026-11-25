# Page 1

**Part 1:** Abstract—During partial Internet shutdowns, even when international transit is disconnected, domestic IP connectivity islands may remain operational. In this research, we examine whether independently operated forum servers can locally accept signed posts and reconcile missing objects through those surviving paths. Jagoo Bahee combines canonical protobuf envelopes verified as the exact received bytes, signed admission receipts bound to those bytes, caller-initiated synchronization, and a quota-bounded, dual-homed validating relay.

**Part 2:** On a constrained and packet-loss-affected link, both a minimal ActivityPub push baseline and our prototype successfully delivered 20/20 posts; when inbound ports were blocked, periodic pull recovered 10/10 posts, whereas the push method could not deliver any. TypeScript, Rust, and Python completely agreed on 20,000 generated and mutated envelope cases. These results establish partition recovery through surviving IP paths on a single-host testbed, rather than validation under a real shutdown or sustained denial-of-service situation.

Index Terms—Federated systems, Internet shutdowns, network partitions, signed objects, store-and-forward.

**Part 3:** Internet disruptions do not always sever connections entirely but instead may reduce bandwidth, restrict particular destinations or protocols, and sever international connections, where domestic networks keep on communicating amongst themselves [1], [2]. According to Baltra et al. [3], the authors have differentiated between connectivity islands, which are a set of sites that keep communication locally with no external connection and peninsulas, which allow some kind of Internet connection. The central issue at hand is whether individually managed server forums will be able to process and record messages on a domestic IP basis.

**Part 4:** Circumvention proxies [4] and device-to-device mesh networks [5]–[7] offer solutions for different connectivity scenarios. Considering the need for resilience and security in distributed systems, this work focuses on secure federation with partial Internet connectivity and makes the following four contributions:

1. A byte-preserving admission path with identical validity requirements for both local and federated entities.
2. Caller-driven delivery, streaming, and backfill via outbound connections with asymmetric connectivity.
3. Quota-limited, dual-homed validating relay with end-to-end data integrity guarantees but no trust skipping validation.
4. Evaluation of route disconnect, network impairments, hop scaling, admission pressure, minimal ActivityPub inbox, and cross-language wire agreement.

**Part 5:** Our statements are only valid for existing IP routes; this architecture will not be able to generate new routes in a total blackout, force admission, or conceal a relay from its operator.

**Part 6:** ActivityPub provides activities to inboxes of actors [8], AT Protocol provides signed repository commits [9], and Nostr uses signed events and relays [10], each showing alternative ways of doing encoding, transport, and interoperability through reachable peers. Snowflake uses temporary WebRTC proxies that need a reachable rendezvous [4], while Anix, Rangzen, and Moby use device-to-device communication when IP access is restricted or missing [5]-[7]. Instead of saying that the current systems do not work at all in partition situations, we explore the more nuanced scenario in which independent servers have IP access among different islands and peninsulas. We combine wire format validation with outbound synchronization and relaying based on quota. Admittance also takes into account the recipient's clock and prerequisite state, relevant peer quotas, and origin-based abuse prevention.

**Part 7:** Certificate Transparency offers Merkle inclusion and consistency proofs [11], [12], while PeerReview and CoSi show accountability by means of verifiable history and witness co-signing [13], [14]. Malformed inputs, replay attacks, and a later hiding of a confessed object are included in our threat model. Receipt is an evidence of the receipt of exact bytes; if the operator refuses the submission of a proposal, then a receipt is not produced.

**Part 8:** The dual-homed bridge contains one address per island and the trust is pre-set. The trust defines peer quotas and traffic classes but never object validity. The bridge runs the whole admission stack in order to validate and store the relayed objects independently of the packet transparent forwarding and sign receipts using its own key. In case when direct inter-island paths are absent, the bridge relays between islands based on quotas of (source uplink, destination uplink, priority) and does not include the supplying peer into fan-out.

**Additional highlighted author information:**

Khulna 9203, Bangladesh

tasmir@tuta.io  sarwad015@gmail.com  hasanideal2002@gmail.com

---

# Page 2

**Part 1:** Clients, validating island nodes, dual-homed relays, and external audit-log services (ALSs). 
The upper bar depicts separately the connectivity concept (L0), situations analyzed in Docker (L1-L3), and the complete disconnect scenario not in scope (L4). 
Audit certificates are passed outside the admission path.

**Part 2:** Empties the queue in (priority, sequence) order, distributes the workload based on (peer, plane), and employs concurrent peer leases in such a way that an inactive connection will not block deliveries to other peers in sequence. Audit-log service (ALS) is performed independent of the write path; receipts are transmitted in audit certificates to ALSs by the client.

**Part 3:** B. Signature Objects and Confession

Each envelope includes a version, plane, domain tag, author key, key algorithm, optional parent, scope, created timestamp (created_at_ms), 16-byte nonce, priority, payload, and anti-abuse fields. Recipients check created_at_ms within a clock window, ranging from seven days prior to the local time (to compensate for off-line transport delays) to ten minutes after (to disallow future-dating); created_at_ms is not expiration.

The author digitally signs the canonical byte sequence of fields 1-12 using Ed25519 [15]; this is tied to the SHA-256 content identifier of that exact byte sequence. Given that traditional binary protoform serialization is not canonical [16], our profile requires increasing order of fields, minimal size varints, omission of default fields, NFC normalization of strings, and unknown-field rejection.

The recipient decodes and re-encodes the byte sequence and rejects any byte mismatch before proceeding with the payload decoding. The re-encoding step before signature validation might transform a non-canonical byte sequence into a canonically valid signed one, masking wire-format abuse of the message at relay level.

**Part 4:** Per-client/network rate limits and peer quotas using HTTP and gRPC respectively are enforced before step 1 (Figure 2). Steps 1 to 12 are purely read operations that validate the request for its canonicality, domain/plane rules, clock window, signature/certificate, and duplicate removal based on the content-ID.

**Part 5:** Step 14 allows the execution of the operation based on the projection, while step 15 ensures domain semantics. Step 16-18 atomically save the initial envelope, update projections, add a Merkle leaf, and sign the receipt. Idempotent retries yield the saved receipt, while non-idempotent retries of an operation that uses the same nonce get rejected as replays. Races between push delivery and backfill are handled by a database uniqueness constraint.

**Part 6:** Entry quotas are checked before read-only checking; authorization happens at stage 14.
**Part 7:** Since the caller initiates each RPC, even a node that is behind carrier-grade NAT or a firewall block can communicate in both directions through outbound connections. Outbound synchronization solves reachability asymmetry problems and not peer discovery because the operator needs to know at least one peer's IP address.

---

# Page 3

**Part 1:** Peer heads

Keyed matching of non-stale heads detects conflict between equally sized roots or tree reduction; STH markings do not need to be checked again for peer head analysis; split view or automated ALS cross-auditing is still pending.

**Part 2:** No receipt is given if rejection happens prior to admission.

**Part 3:** Default RPC deadline restrictions set call control limits at 5 seconds, delivery at 15 seconds (which propagates the cancellation using AbortSignal) and backfill at 30 seconds. Retry intervals for failed deliveries grow exponentially by doubling from 1 second to a maximum of 15 minutes and get flagged as dead-letter on the 13th attempt (with a cumulative backoff time of 47 minutes and 3 seconds, not counting RPC times). Backpressure peer hints are limited to 60 seconds, while testbed uplinks test every 5 seconds with 1.5 second timeouts and fail after 2 tries.

**Part 4:** IV. D. Guarantees of an Audit

Independent ALS audit guarantees canonical envelope decoding, Ed25519 signature by the author, content and server IDs, server receipt signature, and signed tree head (STH) and inclusion proof prior to storing audit certificate.

The Table below lists implemented guarantees and gaps still to be solved. Storing a receipt provides evidence of receiving precise bytes even after the server removes those bytes.

In case of comparing peer reports on STHs, a peer evaluates whether the head mentions expected server key, prunes old observations that could cause misordering errors and identifies conflicts between roots of the same size or shrinking tree in new heads.

This comparison is not performing an independent verification of STH signatures, advances the stored observation to larger trees without showing append-only tree growth and cannot find isolated split views in absence of cross-peer audits.
