# Reticulum TCPInterface and RNode operator guide

> Reticulum is optional and disabled by default. Radio settings are jurisdiction- and
> hardware-specific. Confirm the permitted frequency, bandwidth, duty cycle, and transmit power
> with the local regulator and the board documentation before enabling transmission.

## 1. Two-node Reticulum TCPInterface drill

Create separate configuration directories so each process has its own identity and storage.

Node A, `.local/rns-a/config`:

```ini
[reticulum]
  enable_transport = Yes

[interfaces]
  [[Jagoo TCP server]]
    type = TCPServerInterface
    enabled = Yes
    listen_ip = 127.0.0.1
    listen_port = 4242
```

Node B, `.local/rns-b/config`:

```ini
[reticulum]
  enable_transport = Yes

[interfaces]
  [[Jagoo TCP client]]
    type = TCPClientInterface
    enabled = Yes
    target_host = 127.0.0.1
    target_port = 4242
```

Start one relay per node:

```powershell
python -m jagoo_relay.daemon --mode rns --rns-config .local/rns-a --bind 127.0.0.1:50071 --database .local/rns-a/relay.sqlite3
python -m jagoo_relay.daemon --mode rns --rns-config .local/rns-b --bind 127.0.0.1:50072 --database .local/rns-b/relay.sqlite3
```

Use the bridge `Announce` RPC on each relay to obtain its destination hash, then configure each
Nest node with the other relay's hash. Stop the client interface during a fragmented transfer,
restart it, and confirm that queue depth returns to zero and the recipient receives one complete
envelope. The relay never delivers a partial reassembly.

## 2. RNodeInterface

The values below are examples, not universal radio settings:

```ini
[reticulum]
  enable_transport = Yes

[interfaces]
  [[Jagoo RNode LoRa]]
    type = RNodeInterface
    enabled = Yes
    port = /dev/ttyUSB0
    frequency = 867200000
    bandwidth = 125000
    txpower = 7
    spreadingfactor = 8
    codingrate = 5
```

On Windows the port is normally `COM5`-style. Reticulum also accepts a previously paired BLE
RNode via a `ble://...` port where the platform supports it. Both ends must use compatible radio
parameters.

Before connecting Jagoo:

1. Run `rnstatus` and confirm the interface is online.
2. Confirm an announce is visible from the remote side.
3. Send only test traffic at a legal power and frequency.
4. Open the authenticated Admin workspace and verify the interface kind, link state, byte
   counters, RSSI/SNR, known paths, and relay queue.
5. Disconnect the RNode, enqueue a broadcast, reconnect it, and confirm store-and-forward drains.

If hardware is unavailable, record the TCPInterface gate as verified and the physical-radio
exercise as not run. Do not claim an on-air test from the software-only gate.

## বাংলা অপারেটর নোট

RNode চালুর আগে দেশের অনুমোদিত frequency, bandwidth, duty cycle ও TX power যাচাই করুন। উপরের
frequency কেবল উদাহরণ। দুই পাশের radio parameter একই হতে হবে। প্রথমে `rnstatus` দিয়ে interface
online কিনা দেখুন, তারপর remote announce যাচাই করুন। Admin workspace-এ RSSI, SNR, path এবং queue
দেখা যাবে। রেডিও খুলে দিয়ে broadcast queue করুন, আবার লাগানোর পরে queue শূন্য ও সম্পূর্ণ message
delivery নিশ্চিত করুন। Hardware পরীক্ষা না করলে build log-এ স্পষ্টভাবে “not run” লিখুন।

