# R1 — Threat Model

## 1. Adversaries

| ID | Adversary | Capability | Primary mitigations |
|---|---|---|---|
| **A1** | **State network operator** | Nationwide DNS/IP/SNI blocking, full internet shutdown, DPI protocol fingerprinting, BGP manipulation, IX shutdown | Multi-homeserver, reachability scopes, ISP-local paths, ISP bridging, mesh, Reticulum, static-exportable client |
| **A2** | **Compromised or coerced instance** | Full DB access, forged server signatures, content deletion, lying to clients, shadowbanning | Client-side signature verification, Merkle transparency log with gossiped tree heads, federation replication, E2EE messaging |
| **A3** | **Device seizure** | Physical access to an unlocked device, compelled unlock | Per-plane key isolation, key revocation, pre-signed duress revocation, per-community key derivation, forward-secret messaging, per-plane panic wipe |
| **A4** | **Mass spam / astroturf operator** | Thousands of IPs, cheap compute, scripted clients | Memory-hard PoW, credit economy, blind credentials, epoch nullifiers, web-of-trust reach limits, subscription consent |
| **A5** | **Passive network observer** | Records all traffic for later analysis | Hybrid PQ key agreement (harvest-now-decrypt-later), metadata minimisation, per-community identity unlinkability, local-only subscriptions |
| **A6** | **Malicious mesh or federation peer** | Injects, drops, replays, or floods traffic | Full pipeline verification before storage and before relay; hop limits; TTL; per-peer quotas; content-ID dedupe; trust-level quota binding |
| **A7** | **Impersonator of a trusted broadcaster** | Registers a confusable channel name, publishes false emergency instructions | Channel ID is the key not the name; confusable-name detection; verification levels; `CRITICAL` gated on vouched status; in-person QR verification |

## 2. Requirements derived from the model

| ID | Requirement | Counters |
|---|---|---|
| **THR-01** | Content validity MUST be verifiable with no network access and no trusted server | A1, A2 |
| **THR-02** | A server MUST NOT be able to delete content without leaving verifiable evidence | A2 |
| **THR-03** | Peer trust affects quota only, never verification | A6 |
| **THR-04** | Every inbound envelope from any transport re-runs the full validation pipeline before storage and before relay | A6 |
| **THR-05** | Message plaintext MUST NOT exist server-side in any plane | A2, A3 |
| **THR-06** | Key material MUST be recoverable-from-seizure by revocation, and pre-revocation history MUST stay valid | A3 |
| **THR-07** | Forum and Signal identities MUST be cryptographically and operationally unlinkable | A3, A5 |
| **THR-08** | Rate limiting MUST function against a fully anonymous actor | A4 (and prevents A1 using identity as a lever) |
| **THR-09** | The node MUST NOT persist any mapping from network address to Forum key | A2, A5 |
| **THR-10** | Subscriber interest MUST NOT be inferable from server-side state by default | A2, A5 |
| **THR-11** | Discovery MUST NOT depend solely on the network that just failed | A1 |
| **THR-12** | Maximum-severity broadcasts MUST require a verified publisher | A7 |
| **THR-13** | A peer that rewrites its transparency log MUST be detectable by its peers | A2 |
| **THR-14** | Panic wipe MUST be available per plane, without unlocking the full app | A3 |

## 3. Explicit non-goals

| Non-goal | Reason |
|---|---|
| Anonymity against a global passive adversary | Requires a full anonymity network. We reduce metadata; we do not claim traffic-analysis resistance. |
| Protection against active malware on an unlocked device | If code runs with the app unlocked, keys are exposed. We limit blast radius (per-plane, per-community keys, revocation), not the root compromise. |
| Availability against sustained physical destruction of all local hardware | Out of software scope. |
| Preventing a determined user from linking their own two identities | We refuse to build linkage features (`SEP-08`) but cannot stop someone posting the same text in both planes. |

## 4. Safety property

The one property that must hold in every operating mode:

> A client holding an author's public key can determine, **with no network access and no trusted server**, whether a given piece of content was genuinely authored by that key and has not been modified.

**THR-15:** This property MUST be demonstrated by an automated test that runs with all network interfaces disabled.

## 5. Threat coverage gate

**THR-16:** Each adversary A1–A7 MUST have at least one automated test demonstrating its primary mitigation. Tracked as `TX.8` in [`../09-TASKS.md`](../09-TASKS.md).

| Adversary | Demonstrating test | Phase |
|---|---|---|
| A1 | `GLOBAL` firewalled; two nodes federate over `ISP_LOCAL` (`TG-02`) | P3 |
| A2 | Consistency proof fails after server-side deletion (`AC-27`) | P1 |
| A3 | Per-plane panic wipe leaves the other plane intact (`P4-G10`) | P4 |
| A4 | 50 concurrent requests vs 10 credits succeed exactly 10 times (`P1-G6`) | P1 |
| A5 | Database inspection shows ciphertext only (`P4-G7`); no Forum↔Signal association (`P4-G9`) | P4 |
| A6 | Tampered envelope from a peer rejected and not relayed (`P5-G3`, `FG-06`) | P2/P5 |
| A7 | `CRITICAL` from an unverified channel filtered by default (`P4-G4`) | P4 |
