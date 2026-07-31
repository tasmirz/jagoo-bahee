"""Chaquopy bridge for the Signal plane.

No Forum state, HTTP credentials, or legacy Jagoo message keys are accepted here.  RNS owns
path selection; TCP is merely an interface when Internet is present, AutoInterface is local
Wi-Fi discovery, and RNode entries are the physical BLE/USB interfaces.
"""
import base64
import collections
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

# The last lines Reticulum logged, so a failure can say WHY.
_log_lines = collections.deque(maxlen=40)


class ReticulumPanic(RuntimeError):
    """Raised in place of `RNS.panic()`, which would take the whole app with it."""


def _install_host_guards():
    """
    Stop Reticulum from killing the process, and capture its log.

    ── Why the app vanished on "Start RNS" ─────────────────────────────────────────────
    `RNS.panic()` is `os._exit(255)` — not an exception, not a signal, not something a
    `try/except` can ever see. `Reticulum.__init__` calls it for an unparseable config, a
    duplicate interface name, and — the likely one here — any interface that fails to
    construct. Android showed `Process com.jagoobahee.app has died` and
    `Zygote: exited cleanly (255)`, which reads as a crash with no stack anywhere, because
    nothing crashed: a library decided the process should end.

    A library embedded in someone else's app does not get to make that call. Both `panic`
    and `exit` are replaced with raises, so the existing handler in `start` turns them into
    `{state: "failed", error: ...}` and the person sees a sentence instead of a closed app.

    Reticulum logs the real reason immediately before panicking ("The interface X could not
    be created", "The contained exception was: ..."), so its log is redirected into a ring
    buffer and the tail is attached to the error. Without that the honest report would be
    "Reticulum aborted" with no cause.
    """
    RNS.panic = _panic
    RNS.exit = _exit
    RNS.logdest = RNS.LOG_CALLBACK
    RNS.logcall = _log_lines.append


def _panic():
    raise ReticulumPanic("Reticulum aborted while starting")


def _exit(code=0):
    raise ReticulumPanic("Reticulum asked to end the process (code %s)" % code)


def _recent_log():
    """The tail of Reticulum's own log, which is where the actual cause is written."""
    interesting = [line for line in _log_lines if "[Error]" in line or "could not" in line.lower()]
    tail = interesting[-3:] if interesting else list(_log_lines)[-3:]
    return " · ".join(line.strip() for line in tail)


def _missing_rnode_requirements():
    """
    What an RNode interface needs and this build does not have.

    `RNodeInterface.__init__` imports `usbserial4a` for the serial line and `jnius` for the
    Android APIs, and calls `RNS.panic()` when either is absent — from a constructor, so it
    kills the process instead of failing the interface. Chaquopy installs `rns` and `lxmf`
    only, so on this build both are missing and every "Start BLE RNode" was an abort.

    Reticulum is the LOWEST-priority transport here and an optional adapter by design
    (AR-12), so the honest answer is that this build has no radio support — not to pull in
    two more native-adjacent packages on the chance they compile.
    """
    import importlib.util

    return [name for name in ("usbserial4a", "jnius") if importlib.util.find_spec(name) is None]


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
            # RNS's Android-patched RNodeInterface resolves BLE/USB device identifiers, but
            # only if its own Python prerequisites are present — and if they are not, it calls
            # RNS.panic() from its constructor (RNodeInterface.py:411) rather than raising.
            # Declaring the interface anyway is therefore not "try it and see": it is a
            # guaranteed abort of the entire Reticulum start, taking the working interfaces
            # with it. Asked first, reported as unavailable, and left out of the config.
            missing = _missing_rnode_requirements()
            if missing:
                reported.append({
                    "kind": kind,
                    "state": "unavailable",
                    "detail": "This build has no radio support (missing %s)" % ", ".join(missing),
                })
                continue
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
            # A URI is not a path. `os.makedirs("file:///data/...")` reads that as a RELATIVE
            # path beginning with a component literally named "file:", resolves it against the
            # working directory — "/" on Android — and reports
            # "[Errno 30] Read-only file system: 'file:'", which names the root filesystem for
            # a directory inside the app's own private storage. The caller converts (see
            # `fileSystemPath` in rns.ts); this refuses the wrong shape rather than silently
            # creating "file:" wherever it happens to land.
            if "://" in root or not root.startswith("/"):
                raise ValueError(
                    "storagePath must be an absolute filesystem path, not a URI: %s" % root
                )
            os.makedirs(root, exist_ok=True)
            config_text, interfaces = _interface_config(config.get("interfaces", []))
            with open(os.path.join(root, "config"), "w", encoding="utf-8") as handle:
                handle.write("[reticulum]\n  enable_transport = No\n\n[interfaces]\n" + config_text)
            _state = {"state": "starting", "destinationHash": None, "interfaces": interfaces, "error": None}
            # Must precede the constructor: every panic site is inside it.
            _install_host_guards()
            _log_lines.clear()
            _reticulum = RNS.Reticulum(configdir=root)
            _identity = RNS.Identity.from_bytes(private_key)
            _router = LXMF.LXMRouter(storagepath=os.path.join(root, "lxmf"), identity=_identity)
            _destination = _router.register_delivery_identity(_identity, display_name="Jagoo Signal")
            _router.register_delivery_callback(_receive_lxmf)
            _state = {"state": "running", "destinationHash": _destination.hash.hex(), "interfaces": interfaces, "error": None}
        except Exception as exc:  # surfaced to RN; avoids Reticulum's process-level panic
            detail = str(exc) or exc.__class__.__name__
            context = _recent_log()
            _state = {
                "state": "failed",
                "destinationHash": None,
                "interfaces": [],
                "error": "%s — %s" % (detail, context) if context else detail,
            }
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
