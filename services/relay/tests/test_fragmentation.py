from hashlib import sha256

import pytest

from jagoo_relay.fragmentation import FragmentError, Reassembler, fragment


def test_fragmentation_reassembles_out_of_order_with_integrity():
    envelope = bytes(range(256)) * 4
    frames = fragment(envelope, 96)
    reassembler = Reassembler()
    result = None
    for frame in reversed(frames):
        result = reassembler.accept(frame)
    assert result == envelope
    assert reassembler.pending == 0


def test_partial_reassembly_expires_without_delivery():
    frames = fragment(b"emergency" * 100, 80)
    reassembler = Reassembler(timeout_seconds=2)
    assert reassembler.accept(frames[0], now=1) is None
    assert reassembler.expire(now=4) == 1
    assert reassembler.pending == 0


def test_corrupted_fragment_is_rejected():
    frame = bytearray(fragment(b"broadcast", 80)[0])
    frame[-1] ^= 0xFF
    with pytest.raises(FragmentError, match="integrity"):
        Reassembler().accept(bytes(frame))
