# R0 — Vision & Scope

## 1. What this is

A **federated, censorship-resistant community platform** that degrades gracefully from full internet, through ISP-level blocking, to complete national blackout — and keeps working at every step.

It has the shape of a forum (communities, posts, threaded comments, votes, moderation, messaging) because that is what people actually use to coordinate. Underneath, every piece of content is a **self-authenticating signed object** that does not depend on any server for its validity, so it can travel over HTTP, gRPC, LoRa radio, phone-to-phone Bluetooth, or a QR code on a screen, and still be verified on arrival.

Alongside it runs a second, deliberately separate system: **identified broadcast channels and person-to-person messaging**, where knowing exactly who is speaking is the entire point.

## 2. Operating modes

| Mode | Condition | What works |
|---|---|---|
| **Connected** | Normal internet | Everything. Full feed, media, federation, live updates. |
| **Constrained** | ISP blocking, DPI, throttling, IX down | Multi-homeserver failover, ISP-local paths, ISP bridging, text-first. Full feature set at reduced fidelity. |
| **Blackout** | No wide-area IP | Broadcast, messaging, check-ins, and cached content over mesh/LoRa/sneakernet. Content authored offline queues and syncs when any path opens. |

Full ladder with reachability scopes: [`../00-OVERVIEW.md`](../00-OVERVIEW.md) §3.

## 3. Design axioms

Non-negotiable. Every design decision is checkable against these.

| ID | Axiom | Consequence |
|---|---|---|
| **VIS-01** | The author, not the server, makes content valid | A signature is created before the network is touched. Server approval is never a precondition for publishing. |
| **VIS-02** | Identity is a public key | Not a row ID, not a username, not a server-issued token. Names are labels on keys. |
| **VIS-03** | Content is addressed by its hash | Same post, same ID, every node, forever. Dedupe, replay protection, and cross-node references fall out of this. |
| **VIS-04** | One wire format, every transport | The bytes signed in a browser are the bytes sent over LoRa. A verifier need not know how they arrived. |
| **VIS-05** | Moderation is additive, never subtractive at the protocol layer | Servers and moderators publish *opinions* clients may honour. Content cannot be un-published, only un-shown. |
| **VIS-06** | Every censorship action is evidence | Removal or refusal is itself a signed, auditable object. Silent deletion is structurally impossible. |
| **VIS-07** | Cost, not identity, is the anti-abuse primitive | Rate limiting must work against an anonymous user. Requiring identity for spam control is a censorship lever. |
| **VIS-08** | Assume the device is seized | Key revocation, duress destruction, and forward secrecy are requirements, not features. |
| **VIS-09** | Anonymity and identifiability are separate systems | A person's known broadcast identity must never be linkable to their pseudonymous forum identity. |
| **VIS-10** | The fallback path is the primary path whenever it works | Code that only runs during a blackout fails during a blackout. Narrow scopes are preferred continuously so they stay warm. |

## 4. Goal priority

Ordered. A later goal must never be built at the cost of an earlier one, and no later goal may become a dependency of an earlier one.

| # | Goal | Rank | Phase |
|---|---|---|---|
| 1 | Federation works — independent instances exchange, verify, and project content | ★ **Primary** | P2 |
| 2 | ISP-level availability and ISP bridging | ★ **Secondary** | P3 |
| 3 | Broadcast (subscriber pattern) and identified messaging over IP | Tertiary | P4 |
| 4 | Offline store-and-forward | Low | P5 |
| 5 | Reticulum / LoRa | **Lowest** | P6 |

**VIS-11:** Reticulum is an optional adapter behind a transport port, never a dependency. The system must be complete and demonstrable with it absent from the build.

## 5. Out of scope for v2

| Excluded | Why |
|---|---|
| Cryptocurrency, tokens, on-chain anything | Not needed for any requirement; adds regulatory and complexity risk |
| Video transcoding or live streaming | Bandwidth profile is wrong for the target |
| SMS / USSD / IVR gateway | Envelope is designed to fit; no gateway ships in v2. Deferred to v3. |
| Full zk-SNARK group membership | Interface designed for it; v2 uses blind credentials + nullifiers. Upgrade path, not a dependency. |
| Anonymity against a global passive adversary | We are not Tor. Metadata is reduced, not eliminated. |

## 6. Success definition

v2 is successful when a person in a city under an internet shutdown can:

1. Open the app served from a mirror, a USB stick, or a cached PWA.
2. Reach a node **on their own ISP** with no national gateway.
3. Read and post to communities federated with other nodes on that ISP.
4. Receive an emergency broadcast from an organisation they verified in person.
5. Message a specific person end-to-end encrypted.
6. Verify every piece of it cryptographically, trusting no server.

Items 1–3 are P1–P3. Items 4–5 are P4. Item 6 is P0–P1.
