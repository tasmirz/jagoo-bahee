"""gRPC/Unix-socket Reticulum bridge process."""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
from pathlib import Path

import grpc

from jagoo.v1 import bridge_pb2, bridge_pb2_grpc, envelope_pb2

from .engine import RelayEngine
from .store import RelayStore
from .transport import RnsTransport, TcpInterfaceTransport

logger = logging.getLogger("jagoo_relay")


class BridgeService(bridge_pb2_grpc.ReticulumBridgeServicer):
    def __init__(self, engine: RelayEngine) -> None:
        self.engine = engine

    async def Announce(self, request, context):
        destination = await self.engine.announce(request.app_name, list(request.aspects))
        return bridge_pb2.BridgeAnnounceResp(destination_hash=destination)

    async def Send(self, request, context):
        if request.priority == envelope_pb2.PRIORITY_BULK:
            return bridge_pb2.SendResp(
                accepted=False,
                code=envelope_pb2.ERROR_CODE_TRANSPORT_UNSUPPORTED,
                fragments=0,
            )
        try:
            fragments = await self.engine.send(
                bytes(request.envelope), request.destination_hash, request.priority
            )
            return bridge_pb2.SendResp(
                accepted=True,
                code=envelope_pb2.ERROR_CODE_UNSPECIFIED,
                fragments=fragments,
            )
        except ValueError:
            return bridge_pb2.SendResp(
                accepted=False,
                code=envelope_pb2.ERROR_CODE_PRIORITY_MISMATCH,
                fragments=0,
            )

    async def Receive(self, request, context):
        # grpc.aio cancels the suspended generator when the client closes the
        # stream. ServicerContext intentionally has no synchronous is_active()
        # API, so cancellation is the lifecycle signal here.
        while True:
            item = await self.engine.inbound.get()
            if request.destination_hash and request.destination_hash != self.engine.destination_hash:
                continue
            yield bridge_pb2.InboundEnvelope(
                envelope=item.envelope,
                source_hash=item.source_hash,
                rssi=item.rssi,
                snr=item.snr,
                hops=item.hops,
                received_at_ms=item.received_at_ms,
            )

    async def Status(self, request, context):
        status = await self.engine.status()
        return bridge_pb2.BridgeStatus(
            interfaces=[
                bridge_pb2.RnsInterface(
                    name=item["name"],
                    kind=item["kind"],
                    up=item["up"],
                    rssi=item["rssi"],
                    snr=item["snr"],
                    tx_bytes=item["tx_bytes"],
                    rx_bytes=item["rx_bytes"],
                )
                for item in status.get("interfaces", [])
            ],
            paths=[
                bridge_pb2.RnsPath(
                    destination_hash=item["destination_hash"],
                    hops=item["hops"],
                    last_seen_ms=item["last_seen_ms"],
                )
                for item in status.get("paths", [])
            ],
            queue_depth=status["queue_depth"],
        )


async def serve(engine: RelayEngine, bind: str) -> None:
    await engine.start()
    destination = await engine.announce("jagoo", ["bridge"])
    logger.warning("Jagoo relay destination: %s", destination)
    server = grpc.aio.server(
        options=[
            ("grpc.max_send_message_length", 65_536),
            ("grpc.max_receive_message_length", 65_536),
        ]
    )
    bridge_pb2_grpc.add_ReticulumBridgeServicer_to_server(BridgeService(engine), server)
    if server.add_insecure_port(bind) == 0:
        raise RuntimeError(f"could not bind relay bridge to {bind}")
    await server.start()

    async def drain() -> None:
        while True:
            await engine.drain_once()
            await asyncio.sleep(1)

    worker = asyncio.create_task(drain())
    try:
        await server.wait_for_termination()
    finally:
        worker.cancel()
        await server.stop(2)
        await engine.close()


def build_engine(arguments: argparse.Namespace) -> RelayEngine:
    if arguments.mode == "rns":
        transport = RnsTransport(arguments.rns_config)
    else:
        transport = TcpInterfaceTransport(
            arguments.identity,
            arguments.tcp_host,
            arguments.tcp_port,
            arguments.peer_host,
            arguments.peer_port,
        )
    return RelayEngine(transport, RelayStore(arguments.database))


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description="Jagoo optional Reticulum relay")
    value.add_argument("--bind", default=os.getenv("RELAY_BIND", "127.0.0.1:50071"))
    value.add_argument("--database", default=os.getenv("RELAY_DB", "relay.sqlite3"))
    value.add_argument("--mode", choices=["tcp", "rns"], default=os.getenv("RELAY_MODE", "tcp"))
    value.add_argument("--identity", default=os.getenv("RELAY_ID", "jagoo-relay"))
    value.add_argument("--tcp-host", default=os.getenv("RELAY_TCP_HOST", "127.0.0.1"))
    value.add_argument("--tcp-port", type=int, default=int(os.getenv("RELAY_TCP_PORT", "4965")))
    value.add_argument("--peer-host", default=os.getenv("RELAY_PEER_HOST"))
    value.add_argument(
        "--peer-port",
        type=int,
        default=int(os.environ["RELAY_PEER_PORT"]) if "RELAY_PEER_PORT" in os.environ else None,
    )
    value.add_argument("--rns-config", default=os.getenv("RELAY_RNS_CONFIG"))
    return value


def main() -> None:
    arguments = parser().parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    Path(arguments.database).parent.mkdir(parents=True, exist_ok=True)
    asyncio.run(serve(build_engine(arguments), arguments.bind))


if __name__ == "__main__":
    main()
