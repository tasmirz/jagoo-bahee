# ADR-008 — Raw-bytes federation ingress, the direction ledger, and envelope origin

**Status:** Accepted · 2026-07-29
**Governs:** T2.4, T2.6, T2.7, T2.8 · FD-05, FD-13, FD-14, FED-12, FED-28 · FG-05, FG-06

Three decisions on the inbound federation path, recorded together because each one exists to close a
specific way a peer could make our node do the wrong thing.

---

## 1. The gRPC layer carries bytes, never re-encoded messages

`federation.proto` declares `Deliver`, `StreamActivities` and `Backfill` in terms of `Envelope`
messages. `IngressPipeline.accept` takes `Uint8Array`. The obvious bridge — decode the frame into a
ts-proto object and call `Envelope.encode()` to get bytes back — is wrong, and dangerously so.

`packages/sdk-ts/src/core/decode.ts` does not restate the five canonical rules; it decodes, **re-encodes
and compares bytes**, so one check covers field order, omitted zeros, minimal varints, unknown fields,
NFC and trailing data. Re-encoding in the adapter would perform that normalisation *before* the
pipeline ever sees the input. A peer could then send any of the many non-canonical encodings of a
signed envelope, have our adapter quietly rewrite it into the canonical form, and watch it validate.
That is the v1 signature-confusion bug class, arriving over the network from an untrusted source, past
the exact gate built to foreclose it.

**Decision.** `adapters/inbound/grpc/raw-envelope-codec.ts` supplies a passthrough codec
(`encode: bytes => bytes`, `decode: bytes => bytes`) and a `FederationWireDefinition` derived from the
generated `FederationDefinition` with the `Envelope` request/response types replaced by it. The handler
receives the peer's exact framed bytes and passes them to `accept()` unmodified.

This is wire-compatible: gRPC length-prefixes each message body, so a serialized `jagoo.v1.Envelope`
handed through verbatim is byte-identical to what any conforming implementation would frame.

**Asserted by:** a test that delivers a protobuf-valid but non-canonical encoding of a genuinely signed
envelope and requires `MALFORMED` — not acceptance, and not silent repair.

---

## 2. `(content_id, direction)` is a unique database index, not a check

FD-05 and FED-12 require deduplication enforced by the database. The reason is specific: v1 did
`findOne` then `insertOne` and caught error 11000, but **no unique index was ever declared**, so the
catch was unreachable and the guard was a race that looked like a guard.

**Decision.** Collection `federation_ledger`, unique compound index `{ content_id: 1, direction: 1 }`,
with `direction ∈ {'in','out'}` plus `peer_id`, `log_index` and `recorded_at_ms`. The inbound row is
written inside the same transaction as projection and witness append. A duplicate key error **is** the
dedupe result; there is no read-then-write anywhere on this path.

Why a separate collection rather than extending the envelope store's existing unique index on
`content_id`: the envelope log holds exactly one row per envelope regardless of how many peers offered
it. Direction and peer attribution are federation bookkeeping, not properties of the content, and
`ID-01` forbids local storage detail leaking into anything signed or federated.

Note that pipeline step 11 (DEDUPE) still runs and still short-circuits with the original receipt
(ER-01). The ledger is not a replacement for it — it is the guarantee that holds when two deliveries
race past step 11 concurrently, which is exactly the case a read cannot cover.

**Asserted by (FG-05):** three things, because "it didn't crash" is what v1 also observed —
(1) `listIndexes` reports the index with `unique: true`; (2) concurrent double delivery yields exactly
one projection; (3) the duplicate-key branch was genuinely entered.

---

## 3. Envelopes carry an origin, so they are never relayed back to their sender

FD-14 and FED-28 require that a node not re-relay an envelope to the peer it received it from. No task
in `Plans/09-TASKS.md` owns this, and it is not optional: with T2.6 (inbound projection) and T2.8
(outbound queue) both present and no origin, node A fans out to B, B accepts and fans out to A, A
dedupes at step 11 — but only after a full network round trip, for every envelope, forever. Content
deduplication (FD-13) makes the loop terminate; it does not make it free.

**Decision.** `IngressPipeline.accept(raw, origin?)` where
`IngressOrigin = { readonly transportId: string; readonly peerId?: string }`, defaulting to
`{ transportId: 'local' }`. Step 19 passes `excludePeers: [origin.peerId]` to `FederationOut.enqueue`.

`transportId` is recorded and reported; it is never branched on. `eslint.config.mjs` already errors on
`SwitchStatement[discriminant.property.name="transportId"]` outside the transport layer (NFR-M03), and
an origin that changed behaviour by transport would be the Liskov violation CLAUDE.md §5.2 bans.

Peer trust does not appear in this structure at all, deliberately. FD-03 is unconditional: every
inbound envelope re-runs all 19 steps, and trust affects **quota only, never verification**. Origin
tells the outbox where not to send something. It tells the pipeline nothing.

**Asserted by:** a two-node test that publishes on A and requires B's outbox to contain no entry
targeting A.
