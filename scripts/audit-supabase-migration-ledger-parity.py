from __future__ import annotations

from collections import defaultdict
from pathlib import Path

REMOTE_FIXTURE = Path("supabase/verification/production_migration_versions_20260802.txt")
RECORDED_AFTER_FIXTURE = {
    "20260803000100",
    "20260804133050",
    "20260805164846",
    "20260805231236",
    "20260805232006",
    "20260805232630",
    "20260805234259",
    "20260806035615",
    "20260806043309",
    "20260806051259",
    "20260806052332",
    "20260806055307",
    "20260806162510",
    "20260806183734",
    "20260806184732",
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
    "20260808231628",
    "20260809051313",
    "20260809052815",
    "20260809054837",
    "20260809125105",
    "20260809135046",
    "20260809153413",
    "20260809154150",
    "20260810073809",
    "20260810104207",
    "20260811125055",
    "20260811135000",
    "20260811161132",
    "20260811204240",
    "20260811204938",
    "20260811212151",
    "20260811212450",
    "20260811212518",
    "20260811214134",
    "20260811215122",
    "20260811220007",
    "20260811220540",
    "20260811220854",
    "20260811221235",
    "20260812044452",
    "20260812084726",
    "20260815063127",
    "20260815071015",
    "20260815071636",
    "20260815071755",
    "20260815072854",
    "20260815073018",
    "20260815073049",
    "20260815073800",
    "20260815073854",
    "20260815074155",
    "20260815083538",
    "20260815091332",
    "20260815092436",
    "20260815093542",
    "20260815093646",
    "20260815194348",
    "20260815195748",
    "20260816002307",
    "20260816002920",
    "20260816004428",
    "20260816040624",
    "20260816042731",
    "20260816042900",
    "20260816063214",
    "20260816063756",
    "20260816064133",
    "20260816083428",
    "20260816091600",
    "20260816091700",
    "20260816091727",
    "20260816091905",
    "20260816093707",
    "20260816095052",
    "20260816095952",
    "20260816103729",
    "20260816111545",
    "20260816120146",
    "20260816120403",
    "20260816125001",
    "20260816161657",
    "20260816162036",
    "20260816174809",
    "20260816174926",
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
    "20260815040500",
    "20260815140500",
    "20260818084500",
    "20260818090000",
    "20260818095500",
    "20260818210000",
}

remote_versions = {line.strip() for line in REMOTE_FIXTURE.read_text(encoding="utf-8").splitlines() if line.strip()} | RECORDED_AFTER_FIXTURE
local_by_version: dict[str, list[str]] = defaultdict(list)
for path in sorted(Path("supabase/migrations").glob("*.sql")):
    version = path.name.split("_", 1)[0]
    if len(version) == 14 and version.isdigit(): local_by_version[version].append(path.name)
local_versions = set(local_by_version)
missing_remote = sorted(remote_versions - local_versions)
missing_expected_new = sorted(EXPECTED_NEW - local_versions)
unexpected_local = sorted(local_versions - remote_versions - EXPECTED_NEW)
duplicates = {version: names for version, names in local_by_version.items() if len(names) > 1}
print(f"REMOTE_FIXTURE_COUNT={len(remote_versions)}")
print(f"RECORDED_AFTER_FIXTURE_COUNT={len(RECORDED_AFTER_FIXTURE)}")
print(f"LOCAL_14_DIGIT_COUNT={len(local_versions)}")
print(f"EXPECTED_NEW_COUNT={len(EXPECTED_NEW)}")
print(f"MISSING_REMOTE_COUNT={len(missing_remote)}")
for version in missing_remote: print(f"MISSING_REMOTE_VERSION={version}")
print(f"MISSING_EXPECTED_NEW_COUNT={len(missing_expected_new)}")
for version in missing_expected_new: print(f"MISSING_EXPECTED_NEW_VERSION={version}")
print(f"UNEXPECTED_LOCAL_COUNT={len(unexpected_local)}")
for version in unexpected_local: print(f"UNEXPECTED_LOCAL_VERSION={version}|{'|'.join(local_by_version[version])}")
print(f"DUPLICATE_LOCAL_VERSION_COUNT={len(duplicates)}")
for version, names in sorted(duplicates.items()): print(f"DUPLICATE_LOCAL_VERSION={version}|{'|'.join(names)}")
if missing_remote or missing_expected_new or unexpected_local or duplicates: raise SystemExit(1)
print("MIGRATION_LEDGER_PARITY_CONTRACT=PASS")
