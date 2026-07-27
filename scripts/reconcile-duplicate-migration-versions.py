from __future__ import annotations

from collections import defaultdict
from pathlib import Path

MIGRATION_DIR = Path("supabase/migrations")

by_version: dict[str, list[Path]] = defaultdict(list)
for path in sorted(MIGRATION_DIR.glob("*.sql")):
    prefix = path.name.split("_", 1)[0]
    if len(prefix) == 14 and prefix.isdigit():
        by_version[prefix].append(path)

removed: list[Path] = []
unresolved: list[tuple[str, list[Path]]] = []

for version, paths in sorted(by_version.items()):
    if len(paths) <= 1:
        continue

    placeholders = [path for path in paths if path.name.endswith("_recovered_placeholder.sql")]
    named = [path for path in paths if path not in placeholders]

    if len(placeholders) == 1 and len(named) == 1:
        placeholders[0].unlink()
        removed.append(placeholders[0])
        continue

    unresolved.append((version, paths))

if unresolved:
    details = "\n".join(
        f"{version}: {', '.join(str(path) for path in paths)}"
        for version, paths in unresolved
    )
    raise SystemExit(f"unresolved duplicate migration versions:\n{details}")

if not removed:
    raise SystemExit("no redundant recovered placeholders were found")

remaining: dict[str, list[Path]] = defaultdict(list)
for path in sorted(MIGRATION_DIR.glob("*.sql")):
    prefix = path.name.split("_", 1)[0]
    if len(prefix) == 14 and prefix.isdigit():
        remaining[prefix].append(path)

remaining_duplicates = {
    version: paths for version, paths in remaining.items() if len(paths) > 1
}
if remaining_duplicates:
    raise SystemExit(f"duplicate versions remain: {remaining_duplicates}")

print(f"removed={len(removed)}")
for path in removed:
    print(path)
