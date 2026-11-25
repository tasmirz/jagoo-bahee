"""Differential fuzz / PBT worker over stdin/stdout NDJSON."""

from __future__ import annotations

import json
import sys

from jb_reference import (
    Envelope,
    canonical_bytes,
    content_id_from_canonical,
    decode_signed_envelope,
    encode_signed_envelope,
    envelope_from_fixture,
    DecodeError,
)


def main() -> None:
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        task = json.loads(line)
        op = task.get("op")
        if op == "encode":
            base = envelope_from_fixture(task["envelope"])
            sig = bytes.fromhex(task.get("signature", ""))
            env = Envelope(
                version=base.version,
                plane=base.plane,
                domain=base.domain,
                author_key=base.author_key,
                key_alg=base.key_alg,
                parent=base.parent,
                scope=base.scope,
                created_at_ms=base.created_at_ms,
                nonce=base.nonce,
                priority=base.priority,
                body=base.body,
                anti_abuse=base.anti_abuse,
                signature=sig,
            )
            canonical = canonical_bytes(env)
            wire = encode_signed_envelope(env)
            resp = {
                "ok": True,
                "canonical_hex": canonical.hex(),
                "wire_hex": wire.hex(),
                "content_id": content_id_from_canonical(canonical),
            }
        elif op == "decode":
            raw = bytes.fromhex(task["wire_hex"])
            try:
                env = decode_signed_envelope(raw)
                canonical = canonical_bytes(env)
                wire = encode_signed_envelope(env)
                resp = {
                    "ok": True,
                    "canonical_hex": canonical.hex(),
                    "wire_hex": wire.hex(),
                    "content_id": content_id_from_canonical(canonical),
                }
            except DecodeError as exc:
                resp = {"ok": False, "error": str(exc)}
        else:
            resp = {"ok": False, "error": f"unknown op {op}"}
        sys.stdout.write(json.dumps(resp) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
