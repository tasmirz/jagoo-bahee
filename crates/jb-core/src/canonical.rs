//! Canonical envelope encoding — the Rust reference.
//!
//! Mirrors `packages/sdk-ts/src/core/canonical.ts` field for field, written independently
//! from Plans/02-CONTRACTS-CORE.md §1-2.
//!
//! EN-01, the five rules:
//!   1. Fields in strictly ascending field number.
//!   2. Default / zero values omitted ENTIRELY.
//!   3. No unknown fields retained or re-emitted.
//!   4. Strings NFC-normalised before encoding.
//!   5. No float or double anywhere in a signed structure.

use crate::wire::{encode_utf8_nfc, write_len_delimited, write_varint_field};

// Envelope field numbers — frozen. These are what the canonical order sorts by.
pub const FIELD_VERSION: u32 = 1;
pub const FIELD_PLANE: u32 = 2;
pub const FIELD_DOMAIN: u32 = 3;
pub const FIELD_AUTHOR_KEY: u32 = 4;
pub const FIELD_KEY_ALG: u32 = 5;
pub const FIELD_PARENT: u32 = 6;
pub const FIELD_SCOPE: u32 = 7;
pub const FIELD_CREATED_AT_MS: u32 = 8;
pub const FIELD_NONCE: u32 = 9;
pub const FIELD_PRIORITY: u32 = 10;
pub const FIELD_BODY: u32 = 11;
pub const FIELD_ANTI_ABUSE: u32 = 12;
pub const FIELD_SIGNATURE: u32 = 13;

const AA_CREDENTIAL: u32 = 1;
const AA_NULLIFIER: u32 = 2;
const AA_EPOCH: u32 = 3;
const AA_POW: u32 = 4;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct AntiAbuse {
    pub credential: Vec<u8>,
    pub nullifier: Vec<u8>,
    pub epoch: u32,
    pub pow: Vec<u8>,
}

impl AntiAbuse {
    /// Normative: an all-empty AntiAbuse is omitted from the envelope entirely rather
    /// than emitted as a zero-length message. Proto3 would permit either — `{}` set
    /// versus unset — and permitting both would be a second accepted form (EN-02).
    /// TypeScript and Python implement the identical rule.
    pub fn is_empty(&self) -> bool {
        self.credential.is_empty() && self.nullifier.is_empty() && self.epoch == 0 && self.pow.is_empty()
    }

    fn encode(&self) -> Vec<u8> {
        let mut out = Vec::with_capacity(64);
        if !self.credential.is_empty() {
            write_len_delimited(&mut out, AA_CREDENTIAL, &self.credential);
        }
        if !self.nullifier.is_empty() {
            write_len_delimited(&mut out, AA_NULLIFIER, &self.nullifier);
        }
        if self.epoch != 0 {
            write_varint_field(&mut out, AA_EPOCH, u64::from(self.epoch));
        }
        if !self.pow.is_empty() {
            write_len_delimited(&mut out, AA_POW, &self.pow);
        }
        out
    }
}

/// Fields 1..12 plus the signature. The signature is excluded from `canonical_bytes`,
/// so the content ID is stable across re-signing (EN-03).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Envelope {
    pub version: u32,
    pub plane: u32,
    pub domain: String,
    pub author_key: Vec<u8>,
    pub key_alg: u32,
    pub parent: String,
    pub scope: String,
    pub created_at_ms: i64,
    pub nonce: Vec<u8>,
    pub priority: u32,
    pub body: Vec<u8>,
    pub anti_abuse: Option<AntiAbuse>,
    pub signature: Vec<u8>,
}

/// Canonical bytes of fields 1..12 — what gets signed and what the content ID hashes.
pub fn canonical_bytes(env: &Envelope) -> Vec<u8> {
    let mut out = Vec::with_capacity(512);

    if env.version != 0 {
        write_varint_field(&mut out, FIELD_VERSION, u64::from(env.version));
    }
    if env.plane != 0 {
        write_varint_field(&mut out, FIELD_PLANE, u64::from(env.plane));
    }
    if !env.domain.is_empty() {
        write_len_delimited(&mut out, FIELD_DOMAIN, &encode_utf8_nfc(&env.domain));
    }
    if !env.author_key.is_empty() {
        write_len_delimited(&mut out, FIELD_AUTHOR_KEY, &env.author_key);
    }
    if env.key_alg != 0 {
        write_varint_field(&mut out, FIELD_KEY_ALG, u64::from(env.key_alg));
    }
    if !env.parent.is_empty() {
        write_len_delimited(&mut out, FIELD_PARENT, &encode_utf8_nfc(&env.parent));
    }
    if !env.scope.is_empty() {
        write_len_delimited(&mut out, FIELD_SCOPE, &encode_utf8_nfc(&env.scope));
    }
    if env.created_at_ms != 0 {
        // Two's complement for negative values — protobuf int64 semantics.
        write_varint_field(&mut out, FIELD_CREATED_AT_MS, env.created_at_ms as u64);
    }
    if !env.nonce.is_empty() {
        write_len_delimited(&mut out, FIELD_NONCE, &env.nonce);
    }
    if env.priority != 0 {
        write_varint_field(&mut out, FIELD_PRIORITY, u64::from(env.priority));
    }
    if !env.body.is_empty() {
        write_len_delimited(&mut out, FIELD_BODY, &env.body);
    }

    match &env.anti_abuse {
        Some(aa) if !aa.is_empty() => {
            write_len_delimited(&mut out, FIELD_ANTI_ABUSE, &aa.encode());
        }
        _ => {}
    }

    out
}

/// Full wire bytes including the signature — what actually travels over a transport.
pub fn encode_signed_envelope(env: &Envelope) -> Vec<u8> {
    let mut out = canonical_bytes(env);
    if !env.signature.is_empty() {
        write_len_delimited(&mut out, FIELD_SIGNATURE, &env.signature);
    }
    out
}

/// Verify authorship offline (THR-01). Returns false on malformed input rather than
/// panicking — a malformed signature from a hostile peer is an ordinary rejection at
/// pipeline step 9, and a panic here would be a trivial denial of service.
pub fn verify_envelope(env: &Envelope) -> bool {
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};

    if env.signature.len() != 64 || env.author_key.len() != 32 {
        return false;
    }
    let Ok(key_bytes): Result<[u8; 32], _> = env.author_key.as_slice().try_into() else {
        return false;
    };
    let Ok(sig_bytes): Result<[u8; 64], _> = env.signature.as_slice().try_into() else {
        return false;
    };
    let Ok(key) = VerifyingKey::from_bytes(&key_bytes) else {
        return false;
    };
    key.verify(&canonical_bytes(env), &Signature::from_bytes(&sig_bytes))
        .is_ok()
}
