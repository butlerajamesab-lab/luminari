from __future__ import annotations

from collections import defaultdict
from pathlib import Path

REMOTE_FIXTURE = Path("supabase/verification/production_migration_versions_20260802.txt")
RECORDED_AFTER_FIXTURE = {"20260803000100"}
EXPECTED_NEW = {
    "20260803000200",
    "20260804063920",
    "20260804064053",
    "20260804065409",
    "20260804123525",
    "20260805163200",
    "20260805194900",
    "20260805195000",
    "20260805201200",
}

remote_versions = {
    line.strip()
    for line in REMOTE_FIXTURE.read_text(encoding="utf-8").splitlines()
    if line.strip()
} | RECORDED_AFTER_FIXTURE

local_by_version: dict[str, list[str]] = defaultdict(list)
for path in sorted(Path("supabase/migrations").glob("*.sql")):
    version = path.name.split("_", 1)[0]
    if len(version) == 14 and version.isdigit():
        local_by_version[version].append(path.name)

local_versions = set(local_by_version)
missing_remote = sorted(remote_versions - local_versions)
missing_expected_new = sorted(EXPECTED_NEW - local_versions)
unexpected_local = sorted(local_versions - remote_versions - EXPECTED_NEW)
duplicates = {
    version: names
    for version, names in local_by_version.items()
    if len(names) > 1
}

print(f"REMOTE_FIXTURE_COUNT={len(remote_versions)}")
print(f"RECORDED_AFTER_FIXTURE_COUNT={len(RECORDED_AFTER_FIXTURE)}")
print(f"LOCAL_14_DIGIT_COUNT={len(local_versions)}")
print(f"EXPECTED_NEW_COUNT={len(EXPECTED_NEW)}")
print(f"MISSING_REMOTE_COUNT={len(missing_remote)}")
for version in missing_remote:
    print(f"MISSING_REMOTE_VERSION={version}")
print(f"MISSING_EXPECTED_NEW_COUNT={len(missing_expected_new)}")
for version in missing_expected_new:
    print(f"MISSING_EXPECTED_NEW_VERSION={version}")
print(f"UNEXPECTED_LOCAL_COUNT={len(unexpected_local)}")
for version in unexpected_local:
    print(f"UNEXPECTED_LOCAL_VERSION={version}|{'|'.join(local_by_version[version])}")
print(f"DUPLICATE_LOCAL_VERSION_COUNT={len(duplicates)}")
for version, names in sorted(duplicates.items()):
    print(f"DUPLICATE_LOCAL_VERSION={version}|{'|'.join(names)}")

if missing_remote or missing_expected_new or unexpected_local or duplicates:
    raise SystemExit(1)

print("MIGRATION_LEDGER_PARITY_CONTRACT=PASS")
