---
marp: true
theme: default
paginate: true
size: 16:9
header: 'Jagoo Bahee v2'
footer: 'Federated · censorship-resistant · blackout-tolerant'
style: |
  section { font-size: 25px; }
  h1 { color: #1f3a68; }
  h2 { color: #1f3a68; }
  section.lead { text-align: center; }
  section.lead h1 { font-size: 60px; }
  table { font-size: 21px; }
  code { font-size: 0.85em; }
  pre { font-size: 18px; }
  .small { font-size: 20px; }
---

<!-- _class: lead -->

# Jagoo Bahee v2

## A community platform that survives the shutdown

Federated · censorship-resistant · works from full internet down to LoRa radio

<br>

<span class="small">Forum Track · Broadcast & Offline Messaging Track</span>

<!--
Opening line: "Most platforms have an offline mode. This one has an offline *architecture*."
Leave this up for 20 seconds. Don't read it aloud.
-->

---

## 1 · The problem

**When a government pulls the plug, every centralised platform dies at once.**

| What happens | Why the usual answer fails |
| --- | --- |
| National gateway cut | Your servers are outside the country |
| ISPs islanded from each other | Your peers are on the other island |
| DNS / TLS filtering | One domain, one choke point |
| Total IP blackout | No transport at all |
| Platform pressured to remove content | Deletion leaves no evidence |

Relief coordination, missing-person reports and independent reporting all stop **together**,
at the moment they matter most.

> An "offline mode" that queues requests to a server you can no longer reach is not resilience.

<!--
This is the credibility slide. Ground it in a shutdown the audience remembers.
-->

---

## 2 · The core idea

### Every mutation is a self-authenticating signed envelope

```
content_id = "jb1" + base32( SHA-256( canonical_bytes(fields 1..12) ) )
signature  = Ed25519 over the same canonical bytes
```

**There is exactly one write endpoint in the entire system:** `POST /v1/envelopes`

- A post, a vote, a ban, a broadcast, a key revocation — all the same shape
- Validity comes from the **signature**, never from which server delivered it
- The ID comes from the **content**, so every node computes the same one
- Therefore it travels over HTTP, gRPC, Bluetooth, LoRa, or a photographed QR code
  and still verifies on arrival

<br>

**Canonical encoding has exactly one accepted form.** No fallback chains, no "try the legacy
shape too" — that ambiguity *is* a signature-confusion bug, and we foreclose it with a
three-language byte-for-byte agreement gate.

---

## 3 · Two tracks, unlinkable by construction

| | **Track 1 — Forum** | **Track 2 — Broadcast & Messaging** |
| --- | --- | --- |
| Identity | Pseudonymous | **Identified** |
| Root secret | `M_forum` mnemonic | **separate** `M_signal` mnemonic |
| The point | You *cannot* tell who said it | You *can* tell exactly who said it |
| Carries | Communities, posts, comments, votes, moderation | Channels, emergency broadcasts, check-ins, E2EE messages |
| Domains | 30 | 20 |
| Budget | unbounded | ≤ 512 B broadcast · ≤ 1 KB message |

### Why the separation is structural, not policy

If a relief coordinator's **named** broadcast key could be linked to their **anonymous** forum key,
speaking publicly under their real name would retroactively deanonymise every forum post that key
ever made — including posts from years earlier.

<br>

Two mnemonics · two vaults · two certificate trees · two event streams · **two independent panic wipes**.
Every domain belongs to exactly one plane; a mismatch is rejected at pipeline step 5.

---

## 4 · One pipeline, every transport

Every envelope — from HTTP, from a federated peer, from a mesh phone, from a radio —
runs **the same 19 steps in the same order**.

```
 1 SIZE → 2 PARSE → 3 VERSION → 4 DOMAIN → 5 PLANE → 6 ALG → 7 PRIORITY → 8 CLOCK
   → 9 SIGNATURE → 10 CERTIFICATE → 11 DEDUPE → 12 REPLAY        ← no database writes
   → 13 ANTI-ABUSE → 14 AUTHORISE → 15 VALIDATE
   → 16 APPLY  +  17 WITNESS                                     ← one atomic transaction
   → 18 RECEIPT → 19 FANOUT
```

- **Steps 1–12 write nothing.** A flood of forged envelopes cannot be amplified into write load.
- **16 and 17 commit together.** A projected envelope missing from the transparency log is a
  transparency failure, not a minor inconsistency.
- **Peer trust affects quota only — never verification.** A trusted peer's forged envelope is
  rejected exactly as a stranger's is.

Each step is a pure, independently testable function. The pipeline *composes* them and has **no
branch on content type anywhere**.

---

## 5 · Adding a feature never touches the core

`registry.yaml` is the only place a content type is defined — and it generates into
**TypeScript, Rust and Python**.

```yaml
- domain: 'jb:post:create:v1'
  plane: FORUM              # enforced at step 5
  priority: BULK            # enforced at step 7
  credit_cost: 10           # charged at step 13
  requires: [CREDENTIAL, NULLIFIER]
  permission: post.create   # checked at step 14
```

**A new feature = one registry row + one handler.** Zero pipeline changes.

```ts
validate(body, env)          // pure, no I/O
authorize(body, env, ctx)    // against projections
project(body, env, tx)       // same transaction as the log append
```

A `switch` on content type anywhere in the core is **lint-enforced as a build failure** — if one
appears, the abstraction has already failed.

---

## 6 · Federation — the primary goal

Six gRPC RPCs, server-to-server. Two nodes, separate databases, federating for real: `pnpm ops:two-node`

| | |
| --- | --- |
| `Announce` | TOFU admission at `PROBATION` — no admin allowlist |
| `Deliver` | Streaming push, per-peer per-class quota |
| `StreamActivities` | Live pull, **caller-initiated** |
| `Backfill` | Resumable catch-up from a durable cursor |
| `GossipSTH` | Signed tree heads + fork detection |
| `ExchangeDirectory` | Peer discovery |

**Four rules carry the weight:**

- A peer's bytes are **never re-encoded** — re-encoding would silently *repair* a forged envelope
- Trust changes **quota**, never verification — inbound re-runs all 19 steps
- Dedupe is a **unique database index**, not a read-then-write
- An envelope is **never relayed back to its sender**

A node behind CGNAT federates **fully in both directions** over connections it opened.
No port forwarding. That is the default for a home node — not a degraded mode.

---

## 7 · The resilience ladder

The app has no kill switch and no "offline mode" to enter. It degrades one rung at a time.

| Rung | Situation | Still works |
| --- | --- | --- |
| **L0** GLOBAL | Normal internet | Everything |
| **L1** NATIONAL | Transit cut, domestic IX alive | Everything, over national peers |
| **L2** ISP_LOCAL | Each ISP an island | Full forum + signal inside your ISP |
| **L3** BRIDGE | Multi-homed node joins two islands | Class-filtered cross-island relay |
| **L4** LAN / MESH | No wide-area IP | Phone-to-phone WebRTC mesh, `.jbpack` sneakernet |
| **L5** RETICULUM | No IP at all | Emergency broadcasts over LoRa |

### The rule that makes it actually work

> **Code that only runs during a blackout fails during a blackout.**

Path selection prefers the **narrowest working scope** — `LAN` > `ISP_LOCAL` > `NATIONAL` >
`GLOBAL` — **continuously, not on failure**. The fallback path is warm and monitored every ordinary
day, so it is known-good the moment it becomes the only path.

Plus: Tor v3 onion publishing · reverse tunnels through trusted peers · baked-in per-ISP seed lists.

---

## 8 · Two things a censor cannot do quietly

### Stop spam without unmasking anyone

Requiring identity to fight spam *hands the adversary a censorship lever.*
So the primitive is **cost**, not identity — and it works against a fully anonymous user:

memory-hard proof-of-work · credits · **blind credentials** (prove you're a member without
revealing which) · epoch nullifiers

**A check-in costs zero and needs no credential.** Telling people you are alive is never rate-limited.

### Remove content without leaving evidence

- **No server-side approval before publishing** — withheld approval is indistinguishable from a
  network error, which makes silent censorship structurally possible
- Content is valid the instant its author signs it; moderation is **additive signed opinion**
- **Deletion is a tombstone:** ID, author, timestamp, acting moderator and reason stay public —
  only the body is withheld
- Every envelope enters a **Merkle transparency log**, mirrored to an **independent audit service**
- The client **recomputes every proof on-device, with the network disabled**

---

## 9 · Built, and proven by gates

<div class="small">

| | |
| --- | --- |
| **Node** | NestJS, hexagonal, designed to run on a Raspberry Pi 4 in < 512 MB |
| **Client** | Expo React Native — offline-first, Bangla + English, WCAG 2.1 AA |
| **Contracts** | protobuf source of truth → TS · Rust · Python codegen |
| **Storage** | MongoDB (envelopes + projections + Merkle), Redis, S3/MinIO |
| **Extras** | Independent audit log · Python Reticulum sidecar · Tor setup |

</div>

```
pnpm test      →  672 passing · 13 skipped · 0 failing        (57.9 s)
                  backend 476 · frontend 121 · sdk 71 · audit-log 4
pnpm vectors   →  ★ 3 independent implementations agree on 16 vectors, byte-for-byte
```

**Blocking CI gates — each exists because it caught a real, expensive bug:**
cross-language canonical vectors · codegen regenerate-and-diff · import-boundary probes that
**fail on purpose** · real-Mongo atomicity + unique-index gates · two-node federation as its
**own job**, so a green summary can never hide it being skipped.

<span class="small">*Only the envelope log is backup-critical. Every projection rebuilds from it, byte-identically.*</span>

---

<!-- _class: lead -->

## 10 · See it run

```bash
pnpm smoke:local     # certify → auth → blind credential → community
                     # → signed post → projection → inclusion proof
                     # zero infrastructure required

pnpm ops:two-node    # two nodes, separate databases, federating for real

pnpm vectors         # TypeScript ≡ Rust ≡ Python, byte-for-byte
```

<br>

### The one sentence

**Nothing here depends on a server being trustworthy, reachable, or even alive** —
so the platform degrades instead of dying, and every act of censorship leaves evidence.

<br>

<span class="small">`Installation.md` · `Testing.md` · `README.md` — AGPL-3.0-or-later</span>

<!--
Close on the demo, not on the sentence. Run smoke:local live if there is a terminal.
-->
