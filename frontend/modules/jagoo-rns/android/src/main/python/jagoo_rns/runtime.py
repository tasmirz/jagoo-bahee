"""Chaquopy bridge for the Signal plane.

No Forum state, HTTP credentials, or legacy Jagoo message keys are accepted here.  RNS owns
path selection; TCP is merely an interface when Internet is present, AutoInterface is local
Wi-Fi discovery, and RNode entries are the physical BLE/USB interfaces.
"""
import base64
import json
import os
import threading

import RNS
import LXMF

_lock = threading.RLock()
_reticulum = None
_router = None
_identity = None
_destination = None
_state = {"state": "stopped", "destinationHash": None, "interfaces": [], "error": None}
_inbox = []


def _interface_config(items):
    lines = []
    reported = []
    for item in items:
        if not item.get("enabled", True):
            continue
        kind = item.get("kind")
        if kind == "tcp" and item.get("host") and item.get("port"):
            lines.extend(["[[TCPClientInterface]]", "  type = TCPClientInterface", "  enabled = Yes",
                          "  target_host = %s" % item["host"], "  target_port = %s" % item["port"], ""])
            reported.append({"kind": kind, "state": "configured", "detail": "%s:%s" % (item["host"], item["port"])})
        elif kind == "auto":
            lines.extend(["[[AutoInterface]]", "  type = AutoInterface", "  enabled = Yes", ""])
            reported.append({"kind": kind, "state": "configured", "detail": "Wi-Fi multicast"})
        elif kind in ("rnode_ble", "rnode_usb"):
            # RNS's Android-patched RNodeInterface resolves BLE/USB device identifiers.
            lines.extend(["[[RNodeInterface]]", "  type = RNodeInterface", "  enabled = Yes",
                          "  port = %s" % item.get("device", "auto"), ""])
            reported.append({"kind": kind, "state": "configured", "detail": item.get("device", "auto")})
        else:
            reported.append({"kind": str(kind), "state": "ignored", "detail": "incomplete interface configuration"})
    return "\n".join(lines), reported


def start(raw):
    global _reticulum, _router, _identity, _destination, _state
    with _lock:
        try:
            config = json.loads(raw)
            private_key = base64.b64decode(config["identityPrivateKey"])
            if len(private_key) != 64:
                raise ValueError("Reticulum private identity must be 64 bytes")
            root = config["storagePath"]
            os.makedirs(root, exist_ok=True)
            config_text, interfaces = _interface_config(config.get("interfaces", []))
            with open(os.path.join(root, "config"), "w", encoding="utf-8") as handle:
                handle.write("[reticulum]\n  enable_transport = No\n\n[interfaces]\n" + config_text)
            _state = {"state": "starting", "destinationHash": None, "interfaces": interfaces, "error": None}
            _reticulum = RNS.Reticulum(configdir=root)
            _identity = RNS.Identity.from_bytes(private_key)
            _router = LXMF.LXMRouter(storagepath=os.path.join(root, "lxmf"), identity=_identity)
            _destination = _router.register_delivery_identity(_identity, display_name="Jagoo Signal")
            _router.register_delivery_callback(_receive_lxmf)
            _state = {"state": "running", "destinationHash": _destination.hash.hex(), "interfaces": interfaces, "error": None}
        except Exception as exc:  # surfaced to RN; avoids Reticulum's process-level panic
            _state = {"state": "failed", "destinationHash": None, "interfaces": [], "error": str(exc)}
        return json.dumps(_state)


def stop():
    global _reticulum, _router, _identity, _destination, _state
    with _lock:
        _router = _identity = _destination = None
        if _reticulum is not None:
            try:
                RNS.Reticulum.exit_handler()
            except Exception:
                pass
        _reticulum = None
        _state = {"state": "stopped", "destinationHash": None, "interfaces": [], "error": None}


def status():
    return json.dumps(_state)


def announce():
    if _destination is None:
        raise RuntimeError("RNS is not running")
    _destination.announce()


def send_lxmf(raw):
    if _router is None:
        raise RuntimeError("RNS is not running")
    message = json.loads(raw)
    destination_hash = bytes.fromhex(message["destinationHash"])
    recipient_identity = RNS.Identity.recall(destination_hash)
    if recipient_identity is None:
        RNS.Transport.request_path(destination_hash)
        raise RuntimeError("LXMF destination is unknown; path request started, retry when available")
    destination = RNS.Destination(recipient_identity, RNS.Destination.OUT, RNS.Destination.SINGLE, "lxmf", "delivery")
    lxmessage = LXMF.LXMessage(destination, _destination, message.get("content", ""), title=message.get("title", ""), fields=message.get("fields") or {})
    _router.handle_outbound(lxmessage)
    return json.dumps({"id": lxmessage.hash.hex(), "state": "queued"})


def _receive_lxmf(message):
    content = message.content.decode("utf-8", errors="replace") if isinstance(message.content, bytes) else str(message.content)
    title = message.title.decode("utf-8", errors="replace") if isinstance(message.title, bytes) else str(message.title or "")
    source = getattr(getattr(message, "source", None), "hash", b"")
    _inbox.append({"id": message.hash.hex(), "sourceHash": source.hex(), "content": content, "title": title})


def drain_lxmf():
    with _lock:
        result = list(_inbox)
        _inbox.clear()
        return json.dumps(result)
