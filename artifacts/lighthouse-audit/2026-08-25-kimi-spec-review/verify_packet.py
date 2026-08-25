#!/usr/bin/env python3
import csv
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def verify_source_hashes() -> None:
    entries = []
    for line in (ROOT / "SOURCE_SHA256SUMS").read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        digest, relative_path = line.split("  ", 1)
        path = ROOT / relative_path
        assert path.is_file(), f"missing source file: {relative_path}"
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        assert actual == digest, f"hash mismatch: {relative_path}"
        entries.append(relative_path)
    assert len(entries) == 21, f"expected 21 source files, found {len(entries)}"


def verify_table_snapshot() -> None:
    with (ROOT / "audit/lighthouse_exact_row_counts.csv").open(
        encoding="utf-8", newline=""
    ) as handle:
        csv_rows = {
            row["table"]: int(row["exact_rows"]) for row in csv.DictReader(handle)
        }
    json_rows = json.loads(
        (ROOT / "audit/lighthouse_exact_row_counts.json").read_text(encoding="utf-8")
    )
    assert csv_rows == json_rows
    assert len(json_rows) == 582
    assert sum(json_rows.values()) == 2_177_569

    current_rows = json.loads(
        (
            ROOT
            / "audit/lighthouse_exact_row_counts_current_20260825.json"
        ).read_text(encoding="utf-8")
    )
    assert len(current_rows) == 583
    assert sum(current_rows.values()) == 2_225_184


def verify_pass3_evidence() -> None:
    expected = json.loads(
        (ROOT / "audit/pass3_expected_counts.json").read_text(encoding="utf-8")
    )
    assert len(expected["per_state"]) == 20
    computed = {}
    for state in expected["per_state"].values():
        for metric, value in state["counts"].items():
            computed[metric] = computed.get(metric, 0) + value
    assert computed == expected["totals"]

    name_hashes = json.loads(
        (ROOT / "audit/pass3_name_hashes.json").read_text(encoding="utf-8")
    )
    assert len(name_hashes) == 670
    assert all(re.fullmatch(r"[0-9a-f]{32}", key) for key in name_hashes)
    pairs = [tuple(value) for value in name_hashes.values()]
    assert all(len(pair) == 2 for pair in pairs)
    assert len(set(pairs)) == 670


def verify_sais_batches() -> None:
    resource_ids = []
    deadline_ids = []
    for path in sorted((ROOT / "_work/sais3").glob("*.sql")):
        text = path.read_text(encoding="utf-8")
        ids = re.findall(r"^\('([^']+)'", text, flags=re.MULTILINE)
        assert text.startswith("WITH ins AS (INSERT INTO ")
        assert "ON CONFLICT (resource_id) DO NOTHING" in text
        if path.name.startswith("r"):
            assert "INSERT INTO sais_resources " in text
            resource_ids.extend(ids)
        elif path.name.startswith("d"):
            assert "INSERT INTO sais_resource_deadlines " in text
            deadline_ids.extend(ids)
        else:
            raise AssertionError(f"unexpected SQL batch: {path.name}")
    assert len(resource_ids) == len(set(resource_ids)) == 164
    assert len(deadline_ids) == len(set(deadline_ids)) == 164
    assert set(resource_ids) == set(deadline_ids)


if __name__ == "__main__":
    verify_source_hashes()
    verify_table_snapshot()
    verify_pass3_evidence()
    verify_sais_batches()
    print("packet verification: PASS")
