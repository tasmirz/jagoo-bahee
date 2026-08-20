# NSysS 2026 threat-model audit

## Purpose and interpretation

This is the repository-to-paper audit for the reframed system: a pseudonymous, federated public
forum that remains usable on ISP-local networks and across a multi-homed domestic bridge when the
global Internet or a national exchange is unavailable. Mesh, Reticulum, LoRa, Bluetooth and
off-grid delivery are outside the paper. They may exist in the repository, but they are not a
defence claimed by `paper/main.tex`.

Two similarly numbered mechanisms must not be confused:

- the **nineteen-step admission pipeline** validates every envelope, including every envelope a
  bridge receives before step 19 decides fanout; and
- ISP availability is the separate **T3.1--T3.22** programme: scoped endpoints, path selection,
  discovery, a multi-homed bridge, quotas, failover, NAT traversal and operator/client surfaces.

“Resists” below means the repository contains a concrete mechanism and testable property. It does
not mean the mechanism eliminates the threat. “Partial” names the remaining attack explicitly.

## Threats already named in the repository

`Plans/requirements/R1-THREAT-MODEL.md` defines seven adversaries: a state network operator, a
compromised/coerced instance, device seizure, mass spam/astroturfing, a passive network observer, a
malicious federation peer, and an emergency-channel impersonator. `paper/main.tex` narrows these to
the Forum and L0--L3 reachability story. The paper currently names suppression, relay tampering,
history rewriting, invalid-input flooding, partition, peer framing and Sybil flooding.

The implementation also records choices that are themselves threat responses:

- signatures and content-derived identifiers make edits detectable;
- canonical decoding rejects alternate encodings before signature verification;
- steps 1--12 of admission do not write, and projection plus witness append commit atomically;
- peer trust affects quota, never validity;
- admission cost is charged once at the origin, while receivers impose per-peer/per-class quotas;
- moderation is a signed additive assertion and removal leaves a tombstone;
- node receipts, signed tree heads, client-held certificates and independent audit retention preserve
  evidence of acknowledged content;
- narrower reachable scopes are preferred continuously, and a bridge is an ordinary verifying,
  multi-homed node whose cross-uplink fanout is opt-in and quota-bound;
- durable outboxes, re-announcement and backfill recover after path changes; and
- Forum and identified Signal identities use separate roots, while the node is forbidden to persist
  an IP-address-to-Forum-key mapping.

## Consolidated technical and sociotechnical threat matrix

| Threat | Resistance in this design | Coverage | Residual risk / why it is not solved |
|---|---|---|---|
| Operator edits a post, comment, vote or moderation action | The author's signature covers the admitted bytes; the content ID is derived from those bytes; clients verify both. | Strong for detection | The operator can serve an old but valid object or omit a newer one. Integrity is not freshness or completeness. |
| Operator deletes acknowledged content | The client retains the exact request, node-signed receipt, signed tree head and inclusion proof as a portable certificate and can forward it to independent append-only audit services; federation creates other copies. | Partial, evidence preserving | Evidence exists only after acknowledgement and only while at least one client, peer or auditor retains it. The system cannot prove that an unacknowledged submission was accepted, compel continued service, or recover a body after every copy is destroyed. |
| Operator silently withholds or shadowbans content | Content becomes author-valid before server approval; moderation and labels are signed assertions; clients may change server and consume federated copies. | Partial | A local operator still controls its read API, peer set and default client policy. Omission before any honest replica observes the object is indistinguishable from loss. Cross-node completeness is not proven. |
| Abusive or captured moderation | Public signed mod actions, reasons, role changes, reports, labels and tombstones create accountability; moderation policy is instance-local rather than protocol validity. | Partial | Transparency does not make a decision fair. Operators can refuse federation, clients can default to one label source, and communities can suffer brigading, moderator capture, inconsistent norms and volunteer burnout. Portability of identity is not portability of community governance. |
| Illegal, dangerous or personally identifying content | Instance-local hiding, signed moderation, labels and reports let each operator apply local law and community policy without rewriting the shared signed object. | Partial and intentionally tensioned | Replication and durable evidence increase legal, safety and privacy exposure. Tombstones preserve metadata that a victim may want erased. The design has no global removal, appeal or jurisdiction-resolution mechanism. |
| Relay modifies or relabels content | Passthrough federation preserves received bytes; non-canonical encodings are rejected; server and client recompute identifiers and verify signatures. | Strong for detection | A relay can still omit, delay, reorder or selectively forward valid content. |
| Malicious peer injects, replays or floods | All applicable admission checks rerun; dedupe/replay checks, per-peer quotas, class restrictions, demotion and backpressure constrain work. | Partial | A valid malicious peer can consume its granted quota, and the origin-payment exception lets it relay content that did not pay at that peer. Link and CPU exhaustion remain possible before or during verification. |
| History rewrite, rollback or split view | Projection and Merkle append are atomic; nodes sign and gossip tree heads; timestamp ordering prevents stale observations from being mistaken for rollback, and a smaller current head raises a local alarm. | Partial | Timestamps do not prove Merkle consistency and a malicious log controls its own timestamps. Detection requires an honest observer to exchange inconsistent heads; a colluding or eclipsed neighbourhood can maintain a false view. Without a consistency proof the result remains `unknown`, not proof of guilt or innocence. |
| Malicious or unavailable third-party audit server | Audit services independently verify certificates, reject conflicts and hash-chain append-only records; clients can retain and submit to several services. | Partial | The audit service learns the public envelope, can withhold availability, and its local hash chain is not a globally witnessed transparency log. Multiple services help only when independently operated and discoverable. |
| National gateway, DNS/IP/SNI blocking or IX shutdown | ISP-local and national endpoints, continuous narrowest-scope preference, explicit source-IP binding, durable peer/seed directories and multi-homed bridging avoid dependence on an external host. | Partial, core claim | It requires domestic IP reachability, reachable local nodes, and at least one bridge for disconnected ISP islands. It does not survive every access link being disabled, power loss, equipment seizure, or destruction of all domestic hosts. |
| Bridge blocking, capture or coercion | Bridges are ordinary verifiers, can be multiplied, enforce opt-in pairs and quotas, reserve higher-priority capacity, expose readiness, and fail over between uplinks. | Partial | A topology with one bridge has a chokepoint. A coerced bridge can omit traffic, reveal metadata or disappear; signatures reveal tampering but not omission. The paper does not measure independently operated redundant bridges. |
| CGNAT or no inbound address | An outbound-only node can federate over a connection it opens; reverse tunnelling through a trusted peer is available. | Partial | Bootstrapping still needs a reachable peer and directory. The tunnel provider becomes a metadata observer and availability dependency. |
| Eclipse, peer-directory poisoning or trust capture | Operators select peers, TOFU starts at probation, promotion needs vouching, trust changes quota only, and baked-in/retained seeds reduce dependence on one live directory. | Weak/partial | There is no proof that the discovered peer set is diverse or honest. An adversary controlling first contact or enough vouches can isolate a node while serving only valid, selectively incomplete history. |
| DNS, certificate or clock dependency during blackout | Peers can use explicit scoped addresses and durable directories; signed application objects do not depend on a live CA after receipt. The clock window is configurable and tree heads carry signed timestamps. | Partial | Initial name resolution, TLS deployment choices, certificate expiry and clock drift can still prevent connections or reject valid envelopes. The paper's single-host testbed has zero clock skew and does not exercise these failures. |
| Invalid-envelope DoS | Raw size is checked before parsing; steps 1--12 write nothing; per-peer quotas run at the transport boundary; class buckets reserve capacity. | Partial, measured narrowly | The measured result is zero database writes, not immunity to CPU, socket, bandwidth, log, queue or storage exhaustion. Expensive valid signatures/PoW, slowloris behaviour and many peers remain unmeasured. |
| Spam, Sybils, brigading and astroturfing | Memory-hard PoW, credits, blind credentials and epoch nullifiers price anonymous actions; per-peer quotas bound federation input. | Partial by design | Cost bounds rate, not identities or coordinated humans. Wealthier attackers have more compute; resource-poor users and low-end phones may be excluded. Popularity manipulation and coordinated harassment are governance problems, not cryptographic ones. |
| Deanonymisation by account records | Forum identity is a public key; no email/password or civil identity is required; per-community derivation and blind credentials reduce direct linkage; nodes must not persist IP-to-key mappings. | Partial; the correct claim is pseudonymity | A server or ISP observes live network addresses and timing, and an audit service receives the public envelope. Key reuse, writing style, social graph, posting time, attachments, malicious clients and correlation across bridges can identify users. Optional Tor helps only while an external Tor path is reachable and is not a blackout remedy. |
| Global passive observation and traffic analysis | No substantive defence is claimed. | Out of scope | There is no cover traffic, mixing, padding discipline or formal anonymity analysis. An observer on both sides can correlate flows. |
| Device seizure, malware or compelled unlock | Separate identity roots, per-plane panic wipe, revocation and forward-secret messaging reduce blast radius outside the paper's Forum focus. | Partial/out of paper scope | An unlocked compromised device exposes keys and drafts. Revocation takes effect only after reaching peers and public content already linked to a key remains linkable. |
| Key loss, malicious revocation or long partition | Deterministic key recovery and signed revocation mechanisms exist. | Partial | Lost recovery material can make a pseudonym unusable; delayed revocation leaves a stolen key valid inside an island; aggressive revocation can itself be censorship. |
| Impersonation and confusable identities | Cryptographic identity is the key, not the display name; the broader system has confusable-name checks and verification levels. | Partial | Humans act on names and avatars. Look-alike identities, compromised trusted keys and false but correctly signed speech remain possible. |
| Disinformation from authentic users | Signatures establish who controlled a key and that bytes are unchanged. Labels and moderation can add counter-speech. | Not solved cryptographically | Authenticity is not truth. Anonymous provenance reduces real-world accountability, and federated moderation can fragment the shared factual context. |
| Censorship through client defaults or app distribution | Users can change servers and moderation policy in principle; the client can retain seeds and signed content. | Weak/partial | A dominant client, app store, preloaded seed set or label provider can become a de facto censor. The repository does not establish reproducible distribution, plural default providers or governance for default changes. |
| Insider abuse, operator error and software supply chain | Hexagonal boundaries, deterministic vectors, cross-language parity, tests and signed objects limit accidental divergence. | Partial | A malicious release can exfiltrate keys or selectively hide valid content while still producing valid protocol messages. Reproducible builds, update transparency and independent code audits are not demonstrated. |
| Economic and operational sustainability | Nodes are independently deployable and bridges expose quotas/metrics. | Unproven | Storage, bandwidth, moderation, legal defence and multi-ISP transit cost money. Concentration around a few funded operators recreates coercible chokepoints even if the protocol is federated. |
| Accessibility and unequal admission cost | Bangla/English UX, low-bandwidth envelopes and multiple anti-abuse mechanisms reduce some barriers. | Partial | PoW is regressive across device classes and electricity access; blackouts correlate with power scarcity and physical risk. No user study measures whether the intended population can bootstrap, understand scope, preserve evidence or change servers safely. |

## What the paper may claim

The strongest defensible claim is not “anonymous, zero trust and censorship proof.” It is:

> The system is a pseudonymous, server-independent integrity and evidence layer for a federated
> forum, plus a tested mechanism for retaining domestic IP reach across ISP partitions when at least
> one local path and, where needed, a multi-homed bridge remain available.

The paper may claim that edits are detectable, acknowledged deletions leave portable evidence,
moderation is attributable, and the measured container topology continues to exchange content after
the simulated exchange route is severed. It must not claim sender anonymity against network
observers, guaranteed completeness, fair moderation, Sybil elimination, field-proven national
blackout survival, or operation with no IP path.

## Paper changes required by this audit

1. Describe portable audit certificates and independent retention next to the nineteen-step pipeline.
2. Separate modification, acknowledged deletion, omission and moderation; they have different proof
   and availability properties.
3. Replace “anonymous” with “pseudonymous” unless the sentence specifically refers to anonymous
   admission credentials. State that no email/password is collected but network anonymity is not
   provided.
4. State the availability preconditions: domestic IP survives, local nodes exist, and disconnected
   islands have at least one reachable multi-homed bridge.
5. Name eclipse/discovery capture, bridge concentration, valid-work DoS, clock/TLS dependencies,
   malicious client defaults and moderation/governance capture as residual threats.
6. Keep mesh/radio/Reticulum out of the contribution, evaluation and comparison. One out-of-scope
   sentence is enough.
7. Explain that all nineteen admission steps apply at a bridge (except the origin-priced payment at
   step 13), while the ISP mechanism itself comprises T3.1--T3.22; do not call either list “the 19
   steps of ISP bridging.”

## Repository evidence used

- `Plans/requirements/R1-THREAT-MODEL.md` and `R0-VISION-SCOPE.md`
- `Plans/requirements/R5-MODERATION.md`
- `Plans/06-CONTRACTS-TRANSPORT.md`
- `Code Implementation/P3-ISP-AVAILABILITY-PLAN.md` and `P3-HANDOFF.md`
- `Code Implementation/ADR-009-PORTABLE-AUDIT-CERTIFICATES.md`
- `Code Implementation/ADR-011-ANTI-ABUSE-IS-CHARGED-AT-ORIGIN.md`
- `backend/src/core/app/ingress.ts`
- `backend/src/core/app/bridge-relay.ts`
- `backend/src/core/domain/transport/path-selection.ts`
- `backend/src/adapters/inbound/http/network-subject.ts`
- `packages/sdk-ts/src/core/audit-certificate.ts`
- `services/audit-log/src/server.ts` and `store.ts`
