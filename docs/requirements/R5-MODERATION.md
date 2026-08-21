# R5 — Moderation, Labels & Transparency

Plane: **FORUM** (labels and mod actions). Contracts: [`../03-CONTRACTS-FORUM.md`](../03-CONTRACTS-FORUM.md) §6, [`../02-CONTRACTS-CORE.md`](../02-CONTRACTS-CORE.md) §3

## 1. Governing principle — publish then attest

**MOD-01:** Server approval MUST NOT be a precondition for publishing. A post is valid the instant its author signs it.

| Property | Pre-publish LLM gate | Publish-then-attest |
|---|---|---|
| Server can silently censor | **Yes** — withheld approval is indistinguishable from a network error | **No** — a missing label is visible; a `RESTRICT` label is signed evidence |
| Works offline / on mesh | No — needs a round trip before publishing | **Yes** |
| Round trips before publishing | 2 + inference latency | 0 |
| User can contest a decision | Nothing to point at | Signed label with `reasons[]` and `appealable` |
| Multiple opinions possible | No — one gatekeeper | **Yes** — labellers may publicly disagree, a stronger signal than one opaque verdict |

The value in the gate idea is preserved: the LLM still explains *specifically what it thinks is wrong* via `Label.reasons[]`, surfaced in the composer as advice. It simply no longer holds the publish button.

## 2. Moderation actions

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| MOD-02 | Post actions: approve, remove, restore, lock, unlock, pin, unpin, flag, unflag | ✓ | P1 |
| MOD-03 | Comment actions: approve, remove, collapse, uncollapse, flag, unflag | ✓ | P1 |
| MOD-04 | Member actions: ban, unban, mute, unmute, kick | ✓ | P1 |
| MOD-05 | Moderator signature on every action | ✓ | P1 |
| MOD-06 | Mod actions carry a **nonce**; replay is rejected | ✗ | P1 |
| MOD-07 | Mod actions carry domain separation and an optional expiry | ✗ | P0 |
| MOD-08 | Mod queue UI | ✓ | P1 |
| MOD-09 | Public mod log with actor, verb, target, reason, timestamp | ✓ | P1 |
| MOD-10 | Mod log **hash-chained** per community | ✓ | P1 |
| MOD-11 | Removal is a public tombstone — ID, author, timestamp, moderator, and reason stay visible; only the body is withheld | partial | P1 |
| MOD-12 | Appeal flow against a removal or a label | — | P1 |

### MOD-06 rationale

v1 moderator signatures were `${action}|${subredditId}|${postId}|${reason}` — no nonce, no expiry, no server binding. Anyone who observed one could replay it forever, on any instance. An approve/un-approve loop was trivially replayable.

## 3. Reports

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| MOD-13 | Create report against post, comment, or identity | ✓ | P1 |
| MOD-14 | Report reason taxonomy (10 categories) | ✓ | P1 |
| MOD-15 | List reports per community with filters | ✓ | P1 |
| MOD-16 | Get, resolve, dismiss report | ✓ | P1 |
| MOD-17 | Pending report count | ✓ | P1 |
| MOD-18 | Report status lifecycle: pending → reviewed → resolved / dismissed | ✓ | P1 |
| MOD-19 | Action-taken record on resolution | ✓ | P1 |

## 4. Labels

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| LBL-01 | Signed `Label` envelope: target, verdict, categories, confidence, model ID, reasons, appealable | — | P1 |
| LBL-02 | Verdict scale: `OK`, `REVIEW`, `RESTRICT`, `DANGEROUS` | — | P1 |
| LBL-03 | LLM labeller service behind a `LabelProvider` port | — | P1 |
| LBL-04 | Human moderator labels use the same envelope, `model_id: "human:mod"` | — | P1 |
| LBL-05 | Advisory pre-flight check in the composer — **non-blocking** | — | P1 |
| LBL-06 | Labeller failure MUST fail open; publishing always succeeds | — | P1 |
| LBL-07 | Client-configurable labeller trust set, with a shipped default | — | P1 |
| LBL-08 | User MUST be able to remove any labeller, including the home instance's | — | P1 |
| LBL-09 | Labels render with labeller attribution and reasons | — | P1 |
| LBL-10 | Third-party labellers (fact-checkers, community mod teams) can publish without instance cooperation | — | P1 |

**LBL-11:** A dead moderation service must never become an outage. This is tested by stopping the labeller and confirming publishing still succeeds (`P1` gate).

## 5. Transparency log

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| TRL-01 | Every accepted envelope's content ID appended as a Merkle leaf (RFC 6962 structure) | ✗ | P1 |
| TRL-02 | Signed Tree Head published at least every 60 seconds and on demand | ✗ | P1 |
| TRL-03 | Every receipt carries an inclusion proof (⌈log₂ n⌉ hashes) | ✗ | P1 |
| TRL-04 | Consistency proofs between any two tree sizes | ✗ | P1 |
| TRL-05 | Append-only storage format | ✗ | P1 |
| TRL-06 | Tree heads gossip between federated peers | — | P2 |
| TRL-07 | A peer that forks its log is detected, flagged, and demoted | — | P2 |
| TRL-08 | `PeerObservation` catches a peer showing different logs to different partners | — | P2 |
| TRL-09 | Client verifies a stored inclusion proof offline against a stored STH | — | P1 |
| TRL-10 | Server-side deletion causes the consistency proof to fail — deletion is **detectable** | — | P1 |

### What TRL replaces

| v1 mechanism | Problem |
|---|---|
| `createProofHash = SHA256(userId \| postId \| serverKeyId)` | All three inputs are public, so anyone can compute it. It proved nothing while being presented in the UI as verification. |
| `audit-service` flat JSON file | No hash chain, no Merkle tree, no signed tree head, and a full-file rewrite per submission — both a tamper vector and an O(n) DoS vector. |
| Server acknowledgements | Server-only attestation with no way to detect a rewritten history. |

## 6. Audit & verification surface

| ID | Requirement | v1 | Phase |
|---|---|---|---|
| MOD-20 | Server public key endpoint | ✓ | P1 |
| MOD-21 | Receipt lookup by content ID | ✓ | P1 |
| MOD-22 | Receipt verification endpoint (stateless helper for third parties) | ✓ | P1 |
| MOD-23 | Signature verification endpoint | ✓ | P1 |
| MOD-24 | Client-side receipt verification page | ✓ | P1 |
| MOD-25 | Local proof store (acknowledgements page) | ✓ | P1 |
| MOD-26 | External witness service (optional remote `WitnessLog` adapter) | ✓ | P1 |
| MOD-27 | Post audit trail showing every envelope affecting it, in order | ✓ | P1 |
