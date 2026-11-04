#!/usr/bin/env bash
set -euo pipefail
# The production release workflow calls this script only on main.
# It never imports archive bytes or starts an existing Docket/Prism worker.
MODE="${1:-preflight}"
case "$MODE" in preflight|install) ;; *) echo "Invalid operation: $MODE" >&2; exit 2;; esac
fail() { printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }
REF='wepxlinwbjrkqdzkqpar'
FIRST='20261104084300_docket_legiscan_bulk_source_admission_v1.sql'
SECOND='20261104090500_docket_legiscan_receipt_append_only_acl.sql'
EXPECTED_APPROVAL='INSTALL_LIGHTHOUSE_NV_EXACT_20261104084300_20261104090500'
ROOT="$(git rev-parse --show-toplevel)" || fail 'Not within Git checkout'
cd "$ROOT"
[[ -f "supabase/migrations/$FIRST" && -f "supabase/migrations/$SECOND" ]] || fail 'Required reviewed migration missing'
[[ "$(git hash-object "supabase/migrations/$FIRST")" == 'c880ce81dd7fd76db0f5a4fd865b17b6d77867e3' ]] || fail 'First migration Git blob mismatch'
[[ "$(git hash-object "supabase/migrations/$SECOND")" == 'ebc539dfb4b3ce35b81c10460c27d0c00141bb77' ]] || fail 'Second migration Git blob mismatch'
git merge-base --is-ancestor '30b984e09ad3c5070a203a03bd9baac84dd3fc20' HEAD || fail 'Missing reviewed #763 merge in HEAD ancestry'
if [[ -n "${GITHUB_REF:-}" ]]; then
  [[ "$GITHUB_REF" == refs/heads/main ]] || fail 'GitHub release must be dispatched from the main ref'
else
  [[ "$(git branch --show-current)" == main ]] || fail 'Local release must be executed from main'
fi
for program in python3 psql supabase; do command -v "$program" >/dev/null 2>&1 || fail "Missing $program"; done
[[ -n "${LIGHTHOUSE_PRODUCTION_DATABASE_URL:-}" ]] || fail 'GitHub secret LIGHTHOUSE_PRODUCTION_DATABASE_URL unavailable'
# Fail closed if this URL points to an unrecognized host/project. It must be a
# Supabase direct URL (db.<ref>.supabase.co) or the project-scoped pooler user.
python3 - "$REF" <<'PY'
import os, re, sys
from urllib.parse import urlsplit, parse_qsl
ref = sys.argv[1]
url = urlsplit(os.environ['LIGHTHOUSE_PRODUCTION_DATABASE_URL'])
host = (url.hostname or '').lower()
try:
    port = url.port
    opts = parse_qsl(url.query, strict_parsing=True)
except ValueError:
    sys.exit('BLOCKED: database URL has invalid port or query parameters')
direct = host == f'db.{ref}.supabase.co' and url.username == 'postgres'
pooler = (re.fullmatch(r'aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com', host) is not None
          and url.username == f'postgres.{ref}')
# Reject connection-override query parameters such as host= or service=.
safe_query = len(opts) <= 1 and all(k == 'sslmode' and v in ('require','verify-full') for k, v in opts)
valid = (url.scheme in ('postgres', 'postgresql') and bool(url.password) and
         port == 5432 and url.path == '/postgres' and not url.fragment and
         (direct or pooler) and safe_query)
if not valid:
    sys.exit('BLOCKED: database URL does not identify the exact Lighthouse Supabase project')
PY
if [[ "$MODE" == install && "${DOCKET_NV_MIGRATION_APPROVAL:-}" != "$EXPECTED_APPROVAL" ]]; then
  fail "Missing exact manual install approval input: $EXPECTED_APPROVAL"
fi
# A single, read-only query confirms we have the specifically reviewed production
# preimage. No ledger repairs, source writes, or historical migration edits.
read -r -d '' PREIMAGE <<'SQL' || true
select
 (select count(*) from supabase_migrations.schema_migrations) = 565
 and (select count(*) from supabase_migrations.schema_migrations where version in ('20261104084300','20261104090500')) = 0
 and to_regclass('public.docket_legiscan_bulk_member_receipt') is null
 and md5(pg_get_functiondef('public.enqueue_docket_current_authoritative_version_v1()'::regprocedure)) = 'aedeefd16eac77249a25640afbdc502b'
 and (select count(*) from public.docket_bill_detail_cache where source = 'legiscan_bulk_json') = 0;
SQL
read_preimage() {
  psql --dbname="$LIGHTHOUSE_PRODUCTION_DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 -c "$PREIMAGE" | tr -d '\r\n'
}
[[ "$(read_preimage)" == t ]] || fail 'Production preimage differs from reviewed 565-migration/trigger/empty-archive baseline'
LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT
# Dry-run never executes migration SQL. The output is intentionally not dumped
# because CLI diagnostics can contain connection details.
if ! supabase db push --db-url "$LIGHTHOUSE_PRODUCTION_DATABASE_URL" --dry-run >"$LOG" 2>&1; then
  fail 'Supabase CLI migration dry-run failed (CLI output withheld to protect connection details)'
fi
python3 - "$LOG" "$FIRST" "$SECOND" <<'PY'
import pathlib, re, sys
body = pathlib.Path(sys.argv[1]).read_text(errors='replace')
found = sorted(set(re.findall(r'(?<![0-9a-zA-Z_])(20[0-9]{12}_[a-zA-Z0-9_-]+\.sql)(?![0-9a-zA-Z_])', body)))
expected = sorted(sys.argv[2:])
if found != expected:
    print(f'BLOCKED: dry-run plan identities mismatch: found {found}; required {expected}', file=sys.stderr)
    sys.exit(1)
print('PASS: Supabase CLI dry-run lists exactly the two reviewed Docket migrations.')
PY
if [[ "$MODE" == preflight ]]; then
  echo 'READ-ONLY PASS. No schema/data changes performed.'
  exit 0
fi
# Re-observe the baseline at the point of installation, rather than relying
# solely on the earlier dry-run. Fail closed after any competing migration.
[[ "$(read_preimage)" == t ]] || fail 'Production baseline changed after the dry-run'
# Supabase CLI db push records migration IDs directly from Git filenames.
# The install path is manual workflow_dispatch only and requires exact input.
if ! supabase db push --db-url "$LIGHTHOUSE_PRODUCTION_DATABASE_URL" --yes >"$LOG" 2>&1; then
  fail 'Supabase db push failed. Inspect production ledger read-only; do not auto-retry or repair history.'
fi
read -r -d '' POSTFLIGHT <<'SQL' || true
select
 (select count(*) from supabase_migrations.schema_migrations where version in ('20261104084300','20261104090500')) = 2
 and (select count(*) from supabase_migrations.schema_migrations) = 567
 and (select count(*) from public.docket_bill_detail_cache where source = 'legiscan_bulk_json') = 0
 and to_regclass('public.docket_legiscan_bulk_member_receipt') is not null
 and (select relrowsecurity from pg_class where oid = to_regclass('public.docket_legiscan_bulk_member_receipt'))
 and md5(pg_get_functiondef('public.enqueue_docket_current_authoritative_version_v1()'::regprocedure)) = '4315a2fc6e7fe6cb75bd34aeb53ec614'
 and has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','select')
 and has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','insert')
 and not has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','update')
 and not has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','delete')
 and not has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','truncate')
 and not has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','references')
 and not has_table_privilege('service_role','public.docket_legiscan_bulk_member_receipt','trigger')
 and not has_table_privilege('anon','public.docket_legiscan_bulk_member_receipt','select')
 and not has_table_privilege('authenticated','public.docket_legiscan_bulk_member_receipt','select');
SQL
[[ "$(psql --dbname="$LIGHTHOUSE_PRODUCTION_DATABASE_URL" -XAtq -v ON_ERROR_STOP=1 -c "$POSTFLIGHT" | tr -d '\r\n')" == t ]] || fail 'Post-install receipt RLS/ACL/trigger/migration verification failed'
echo 'PASS: the two reviewed migration versions are installed. Nevada bill import and separate archive-only worker remain unstarted.'
