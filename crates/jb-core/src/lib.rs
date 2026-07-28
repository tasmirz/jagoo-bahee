//! Reference implementation of the Jagoo Bahee wire format.
//!
//! This crate exists to be *wrong differently*. It is written by hand from
//! `Plans/02-CONTRACTS-CORE.md`, sharing no code and no protobuf codegen lineage with
//! the TypeScript implementation in `packages/sdk-ts`. If both were generated from the
//! same source, the cross-language gate would prove only that the code agrees with
//! itself (build log L-02).
//!
//! `cargo test -p jb-core --test vectors` runs the shared fixture set from
//! `tools/vectors/fixtures/` and asserts byte-identical output. That test is a blocking
//! CI gate (P0-G1, NFR-M09).
//!
//! Scope is deliberately narrow — canonical encoding, content IDs, Ed25519 verification.
//! BIP85 and ML-DSA are TypeScript-only; nothing in P0-G1..G7 needs them here, and a
//! Rust implementation nobody executes buys nothing (ADR-003 §3).

pub mod base32;
pub mod canonical;
pub mod content_id;
pub mod fixtures;
pub mod wire;

#[path = "gen/registry.rs"]
pub mod registry;

pub use canonical::{canonical_bytes, encode_signed_envelope, AntiAbuse, Envelope};
pub use content_id::{content_id, content_id_from_canonical};
