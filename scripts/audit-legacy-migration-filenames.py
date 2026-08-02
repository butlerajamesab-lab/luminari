from pathlib import Path

legacy = []
for path in sorted(Path('supabase/migrations').glob('*.sql')):
    prefix = path.name.split('_', 1)[0]
    if len(prefix) != 14 or not prefix.isdigit():
        legacy.append(path.name)

print(f'LEGACY_MIGRATION_FILE_COUNT={len(legacy)}')
for filename in legacy:
    print(f'LEGACY_MIGRATION_FILE={filename}')

if legacy:
    raise SystemExit(1)
