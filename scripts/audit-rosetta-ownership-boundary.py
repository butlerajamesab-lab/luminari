from __future__ import annotations

import re
from pathlib import Path

MIGRATION_ROOT = Path("supabase/migrations")

FORBIDDEN = {
    "canonical_producer": re.compile(
        r"create\s+(?:or\s+replace\s+)?function\s+public\.run_rosetta_v3_extraction\b",
        re.IGNORECASE,
    ),
    "structural_repair_queue": re.compile(
        r"create\s+(?:table\s+if\s+not\s+exists\s+|table\s+)public\.rosetta_structural_repair_queue\b",
        re.IGNORECASE,
    ),
    "canonical_clause": re.compile(
        r"create\s+(?:table\s+if\s+not\s+exists\s+|table\s+)public\.rosetta_canonical_clause\b",
        re.IGNORECASE,
    ),
    "clause_occurrence": re.compile(
        r"create\s+(?:table\s+if\s+not\s+exists\s+|table\s+)public\.rosetta_clause_occurrence\b",
        re.IGNORECASE,
    ),
    "reconciliation_producer": re.compile(
        r"create\s+(?:or\s+replace\s+)?function\s+public\.rosetta_reconcile_structural_correctness\b",
        re.IGNORECASE,
    ),
    "versioned_rosetta_engine": re.compile(
        r"create\s+(?:or\s+replace\s+)?function\s+public\.rosetta_v\d+_.*(?:extract|reconcil|canonical_output)\b",
        re.IGNORECASE,
    ),
}

violations: list[str] = []
for path in sorted(MIGRATION_ROOT.glob("*.sql")):
    sql = path.read_text(encoding="utf-8")
    # Comments explain historical ownership and are not executable DDL. Strip
    # line comments before checking so the retirement marker can document the
    # forbidden surface without tripping the executable-boundary audit.
    executable = re.sub(r"--[^\n]*", "", sql)
    for label, pattern in FORBIDDEN.items():
        if pattern.search(executable):
            violations.append(f"{path.name}:{label}")

print(f"ROSETTA_OWNERSHIP_VIOLATION_COUNT={len(violations)}")
for violation in violations:
    print(f"ROSETTA_OWNERSHIP_VIOLATION={violation}")

if violations:
    raise SystemExit(1)

print("ROSETTA_OWNERSHIP_BOUNDARY=PASS")
