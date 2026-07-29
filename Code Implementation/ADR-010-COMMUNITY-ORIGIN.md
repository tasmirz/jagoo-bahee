# ADR-010 — A community's origin fingerprint comes from the envelope's ingress, not from the projecting node

**Status:** Accepted · 2026-07-29
**Governs:** T2.6 · COM-19, ID-01, FD-04 · FG-03
**Found by:** the P2 two-node gate, on its first run

---

## The defect

`Plans/02` §7 freezes a community identifier as `<name>@<origin_fp>` and marks it **stable
across nodes: Yes**. `CommunityCreateHandler` computed it as:

```ts
const id = communityId(body.name, this.nodeSigner.serverId);
```

`this.nodeSigner` is the **projecting** node. So when node B projected node A's
`jb:community:create:v1` envelope, it stored the community under `dhaka_relief@jbs1<B>`,
while every post A published carried `scope = dhaka_relief@jbs1<A>`.

The result is not a cosmetic mismatch. On node B:

- `PostCreateHandler.authorize` tolerates a missing community (it must, because federation
  can deliver a post before the community that contains it), so **posts silently accepted**;
- `ModActionHandler.authorize` does not, and rejected every moderation action with
  `FORBIDDEN: community is not known here`;
- every membership, role and permission check on B resolved against a community document
  that no envelope in the network refers to.

A federated community was therefore unmoderatable and unjoinable, while looking fine in the
feed. This is precisely the ID-01 failure class — an identifier that a remote node cannot
resolve or verify — arriving through a different door than v1's Mongo ObjectIds.

P1's suite could not have caught it: with one node, "the projecting node" and "the origin
node" are the same node, and the bug is invisible. It failed on the two-node gate's first
run, which is what that gate is for.

## Decision

`DomainHandler.authorize` and `.project` take an optional `HandlerContext`:

```ts
export interface HandlerContext {
  /** `jbs1…` — this node for a local publish, the delivering peer for a federated one. */
  readonly originServerId: string;
}
```

`IngressPipeline` builds it from `IngressOrigin.originServerId ?? nodeSigner.serverId` and
passes it to both methods. `CommunityCreateHandler` uses
`ctx?.originServerId ?? this.nodeSigner.serverId`.

The context parameter is not an invention: CLAUDE.md §4.3 has always documented
`authorize(body, env, ctx)`. The implementation simply never added it.

**This is provenance, never content.** It is not signed, never re-encoded, and never
influences whether an envelope is valid — FD-03 is untouched. It decides only how one
origin-scoped projection is keyed.

## Why not the alternatives

**Derive the origin from the author's key** (`dhaka_relief@jbk1<creator>`). Stable at every
hop, verifiable from the envelope alone, no ingress plumbing. Rejected because `Plans/02` §7
freezes the example as a **server** fingerprint (`jbs1a4f…`) and `Plans/05` §2 describes
`AnnounceRequest.communities` as "forum communities **hosted**" — both read the origin as a
node, not a person. CLAUDE.md §7.1 is explicit: when a contract looks wrong mid-build, build
against the frozen shape and write the concern down. This is the concern, written down.

**Carry the origin in `CommunityCreate`.** The correct long-term answer, and it is a proto
change: a version bump plus its own decision record, which §7.1 forbids doing mid-phase.

**Use the envelope's `scope` field.** `registry.yaml` declares `scope_kind: NONE` for
`jb:community:create:v1`, so using `scope` would contradict the frozen registry row while
technically not editing it. Worse than an honest version bump.

## Known limitation, and it is real

`originServerId` is the **delivering peer**, which equals the origin for a direct delivery
and diverges under relay: if C relays A's community-create to B, B stamps `@C`. Two nodes
would then hold the same community under different identifiers — the same defect, one hop
further out.

This is acceptable for P2 because every path this build exercises fetches a peer's own
content from that peer: `Deliver` is push-from-origin, and `StreamActivities` / `Backfill`
are pull-from-origin. Relay is a P3 concern (`BridgeRelay`, T3.11), and it is the phase that
must not ship without the contract fix.

**The fix, for whoever picks this up:** add `bytes origin_server_key = 9;` to
`CommunityCreate` in a `jb:community:create:v2` row, signed by the creator, verified on
ingress against the accepting node's own key. Every node then derives the same identifier
from the signed bytes, at any hop count, with no ingress context at all — and this ADR can
be superseded rather than extended.

Tracked in `P2-FEDERATION-PLAN.md` §5 and in the build log alongside L-17.

## Consequences

- A community's ID no longer depends on which node projects it, so `FG-03` passes and
  moderation, membership and roles work across instances.
- `forum-parity.spec.ts` no longer asserts a hand-written `jbs1test` literal. It takes the
  origin from the harness's own signer, because a test that invents a second, different
  server id asserts against a node that does not exist.
- Handlers that do not care about origin are unaffected — the parameter is optional and 29
  of the 30 Forum handlers ignore it.
