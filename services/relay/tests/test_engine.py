import asyncio
import socket

import grpc

from jagoo.v1 import bridge_pb2, bridge_pb2_grpc, envelope_pb2
from jagoo_relay.daemon import BridgeService
from jagoo_relay.engine import RelayEngine
from jagoo_relay.store import RelayStore
from jagoo_relay.transport import MemoryTransport, TcpInterfaceTransport


def paired_engines(tmp_path):
    left_transport = MemoryTransport("left")
    right_transport = MemoryTransport("right")
    left_transport.peer = right_transport
    right_transport.peer = left_transport
    return (
        RelayEngine(left_transport, RelayStore(tmp_path / "left.sqlite3")),
        RelayEngine(right_transport, RelayStore(tmp_path / "right.sqlite3")),
        left_transport,
        right_transport,
    )


def unused_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def test_store_and_forward_resumes_after_link_break(tmp_path):
    async def run():
        left, right, left_link, _right_link = paired_engines(tmp_path)
        await left.start()
        await right.start()
        left_link.up = False
        envelope = b"signed-checkin" * 50
        await left.send(envelope, "right", envelope_pb2.PRIORITY_CHECKIN)
        assert left.store.depth() > 0
        assert right.inbound.empty()
        left_link.up = True
        await left.drain_once()
        received = await asyncio.wait_for(right.inbound.get(), 1)
        assert received.envelope == envelope
        assert left.store.depth() == 0
        await left.close()
        await right.close()

    asyncio.run(run())


def test_grpc_bridge_roundtrip_status_and_bulk_rejection(tmp_path):
    async def run():
        left, right, _left_link, _right_link = paired_engines(tmp_path)
        await left.start()
        await right.start()
        servers = []
        ports = []
        for engine in (left, right):
            server = grpc.aio.server()
            bridge_pb2_grpc.add_ReticulumBridgeServicer_to_server(
                BridgeService(engine), server
            )
            port = server.add_insecure_port("127.0.0.1:0")
            await server.start()
            servers.append(server)
            ports.append(port)
        left_channel = grpc.aio.insecure_channel(f"127.0.0.1:{ports[0]}")
        right_channel = grpc.aio.insecure_channel(f"127.0.0.1:{ports[1]}")
        left_stub = bridge_pb2_grpc.ReticulumBridgeStub(left_channel)
        right_stub = bridge_pb2_grpc.ReticulumBridgeStub(right_channel)
        announced = await right_stub.Announce(
            bridge_pb2.BridgeAnnounceReq(app_name="jagoo", aspects=["bridge"])
        )
        stream = right_stub.Receive(
            bridge_pb2.ReceiveReq(destination_hash=announced.destination_hash)
        )
        envelope = b"signed-broadcast" * 40
        sent = await left_stub.Send(
            bridge_pb2.SendReq(
                envelope=envelope,
                destination_hash=announced.destination_hash,
                priority=envelope_pb2.PRIORITY_BROADCAST,
            )
        )
        assert sent.accepted
        assert sent.fragments > 1
        received = await asyncio.wait_for(stream.read(), 2)
        assert received.envelope == envelope
        status = await left_stub.Status(bridge_pb2.StatusReq())
        assert status.interfaces[0].up
        bulk = await left_stub.Send(
            bridge_pb2.SendReq(
                envelope=b"bulk",
                destination_hash=announced.destination_hash,
                priority=envelope_pb2.PRIORITY_BULK,
            )
        )
        assert not bulk.accepted
        assert bulk.code == envelope_pb2.ERROR_CODE_TRANSPORT_UNSUPPORTED
        stream.cancel()
        await left_channel.close()
        await right_channel.close()
        for server in servers:
            await server.stop(0)
        await left.close()
        await right.close()

    asyncio.run(run())


def test_two_tcp_relays_deliver_after_peer_returns(tmp_path):
    async def run():
        left_port = unused_port()
        right_port = unused_port()
        unavailable_port = unused_port()
        left_link = TcpInterfaceTransport(
            "left", "127.0.0.1", left_port, "127.0.0.1", unavailable_port
        )
        right_link = TcpInterfaceTransport(
            "right", "127.0.0.1", right_port, "127.0.0.1", left_port
        )
        left = RelayEngine(left_link, RelayStore(tmp_path / "tcp-left.sqlite3"))
        right = RelayEngine(right_link, RelayStore(tmp_path / "tcp-right.sqlite3"))
        await left.start()
        await right.start()
        await left.announce("jagoo", ["bridge"])
        destination = await right.announce("jagoo", ["bridge"])

        envelope = b"signed-emergency-broadcast" * 50
        fragments = await left.send(
            envelope, destination, envelope_pb2.PRIORITY_BROADCAST
        )
        assert fragments > 1
        assert left.store.depth() == fragments

        left_link.peer_port = right_port
        await left.drain_once()
        received = await asyncio.wait_for(right.inbound.get(), 2)
        assert received.envelope == envelope
        assert left.store.depth() == 0
        assert (await left.status())["interfaces"][0]["kind"] == "TCPInterface"
        await left.close()
        await right.close()

    asyncio.run(run())
