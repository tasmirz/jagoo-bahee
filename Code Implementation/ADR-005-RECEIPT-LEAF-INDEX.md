# ADR-005 — Receipt Merkle Leaf Index

**Status:** accepted during P1 conformance  
**Decision:** add optional protobuf field `Receipt.leaf_index = 9`.

ADR-001 deliberately permits holes in the envelope `log_index` by reserving index blocks.
RFC 6962 inclusion verification, however, requires a dense zero-based leaf position.
Treating `log_index` as that position works only until a process reserves a block and
restarts, after which valid proofs cannot be verified offline.

The original frozen receipt omitted a separate leaf position while requiring the receipt
to carry a self-contained inclusion proof (TL-03). Field 9 is a backward-compatible
contract correction: old decoders ignore it, while new clients use it and never infer a
Merkle position from the sparse log index. No existing field changes meaning.
