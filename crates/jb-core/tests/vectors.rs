//! P0-G1..G4 in Rust — the independent half of the cross-language gate.
//!
//! This crate is written by hand from `Plans/02-CONTRACTS-CORE.md` and shares no code and
//! no codegen lineage with the TypeScript implementation. That independence is the entire
//! value: if both were generated from one source, agreement would prove only that the
//! generator is self-consistent (build log L-02).
//!
//!     cargo test -p jb-core --test vectors

use std::collections::BTreeMap;

use ed25519_dalek::{Signer, SigningKey};
use jb_core::canonical::{
    canonical_bytes, encode_signed_envelope, FIELD_DOMAIN, FIELD_PLANE, FIELD_SCOPE,
    FIELD_VERSION,
};
use jb_core::content_id::content_id_from_canonical;
use jb_core::decode::decode_signed_envelope;
use jb_core::fixtures;
use jb_core::wire::{write_len_delimited, write_tag, write_varint, write_varint_field};

/// The committed cross-language expectations, keyed by vector name.
fn expected() -> BTreeMap<String, serde_json::Value> {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../tools/vectors/expected.json");
    let raw = std::fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!(
            "cannot read {}: {e}\nRun `pnpm vectors --update` to generate it.",
            path.display()
        )
    });
    serde_json::from_str(&raw).expect("expected.json is not valid JSON")
}

fn canonical_of(name: &str) -> Vec<u8> {
    let file = fixtures::load();
    let vector = file
        .vectors
        .iter()
        .find(|v| v.name == name)
        .unwrap_or_else(|| panic!("fixture vector not found: {name}"));
    canonical_bytes(&vector.envelope.to_envelope())
}

/// P0-G1 — byte-identical canonical encoding and content IDs across the fixture set.
#[test]
fn canonical_encoding_matches_expectations() {
    let file = fixtures::load();
    let expected = expected();

    assert_eq!(
        file.vectors.len(),
        expected.len(),
        "fixture count and expectation count disagree"
    );

    for vector in &file.vectors {
        let env = vector.envelope.to_envelope();
        let canonical = canonical_bytes(&env);
        let want = expected
            .get(&vector.name)
            .unwrap_or_else(|| panic!("no expectation for vector {}", vector.name));

        assert_eq!(
            hex::encode(&canonical),
            want["canonical_hex"].as_str().expect("canonical_hex is a string"),
            "canonical bytes differ for vector {}",
            vector.name
        );
        assert_eq!(
            content_id_from_canonical(&canonical),
            want["content_id"].as_str().expect("content_id is a string"),
            "content id differs for vector {}",
            vector.name
        );
    }
}

/// EN-01 rule 2 — an all-empty AntiAbuse is omitted entirely, never emitted as a
/// zero-length submessage. Proto3 would allow either; allowing both would be a second
/// accepted form, which EN-02 forbids.
#[test]
fn empty_anti_abuse_is_omitted_not_emitted() {
    assert_eq!(
        canonical_of("anti-abuse-absent"),
        canonical_of("anti-abuse-empty-object"),
    );
}

/// EN-01 rule 4 — NFC normalisation, and it must hold for Bangla, not just ASCII.
/// Two devices with different input methods must produce the same content ID for the
/// same text, or federation silently duplicates every post.
#[test]
fn nfc_composed_and_decomposed_agree() {
    assert_eq!(canonical_of("nfc-composed"), canonical_of("nfc-decomposed"));
}

/// P0-G2 — a signature over one domain must not verify under another.
#[test]
fn domain_separation() {
    let a = canonical_of("domain-separation-a");
    let b = canonical_of("domain-separation-b");
    assert_ne!(a, b, "the pair must differ in canonical bytes");
    assert_ne!(
        content_id_from_canonical(&a),
        content_id_from_canonical(&b),
        "the pair must differ in content id"
    );

    let key = SigningKey::from_bytes(&[7u8; 32]);
    let signature = key.sign(&a);

    assert!(key.verifying_key().verify_strict(&a, &signature).is_ok());
    assert!(
        key.verifying_key().verify_strict(&b, &signature).is_err(),
        "P0-G2 VIOLATED: a signature over domain A verified under domain B"
    );
}

/// P0-G3 — a FORUM-plane signature must not verify as a SIGNAL-plane envelope.
/// `plane` is field 2, inside the signature, which is what makes cross-plane replay
/// impossible by construction rather than by a server-side check (SEP-02).
#[test]
fn plane_separation() {
    let forum = canonical_of("plane-separation-forum");
    let signal = canonical_of("plane-separation-signal");
    assert_ne!(forum, signal);

    let key = SigningKey::from_bytes(&[11u8; 32]);
    let signature = key.sign(&forum);

    assert!(key.verifying_key().verify_strict(&forum, &signature).is_ok());
    assert!(
        key.verifying_key().verify_strict(&signal, &signature).is_err(),
        "P0-G3 VIOLATED: a FORUM signature verified as a SIGNAL envelope"
    );
}

/// P0-G4 — the v1 signature-confusion regression.
///
/// v1 accepted a signature valid over either of two canonical forms, the legacy one
/// omitting `url`, `attachment_ids` and `poll`. A signature over a plain text post
/// therefore also validated a post carrying an attacker-chosen URL — and the UI showed a
/// green check on the forgery.
#[test]
fn field_omission_signature_confusion() {
    let sparse = canonical_of("field-omission-sparse");
    let populated = canonical_of("field-omission-populated");
    assert_ne!(sparse, populated);

    let key = SigningKey::from_bytes(&[23u8; 32]);
    let signature = key.sign(&sparse);

    assert!(key.verifying_key().verify_strict(&sparse, &signature).is_ok());
    assert!(
        key.verifying_key()
            .verify_strict(&populated, &signature)
            .is_err(),
        "P0-G4 VIOLATED: the v1 signature-confusion bug is back"
    );
}

fn signed_wire_of(name: &str) -> Vec<u8> {
    let file = fixtures::load();
    let vector = file
        .vectors
        .iter()
        .find(|v| v.name == name)
        .unwrap_or_else(|| panic!("fixture vector not found: {name}"));
    let mut env = vector.envelope.to_envelope();
    env.signature = vec![9u8; 64];
    encode_signed_envelope(&env)
}

#[test]
fn decode_round_trips_fixtures() {
    for name in [
        "minimal",
        "forum-post-full",
        "anti-abuse-epoch-only",
        "large-timestamp",
        "bangla-broadcast",
        "checkin-zero-cost",
    ] {
        let raw = signed_wire_of(name);
        let decoded = decode_signed_envelope(&raw).unwrap_or_else(|e| panic!("{name}: {e}"));
        assert_eq!(encode_signed_envelope(&decoded), raw, "{name}");
    }
}

#[test]
fn decode_rejects_descending_fields() {
    let mut w = Vec::new();
    write_varint_field(&mut w, FIELD_PLANE, 1);
    write_varint_field(&mut w, FIELD_VERSION, 1);
    assert!(decode_signed_envelope(&w).is_err());
}

#[test]
fn decode_rejects_repeated_field() {
    let mut w = Vec::new();
    write_varint_field(&mut w, FIELD_VERSION, 1);
    write_varint_field(&mut w, FIELD_VERSION, 1);
    let err = decode_signed_envelope(&w).unwrap_err();
    assert!(err.0.contains("appears twice"));
}

#[test]
fn decode_rejects_explicit_zero() {
    let mut w = Vec::new();
    write_varint_field(&mut w, FIELD_VERSION, 1);
    write_varint_field(&mut w, FIELD_PLANE, 0);
    let err = decode_signed_envelope(&w).unwrap_err();
    assert!(err.0.contains("not in canonical form"));
}

#[test]
fn decode_rejects_empty_anti_abuse() {
    let mut w = Vec::new();
    write_varint_field(&mut w, FIELD_VERSION, 1);
    write_len_delimited(&mut w, jb_core::canonical::FIELD_ANTI_ABUSE, &[]);
    let err = decode_signed_envelope(&w).unwrap_err();
    assert!(err.0.contains("not in canonical form"));
}

#[test]
fn decode_rejects_unknown_envelope_field() {
    let mut w = Vec::new();
    write_varint_field(&mut w, FIELD_VERSION, 1);
    write_varint_field(&mut w, 99, 1);
    let err = decode_signed_envelope(&w).unwrap_err();
    assert!(err.0.contains("unknown envelope field 99"));
}

#[test]
fn decode_rejects_unknown_anti_abuse_field() {
    let mut inner = Vec::new();
    write_varint_field(&mut inner, 7, 1);
    let mut w = Vec::new();
    write_varint_field(&mut w, FIELD_VERSION, 1);
    write_len_delimited(&mut w, jb_core::canonical::FIELD_ANTI_ABUSE, &inner);
    let err = decode_signed_envelope(&w).unwrap_err();
    assert!(err.0.contains("unknown anti_abuse field 7"));
}

#[test]
fn decode_rejects_unsupported_wire_type() {
    let mut w = Vec::new();
    write_tag(&mut w, FIELD_VERSION, 1);
    w.extend_from_slice(&[0u8; 8]);
    let err = decode_signed_envelope(&w).unwrap_err();
    assert!(err.0.contains("unsupported wire type"));
}

#[test]
fn decode_rejects_overlong_varint() {
    let mut w = Vec::new();
    write_tag(&mut w, FIELD_VERSION, 0);
    w.extend_from_slice(&[0x80; 11]);
    w.push(0x00);
    let err = decode_signed_envelope(&w).unwrap_err();
    assert!(err.0.contains("longer than 10 bytes"));
}

#[test]
fn decode_rejects_truncated_varint() {
    let mut w = Vec::new();
    write_tag(&mut w, FIELD_VERSION, 0);
    w.push(0x80);
    let err = decode_signed_envelope(&w).unwrap_err();
    assert!(err.0.contains("truncated varint"));
}

#[test]
fn decode_rejects_length_past_buffer() {
    let mut w = Vec::new();
    write_tag(&mut w, FIELD_DOMAIN, 2);
    write_varint(&mut w, 99);
    w.extend_from_slice(&[1, 2]);
    let err = decode_signed_envelope(&w).unwrap_err();
    assert!(err.0.contains("exceeds buffer"));
}

#[test]
fn decode_rejects_invalid_utf8() {
    let mut w = Vec::new();
    write_varint_field(&mut w, FIELD_VERSION, 1);
    write_len_delimited(&mut w, FIELD_DOMAIN, &[0xff, 0xfe]);
    let err = decode_signed_envelope(&w).unwrap_err();
    assert!(err.0.contains("not valid UTF-8"));
}

#[test]
fn decode_rejects_trailing_bytes() {
    let mut raw = signed_wire_of("minimal");
    raw.extend_from_slice(&[0x00, 0x00]);
    assert!(decode_signed_envelope(&raw).is_err());
}

#[test]
fn decode_rejects_non_nfc_string() {
    let mut w = Vec::new();
    write_varint_field(&mut w, FIELD_VERSION, 1);
    write_len_delimited(&mut w, FIELD_SCOPE, "cafe\u{0301}".as_bytes());
    let err = decode_signed_envelope(&w).unwrap_err();
    assert!(err.0.contains("not in canonical form"));
}

#[test]
fn decode_rejects_uint32_overflow() {
    let mut w = Vec::new();
    write_varint_field(&mut w, FIELD_VERSION, 0x1_0000_0000);
    let err = decode_signed_envelope(&w).unwrap_err();
    assert!(err.0.contains("exceeds uint32 range"));
}
