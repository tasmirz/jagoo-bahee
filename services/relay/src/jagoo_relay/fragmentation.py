"""RT-03 deterministic fragmentation and integrity-checked reassembly."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import struct
import time
from typing import Iterable

MAGIC = b"JBFR"
HEADER = struct.Struct("!4s16sHH16s")
MIN_MTU = HEADER.size + 1


class FragmentError(ValueError):
    """A fragment cannot safely participate in reassembly."""


@dataclass(frozen=True)
class Fragment:
    message_id: bytes
    index: int
    total: int
    checksum: bytes
    payload: bytes

    def encode(self) -> bytes:
        return HEADER.pack(MAGIC, self.message_id, self.index, self.total, self.checksum) + self.payload

    @classmethod
    def decode(cls, encoded: bytes) -> "Fragment":
        if len(encoded) < MIN_MTU:
            raise FragmentError("fragment is truncated")
        magic, message_id, index, total, checksum = HEADER.unpack(encoded[: HEADER.size])
        payload = encoded[HEADER.size :]
        if magic != MAGIC or total == 0 or index >= total:
            raise FragmentError("fragment header is invalid")
        if sha256(payload).digest()[:16] != checksum:
            raise FragmentError("fragment integrity check failed")
        return cls(message_id, index, total, checksum, payload)


def fragment(envelope: bytes, mtu: int, message_id: bytes | None = None) -> list[bytes]:
    if mtu < MIN_MTU:
        raise FragmentError(f"MTU must be at least {MIN_MTU}")
    if not envelope:
        raise FragmentError("envelope is empty")
    identifier = message_id or sha256(envelope).digest()[:16]
    if len(identifier) != 16:
        raise FragmentError("message ID must be 16 bytes")
    payload_size = mtu - HEADER.size
    chunks = [envelope[offset : offset + payload_size] for offset in range(0, len(envelope), payload_size)]
    if len(chunks) > 0xFFFF:
        raise FragmentError("envelope requires too many fragments")
    return [
        Fragment(identifier, index, len(chunks), sha256(chunk).digest()[:16], chunk).encode()
        for index, chunk in enumerate(chunks)
    ]


@dataclass
class _Pending:
    total: int
    created_at: float
    chunks: dict[int, bytes]


class Reassembler:
    def __init__(self, timeout_seconds: float = 300.0) -> None:
        self.timeout_seconds = timeout_seconds
        self._pending: dict[bytes, _Pending] = {}

    def expire(self, now: float | None = None) -> int:
        instant = time.monotonic() if now is None else now
        expired = [
            identifier
            for identifier, pending in self._pending.items()
            if instant - pending.created_at >= self.timeout_seconds
        ]
        for identifier in expired:
            del self._pending[identifier]
        return len(expired)

    def accept(self, encoded: bytes, now: float | None = None) -> bytes | None:
        instant = time.monotonic() if now is None else now
        self.expire(instant)
        item = Fragment.decode(encoded)
        pending = self._pending.get(item.message_id)
        if pending is None:
            pending = _Pending(item.total, instant, {})
            self._pending[item.message_id] = pending
        if pending.total != item.total:
            del self._pending[item.message_id]
            raise FragmentError("fragment count changed during reassembly")
        pending.chunks.setdefault(item.index, item.payload)
        if len(pending.chunks) != pending.total:
            return None
        result = b"".join(pending.chunks[index] for index in range(pending.total))
        del self._pending[item.message_id]
        if sha256(result).digest()[:16] != item.message_id:
            raise FragmentError("reassembled envelope identity does not match")
        return result

    @property
    def pending(self) -> int:
        return len(self._pending)


def reassemble_all(fragments: Iterable[bytes]) -> bytes | None:
    reassembler = Reassembler()
    result = None
    for item in fragments:
        result = reassembler.accept(item)
    return result
