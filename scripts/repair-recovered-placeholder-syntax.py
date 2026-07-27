from __future__ import annotations

import re
from pathlib import Path

MIGRATION_DIR = Path("supabase/migrations")
INVALID_NOTICE = re.compile(
    r"RAISE NOTICE Recovered placeholder for migration version ([0-9]+);"
)

changed: list[Path] = []
inspected = 0

for path in sorted(MIGRATION_DIR.glob("*_recovered_placeholder.sql")):
    inspected += 1
    source = path.read_text()
    repaired, count = INVALID_NOTICE.subn(
        lambda match: (
            "RAISE NOTICE 'Recovered placeholder for migration version "
            f"{match.group(1)}';"
        ),
        source,
    )

    if count > 1:
        raise SystemExit(f"unexpected repeated invalid notice in {path}: {count}")

    if count == 1:
        path.write_text(repaired)
        changed.append(path)

remaining = [
    path
    for path in sorted(MIGRATION_DIR.glob("*_recovered_placeholder.sql"))
    if INVALID_NOTICE.search(path.read_text())
]

if remaining:
    raise SystemExit(
        "invalid recovered placeholder notices remain: "
        + ", ".join(str(path) for path in remaining)
    )

if not changed:
    raise SystemExit("no invalid recovered placeholder migrations were found")

print(f"inspected={inspected}")
print(f"repaired={len(changed)}")
for path in changed:
    print(path)
