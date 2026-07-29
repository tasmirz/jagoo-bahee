"""Radio transport boundary plus TCP/no-hardware and actual RNS adapters."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
import struct
from typing import Protocol

Inbound = Callable[[bytes, str, int, int, int], Awaitable[None]]


class LinkUnavailable(ConnectionError):
    pass


class RelayTransport(Protocol):
    mtu: int

    async def start(self, inbound: Inbound) -> None: ...
    async def announce(self, app_name: str, aspects: list[str]) -> str: ...
    async def send(self, frame: bytes, destination: str) -> None: ...
    async def status(self) -> dict[str, object]: ...
    async def close(self) -> None: ...


class MemoryTransport:
    """Deterministic test double with a switchable link."""

    mtu = 220

    def __init__(self, identity: str) -> None:
        self.identity = identity
        self.peer: MemoryTransport | None = None
        self.up = True
        self._inbound: Inbound | None = None
        self.tx_bytes = 0
        self.rx_bytes = 0

    async def start(self, inbound: Inbound) -> None:
        self._inbound = inbound

    async def announce(self, app_name: str, aspects: list[str]) -> str:
        return self.identity

    async def send(self, frame: bytes, destination: str) -> None:
        if not self.up or not self.peer or not self.peer.up or not self.peer._inbound:
            raise LinkUnavailable("memory link is down")
        self.tx_bytes += len(frame)
        self.peer.rx_bytes += len(frame)
        await self.peer._inbound(frame, self.identity, 0, 0, 1)

    async def status(self) -> dict[str, object]:
        return {
            "interfaces": [
                {
                    "name": self.identity,
                    "kind": "MemoryInterface",
                    "up": self.up,
                    "rssi": 0,
                    "snr": 0,
                    "tx_bytes": self.tx_bytes,
                    "rx_bytes": self.rx_bytes,
                }
            ],
            "paths": [],
        }

    async def close(self) -> None:
        self.up = False


class TcpInterfaceTransport:
    """TCPInterface demo path with no radio hardware."""

    mtu = 220
    _length = struct.Struct("!I")

    def __init__(
        self,
        identity: str,
        listen_host: str,
        listen_port: int,
        peer_host: str | None = None,
        peer_port: int | None = None,
    ) -> None:
        self.identity = identity
        self.listen_host = listen_host
        self.listen_port = listen_port
        self.peer_host = peer_host
        self.peer_port = peer_port
        self._server: asyncio.AbstractServer | None = None
        self._inbound: Inbound | None = None
        self.tx_bytes = 0
        self.rx_bytes = 0

    async def start(self, inbound: Inbound) -> None:
        self._inbound = inbound
        self._server = await asyncio.start_server(self._receive, self.listen_host, self.listen_port)

    async def _receive(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        try:
            while True:
                length = self._length.unpack(await reader.readexactly(self._length.size))[0]
                if length > self.mtu:
                    raise ValueError("TCPInterface frame exceeds MTU")
                frame = await reader.readexactly(length)
                self.rx_bytes += len(frame)
                if self._inbound:
                    await self._inbound(frame, "tcp-peer", 0, 0, 1)
        except (asyncio.IncompleteReadError, ConnectionError):
            pass
        finally:
            writer.close()
            await writer.wait_closed()

    async def announce(self, app_name: str, aspects: list[str]) -> str:
        return self.identity

    async def send(self, frame: bytes, destination: str) -> None:
        if self.peer_host is None or self.peer_port is None:
            raise LinkUnavailable("TCPInterface peer is not configured")
        try:
            _reader, writer = await asyncio.open_connection(self.peer_host, self.peer_port)
            writer.write(self._length.pack(len(frame)) + frame)
            await writer.drain()
            writer.close()
            await writer.wait_closed()
            self.tx_bytes += len(frame)
        except OSError as error:
            raise LinkUnavailable(str(error)) from error

    async def status(self) -> dict[str, object]:
        return {
            "interfaces": [
                {
                    "name": self.identity,
                    "kind": "TCPInterface",
                    "up": self._server is not None,
                    "rssi": 0,
                    "snr": 0,
                    "tx_bytes": self.tx_bytes,
                    "rx_bytes": self.rx_bytes,
                }
            ],
            "paths": [],
        }

    async def close(self) -> None:
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            self._server = None


class RnsTransport:
    """Production RNS packet adapter. Importing RNS is confined to this optional class."""

    mtu = 220

    def __init__(self, config_dir: str | None = None) -> None:
        import RNS

        self.RNS = RNS
        self.reticulum = RNS.Reticulum(configdir=config_dir)
        self.identity = RNS.Identity()
        self.destination = None
        self._inbound: Inbound | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    async def start(self, inbound: Inbound) -> None:
        self._inbound = inbound
        self._loop = asyncio.get_running_loop()

    async def announce(self, app_name: str, aspects: list[str]) -> str:
        self.destination = self.RNS.Destination(
            self.identity,
            self.RNS.Destination.IN,
            self.RNS.Destination.SINGLE,
            app_name,
            *aspects,
        )

        def receive(data: bytes, packet: object) -> None:
            if self._inbound and self._loop:
                source = getattr(packet, "destination_hash", b"")
                source_hash = (
                    source.hex() if isinstance(source, bytes) else str(source or "rns-peer")
                )
                rssi = round(getattr(packet, "rssi", 0) or 0)
                snr = round(getattr(packet, "snr", 0) or 0)
                hops = int(getattr(packet, "hops", 1) or 1)
                asyncio.run_coroutine_threadsafe(
                    self._inbound(data, source_hash, rssi, snr, hops), self._loop
                )

        self.destination.set_packet_callback(receive)
        self.destination.announce()
        return self.destination.hexhash

    async def send(self, frame: bytes, destination: str) -> None:
        destination_hash = bytes.fromhex(destination)
        recalled = self.RNS.Identity.recall(destination_hash)
        if recalled is None:
            self.RNS.Transport.request_path(destination_hash)
            raise LinkUnavailable("RNS path requested; destination identity not yet known")
        target = self.RNS.Destination(
            recalled,
            self.RNS.Destination.OUT,
            self.RNS.Destination.SINGLE,
            "jagoo",
            "bridge",
        )
        self.RNS.Packet(target, frame).send()

    async def status(self) -> dict[str, object]:
        interfaces = []
        with self.RNS.Transport.interfaces_lock:
            current_interfaces = list(self.RNS.Transport.interfaces)
        for interface in current_interfaces:
            interfaces.append(
                {
                    "name": str(interface),
                    "kind": type(interface).__name__,
                    "up": bool(getattr(interface, "online", True)),
                    "rssi": round(getattr(interface, "r_stat_rssi", 0) or 0),
                    "snr": round(getattr(interface, "r_stat_snr", 0) or 0),
                    "tx_bytes": int(getattr(interface, "txb", 0)),
                    "rx_bytes": int(getattr(interface, "rxb", 0)),
                }
            )
        with self.RNS.Transport.path_table_lock:
            path_table = list(self.RNS.Transport.path_table.items())[:500]
        paths = [
            {
                "destination_hash": destination.hex(),
                "hops": int(entry[2]),
                "last_seen_ms": int(float(entry[0]) * 1000),
            }
            for destination, entry in path_table
        ]
        return {
            "interfaces": interfaces,
            "paths": paths,
        }

    async def close(self) -> None:
        self._loop = None
        return None
