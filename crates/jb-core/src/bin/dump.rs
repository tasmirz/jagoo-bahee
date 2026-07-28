//! Emit this implementation's canonical output for every fixture, as JSON on stdout.
//!
//! The gate runner (`tools/vectors/run-gate.mjs`) collects one of these per language and
//! compares them pairwise. Nothing here asserts — asserting is the runner's job, and
//! keeping the dump dumb means a language cannot accidentally pass itself.
//!
//!     cargo run --quiet -p jb-core --bin jb-dump

use jb_core::canonical::canonical_bytes;
use jb_core::content_id::content_id_from_canonical;
use jb_core::fixtures;

fn main() {
    let file = fixtures::load();

    // BTreeMap so key order is deterministic and the runner's diff stays readable.
    let mut out = std::collections::BTreeMap::new();

    for vector in &file.vectors {
        let env = vector.envelope.to_envelope();
        let canonical = canonical_bytes(&env);
        out.insert(
            vector.name.clone(),
            serde_json::json!({
                "canonical_hex": hex::encode(&canonical),
                "content_id": content_id_from_canonical(&canonical),
            }),
        );
    }

    println!("{}", serde_json::to_string_pretty(&out).expect("serialisable"));
}
