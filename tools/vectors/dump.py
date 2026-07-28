"""Emit this implementation's canonical output for every fixture, as JSON on stdout.

The gate runner (`tools/vectors/run-gate.mjs`) collects one of these per language and
compares them pairwise. Nothing here asserts — asserting is the runner's job, and keeping
the dump dumb means a language cannot accidentally pass itself.

    python tools/vectors/dump.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from jb_reference import canonical_bytes, content_id, envelope_from_fixture  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures" / "envelopes.json"


def main() -> None:
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    out = {}

    for vector in fixtures["vectors"]:
        env = envelope_from_fixture(vector["envelope"])
        out[vector["name"]] = {
            "canonical_hex": canonical_bytes(env).hex(),
            "content_id": content_id(env),
        }

    json.dump(out, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
