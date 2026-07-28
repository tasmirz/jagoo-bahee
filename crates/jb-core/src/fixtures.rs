//! Loading the shared fixture set.
//!
//! `created_at_ms` arrives as a decimal STRING so no consumer's JSON parser can round it
//! through a double — the field is int64 and it is inside the signature.

use serde::Deserialize;

use crate::canonical::{AntiAbuse, Envelope};

#[derive(Debug, Deserialize)]
pub struct FixtureFile {
    pub vectors: Vec<Vector>,
}

#[derive(Debug, Deserialize)]
pub struct Vector {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub envelope: EnvelopeSpec,
}

#[derive(Debug, Deserialize)]
pub struct EnvelopeSpec {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub plane: u32,
    #[serde(default)]
    pub domain: String,
    #[serde(default)]
    pub author_key: String,
    #[serde(default)]
    pub key_alg: u32,
    #[serde(default)]
    pub parent: String,
    #[serde(default)]
    pub scope: String,
    #[serde(default = "zero_string")]
    pub created_at_ms: String,
    #[serde(default)]
    pub nonce: String,
    #[serde(default)]
    pub priority: u32,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub anti_abuse: Option<AntiAbuseSpec>,
}

#[derive(Debug, Deserialize)]
pub struct AntiAbuseSpec {
    #[serde(default)]
    pub credential: String,
    #[serde(default)]
    pub nullifier: String,
    #[serde(default)]
    pub epoch: u32,
    #[serde(default)]
    pub pow: String,
}

fn zero_string() -> String {
    "0".to_string()
}

fn unhex(s: &str) -> Vec<u8> {
    hex::decode(s).unwrap_or_else(|e| panic!("fixture contains invalid hex {s:?}: {e}"))
}

impl EnvelopeSpec {
    pub fn to_envelope(&self) -> Envelope {
        Envelope {
            version: self.version,
            plane: self.plane,
            domain: self.domain.clone(),
            author_key: unhex(&self.author_key),
            key_alg: self.key_alg,
            parent: self.parent.clone(),
            scope: self.scope.clone(),
            created_at_ms: self
                .created_at_ms
                .parse()
                .unwrap_or_else(|e| panic!("created_at_ms {:?} is not an i64: {e}", self.created_at_ms)),
            nonce: unhex(&self.nonce),
            priority: self.priority,
            body: unhex(&self.body),
            anti_abuse: self.anti_abuse.as_ref().map(|a| AntiAbuse {
                credential: unhex(&a.credential),
                nullifier: unhex(&a.nullifier),
                epoch: a.epoch,
                pow: unhex(&a.pow),
            }),
            signature: Vec::new(),
        }
    }
}

/// Path to the shared fixture file, relative to the crate root.
pub const FIXTURE_PATH: &str = "../../tools/vectors/fixtures/envelopes.json";

pub fn load() -> FixtureFile {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(FIXTURE_PATH);
    let raw = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("cannot read fixtures at {}: {e}", path.display()));
    serde_json::from_str(&raw).expect("fixtures are not valid JSON")
}
