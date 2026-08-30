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
    "20260505074840": (
        "20260505074840_detected_signals_foundation.sql",
        "460f50414384e582c2d5e4303690c27006e82f5b",
    ),
    "20260505074842": (
        "20260505074842_retire_incompatible_atlas_signal_chain.sql",
        "4023ec7c649a9939dacb1e8b9a53565759569423",
    ),
    "20260513200123": (
        "20260513200123_harden_analysis_snapshots_fresh_replay.sql",
        "81ef2c910c3ce9544e2d8e50b62d9b6fd263da77",
    ),
    "20260612180130": (
        "20260612180130_corpus_import_queue_foundation.sql",
        "905e29ca31062385790d88b9f7b55e6a2afb3777",
    ),
    "20260614205299": (
        "20260614205299_admin_change_log_foundation.sql",
        "8c1fb68fdd2cf6adaf7309bae4121ce5df8cb487",
    ),
    "20260724155641": (
        "20260724155641_civic_genome_family_bill_foundation.sql",
        "1fa0a341cd6d404702a90f42859e0571a1717e7d",
    ),
    "20260727012910": (
        "20260727012910_family_momentum_snapshot_foundation.sql",
        "b4e768c3b3162b1a71d7dba41a72d26a09a5cc59",
    ),
    "20260729111825": (
        "20260729111825_coordinate_enrichment_queue_foundation.sql",
        "e361c9db041ab717358fa368faf221939f3fb356",
    ),
    "20260729150407": (
        "20260729150407_data_stream_registry_foundation.sql",
        "7b099a1e3ae1b4ac02554fb7859f52c787dfe17e",
    ),
    "20260729150408": (
        "20260729150408_atlas_stream_tables_foundation.sql",
        "bac1144637f412c4118a293ac2c829f016bcf81f",
    ),
    "20260729154228": (
        "20260729154228_ingest_runs_foundation.sql",
        "13da53e576a0df1bcd6b1bdeb55d799531f20a5d",
    ),
    "20260729164259": (
        "20260729164259_state_enriched_directory_foundation.sql",
        "f2b00eefe0870c427c2230262019c7319ad727a3",
    ),
    "20260729165153": (
        "20260729165153_registry_jurisdiction_program_foundation.sql",
        "6945a09fbc7d670545d46fbe45c8d1d325442f47",
    ),
    "20260730093430": (
        "20260730093430_world_index_tables_foundation.sql",
        "be84abac936c354f79309122132d73d06646b555",
    ),
    "20260731091000": (
        "20260731091000_civic_genome_event_foundation.sql",
        "491c84ba8ec0d50f16e32a68ceae2b2d265c4b97",
    ),
    "20260731092500": (
        "20260731092500_bill_lineage_edge_foundation.sql",
        "b93028c22bf0659e2b335b07c7f3b78e271d15a4",
    ),
    "20260731194000": (
        "20260731194000_notifications_foundation.sql",
        "ac310c326f1d3638c08ad3943ed4ccb51bd51f07",
    ),
    "20260801070000": (
        "20260801070000_math_engine_base_foundation.sql",
        "0e027bbbec7c2ccd37db572e5e140737e115d289",
    ),
    "20260806035000": (
        "20260806035000_share_links_foundation.sql",
        "4ff031128af02bd5e64da1ee4043f6e2a517dec5",
    ),
    "20260806042500": (
        "20260806042500_atlas_lighthouse_bridge_foundation.sql",
        "02372fd6ab1da33a90adf2c21d1cd1f9a9240b84",
    ),
    "20260807053000": (
        "20260807053000_case_narratives_foundation.sql",
        "3ae1b076492977d6307abcc3facf0b3c9769d823",
    ),
    "20260807154000": (
        "20260807154000_legacy_case_ledgers_foundation.sql",
        "08351c7eada3b7dac37de2b26969020f7baaa584",
    ),
    "20260807170000": (
        "20260807170000_documents_upload_compatibility_foundation.sql",
        "fc2bc2686415ea1b71c9033c95ecb92c07a5fd89",
    ),
    "20260808200000": (
        "20260808200000_batch_rerun_runs_foundation.sql",
        "14cc49409131e491aa59e6b8183c35e751fc71c0",
    ),
    "20260809130000": (
        "20260809130000_case_workflow_tables_foundation.sql",
        "9af9eb8ffa3712d179ebc947febe9d7a8bbf7eab",
    ),
    "20260810070000": (
        "20260810070000_registry_resource_realms_foundation.sql",
        "57f246fba48a7cc9c5da5652b6b10339eb6c58d2",
    ),
    "20260815060000": (
        "20260815060000_canonical_problem_instances_foundation.sql",
        "0b4423aa1c91d31ecc4134f4ba4c0f002759ba7f",
    ),
    "20260815075930": (
        "20260815075930_findings_coverage_foundation.sql",
        "6c9acc4134c285368cf8c4a410b80c172f88ecee",
    ),
    "20260815075950": (
        "20260815075950_filing_catalog_tables_foundation.sql",
        "3e44fc804f6a22601f60b1792e3b719d35bb7267",
    ),
    "20260815080020": (
        "20260815080020_signal_registry_foundation.sql",
        "fd89ea14c9f32fec836474c1370d547e7ef637b9",
    ),
    "20260815081100": (
        "20260815081100_runtime_legal_library_foundation.sql",
        "bf4512eaf1affc72f2b24f7af8593d27f18feea0",
    ),
    "20260815081130": (
        "20260815081130_case_surface_tables_foundation.sql",
        "0009349f013832cb095010205c7b62e40b0f5690",
    ),
    "20260816063000": (
        "20260816063000_visibility_legacy_tables_foundation.sql",
        "ccbb0a0325cf9420baf2fbe3325c48ce47456f20",
    ),
    "20260816124000": (
        "20260816124000_legacy_signal_graph_tables_foundation.sql",
        "9a6926fd4631e20199405071008bf8d9fec2c514",
    ),
    "20260817070000": (
        "20260817070000_enforcement_intelligence_tables_foundation.sql",
        "09f0458bab163c60d83a9202c8b2d92037d3585b",
    ),
    "20260817194630": (
        "20260817194630_knowledge_backbone_tables_foundation.sql",
        "a9dc18c83c9109569d469ec72ac504c89f38cc3d",
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
    "20260821093830": (
        "20260821093830_intake_provenance_tables_foundation.sql",
        "12b9684886916ecb02a80c9e06a5221b76d2b0f9",
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
    "20260822003000": (
        "20260822003000_upload_sessions_foundation.sql",
        "d8bb9f5525283c526b27c8e82d4c425c3fa17fe8",
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
    "20260826130000": (
        "20260826130000_foia_reference_stubs_foundation.sql",
        "841ed793c9ce734b4aed610e471dc19c5b8f709a",
    ),
    "20260829093000": (
        "20260829093000_lighthouse_case_detail_client_lockdown.sql",
        "26b8d745885d08a00b2cbeab2fb9ce3604d52058",
    ),
    "20260829094000": (
        "20260829094000_legacy_function_resolution_bridges.sql",
        "14b8774b465db0b1dc0e563aafec51f684fd9dda",
    ),
}

SOURCE_CONTROLLED_APPLICATION_RECEIPTS = {
    "20260829105026": (
        "7d48c98ebf0c263f41446acfa4c6a6eb",
        "8649acbf35650b172adbde5eecb95afe03bed934",
    ),
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
    "20260516063117": (
        "6c7b42e71d68aa2d1025a5f0e3f2045f",
        "56b9712aa63e208e78e1c1fe7ad906fd9d8a5fb0",
    ),
    "20260516064719": (
        "1cec5eb0917b2a80b8234ca46cc8d98c",
        "7be1047b3f43c6df60c7a38043a77967f7c100b4",
    ),
    "20260516071114": (
        "5846eca378a24056151f30997f6b4151",
        "dd03054d02c543d9a04741b5ed5405a6ab6c849e",
    ),
    "20260516072055": (
        "ac36f23bb5d4abd0818381782410676a",
        "e5e74c5e9691cb255f43e116bd98403e6e7cb113",
    ),
    "20260516095820": (
        "dd6c1b377719180ed6a225ac2a029388",
        "a89e04f230d5faed18c7d8a751b3af41890af580",
    ),
    "20260516115041": (
        "018823b4cfaebf922d1825fe0fc4c664",
        "0776c81fcd6030163e6639496594b28e9d7b0ea8",
    ),
    "20260517141106": (
        "4f06203bcd507e1fa0064f04bce72fcc",
        "fde82d251c27f4a5834362666f73ef1c620aa8de",
    ),
    "20260517141117": (
        "4f06203bcd507e1fa0064f04bce72fcc",
        "fde82d251c27f4a5834362666f73ef1c620aa8de",
    ),
    "20260525232050": (
        "30522a5138995d21c138fd1b261f83e9",
        "9f39b32cc325e529053e5b62a85ff2fd80fd76a4",
    ),
    "20260525232233": (
        "6345172cd9f28376083c293e8ef13a0d",
        "ae9601dbc9e9fcbf2cd67919bebae4573e7b91b7",
    ),
    "20260526055607": (
        "7542d445810e9db01a6a8d0c3033aa85",
        "c18589f1a9bc509b44b214ead34360636dded768",
    ),
    "20260526060031": (
        "c7578475d86576e152c2a810f5551f63",
        "2c6d63196c2a57a4aeecc0e4b9c014d6946783e5",
    ),
    "20260526210708": (
        "c634ef693ce496e0e0600af422f99a46",
        "94dcac806b51305e6df0fa5ddfefcbf5eccd68f8",
    ),
    "20260605225538": (
        "bb2c5dfb1d8a795bebd7e31f3f381b04",
        "96b9871767f732d7e4f0f7374549db250cbaa8d5",
    ),
    "20260609122541": (
        "5f4cdc18172b361ee9b014a11fae0b79",
        "ed1dd7f6ac9f109319fceb3522908d52cabd80e8",
    ),
    "20260613094359": (
        "8d1f8c3bb885a751822246caca87dc01",
        "caf7de12772918a3e99af904cf4af06e8abaea34",
    ),
    "20260613100249": (
        "debaf61da86603b4687379bd8b16d801",
        "f6e52c35b7a96c264e0b3877ecce897784f7b7f2",
    ),
    "20260729022336": (
        "551357d09585bc62520fa85f5043c511",
        "d1d1c7b5bc362f69c130adda3d27f1b9c210622d",
    ),
    "20260729110336": (
        "3fda3f180634c3d6d26e2f53a6e74465",
        "8d957dd6002f9b729682393c315fad18509ae57b",
    ),
    "20260730134202": (
        "7b7cedac8471435b59561a80856efa64",
        "fb3cf2d8dd48a1b4c0c007faa3956219ecb86ed9",
    ),
    "20260730215234": (
        "cd4e6b789c6d23b8ae7e9248282528a1",
        "70c15f85945a77a3ca0d82ca329d57481732f7b9",
    ),
    "20260731001606": (
        "8dd02007f118b4b10dbf83eb44861b07",
        "a0c5f1e4e788d28ebf1201758c7c41c36c8d3890",
    ),
    "20260731003903": (
        "d512d2c8670121eebc71972de6684812",
        "c2692754a86abc361fa2a612f1d0508a636169a5",
    ),
    "20260731005055": (
        "fe76430d43efe6491bc7a964c7689d5a",
        "0edfa8224d0d42308e62f5b50298aa38265e97eb",
    ),
    "20260731012842": (
        "9dd8cc9361ba1f56da1186946340c9da",
        "b90945c1957e261af07fcbfc0604be106b1c9178",
    ),
    "20260731184205": (
        "29d27053b4d8ecac927dc0e600087294",
        "2ed20f278cf948db41c10566aefb616de19d902b",
    ),
    "20260731185401": (
        "6cefce3c6a1af6ae49e02e47d2ae156a",
        "e49b05ec67f68386896f6700108684f3eaa24ce2",
    ),
    "20260731192928": (
        "23af644914fe7d8529a47106ff1a1cdb",
        "ccc4ffba0157f04246c356631356e6532b2e5991",
    ),
    "20260731195927": (
        "2460b6b7ce5381d2dc778b9b89dfbc9d",
        "3c6c31d78272705cbd9ae11b3ebf898ce71edce0",
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
    "20260805231236": (
        "22ddc1aa95d3fc453e53f68a87b4a0a9",
        "b2c30784185f127cede2efe4f5ea519bdf4869b2",
    ),
    "20260805234500": (
        "46df49ff6847a129610bdb04fd63fd72",
        "a218e24192d874a64a0dfcf9348765bd82ab5752",
    ),
    "20260816091600": (
        "d2ed46a7566497158a9fe51b543aeec7",
        "149caa2e0714ce5baf477b4698321644b4d94a02",
    ),
    "20260816091700": (
        "51d208125fe45838375bbfb633a8df14",
        "50809b435e3883dcfd3c2858da16ed890d05a177",
    ),
    "20260816091727": (
        "1986b277310c37cb4427c9859ba76916",
        "78425d6c5c919e0a5bd2a81bc32dec958fa59bba",
    ),
    "20260816091905": (
        "bf6f32f72240f8fbe3d67b1516e8b9ba",
        "4807d08b124b27f987c0fa024a5376f53e189832",
    ),
    "20260819110102": (
        "ab8db840bfc39f693b9befc593578323",
        "ce3c56b7819e2cc007d813657be3c3e10fb00089",
    ),
    "20260820155755": (
        "c8b5c73482716082f48b1263529ab08a",
        "aa4ddf5a73fcc6d77f05d4fe135cd565341c9dd7",
    ),
    "20260821093947": (
        "036182e673147d21d13eb59f5d1a1483",
        "78c7e6956a6eb23c7f08015cfe7e149b4ed884f1",
    ),
    "20260821123119": (
        "62858fb0b19ad193383ae90265b610d1",
        "f9cf6c87b4c57727ba611f663d63d235c64411e4",
    ),
    "20260821123150": (
        "1aa15df19a3b9f6819c8757d1c8574ea",
        "45693bff38c5af2a0cc1380222b79bfd7028cf97",
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
