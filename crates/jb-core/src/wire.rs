//! Protobuf wire primitives, hand-written.
//!
//! A general-purpose protobuf library legitimately preserves unknown fields, tolerates
//! several valid orderings, and differs on whether an explicitly-set zero is emitted.
//! Each of those is a second accepted form, and EN-02 permits exactly one.

use unicode_normalization::UnicodeNormalization;

pub const WIRE_VARINT: u32 = 0;
pub const WIRE_LEN: u32 = 2;

/// Base-128 varint. A negative i64 is encoded as its two's-complement u64, which is ten
/// bytes — matching protobuf's int64 behaviour exactly.
pub fn write_varint(out: &mut Vec<u8>, value: u64) {
    let mut v = value;
    while v >= 0x80 {
        out.push(((v & 0x7f) | 0x80) as u8);
        v >>= 7;
    }
    out.push(v as u8);
}

pub fn write_tag(out: &mut Vec<u8>, field_number: u32, wire_type: u32) {
    write_varint(out, u64::from((field_number << 3) | wire_type));
}

pub fn write_varint_field(out: &mut Vec<u8>, field_number: u32, value: u64) {
    write_tag(out, field_number, WIRE_VARINT);
    write_varint(out, value);
}

pub fn write_len_delimited(out: &mut Vec<u8>, field_number: u32, payload: &[u8]) {
    write_tag(out, field_number, WIRE_LEN);
    write_varint(out, payload.len() as u64);
    out.extend_from_slice(payload);
}

/// NFC normalisation before encoding (EN-01).
///
/// Two visually identical strings can have different UTF-8 bytes — "é" is either U+00E9
/// or U+0065 U+0301. Without normalisation the same text signed on two devices produces
/// two different content IDs, breaking dedupe, replay protection and cross-node
/// references at once.
///
/// This must handle Bangla correctly, not merely ASCII: NFR-A04 makes Bangla a
/// first-class locale, broadcast headline budgets are computed against Bangla UTF-8
/// worst case (SIG-26), and a normalisation divergence that only appears in the primary
/// language of the target users is exactly the bug this gate exists to catch.
pub fn encode_utf8_nfc(s: &str) -> Vec<u8> {
    s.nfc().collect::<String>().into_bytes()
}
