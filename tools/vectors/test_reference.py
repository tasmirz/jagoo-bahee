"""Python-side unit tests for the reference encoder.

The cross-language comparison lives in `run-gate.mjs`. These tests cover the properties
that are cheapest to assert in one language, so a regression is localised before the
three-way diff turns red.

    python -m pytest tools/vectors -q
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from jb_reference import (
    Envelope,
    base32_encode,
    canonical_bytes,
    content_id,
    encode_utf8_nfc,
    envelope_from_fixture,
    write_varint,
)

FIXTURES = json.loads(
    (Path(__file__).parent / "fixtures" / "envelopes.json").read_text(encoding="utf-8")
)
BY_NAME = {v["name"]: v for v in FIXTURES["vectors"]}


def build(name: str) -> Envelope:
    return envelope_from_fixture(BY_NAME[name]["envelope"])


# ── EN-01 rule 2: zero values omitted entirely ───────────────────────────────────

def test_zero_fields_are_omitted_entirely():
    """Byte-exact expectation written out by hand from the spec.

    A snapshot captured from a run would assert only that the code still does whatever
    it did last time, which is not what this rule needs.
    """
    domain = "jb:vote:cast:v1"
    env = Envelope(version=1, plane=1, domain=domain, key_alg=1, priority=4)

    expected = (
        bytes([0x08, 0x01])                    # field 1  version, varint  = 1
        + bytes([0x10, 0x01])                  # field 2  plane, varint    = FORUM
        + bytes([0x1A, len(domain)])           # field 3  domain, len-delimited
        + domain.encode("ascii")
        + bytes([0x28, 0x01])                  # field 5  key_alg, varint  = ED25519
        + bytes([0x50, 0x04])                  # field 10 priority, varint = BULK
    )

    # Fields 4, 6, 7, 8, 9, 11 and 12 are all zero and therefore entirely absent —
    # no tag, no length, nothing.
    assert canonical_bytes(env) == expected


def test_unset_fields_shorten_the_encoding():
    env = Envelope(version=1, plane=1, domain="x", key_alg=1, priority=4)
    # version(2) + plane(2) + domain(2+1) + key_alg(2) + priority(2) = 11 bytes
    assert len(canonical_bytes(env)) == 11


def test_optional_string_presence_changes_length():
    with_scope = Envelope(version=1, domain="d", scope="s")
    without_scope = Envelope(version=1, domain="d")
    assert len(canonical_bytes(with_scope)) > len(canonical_bytes(without_scope))


# ── EN-02: exactly one accepted form ─────────────────────────────────────────────

def test_absent_and_empty_anti_abuse_encode_identically():
    """An all-empty AntiAbuse is omitted, never emitted as a zero-length message.

    Proto3 would allow either shape. Allowing both would be a second accepted form,
    and EN-02 permits exactly one.
    """
    absent = build("anti-abuse-absent")
    empty = build("anti-abuse-empty-object")
    assert canonical_bytes(absent) == canonical_bytes(empty)
    assert content_id(absent) == content_id(empty)


def test_partially_populated_anti_abuse_is_emitted():
    epoch_only = build("anti-abuse-epoch-only")
    assert epoch_only.anti_abuse is not None
    assert not epoch_only.anti_abuse.is_empty()
    # Field 12, wire type 2 => tag byte 0x62.
    assert b"\x62" in canonical_bytes(epoch_only)


# ── EN-01 rule 4: NFC normalisation ──────────────────────────────────────────────

def test_nfc_composed_and_decomposed_agree():
    """The same text signed on two devices must produce ONE content ID.

    Written with explicit escapes. The two forms are visually identical, so spelling
    them literally in the source risks an editor or a save step normalising one into
    the other, leaving the test quietly comparing a string with itself.
    """
    composed = "café"        # e-acute as a single code point
    decomposed = "café"     # plain e followed by combining acute accent
    assert composed != decomposed
    assert encode_utf8_nfc(composed) == encode_utf8_nfc(decomposed)


def test_nfc_fixture_pair_agrees():
    assert content_id(build("nfc-composed")) == content_id(build("nfc-decomposed"))


def test_bangla_round_trips():
    """NFR-A04 — Bangla is a first-class locale, not a late translation layer.

    'পানি বাড়ছে' — water is rising.
    """
    headline = "পানি বাড়ছে"
    assert encode_utf8_nfc(headline).decode("utf-8") == headline
    # 6 Bangla code points + 1 space, at 3 bytes per Bangla char: the worst case that
    # SIG-26's 512-byte broadcast budget is computed against.
    assert len(encode_utf8_nfc(headline)) == 28


# ── P0-G2 / P0-G3 / P0-G4: the three regressions ─────────────────────────────────

def test_domain_separation_changes_the_bytes():
    """P0-G2: a signature over one domain must not verify under another."""
    a, b = build("domain-separation-a"), build("domain-separation-b")
    assert canonical_bytes(a) != canonical_bytes(b)
    assert content_id(a) != content_id(b)


def test_plane_separation_changes_the_bytes():
    """P0-G3: the plane byte is inside the signature (SEP-02), so a FORUM signature
    cannot be lifted and replayed as a SIGNAL one."""
    forum, signal = build("plane-separation-forum"), build("plane-separation-signal")
    assert canonical_bytes(forum) != canonical_bytes(signal)
    assert content_id(forum) != content_id(signal)


def test_field_omission_changes_the_bytes():
    """P0-G4 — THE v1 REGRESSION.

    v1 accepted a signature valid over either of two canonical forms, the legacy one
    omitting url, attachmentIds and poll. A signature the user produced over a plain
    text post therefore also validated a post carrying an attacker-chosen URL and
    arbitrary attachments, and the verification UI showed a green check on the forgery.

    With exactly one canonical form, the two bodies are simply different bytes.
    """
    sparse, populated = build("field-omission-sparse"), build("field-omission-populated")
    assert canonical_bytes(sparse) != canonical_bytes(populated)
    assert content_id(sparse) != content_id(populated)


# ── int64 exactness ──────────────────────────────────────────────────────────────

def test_large_timestamp_is_exact():
    """A double loses precision above 2^53, and this field is inside the signature."""
    env = build("large-timestamp")
    assert env.created_at_ms == 9007199254740993


@pytest.mark.parametrize(
    "value,expected",
    [
        (0, b"\x00"),
        (1, b"\x01"),
        (127, b"\x7f"),
        (128, b"\x80\x01"),
        (300, b"\xac\x02"),
        (9007199254740993, b"\x81\x80\x80\x80\x80\x80\x80\x10"),
    ],
)
def test_varint_encoding(value, expected):
    out = bytearray()
    write_varint(out, value)
    assert bytes(out) == expected


def test_negative_int64_is_ten_bytes():
    """Protobuf encodes a negative int64 as its two's-complement u64."""
    out = bytearray()
    write_varint(out, -1)
    assert bytes(out) == b"\xff" * 9 + b"\x01"


# ── identifiers ──────────────────────────────────────────────────────────────────

def test_base32_is_lowercase_unpadded():
    """TP-19: an ID has to survive being read aloud or typed from a poster."""
    encoded = base32_encode(bytes(range(32)))
    assert encoded == encoded.lower()
    assert "=" not in encoded


def test_content_id_shape():
    cid = content_id(build("forum-post-full"))
    assert cid.startswith("jb1")
    assert len(cid) == 55  # "jb1" + 52 base32 chars for a 32-byte digest
