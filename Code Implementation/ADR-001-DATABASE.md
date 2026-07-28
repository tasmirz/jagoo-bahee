# ADR-001 — Primary datastore: MongoDB + Redis

**Status:** Accepted · 2026-07-29 · decided by the project owner
**Supersedes:** nothing · **Affects:** `backend/src/adapters/outbound/{mongo,redis}`, `ops/docker-compose.yml`

---

## Context

The frozen Plans name Mongo adapters throughout (`MongoEnvelopeStore`, `MongoProjectionStore`,
`MongoPeerDirectory`, `LocalMerkleLog` backed by Mongo) but storage sits behind ports
(`Plans/07-ARCHITECTURE.md` §2), and `ID-01` forbids any database row ID from appearing in a signed
structure or a federated payload. **No frozen contract depends on the storage engine.** The choice is
therefore an adapter-level decision, reversible by writing a second adapter.

What the storage layer must actually provide:

| Need | Requirement |
|---|---|
| Atomic projection write + Merkle log append | `VP-02` — a projected envelope missing from the log is a transparency failure |
| Exact dedupe by content ID, and by `(content_id, direction)` | `FD-05` — enforced by a unique index, never a read-then-write check |
| Efficient range iteration by monotonic log index | `INF-43` — `Backfill` and `rebuild-projections` both depend on it |
| Full rebuild of every projection from the envelope log | `FM-03`, `AC-72` — byte-identical |
| 500 envelopes/s sustained on one node | `NFR-P03` |
| < 512 MB RAM at idle; runs on a Raspberry Pi 4 | `NFR-F05`, `NFR-F06` |

## Decision

**MongoDB 7 for the envelope log, projections, Merkle log, and peer directory. Redis 7 for credits,
nullifiers, rate limits, and the tagged cache.**

Rationale: it matches the adapter names and shapes already written into the frozen Plans, so no
specification text needs revising; document projections map naturally onto the varied per-feature read
models; and the team carries no translation cost between spec and code.

## Consequences and required mitigations

Two real costs come with this choice. Both are handled, and neither may be quietly skipped.

### C-1 — Transactions require a replica set

`VP-02` needs a multi-document transaction spanning the projection write and the Merkle leaf append.
Mongo provides that only on a replica set, even for a single node.

**Mitigation.** `ops/docker-compose.yml` starts `mongod --replSet rs0` with an init container that runs
`rs.initiate()` on first boot. The Pi deployment profile uses the same single-node replica set — the
memory overhead over standalone is small, but the failure mode when it is missing is a confusing
runtime error deep in the pipeline, so it is configured once and documented.

> Logged as **L-03** in the build log: a standalone `mongod` fails at pipeline step 16/17 with
> *"Transaction numbers are only allowed on a replica set member"*.

### C-2 — `log_index` has no native sequence

`StreamActivities(since_index)`, `Backfill(from_index, to_index)`, and `rebuild-projections` all need a
gapless, monotonically increasing log index. Mongo has no `SERIAL`; the naive fix is a counters document
updated with `findOneAndUpdate($inc)` on every write, which is a single-document hotspot at the
`NFR-P03` target of 500/s.

**Mitigation.** `MongoEnvelopeStore` allocates index **ranges** in blocks (default 256) per process from
a `counters` document, and hands them out in memory. This reduces counter contention by the block factor.

Because a process that dies mid-block leaves its unused indices unassigned, the log index is
**monotonic but not gapless**. Every consumer must therefore treat it as an *ordering key with possible
holes*, never as a count:

- `Backfill` returns "all envelopes with `log_index` in `(from, to]`", and the caller compares the
  **set of content IDs** it received, not the count. `FG-04` ("delivers exactly 20, zero duplicates")
  is asserted on content IDs.
- `rebuild-projections` iterates in `log_index` order and must not assert `index === n`.
- Tree size in the Merkle log is a **separate** counter — leaf count, not log index — since RFC 6962
  inclusion proofs need a dense leaf index. The Merkle append is inside the same transaction, so it can
  safely use `$inc` on the tree-size document without a block allocator.

### C-3 — Search and geo

Mongo text indexes cover `SRC-01`/`SRC-02` (search posts, comments, communities, identities) adequately
for P1. `2dsphere` indexes cover the P4 geographic filters (`SIG-32`, `SIG-34`, `CRS-10`). Neither needs
an extra service. If P1 search quality proves insufficient, the read route sits behind a port and a
dedicated search adapter can be added without touching the pipeline.

## Scaling shape

| Layer | Approach |
|---|---|
| Envelope log | Sharded on hashed `content_id` when a single instance outgrows one node; range iteration by `log_index` served from a secondary |
| Projections | Read preference `secondaryPreferred`; droppable and rebuildable without read downtime (`INF-44`) |
| Redis | Separate logical databases for credits, nullifiers, rate limits, and cache so a cache flush cannot clear a credit balance |
| Node process | Stateless behind a load balancer (`INF-04`); federation streams pinned per peer |

## Revisiting

Reopen this decision if any of these becomes true:

- Single-document counter contention shows up in the `NFR-P03` benchmark even with block allocation.
- The replica-set requirement proves too heavy for the Pi 4 acceptance run (`AC-66`).
- Projection rebuild of 10⁶ envelopes exceeds the `NFR-P10` 10-minute budget.

The alternative evaluated and not chosen was PostgreSQL 16 + Redis: single-node ACID with no replica set,
a true `BIGINT GENERATED ALWAYS AS IDENTITY` log index, and native full-text and PostGIS support. It
remains the fallback, and the port boundary is what keeps that switch cheap. Any migration would replay
the envelope log into fresh projections — which is exactly what `rebuild-projections` already does.
