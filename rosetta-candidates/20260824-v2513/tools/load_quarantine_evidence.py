#!/usr/bin/env python3
"""Load and verify the immutable quarantine run-id evidence set.

Usage: python tools/load_quarantine_evidence.py POSTGRES_URI [PSQL]
"""
from __future__ import annotations

import hashlib
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "evidence" / "Rosetta Quarantine Run IDs — 2026-08-23.txt"
SET_ID = "actor-overflow-quarantine-20260823"


def q(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print(__doc__, file=sys.stderr)
        return 2
    uri = sys.argv[1]
    psql = sys.argv[2] if len(sys.argv) == 3 else "psql"
    data = EVIDENCE.read_bytes()
    text = data.decode("utf-8")
    body = "\n".join(line for line in text.splitlines() if not line.startswith("#"))
    ids = [int(value) for value in re.findall(r"\d+", body)]
    if len(ids) != len(set(ids)) or not ids:
        raise SystemExit("quarantine evidence is empty or contains duplicate run IDs")
    digest = hashlib.sha256(data).hexdigest()
    values = ",".join(f"({q(SET_ID)},{value})" for value in ids)
    sql = (
        "begin;"
        "insert into rosetta_replay.quarantine_evidence_set"
        "(quarantine_set_id,source_file_sha256,expected_run_count,description) values("
        f"{q(SET_ID)},{q(digest)},{len(ids)},"
        f"{q('Regenerated actor-overflow quarantine run IDs, evidence bytes preserved')});"
        "insert into rosetta_replay.quarantine_control_run(quarantine_set_id,control_run_id) values "
        f"{values};commit;"
    )
    proc = subprocess.run([psql, "-X", "-v", "ON_ERROR_STOP=1", "-At", uri, "-c", sql],
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode:
        print(proc.stderr.decode("utf-8", "replace"), file=sys.stderr)
        return 1
    print(f"loaded {len(ids)} unique run IDs; sha256={digest}; set={SET_ID}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
