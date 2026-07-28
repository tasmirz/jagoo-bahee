//! Content addressing.
//!
//!   content_id = "jb1" + base32-nopad-lowercase( SHA-256( canonical_bytes(fields 1..12) ) )
//!
//! VIS-03: same post, same ID, every node, forever. Dedupe, replay protection and
//! cross-node references all fall out of this one property.

use sha2::{Digest, Sha256};

use crate::base32;
use crate::canonical::{canonical_bytes, Envelope};

pub const PREFIX_CONTENT: &str = "jb1";
pub const PREFIX_IDENTITY: &str = "jbk1";
pub const PREFIX_CHANNEL: &str = "jbc1";
pub const PREFIX_SERVER: &str = "jbs1";

pub fn content_id_from_canonical(canonical: &[u8]) -> String {
    let digest = Sha256::digest(canonical);
    format!("{PREFIX_CONTENT}{}", base32::encode(&digest))
}

pub fn content_id(env: &Envelope) -> String {
    content_id_from_canonical(&canonical_bytes(env))
}

pub fn identity_id(public_key: &[u8]) -> String {
    format!("{PREFIX_IDENTITY}{}", base32::encode(public_key))
}

pub fn channel_id(signing_key: &[u8]) -> String {
    format!("{PREFIX_CHANNEL}{}", base32::encode(signing_key))
}

pub fn server_id(server_key: &[u8]) -> String {
    format!("{PREFIX_SERVER}{}", base32::encode(server_key))
}
