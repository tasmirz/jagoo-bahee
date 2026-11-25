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


class DecodeError(ValueError):
    """Raised when wire bytes violate EN-02 canonical form."""


class _ByteReader:
    def __init__(self, buf: bytes) -> None:
        self._buf = buf
        self._pos = 0

    @property
    def done(self) -> bool:
        return self._pos >= len(self._buf)

    def varint(self) -> int:
        result = 0
        shift = 0
        bytes_read = 0
        while True:
            if self._pos >= len(self._buf):
                raise DecodeError("truncated varint")
            byte = self._buf[self._pos]
            self._pos += 1
            bytes_read += 1
            if bytes_read > 10:
                raise DecodeError("varint is longer than 10 bytes")
            if bytes_read == 10 and byte > 0x01:
                if byte & 0x80:
                    raise DecodeError("varint is longer than 10 bytes")
                raise DecodeError("envelope is not in canonical form")
            result |= (byte & 0x7F) << shift
            if (byte & 0x80) == 0:
                break
            shift += 7
        return result

    def take(self, n: int) -> bytes:
        if n < 0 or self._pos + n > len(self._buf):
            raise DecodeError("length exceeds buffer")
        out = self._buf[self._pos : self._pos + n]
        self._pos += n
        return out


def _read_fields(buf: bytes) -> list[tuple[int, int, object]]:
    reader = _ByteReader(buf)
    fields: list[tuple[int, int, object]] = []
    while not reader.done:
        tag = reader.varint()
        field_num = tag >> 3
        wire_type = tag & 0x7
        if field_num == 0:
            raise DecodeError("field number 0 is invalid")
        if wire_type == WIRE_VARINT:
            fields.append((field_num, wire_type, reader.varint()))
        elif wire_type == WIRE_LEN:
            length = reader.varint()
            fields.append((field_num, wire_type, reader.take(length)))
        else:
            raise DecodeError(f"unsupported wire type {wire_type} on field {field_num}")
    return fields


def _assert_ascending_unique(fields: list[tuple[int, int, object]], where: str) -> None:
    previous = 0
    for field_num, _wire_type, _val in fields:
        if field_num == previous:
            raise DecodeError(f"{where}: field {field_num} appears twice")
        if field_num < previous:
            raise DecodeError(f"{where}: field {field_num} is out of order after {previous}")
        previous = field_num


def _as_u32(val: int) -> int:
    if val < 0 or val > 0xFFFFFFFF:
        raise DecodeError("varint exceeds uint32 range")
    return val


def _decode_string(raw_bytes: bytes, field_name: str) -> str:
    try:
        return raw_bytes.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise DecodeError(f"{field_name} is not valid UTF-8") from exc


def _decode_anti_abuse(buf: bytes) -> AntiAbuse:
    fields = _read_fields(buf)
    _assert_ascending_unique(fields, "anti_abuse")
    credential = b""
    nullifier = b""
    epoch = 0
    pow_bytes = b""
    for field_num, wire_type, val in fields:
        if field_num == AA_CREDENTIAL:
            if wire_type != WIRE_LEN:
                raise DecodeError("envelope is not in canonical form")
            credential = val  # type: ignore[assignment]
        elif field_num == AA_NULLIFIER:
            if wire_type != WIRE_LEN:
                raise DecodeError("envelope is not in canonical form")
            nullifier = val  # type: ignore[assignment]
        elif field_num == AA_EPOCH:
            if wire_type != WIRE_VARINT:
                raise DecodeError("envelope is not in canonical form")
            epoch = _as_u32(val)  # type: ignore[arg-type]
        elif field_num == AA_POW:
            if wire_type != WIRE_LEN:
                raise DecodeError("envelope is not in canonical form")
            pow_bytes = val  # type: ignore[assignment]
        else:
            raise DecodeError(f"unknown anti_abuse field {field_num}")
    return AntiAbuse(credential=credential, nullifier=nullifier, epoch=epoch, pow=pow_bytes)


def decode_signed_envelope(raw: bytes) -> Envelope:
    """Decode a signed envelope (fields 1..13) and verify canonical EN-02 form."""
    fields = _read_fields(raw)
    _assert_ascending_unique(fields, "envelope")

    version = 0
    plane = 0
    domain = ""
    author_key = b""
    key_alg = 0
    parent = ""
    scope = ""
    created_at_ms = 0
    nonce = b""
    priority = 0
    body = b""
    anti_abuse: Optional[AntiAbuse] = None
    signature = b""

    for field_num, wire_type, val in fields:
        if field_num == FIELD_VERSION:
            if wire_type != WIRE_VARINT:
                raise DecodeError("envelope is not in canonical form")
            version = _as_u32(val)  # type: ignore[arg-type]
        elif field_num == FIELD_PLANE:
            if wire_type != WIRE_VARINT:
                raise DecodeError("envelope is not in canonical form")
            plane = _as_u32(val)  # type: ignore[arg-type]
        elif field_num == FIELD_DOMAIN:
            if wire_type != WIRE_LEN:
                raise DecodeError("envelope is not in canonical form")
            domain = _decode_string(val, "domain")  # type: ignore[arg-type]
        elif field_num == FIELD_AUTHOR_KEY:
            if wire_type != WIRE_LEN:
                raise DecodeError("envelope is not in canonical form")
            author_key = val  # type: ignore[assignment]
        elif field_num == FIELD_KEY_ALG:
            if wire_type != WIRE_VARINT:
                raise DecodeError("envelope is not in canonical form")
            key_alg = _as_u32(val)  # type: ignore[arg-type]
        elif field_num == FIELD_PARENT:
            if wire_type != WIRE_LEN:
                raise DecodeError("envelope is not in canonical form")
            parent = _decode_string(val, "parent")  # type: ignore[arg-type]
        elif field_num == FIELD_SCOPE:
            if wire_type != WIRE_LEN:
                raise DecodeError("envelope is not in canonical form")
            scope = _decode_string(val, "scope")  # type: ignore[arg-type]
        elif field_num == FIELD_CREATED_AT_MS:
            if wire_type != WIRE_VARINT:
                raise DecodeError("envelope is not in canonical form")
            raw_u64 = val  # type: ignore[assignment]
            created_at_ms = raw_u64 - (1 << 64) if raw_u64 >= (1 << 63) else raw_u64
        elif field_num == FIELD_NONCE:
            if wire_type != WIRE_LEN:
                raise DecodeError("envelope is not in canonical form")
            nonce = val  # type: ignore[assignment]
        elif field_num == FIELD_PRIORITY:
            if wire_type != WIRE_VARINT:
                raise DecodeError("envelope is not in canonical form")
            priority = _as_u32(val)  # type: ignore[arg-type]
        elif field_num == FIELD_BODY:
            if wire_type != WIRE_LEN:
                raise DecodeError("envelope is not in canonical form")
            body = val  # type: ignore[assignment]
        elif field_num == FIELD_ANTI_ABUSE:
            if wire_type != WIRE_LEN:
                raise DecodeError("envelope is not in canonical form")
            anti_abuse = _decode_anti_abuse(val)  # type: ignore[arg-type]
        elif field_num == FIELD_SIGNATURE:
            if wire_type != WIRE_LEN:
                raise DecodeError("envelope is not in canonical form")
            signature = val  # type: ignore[assignment]
        else:
            raise DecodeError(f"unknown envelope field {field_num}")

    env = Envelope(
        version=version,
        plane=plane,
        domain=domain,
        author_key=author_key,
        key_alg=key_alg,
        parent=parent,
        scope=scope,
        created_at_ms=created_at_ms,
        nonce=nonce,
        priority=priority,
        body=body,
        anti_abuse=anti_abuse,
        signature=signature,
    )
    if encode_signed_envelope(env) != raw:
        raise DecodeError("envelope is not in canonical form")
    return env


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
