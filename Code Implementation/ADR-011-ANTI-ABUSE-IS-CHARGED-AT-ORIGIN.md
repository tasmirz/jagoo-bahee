# ADR-011 — Anti-abuse is an admission cost charged at origin, not on every hop

**Status:** Accepted · 2026-07-29
**Governs:** pipeline step 13 · VIS-07, FD-03, FD-15, FG-09
**Found by:** running `pnpm ops:two-node` for real, after FG-01…FG-10 were already green

---

## The finding

Two containers, separate databases, a genuine handshake at `TRUSTED`, delivery working. Every
federated envelope was then rejected on arrival:

```
NO_CERTIFICATE: author key is not certified
INSUFFICIENT_CREDITS: valid proof of work required
```

The second explains the first. The `jb:key:certify:forum:v1` row requires proof of work, so the
author's certificate never projected on node B, so every post that followed it was uncertified.

The proof was valid. It was minted against **node A's** `POW_SECRET`, and node B has its own.

## Why this is structural, not a configuration mistake

Every anti-abuse gate in this system is deliberately keyed to one node:

| Gate | Keyed to |
| --- | --- |
| Proof of work | `StatelessArgon2Pow` over that node's `POW_SECRET` |
| Credits | that node's Redis ledger |
| Blind credential | that node's RSA issuer |
| Epoch nullifier | that node's nullifier registry |

That is not incidental. `POW_SECRET` is per node precisely so a challenge minted by one node
cannot be spent at another; a shared secret across a federation would let any compromised node
mint proofs for all of them, and would put the operators of every node in one trust domain — the
opposite of what federation is for.

So a proof minted for node A is not merely *unverifiable* on node B. It is **meaningless** there,
and B rejecting it is B correctly saying "this was not bought from me".

Charging again on arrival therefore makes **every gated domain unfederatable** — which is 29 of
the 30 Forum rows, and the PRIMARY goal traded away for a cost the sender already paid once.

## Decision

Pipeline step 13 runs for **locally published** envelopes and is skipped when
`IngressOrigin.peerId` is set.

```ts
if (!origin.peerId) {
  await acceptAntiAbuse(envelope, spec, d.antiAbuse);
}
```

The receiving node's protection against a flooding peer is what P2 built for exactly this
purpose, and it is strictly better suited to the job:

- **Per-peer, per-class token buckets** (FD-15), spent at the transport boundary *before* the
  pipeline is entered — so a flood costs the node a bucket decrement, not a pipeline run.
- **Trust bounds the classes a peer may push at all** (FG-09): a `PROBATION` peer cannot send
  `BULK` regardless of how much proof of work it has done.
- **Repeated breach demotes the peer and alerts the operator** (FD-16).

A per-envelope cost is the right primitive against an anonymous stranger arriving over HTTP,
because there is no other relationship to price. A per-peer quota is the right primitive against a
peer, because there *is* one — a peer has an identity, a trust level, and a history.

## What is NOT skipped — FD-03 is untouched

Verification runs identically for every envelope from every transport. A federated envelope still
passes size, canonical parse, version, domain, plane, algorithm policy, priority, clock window,
**signature**, **certificate**, dedupe, replay, authorisation and body validation. Peer trust
affects quota only, never verification, exactly as FD-03 requires.

**What is skipped is a PAYMENT, not a CHECK.** FG-06 still passes: a tampered envelope from a
`TRUSTED` peer is rejected, because tampering is caught at step 9, not step 13.

## What this costs

A peer can relay envelopes whose origin never actually paid — it could mint them itself and claim
they were federated. Its quota bounds the volume, its trust bounds the classes, and FD-16 demotes
it for repeated breach; but within one quota window it can push content that paid nothing.

This is the same exposure any federated system has to a misbehaving peer, and it is bounded by
policy this node controls unilaterally. It is a strictly better position than the alternative,
which is not federating.

## The concern, written down (CLAUDE.md §7.1)

`Plans/02` §5 lists step 13 without qualifying it by transport, and CLAUDE.md §4.2 says every
envelope from every transport runs the same pipeline in the same order. Read literally, that
requires the behaviour this ADR changes — and read literally, it also makes the PRIMARY goal
unreachable, because the two requirements cannot both hold while anti-abuse secrets are per node.

The frozen text is not wrong about the *ordering*, which is preserved, or about *verification*,
which is preserved. It is silent on whether a cost is charged once or per hop, and this records
the reading that keeps both FD-03 and the primary goal.

**If a future phase wants cost to travel with the envelope**, the mechanism exists in the
contract already: a `SignedTreeHead`-style attestation from the origin node that it charged the
envelope, verifiable by any peer holding that node's key. That is a proto addition and a version
bump, and it belongs with P4's broadcast work where cross-node cost accounting matters more.

**Asserted by:** `ingress.spec.ts` — a gated envelope with no anti-abuse block is rejected when
published locally and accepted when delivered by a peer; and the two-node suite, where a
certificate and the posts that depend on it now cross.
