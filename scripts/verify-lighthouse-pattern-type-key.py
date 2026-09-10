"""Verify the production pattern-type upsert key without rewriting legacy rows."""

from pathlib import Path
import os
import subprocess
from urllib.parse import urlsplit

database_url = os.environ["PATTERN_TEST_DATABASE_URL"]
target = urlsplit(database_url)
if target.hostname not in {"localhost", "127.0.0.1", "::1"} or target.path != "/lighthouse_runtime_contract_test":
    raise SystemExit("Pattern-type regression requires the dedicated loopback test database")

preflight = Path("supabase/migrations/20260909142930_lighthouse_pattern_type_key_preflight.sql").read_text()
runtime = Path("supabase/migrations/20260909143000_lighthouse_runtime_postgres_contract_v1.sql").read_text()
start = "create table if not exists public.pattern_types ("
seed_section = start + runtime.split(start, 1)[1].split("create table if not exists public.pattern_occurrences (", 1)[0]
minimal = "create table public.pattern_types(id serial primary key,pattern_type varchar(128));"
populated = minimal + """
insert into public.pattern_types(id,pattern_type) values (101,'original_fixture'),(102,null),(103,null);
create table public.pattern_type_reference_fixture(type_id integer references public.pattern_types(id));
insert into public.pattern_type_reference_fixture values (101),(102);
"""

def run(query):
    return subprocess.run(["psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet", "--dbname", database_url],
        input=query, text=True, capture_output=True, timeout=60)

blocked = run("\n".join(["begin;", minimal, seed_section, "rollback;"]))
if blocked.returncode == 0 or "no unique or exclusion constraint matching the ON CONFLICT specification" not in blocked.stderr:
    raise SystemExit("Original production upsert blocker was not reproduced:\n" + blocked.stderr)
print("original_pattern_type_key: PASS — actual runtime seed reproduces the missing conflict key")

for name, fixture, preserve_rows in [
    ("fresh_table", "", False),
    ("production_empty_table", minimal, False),
    ("populated_predecessor", populated, True),
    ("existing_unique_key", populated + "create unique index original_type_key on public.pattern_types(pattern_type);", True),
    ("partial_key_only", populated + "create unique index original_type_key on public.pattern_types(pattern_type) where pattern_type is not null;", True),
]:
    assertions = """
do $$ begin
  if (select count(*) from public.pattern_types where pattern_type in
    ('entity_recurrence','agency_behavior','denial_language_pattern','regulatory_violation_pattern','foia_denial_pattern','record_gap_pattern'))<>6 then
    raise exception 'Runtime pattern-type seed did not converge';
  end if;
end $$;
"""
    if preserve_rows:
        assertions += """
do $$ begin
  if not exists(select 1 from public.pattern_types where id=101 and pattern_type='original_fixture')
    or (select count(*) from public.pattern_types where id in (102,103) and pattern_type is null)<>2
    or (select count(*) from public.pattern_type_reference_fixture r join public.pattern_types t on t.id=r.type_id)<>2 then
    raise exception 'Original type identities, nullable values, or references changed';
  end if;
end $$;
"""
    result = run("\n".join(["begin;", fixture, preflight, seed_section, assertions,
        "create temporary table first_types as select * from public.pattern_types;",
        "create temporary table first_indexes as select indexrelid from pg_index where indrelid='public.pattern_types'::regclass;",
        preflight, seed_section, assertions,
        """do $$ begin
          if exists((select * from first_types except select * from public.pattern_types)
            union all (select * from public.pattern_types except select * from first_types))
            or exists(select 1 from first_indexes f left join pg_index i on i.indexrelid=f.indexrelid where i.indexrelid is null) then
            raise exception 'Repeated preflight or seed replaced existing rows or keys';
          end if;
        end $$;""", "rollback;"]))
    if result.returncode:
        raise SystemExit(f"{name}: FAIL\n" + result.stderr)
    print(f"{name}: PASS — actual upsert, stable IDs, original values and references, repeat execution")

duplicate_guard = """
do $fixture$ begin
  begin
    execute $migration$__PREFLIGHT__$migration$;
    raise exception 'Duplicate legacy names were silently accepted';
  exception when unique_violation then null;
  end;
  if (select count(*) from public.pattern_types where pattern_type='duplicate')<>2
    or to_regclass('public.uq_lighthouse_pattern_type_runtime') is not null then
    raise exception 'Duplicate-key failure rewrote original data or left a partial index';
  end if;
end $fixture$;
""".replace("__PREFLIGHT__", preflight)
result = run("\n".join(["begin;", minimal,
    "insert into public.pattern_types(pattern_type) values ('duplicate'),('duplicate');",
    duplicate_guard, "rollback;"]))
if result.returncode:
    raise SystemExit("duplicate_legacy_names: FAIL\n" + result.stderr)
print("duplicate_legacy_names: PASS — preserves ambiguous legacy rows and rolls back the key")
