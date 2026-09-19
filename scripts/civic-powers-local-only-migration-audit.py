import re
from pathlib import Path

ledger_script = Path('scripts/civic-powers-migration-ledger-audit.py').read_text()
match = re.search(r"REMOTE_VERSIONS = set\('''(.*?)'''\.split\(\)\)", ledger_script, re.S)
if not match:
    raise SystemExit('unable_to_parse_remote_version_fixture')
remote_versions = set(match.group(1).split())

local_by_version: dict[str, list[str]] = {}
for path in sorted(Path('supabase/migrations').glob('*.sql')):
    version = path.name.split('_', 1)[0]
    if len(version) == 14 and version.isdigit():
        local_by_version.setdefault(version, []).append(path.name)

local_only = sorted(set(local_by_version) - remote_versions)
print(f'LOCAL_14_DIGIT_COUNT={len(local_by_version)}')
print(f'LOCAL_ONLY_COUNT={len(local_only)}')
for version in local_only:
    print(f'LOCAL_ONLY_VERSION={version}|{"|".join(local_by_version[version])}')
