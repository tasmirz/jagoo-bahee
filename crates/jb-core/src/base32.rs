//! RFC 4648 base32, lowercase, no padding.
//!
//! Lowercase and unpadded so an identifier survives being read aloud, written on a
//! poster, or typed into a manual node-entry field during a blackout (TP-19).

const ALPHABET: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyz234567";

pub fn encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(5) * 8);
    let mut bits: u32 = 0;
    let mut value: u32 = 0;

    for &byte in data {
        value = (value << 8) | u32::from(byte);
        bits += 8;
        while bits >= 5 {
            out.push(ALPHABET[((value >> (bits - 5)) & 31) as usize] as char);
            bits -= 5;
        }
    }
    if bits > 0 {
        out.push(ALPHABET[((value << (5 - bits)) & 31) as usize] as char);
    }

    out
}

pub fn decode(s: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(s.len() * 5 / 8);
    let mut bits: u32 = 0;
    let mut value: u32 = 0;

    for c in s.chars() {
        // Accept uppercase on input — a person transcribing an ID should not be punished
        // for shift key state. Output is always lowercase.
        let digit = match c.to_ascii_lowercase() {
            'a'..='z' => c.to_ascii_lowercase() as u32 - 'a' as u32,
            '2'..='7' => c as u32 - '2' as u32 + 26,
            _ => return None,
        };
        value = (value << 5) | digit;
        bits += 5;
        if bits >= 8 {
            out.push(((value >> (bits - 8)) & 0xff) as u8);
            bits -= 8;
        }
    }

    Some(out)
}
