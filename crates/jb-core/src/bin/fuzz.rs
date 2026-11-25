//! Differential fuzz / PBT worker over stdin/stdout NDJSON.
//!
//! Each line on stdin is one task:
//!   {"op":"encode","envelope":{...,"signature":"<hex>"}}
//!   {"op":"decode","wire_hex":"<hex>"}
//! Emits one JSON line per task on stdout.

use std::io::{self, BufRead, Write};

use jb_core::canonical::{canonical_bytes, encode_signed_envelope};
use jb_core::content_id::content_id_from_canonical;
use jb_core::decode::decode_signed_envelope;
use jb_core::fixtures::EnvelopeSpec;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
enum Task {
    Encode {
        envelope: EnvelopeSpec,
        #[serde(default)]
        signature: String,
    },
    Decode {
        wire_hex: String,
    },
}

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());

    for line in stdin.lock().lines() {
        let line = line.expect("stdin read");
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let resp = match serde_json::from_str::<Task>(trimmed) {
            Ok(Task::Encode { envelope, signature }) => {
                let mut env = envelope.to_envelope();
                env.signature = hex::decode(&signature).expect("valid signature hex");
                let canonical = canonical_bytes(&env);
                let wire = encode_signed_envelope(&env);
                serde_json::json!({
                    "ok": true,
                    "canonical_hex": hex::encode(&canonical),
                    "wire_hex": hex::encode(&wire),
                    "content_id": content_id_from_canonical(&canonical),
                })
            }
            Ok(Task::Decode { wire_hex }) => {
                let raw = hex::decode(&wire_hex).expect("valid wire_hex");
                match decode_signed_envelope(&raw) {
                    Ok(env) => {
                        let canonical = canonical_bytes(&env);
                        let wire = encode_signed_envelope(&env);
                        serde_json::json!({
                            "ok": true,
                            "canonical_hex": hex::encode(&canonical),
                            "wire_hex": hex::encode(&wire),
                            "content_id": content_id_from_canonical(&canonical),
                        })
                    }
                    Err(e) => serde_json::json!({
                        "ok": false,
                        "error": e.0,
                    }),
                }
            }
            Err(e) => serde_json::json!({
                "ok": false,
                "error": format!("bad task json: {e}"),
            }),
        };
        writeln!(out, "{resp}").expect("stdout write");
    }
    out.flush().expect("stdout flush");
}
