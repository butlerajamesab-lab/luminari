from __future__ import annotations

import csv
import hashlib
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

TRAILING_NEWLINE_NORMALIZED_RECEIPTS = {
    "20260817192259": (
        "1094ff8d54939ff05e0325425cc70c86",
        "2287eabf95aebcd84cee55a71d217705",
    ),
    "20260817192808": (
        "81324b0cecbfa6b170529d0092e6026c",
        "097b6d076c5e7acc69017f2fe7887be2",
    ),
}

SOURCE_CONTROLLED_APPLICATION_RECEIPTS = {
    "20260805194900": (
        "ed9f769f67de34a7c27d14e91e552a55",
        "1a14f25ed15b1ce6392099639e06c1a5160dc462",
    ),
    "20260805195000": (
        "440188573ff844089702c64ca5d536f7",
        "19e9c1d8562234e6a46f67b304004955a470d43e",
    ),
    "20260805201200": (
        "da75cb837f1c71b624c09d6421c7226f",
        "b163351fbc67ace4d936c64ac74b90525df4d1ba",
    ),
}

REPLAY_ALIAS_RECEIPTS = {
    "20260805210000": (
        "0b055159913ace8294a93fb659ddbd68",
        "2fa30df60f163da3c54dbe55e447bb553d2b7b04",
    ),
    "20260805210050": (
        "3679d2cb4a62e34315aebc2a4f19aa42",
        "8d7779fb58ce84fc9029e07134170e4551c48d63",
    ),
    "20260805210100": (
        "dfaf9729d4069f69641842dfcbddc874",
        "2616a8a5eedb5945162b2ea72723c636a9c56f0b",
    ),
    "20260805233000": (
        "f07903abc18d177c9f8ac8bd4722181e",
        "fbd63d99190e6a43c93db3743e8e764e0b516b8d",
    ),
    "20260806042000": (
        "a5e3bd37b09eefc748fb8ffd3b799fd8",
        "86362fff8bb7b14d282158ae399d78c5f12a8211",
    ),
}


def receipt_hashes(path: Path) -> set[str]:
    body = path.read_bytes()
    hashes = {hashlib.md5(body).hexdigest()}
    if body.endswith(b"\n"):
        hashes.add(hashlib.md5(body[:-1]).hexdigest())
    return hashes


def git_blob_sha1(path: Path) -> str:
    body = path.read_bytes()
    header = f"blob {len(body)}\0".encode()
    return hashlib.sha1(header + body).hexdigest()


with PRODUCTION_RECEIPTS.open(encoding="utf-8", newline="") as receipt_file:
    receipt_rows = list(csv.DictReader(receipt_file, delimiter="\t"))

required_columns = {"version", "name", "statements_md5"}
malformed_receipts = [
    row
    for row in receipt_rows
    if set(row) != required_columns
    or len(row["version"]) != 14
    or not row["version"].isdigit()
    or not row["name"]
    or len(row["statements_md5"]) != 32
    or any(character not in "0123456789abcdef" for character in row["statements_md5"])
]

production_by_version: dict[str, list[dict[str, str]]] = defaultdict(list)
for row in receipt_rows:
    production_by_version[row["version"]].append(row)

production_duplicates = {
    version: rows
    for version, rows in production_by_version.items()
    if len(rows) > 1
}
production_versions = set(production_by_version)
production_hashes = {
    row["statements_md5"]: (row["version"], row["name"])
    for row in receipt_rows
}

local_by_version: dict[str, list[Path]] = defaultdict(list)
for path in sorted(Path("supabase/migrations").glob("*.sql")):
    version = path.name.split("_", 1)[0]
    if len(version) == 14 and version.isdigit():
        local_by_version[version].append(path)

local_versions = set(local_by_version)
missing_production = sorted(production_versions - local_versions)
missing_repository_only = sorted(APPROVED_REPOSITORY_ONLY - local_versions)
unexpected_local = sorted(local_versions - production_versions - APPROVED_REPOSITORY_ONLY)
duplicates = {
    version: paths
    for version, paths in local_by_version.items()
    if len(paths) > 1
}

name_mismatches: list[tuple[str, str, str]] = []
hash_mismatches: list[tuple[str, str, str, str]] = []
for version in sorted(production_versions & local_versions):
    if version in duplicates:
        continue
    receipt = production_by_version[version][0]
    path = local_by_version[version][0]
    expected_name = f"{version}_{receipt['name']}.sql"
    if path.name != expected_name:
        name_mismatches.append((version, path.name, expected_name))
    hashes = receipt_hashes(path)
    normalization = TRAILING_NEWLINE_NORMALIZED_RECEIPTS.get(version)
    normalized_match = (
        normalization is not None
        and receipt["statements_md5"] == normalization[0]
        and hashlib.md5(path.read_bytes().rstrip(b"\n")).hexdigest()
        == normalization[1]
    )
    source_controlled_application = SOURCE_CONTROLLED_APPLICATION_RECEIPTS.get(
        version
    )
    source_controlled_match = (
        source_controlled_application is not None
        and receipt["statements_md5"] == source_controlled_application[0]
        and git_blob_sha1(path) == source_controlled_application[1]
    )
    replay_alias = REPLAY_ALIAS_RECEIPTS.get(version)
    replay_alias_match = (
        replay_alias is not None
        and receipt["statements_md5"] == replay_alias[0]
        and git_blob_sha1(path) == replay_alias[1]
    )
    if (
        receipt["statements_md5"] not in hashes
        and not normalized_match
        and not source_controlled_match
        and not replay_alias_match
    ):
        hash_mismatches.append(
            (version, path.name, receipt["statements_md5"], sorted(hashes)[0])
        )

repository_only_production_hash_duplicates: list[
    tuple[str, str, str, str, str]
] = []
for version in sorted(APPROVED_REPOSITORY_ONLY & local_versions):
    for path in local_by_version[version]:
        for statements_md5 in receipt_hashes(path):
            if statements_md5 in production_hashes:
                production_version, production_name = production_hashes[statements_md5]
                repository_only_production_hash_duplicates.append(
                    (
                        version,
                        path.name,
                        production_version,
                        production_name,
                        statements_md5,
                    )
                )
                break

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
    names = "|".join(path.name for path in local_by_version[version])
    print(f"UNEXPECTED_LOCAL_VERSION={version}|{names}")
print(f"DUPLICATE_LOCAL_VERSION_COUNT={len(duplicates)}")
for version, paths in sorted(duplicates.items()):
    names = "|".join(path.name for path in paths)
    print(f"DUPLICATE_LOCAL_VERSION={version}|{names}")
print(f"DUPLICATE_PRODUCTION_VERSION_COUNT={len(production_duplicates)}")
for version in sorted(production_duplicates):
    print(f"DUPLICATE_PRODUCTION_VERSION={version}")
print(f"MALFORMED_PRODUCTION_RECEIPT_COUNT={len(malformed_receipts)}")
print(f"PRODUCTION_NAME_MISMATCH_COUNT={len(name_mismatches)}")
for version, actual, expected in name_mismatches:
    print(f"PRODUCTION_NAME_MISMATCH={version}|{actual}|{expected}")
print(f"PRODUCTION_HASH_MISMATCH_COUNT={len(hash_mismatches)}")
for version, name, expected, actual in hash_mismatches:
    print(f"PRODUCTION_HASH_MISMATCH={version}|{name}|{expected}|{actual}")
print(
    "PRODUCTION_TRAILING_NEWLINE_NORMALIZATION_COUNT="
    f"{len(TRAILING_NEWLINE_NORMALIZED_RECEIPTS)}"
)
print(
    "SOURCE_CONTROLLED_APPLICATION_RECEIPT_COUNT="
    f"{len(SOURCE_CONTROLLED_APPLICATION_RECEIPTS)}"
)
print(f"REPLAY_ALIAS_RECEIPT_COUNT={len(REPLAY_ALIAS_RECEIPTS)}")
print(
    "REPOSITORY_ONLY_PRODUCTION_HASH_DUPLICATE_COUNT="
    f"{len(repository_only_production_hash_duplicates)}"
)
for (
    version,
    name,
    production_version,
    production_name,
    statements_md5,
) in repository_only_production_hash_duplicates:
    print(
        "REPOSITORY_ONLY_PRODUCTION_HASH_DUPLICATE="
        f"{version}|{name}|{production_version}|{production_name}|{statements_md5}"
    )

if (
    missing_production
    or missing_repository_only
    or unexpected_local
    or duplicates
    or production_duplicates
    or malformed_receipts
    or name_mismatches
    or hash_mismatches
    or repository_only_production_hash_duplicates
):
    raise SystemExit(1)

print("MIGRATION_LEDGER_PARITY_CONTRACT=PASS")
