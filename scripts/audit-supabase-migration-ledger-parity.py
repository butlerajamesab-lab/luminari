from __future__ import annotations

from collections import defaultdict
from pathlib import Path

PRODUCTION_RECEIPTS = Path("supabase/verification/production_migration_receipts_20260829.tsv")
APPROVED_REPOSITORY_ONLY = {
    "20260501203517",
    "20260815040500",
    "20260815140500",
    "20260818084500",
    "20260818090000",
    "20260818095500",
    "20260818210000",
    "20260820063000",
    "20260821051200",
    "20260821123000",
    "20260821123100",
    "20260821235951",
    "20260822002000",
    "20260822012500",
    "20260822055000",
    "20260822055100",
    "20260822203000",
}

receipt_rows = [
    line.split("\t")
    for line in PRODUCTION_RECEIPTS.read_text(encoding="utf-8").splitlines()[1:]
    if line.strip()
]
production_versions = {row[0] for row in receipt_rows}
production_duplicates = {
    version
    for version in production_versions
    if sum(1 for row in receipt_rows if row[0] == version) > 1
}
malformed_receipts = [
    row
    for row in receipt_rows
    if len(row) != 3 or len(row[0]) != 14 or not row[0].isdigit() or len(row[2]) != 32
]

local_by_version: dict[str, list[str]] = defaultdict(list)
for path in sorted(Path("supabase/migrations").glob("*.sql")):
    version = path.name.split("_", 1)[0]
    if len(version) == 14 and version.isdigit():
        local_by_version[version].append(path.name)

local_versions = set(local_by_version)
missing_production = sorted(production_versions - local_versions)
missing_repository_only = sorted(APPROVED_REPOSITORY_ONLY - local_versions)
unexpected_local = sorted(local_versions - production_versions - APPROVED_REPOSITORY_ONLY)
duplicates = {version: names for version, names in local_by_version.items() if len(names) > 1}

print(f"PRODUCTION_RECEIPT_COUNT={len(receipt_rows)}")
print(f"PRODUCTION_VERSION_COUNT={len(production_versions)}")
print(f"LOCAL_14_DIGIT_COUNT={len(local_versions)}")
print(f"APPROVED_REPOSITORY_ONLY_COUNT={len(APPROVED_REPOSITORY_ONLY)}")
print(f"MISSING_PRODUCTION_COUNT={len(missing_production)}")
for version in missing_production:
    print(f"MISSING_PRODUCTION_VERSION={version}")
print(f"MISSING_REPOSITORY_ONLY_COUNT={len(missing_repository_only)}")
for version in missing_repository_only:
    print(f"MISSING_REPOSITORY_ONLY_VERSION={version}")
print(f"UNEXPECTED_LOCAL_COUNT={len(unexpected_local)}")
for version in unexpected_local:
    print(f"UNEXPECTED_LOCAL_VERSION={version}|{'|'.join(local_by_version[version])}")
print(f"DUPLICATE_LOCAL_VERSION_COUNT={len(duplicates)}")
for version, names in sorted(duplicates.items()):
    print(f"DUPLICATE_LOCAL_VERSION={version}|{'|'.join(names)}")
print(f"DUPLICATE_PRODUCTION_VERSION_COUNT={len(production_duplicates)}")
for version in sorted(production_duplicates):
    print(f"DUPLICATE_PRODUCTION_VERSION={version}")
print(f"MALFORMED_PRODUCTION_RECEIPT_COUNT={len(malformed_receipts)}")

if (
    missing_production
    or missing_repository_only
    or unexpected_local
    or duplicates
    or production_duplicates
    or malformed_receipts
):
    raise SystemExit(1)

print("MIGRATION_LEDGER_PARITY_CONTRACT=PASS")
