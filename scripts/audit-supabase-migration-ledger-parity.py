from __future__ import annotations

import csv
import hashlib
from collections import defaultdict
from pathlib import Path

PRODUCTION_RECEIPTS = Path("supabase/verification/production_migration_receipts_20260829.tsv")
# executable_md5 is exported from each ordered production statement array by
# trimming trailing whitespace, restoring a missing top-level terminator,
# joining statements with one blank line, and ending the file with one newline.
# The sole comment-only receipt (20260517000000) intentionally gets no terminator.
APPROVED_REPOSITORY_ONLY = {
    "20260501203517": (
        "20260501203517_fresh_branch_signal_severity_foundation.sql",
        "8a13b1a07ae5c0b897392fe400e052e1bda2e48d",
    ),
    "20260513200123": (
        "20260513200123_harden_analysis_snapshots_fresh_replay.sql",
        "81ef2c910c3ce9544e2d8e50b62d9b6fd263da77",
    ),
    "20260815040500": (
        "20260815040500_rosetta_structural_correctness_reconciliation.sql",
        "79515b62a48d5fc865048276073f1f633fe4402e",
    ),
    "20260815140500": (
        "20260815140500_prism_rosetta_v23_generation.sql",
        "a98571ecb82ae4638cf0f496f387787789087f56",
    ),
    "20260818084500": (
        "20260818084500_prism_domain2_legal_pattern_pullthrough.sql",
        "34abda022c0159764a158816c737b7bb1ed426a1",
    ),
    "20260818090000": (
        "20260818090000_domain2_current_prism_generation.sql",
        "1666a2d30880efbffeeca0b58f1a1482d212bccb",
    ),
    "20260818095500": (
        "20260818095500_signal_architecture_runtime_projection_truth.sql",
        "af52234965f8641488c56e8a3422ae8aa183287d",
    ),
    "20260818210000": (
        "20260818210000_canonical_core_read_boundary.sql",
        "f13271ce76999f21521aaddf9bbfffe47bfa2d88",
    ),
    "20260820063000": (
        "20260820063000_civic_genome_prism_rosetta_stale_context_supersession_v1.sql",
        "5d2f0890b94431bc46076456309cdd4dda67c2d0",
    ),
    "20260821051200": (
        "20260821051200_civic_genome_prism_rosetta_stale_context_sweeper_v2.sql",
        "3a4ec5bec743a0711f621deafcba29f560e05039",
    ),
    "20260821123000": (
        "20260821123000_lighthouse_private_client_read_lockdown_v1.sql",
        "0480f8c4eb9976059459fec5de7b3d89f6faaa6a",
    ),
    "20260821123100": (
        "20260821123100_lighthouse_private_client_read_lockdown_policy_completion_v1.sql",
        "f65f8d4a736ae13609902eb75d0da0f2803ca60c",
    ),
    "20260821235951": (
        "20260821235951_atlas_domain3_integrity_review_projection.sql",
        "612ad13348694ecd03a3b801a1d04d5424026848",
    ),
    "20260822002000": (
        "20260822002000_fix_runtime_active_uploads_lifecycle_v1.sql",
        "0e8c84ac2b00c95964b1f7d22db2cd1b11e624ac",
    ),
    "20260822012500": (
        "20260822012500_atlas_domain3_integrity_review_projection_verify.sql",
        "9358b4216dd449499b08e8facb901a9e61f7164d",
    ),
    "20260822055000": (
        "20260822055000_signal_artifact_case_links_v1.sql",
        "d5e994db936c5e5e4f5d3e3dc7dd7ee95f49790b",
    ),
    "20260822055100": (
        "20260822055100_signal_artifact_case_links_intake_index_v1.sql",
        "579e1b5599c5ee2bfe3abe4f02a6fbe3bf6d229b",
    ),
    "20260822203000": (
        "20260822203000_lighthouse_case_status_canonical_default.sql",
        "07150814d2ddd32aa41c0611408a4ed92478a37a",
    ),
}

SOURCE_CONTROLLED_APPLICATION_RECEIPTS = {
    "20260509001402": (
        "bb3b4546c4257014a49a8cef5dea77e0",
        "1f0eb57d456e7f240e43c09f7b0759bdbd200ae0",
    ),
    "20260513200136": (
        "cf445df3da67240166927ad737f9ea75",
        "2e993338680b95caac9ae08c7b4a4b14426e4726",
    ),
    "20260513200250": (
        "b35feafe3cc54edfe240be1fc1a34570",
        "56acd505d15f5dfd5f22ef5cba53d47716653c10",
    ),
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


def file_hashes(path: Path) -> set[str]:
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

required_columns = {
    "version",
    "name",
    "statements_md5",
    "statement_count",
    "executable_md5",
}
malformed_receipts = [
    row
    for row in receipt_rows
    if set(row) != required_columns
    or len(row["version"]) != 14
    or not row["version"].isdigit()
    or not row["name"]
    or len(row["statements_md5"]) != 32
    or any(character not in "0123456789abcdef" for character in row["statements_md5"])
    or not row["statement_count"].isdigit()
    or int(row["statement_count"]) < 1
    or len(row["executable_md5"]) != 32
    or any(character not in "0123456789abcdef" for character in row["executable_md5"])
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
production_hashes: dict[str, tuple[str, str]] = {}
for row in receipt_rows:
    production_hashes[row["statements_md5"]] = (row["version"], row["name"])
    production_hashes[row["executable_md5"]] = (row["version"], row["name"])

local_by_version: dict[str, list[Path]] = defaultdict(list)
for path in sorted(Path("supabase/migrations").glob("*.sql")):
    version = path.name.split("_", 1)[0]
    if len(version) == 14 and version.isdigit():
        local_by_version[version].append(path)

local_versions = set(local_by_version)
approved_repository_only_versions = set(APPROVED_REPOSITORY_ONLY)
missing_production = sorted(production_versions - local_versions)
missing_repository_only = sorted(approved_repository_only_versions - local_versions)
unexpected_local = sorted(
    local_versions - production_versions - approved_repository_only_versions
)
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
    actual_md5 = hashlib.md5(path.read_bytes()).hexdigest()
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
        actual_md5 != receipt["executable_md5"]
        and not source_controlled_match
        and not replay_alias_match
    ):
        hash_mismatches.append(
            (version, path.name, receipt["executable_md5"], actual_md5)
        )

repository_only_name_mismatches: list[tuple[str, str, str]] = []
repository_only_hash_mismatches: list[tuple[str, str, str, str]] = []
for version in sorted(approved_repository_only_versions & local_versions):
    if version in duplicates:
        continue
    path = local_by_version[version][0]
    expected_name, expected_blob_sha1 = APPROVED_REPOSITORY_ONLY[version]
    if path.name != expected_name:
        repository_only_name_mismatches.append(
            (version, path.name, expected_name)
        )
    actual_blob_sha1 = git_blob_sha1(path)
    if actual_blob_sha1 != expected_blob_sha1:
        repository_only_hash_mismatches.append(
            (version, path.name, expected_blob_sha1, actual_blob_sha1)
        )

repository_only_production_hash_duplicates: list[
    tuple[str, str, str, str, str]
] = []
for version in sorted(approved_repository_only_versions & local_versions):
    for path in local_by_version[version]:
        for statements_md5 in file_hashes(path):
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
    "REPOSITORY_ONLY_NAME_MISMATCH_COUNT="
    f"{len(repository_only_name_mismatches)}"
)
for version, actual, expected in repository_only_name_mismatches:
    print(f"REPOSITORY_ONLY_NAME_MISMATCH={version}|{actual}|{expected}")
print(
    "REPOSITORY_ONLY_HASH_MISMATCH_COUNT="
    f"{len(repository_only_hash_mismatches)}"
)
for version, name, expected, actual in repository_only_hash_mismatches:
    print(f"REPOSITORY_ONLY_HASH_MISMATCH={version}|{name}|{expected}|{actual}")
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
    or repository_only_name_mismatches
    or repository_only_hash_mismatches
    or repository_only_production_hash_duplicates
):
    raise SystemExit(1)

print("MIGRATION_LEDGER_PARITY_CONTRACT=PASS")
