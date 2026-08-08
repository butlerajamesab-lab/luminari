from __future__ import annotations

from collections import defaultdict
from pathlib import Path

REMOTE_FIXTURE = Path("supabase/verification/production_migration_versions_20260802.txt")
RECORDED_AFTER_FIXTURE = {
    "20260803000100",
    "20260806035615",
    "20260806043309",
    "20260807053653",
    "20260807055726",
    "20260807125440",
    "20260807154857",
    "20260807155946",
    "20260807161053",
    "20260807175359",
    "20260807204521",
    "20260807205321",
    "20260808200840",
}
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
    "20260805210000",
    "20260805210050",
    "20260805210100",
    "20260805210717",
    "20260805210739",
    "20260805210822",
    "20260805215620",
    "20260805233000",
    "20260805234500",
    "20260805235000",
    "20260805235500",
    "20260805241000",
    "20260806042000",
    "20260806043149",
    "20260806051000",
    "20260806052000",
    "20260806060000",
    "20260806160000",
    "20260806182000",
    "20260806185000",
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
