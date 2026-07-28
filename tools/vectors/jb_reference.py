"""Canonical envelope encoding — the Python reference.

Written by hand from ``Plans/02-CONTRACTS-CORE.md`` §1-2, sharing no code and no
protobuf codegen lineage with either the TypeScript or the Rust implementation. Three
implementations that agree because they were generated from one source prove nothing;
three that agree despite being written independently prove the wire format is
unambiguous (build log L-02).

EN-01, the five rules:
  1. Fields in strictly ascending field number.
  2. Default / zero values omitted ENTIRELY.
  3. No unknown fields retained or re-emitted.
  4. Strings NFC-normalised before encoding.
  5. No float or double anywhere in a signed structure.
"""

from __future__ import annotations

import hashlib
import unicodedata
from dataclasses import dataclass, field
from typing import Optional

WIRE_VARINT = 0
WIRE_LEN = 2

# Envelope field numbers — frozen. These are what the canonical order sorts by.
FIELD_VERSION = 1
FIELD_PLANE = 2
FIELD_DOMAIN = 3
FIELD_AUTHOR_KEY = 4
FIELD_KEY_ALG = 5
FIELD_PARENT = 6
FIELD_SCOPE = 7
FIELD_CREATED_AT_MS = 8
FIELD_NONCE = 9
FIELD_PRIORITY = 10
FIELD_BODY = 11
FIELD_ANTI_ABUSE = 12
FIELD_SIGNATURE = 13

AA_CREDENTIAL = 1
AA_NULLIFIER = 2
AA_EPOCH = 3
AA_POW = 4

PREFIX_CONTENT = "jb1"
PREFIX_IDENTITY = "jbk1"
PREFIX_CHANNEL = "jbc1"
PREFIX_SERVER = "jbs1"

_BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567"


def write_varint(out: bytearray, value: int) -> None:
    """Base-128 varint. A negative int64 becomes its two's-complement u64 (ten bytes),
    matching protobuf's int64 behaviour exactly."""
    v = value & 0xFFFFFFFFFFFFFFFF if value < 0 else value
    while v >= 0x80:
        out.append((v & 0x7F) | 0x80)
        v >>= 7
    out.append(v)


def write_tag(out: bytearray, field_number: int, wire_type: int) -> None:
    write_varint(out, (field_number << 3) | wire_type)


def write_varint_field(out: bytearray, field_number: int, value: int) -> None:
    write_tag(out, field_number, WIRE_VARINT)
    write_varint(out, value)


def write_len_delimited(out: bytearray, field_number: int, payload: bytes) -> None:
    write_tag(out, field_number, WIRE_LEN)
    write_varint(out, len(payload))
    out.extend(payload)


def encode_utf8_nfc(s: str) -> bytes:
    """NFC normalisation before encoding (EN-01 rule 4).

    Two visually identical strings can have different UTF-8 bytes, so without this the
    same text signed on two devices yields two different content IDs — breaking dedupe,
    replay protection and cross-node references at once. Must handle Bangla, not just
    ASCII (NFR-A04).
    """
    return unicodedata.normalize("NFC", s).encode("utf-8")


def base32_encode(data: bytes) -> str:
    """RFC 4648 base32, lowercase, no padding.

    Lowercase and unpadded so an identifier survives being read aloud, written on a
    poster, or typed into a manual node-entry field during a blackout (TP-19).
    """
    out = []
    bits = 0
    value = 0
    for byte in data:
        value = (value << 8) | byte
        bits += 8
        while bits >= 5:
            out.append(_BASE32_ALPHABET[(value >> (bits - 5)) & 31])
            bits -= 5
    if bits > 0:
        out.append(_BASE32_ALPHABET[(value << (5 - bits)) & 31])
    return "".join(out)


@dataclass(frozen=True)
class AntiAbuse:
    credential: bytes = b""
    nullifier: bytes = b""
    epoch: int = 0
    pow: bytes = b""

    def is_empty(self) -> bool:
        """Normative: an all-empty AntiAbuse is omitted from the envelope entirely rather
        than emitted as a zero-length message. Proto3 permits either — ``{}`` set versus
        unset — and permitting both would be a second accepted form (EN-02). TypeScript
        and Rust implement the identical rule."""
        return not self.credential and not self.nullifier and self.epoch == 0 and not self.pow

    def encode(self) -> bytes:
        out = bytearray()
        if self.credential:
            write_len_delimited(out, AA_CREDENTIAL, self.credential)
        if self.nullifier:
            write_len_delimited(out, AA_NULLIFIER, self.nullifier)
        if self.epoch:
            write_varint_field(out, AA_EPOCH, self.epoch)
        if self.pow:
            write_len_delimited(out, AA_POW, self.pow)
        return bytes(out)


@dataclass(frozen=True)
class Envelope:
    version: int = 0
    plane: int = 0
    domain: str = ""
    author_key: bytes = b""
    key_alg: int = 0
    parent: str = ""
    scope: str = ""
    created_at_ms: int = 0
    nonce: bytes = b""
    priority: int = 0
    body: bytes = b""
    anti_abuse: Optional[AntiAbuse] = None
    signature: bytes = field(default=b"")


def canonical_bytes(env: Envelope) -> bytes:
    """Fields 1..12 — what gets signed and what the content ID hashes.

    The signature (field 13) is excluded, so the content ID is stable across re-signing
    (EN-03).
    """
    out = bytearray()

    if env.version:
        write_varint_field(out, FIELD_VERSION, env.version)
    if env.plane:
        write_varint_field(out, FIELD_PLANE, env.plane)
    if env.domain:
        write_len_delimited(out, FIELD_DOMAIN, encode_utf8_nfc(env.domain))
    if env.author_key:
        write_len_delimited(out, FIELD_AUTHOR_KEY, env.author_key)
    if env.key_alg:
        write_varint_field(out, FIELD_KEY_ALG, env.key_alg)
    if env.parent:
        write_len_delimited(out, FIELD_PARENT, encode_utf8_nfc(env.parent))
    if env.scope:
        write_len_delimited(out, FIELD_SCOPE, encode_utf8_nfc(env.scope))
    if env.created_at_ms:
        write_varint_field(out, FIELD_CREATED_AT_MS, env.created_at_ms)
    if env.nonce:
        write_len_delimited(out, FIELD_NONCE, env.nonce)
    if env.priority:
        write_varint_field(out, FIELD_PRIORITY, env.priority)
    if env.body:
        write_len_delimited(out, FIELD_BODY, env.body)

    if env.anti_abuse is not None and not env.anti_abuse.is_empty():
        write_len_delimited(out, FIELD_ANTI_ABUSE, env.anti_abuse.encode())

    return bytes(out)


def encode_signed_envelope(env: Envelope) -> bytes:
    """Full wire bytes including the signature — what travels over a transport."""
    out = bytearray(canonical_bytes(env))
    if env.signature:
        write_len_delimited(out, FIELD_SIGNATURE, env.signature)
    return bytes(out)


def content_id_from_canonical(canonical: bytes) -> str:
    return PREFIX_CONTENT + base32_encode(hashlib.sha256(canonical).digest())


def content_id(env: Envelope) -> str:
    """content_id = "jb1" + base32(SHA-256(canonical_bytes(1..12)))

    VIS-03: same post, same ID, every node, forever.
    """
    return content_id_from_canonical(canonical_bytes(env))


def envelope_from_fixture(spec: dict) -> Envelope:
    """Build an Envelope from a fixture entry.

    ``created_at_ms`` arrives as a decimal STRING so Python's JSON parser cannot round it
    through a float — the field is int64 and it is inside the signature.
    """
    aa_spec = spec.get("anti_abuse")
    anti_abuse = (
        AntiAbuse(
            credential=bytes.fromhex(aa_spec.get("credential", "")),
            nullifier=bytes.fromhex(aa_spec.get("nullifier", "")),
            epoch=int(aa_spec.get("epoch", 0)),
            pow=bytes.fromhex(aa_spec.get("pow", "")),
        )
        if aa_spec is not None
        else None
    )

    return Envelope(
        version=int(spec.get("version", 0)),
        plane=int(spec.get("plane", 0)),
        domain=spec.get("domain", ""),
        author_key=bytes.fromhex(spec.get("author_key", "")),
        key_alg=int(spec.get("key_alg", 0)),
        parent=spec.get("parent", ""),
        scope=spec.get("scope", ""),
        created_at_ms=int(spec.get("created_at_ms", "0")),
        nonce=bytes.fromhex(spec.get("nonce", "")),
        priority=int(spec.get("priority", 0)),
        body=bytes.fromhex(spec.get("body", "")),
        anti_abuse=anti_abuse,
    )
