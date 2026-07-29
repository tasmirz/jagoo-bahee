"""Transport-neutral bridge engine used by gRPC and acceptance tests."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import time

from .fragmentation import FragmentError, Reassembler, fragment
from .store import RelayStore
from .transport import LinkUnavailable, RelayTransport


@dataclass(frozen=True)
class InboundItem:
    envelope: bytes
    source_hash: str
    rssi: int
    snr: int
    hops: int
    received_at_ms: int


class RelayEngine:
    def __init__(self, transport: RelayTransport, store: RelayStore) -> None:
        self.transport = transport
        self.store = store
        self.reassembler = Reassembler()
        self.inbound: asyncio.Queue[InboundItem] = asyncio.Queue(maxsize=1_000)
        self.destination_hash = ""

    async def start(self) -> None:
        await self.transport.start(self._accept_fragment)

    async def announce(self, app_name: str, aspects: list[str]) -> str:
        self.destination_hash = await self.transport.announce(app_name, aspects)
        return self.destination_hash

    async def send(self, envelope: bytes, destination: str, priority: int) -> int:
        if priority == 4:
            raise ValueError("TRANSPORT_UNSUPPORTED")
        if priority not in (1, 2, 3):
            raise ValueError("PRIORITY_MISMATCH")
        frames = fragment(envelope, self.transport.mtu)
        self.store.enqueue(destination, frames)
        await self.drain_once()
        return len(frames)

    async def drain_once(self, limit: int = 256) -> int:
        sent = 0
        for identifier, destination, frame in self.store.due(limit):
            try:
                await self.transport.send(frame, destination)
                self.store.succeed(identifier)
                sent += 1
            except LinkUnavailable:
                self.store.fail(identifier)
                break
        return sent

    async def _accept_fragment(
        self, frame: bytes, source_hash: str, rssi: int, snr: int, hops: int
    ) -> None:
        try:
            envelope = self.reassembler.accept(frame)
        except FragmentError:
            return
        if envelope is None:
            return
        item = InboundItem(
            envelope=envelope,
            source_hash=source_hash,
            rssi=rssi,
            snr=snr,
            hops=hops,
            received_at_ms=int(time.time() * 1000),
        )
        try:
            self.inbound.put_nowait(item)
        except asyncio.QueueFull:
            # Backpressure is explicit: discard the newly completed delivery, never block
            # the radio callback or evict an older item already promised to Receive().
            return

    async def status(self) -> dict[str, object]:
        status = await self.transport.status()
        return {**status, "queue_depth": self.store.depth()}

    async def close(self) -> None:
        await self.transport.close()
        self.store.close()
