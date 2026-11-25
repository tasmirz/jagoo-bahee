//! Deterministic envelope decoding — the Rust reference mirror of `decode.ts`.
//!
//! Enforces EN-02 (exactly one accepted byte form):
//!   1. Ascending unique field numbers.
//!   2. Known envelope / AntiAbuse fields only; wire types 0 (varint) and 2 (len) only.
//!   3. Minimal varints (at most 10 bytes, fitting within u64; uint32 fields within u32).
//!   4. Valid UTF-8 strings.
//!   5. Decode-then-reencode byte equality (`encode_signed_envelope(&env) == raw`),
//!      which rejects explicit zeros, empty `AntiAbuse`, non-minimal varints, mismatched
//!      wire types, and non-NFC Unicode strings.

use std::fmt;

use crate::canonical::{
    encode_signed_envelope, AntiAbuse, Envelope, FIELD_ANTI_ABUSE, FIELD_AUTHOR_KEY, FIELD_BODY,
    FIELD_CREATED_AT_MS, FIELD_DOMAIN, FIELD_KEY_ALG, FIELD_NONCE, FIELD_PARENT, FIELD_PLANE,
    FIELD_PRIORITY, FIELD_SCOPE, FIELD_SIGNATURE, FIELD_VERSION,
};
use crate::wire::{WIRE_LEN, WIRE_VARINT};

const AA_CREDENTIAL: u64 = 1;
const AA_NULLIFIER: u64 = 2;
const AA_EPOCH: u64 = 3;
const AA_POW: u64 = 4;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DecodeError(pub String);

impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for DecodeError {}

struct ByteReader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> ByteReader<'a> {
    fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }

    fn done(&self) -> bool {
        self.pos >= self.buf.len()
    }

    fn varint(&mut self) -> Result<u64, DecodeError> {
        let mut result: u64 = 0;
        let mut shift: u32 = 0;
        let mut bytes_read: usize = 0;

        loop {
            if self.pos >= self.buf.len() {
                return Err(DecodeError("truncated varint".to_string()));
            }
            let byte = self.buf[self.pos];
            self.pos += 1;
            bytes_read += 1;
            if bytes_read > 10 {
                return Err(DecodeError("varint is longer than 10 bytes".to_string()));
            }
            if bytes_read == 10 && byte > 0x01 {
                if (byte & 0x80) != 0 {
                    return Err(DecodeError("varint is longer than 10 bytes".to_string()));
                }
                return Err(DecodeError("envelope is not in canonical form".to_string()));
            }
            result |= u64::from(byte & 0x7f) << shift;
            if (byte & 0x80) == 0 {
                break;
            }
            shift += 7;
        }
        Ok(result)
    }

    fn take(&mut self, len: usize) -> Result<&'a [u8], DecodeError> {
        let end = self
            .pos
            .checked_add(len)
            .ok_or_else(|| DecodeError("length exceeds buffer".to_string()))?;
        if end > self.buf.len() {
            return Err(DecodeError("length exceeds buffer".to_string()));
        }
        let slice = &self.buf[self.pos..end];
        self.pos = end;
        Ok(slice)
    }
}

enum FieldValue<'a> {
    Varint(u64),
    Bytes(&'a [u8]),
}

struct RawField<'a> {
    field: u64,
    value: FieldValue<'a>,
}

fn read_fields(buf: &[u8]) -> Result<Vec<RawField<'_>>, DecodeError> {
    let mut reader = ByteReader::new(buf);
    let mut out = Vec::new();

    while !reader.done() {
        let tag = reader.varint()?;
        let field = tag >> 3;
        let wire_type = (tag & 0x7) as u32;
        if field == 0 {
            return Err(DecodeError("field number 0 is invalid".to_string()));
        }

        if wire_type == WIRE_VARINT {
            out.push(RawField {
                field,
                value: FieldValue::Varint(reader.varint()?),
            });
        } else if wire_type == WIRE_LEN {
            let len_u64 = reader.varint()?;
            let len = usize::try_from(len_u64)
                .map_err(|_| DecodeError("length exceeds buffer".to_string()))?;
            let bytes = reader.take(len)?;
            out.push(RawField {
                field,
                value: FieldValue::Bytes(bytes),
            });
        } else {
            return Err(DecodeError(format!(
                "unsupported wire type {wire_type} on field {field}"
            )));
        }
    }

    Ok(out)
}

fn assert_ascending_unique(fields: &[RawField<'_>], where_: &str) -> Result<(), DecodeError> {
    let mut previous = 0u64;
    for f in fields {
        if f.field == previous {
            return Err(DecodeError(format!("{where_}: field {} appears twice", f.field)));
        }
        if f.field < previous {
            return Err(DecodeError(format!(
                "{where_}: field {} is out of order after {previous}",
                f.field
            )));
        }
        previous = f.field;
    }
    Ok(())
}

fn decode_string(bytes: &[u8], field: &str) -> Result<String, DecodeError> {
    std::str::from_utf8(bytes)
        .map(str::to_owned)
        .map_err(|_| DecodeError(format!("{field} is not valid UTF-8")))
}

fn as_u32(val: u64) -> Result<u32, DecodeError> {
    u32::try_from(val).map_err(|_| DecodeError("varint exceeds uint32 range".to_string()))
}

fn decode_anti_abuse(buf: &[u8]) -> Result<AntiAbuse, DecodeError> {
    let fields = read_fields(buf)?;
    assert_ascending_unique(&fields, "anti_abuse")?;

    let mut out = AntiAbuse::default();
    for f in fields {
        match f.field {
            AA_CREDENTIAL => {
                let FieldValue::Bytes(b) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                out.credential = b.to_vec();
            }
            AA_NULLIFIER => {
                let FieldValue::Bytes(b) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                out.nullifier = b.to_vec();
            }
            AA_EPOCH => {
                let FieldValue::Varint(v) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                out.epoch = as_u32(v)?;
            }
            AA_POW => {
                let FieldValue::Bytes(b) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                out.pow = b.to_vec();
            }
            other => {
                return Err(DecodeError(format!("unknown anti_abuse field {other}")));
            }
        }
    }
    Ok(out)
}

/// Decode a signed envelope (fields 1..13) and verify it is in canonical form.
pub fn decode_signed_envelope(raw: &[u8]) -> Result<Envelope, DecodeError> {
    let fields = read_fields(raw)?;
    assert_ascending_unique(&fields, "envelope")?;

    let mut env = Envelope::default();

    for f in fields {
        let Ok(field_u32) = u32::try_from(f.field) else {
            return Err(DecodeError(format!("unknown envelope field {}", f.field)));
        };
        match field_u32 {
            FIELD_VERSION => {
                let FieldValue::Varint(v) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.version = as_u32(v)?;
            }
            FIELD_PLANE => {
                let FieldValue::Varint(v) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.plane = as_u32(v)?;
            }
            FIELD_DOMAIN => {
                let FieldValue::Bytes(b) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.domain = decode_string(b, "domain")?;
            }
            FIELD_AUTHOR_KEY => {
                let FieldValue::Bytes(b) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.author_key = b.to_vec();
            }
            FIELD_KEY_ALG => {
                let FieldValue::Varint(v) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.key_alg = as_u32(v)?;
            }
            FIELD_PARENT => {
                let FieldValue::Bytes(b) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.parent = decode_string(b, "parent")?;
            }
            FIELD_SCOPE => {
                let FieldValue::Bytes(b) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.scope = decode_string(b, "scope")?;
            }
            FIELD_CREATED_AT_MS => {
                let FieldValue::Varint(v) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.created_at_ms = v as i64;
            }
            FIELD_NONCE => {
                let FieldValue::Bytes(b) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.nonce = b.to_vec();
            }
            FIELD_PRIORITY => {
                let FieldValue::Varint(v) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.priority = as_u32(v)?;
            }
            FIELD_BODY => {
                let FieldValue::Bytes(b) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.body = b.to_vec();
            }
            FIELD_ANTI_ABUSE => {
                let FieldValue::Bytes(b) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.anti_abuse = Some(decode_anti_abuse(b)?);
            }
            FIELD_SIGNATURE => {
                let FieldValue::Bytes(b) = f.value else {
                    return Err(DecodeError("envelope is not in canonical form".to_string()));
                };
                env.signature = b.to_vec();
            }
            other => {
                return Err(DecodeError(format!("unknown envelope field {other}")));
            }
        }
    }

    if encode_signed_envelope(&env) != raw {
        return Err(DecodeError("envelope is not in canonical form".to_string()));
    }

    Ok(env)
}
