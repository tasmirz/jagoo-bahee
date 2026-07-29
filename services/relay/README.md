# Jagoo Reticulum relay

This optional Python sidecar carries signed Jagoo envelopes between a node and Reticulum. It is
disabled by default and is not on the HTTP acceptance path. Only `BROADCAST`, `DIRECT`, and
`CHECKIN` traffic is eligible; `BULK` is rejected before it reaches a constrained link.

## Install and verify

Use Python 3.11 or newer:

```powershell
python -m pip install -e "services/relay[dev]"
pnpm test:relay
```

If `bridge.proto` changes, regenerate the checked-in Python bindings from the repository root:

```powershell
python -m grpc_tools.protoc -I proto --python_out=services/relay/src --grpc_python_out=services/relay/src proto/jagoo/v1/envelope.proto proto/jagoo/v1/bridge.proto
```

The generated imports live under `services/relay/src/jagoo/v1`. Do not edit those files by hand.

## No-radio TCP drill

The built-in TCP mode is a deterministic, length-framed test path for the store-and-forward
engine. Run these in separate terminals:

```powershell
python -m jagoo_relay.daemon --bind 127.0.0.1:50071 --database .local/relay-a.sqlite3 --mode tcp --identity relay-a --tcp-port 4965 --peer-host 127.0.0.1 --peer-port 4966
python -m jagoo_relay.daemon --bind 127.0.0.1:50072 --database .local/relay-b.sqlite3 --mode tcp --identity relay-b --tcp-port 4966 --peer-host 127.0.0.1 --peer-port 4965
```

For an actual Reticulum `TCPServerInterface`/`TCPClientInterface` drill, use `--mode rns` with
the two configurations in
[`RETICULUM-RNODE-GUIDE.md`](../../Code%20Implementation/RETICULUM-RNODE-GUIDE.md).

## Connect a Jagoo node

The adapter remains absent unless all required values are explicit:

```text
RETICULUM_ENABLED=true
RETICULUM_BRIDGE_ADDRESS=127.0.0.1:50071
RETICULUM_DESTINATION_HASH=<remote Jagoo destination hash>
```

Start the sidecar before the Nest node. A sidecar failure is reported in the authenticated
operator workspace and never blocks HTTP acknowledgement or ordinary federation. The queue uses
SQLite WAL and resumes in frame order after a link returns.

## বাংলা দ্রুত নির্দেশনা

Reticulum relay ডিফল্টভাবে বন্ধ থাকে। চালু করতে আগে Python sidecar চালান, তারপর node-এ
`RETICULUM_ENABLED=true`, bridge address এবং গন্তব্য hash দিন। `BULK` পোস্ট LoRa-তে যাবে না;
শুধু broadcast, direct message এবং check-in যাবে। রেডিও বন্ধ হলেও signed frame SQLite queue-তে
থাকে এবং সংযোগ ফিরলে আবার পাঠানো হয়। অপারেটর UI-তে interface, RSSI, SNR, path ও queue দেখা যায়।

