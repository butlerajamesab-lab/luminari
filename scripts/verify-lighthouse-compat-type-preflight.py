"""Prove the production alias blocker and verify transactional type conversion."""

from pathlib import Path
import os
import re
import subprocess
from urllib.parse import urlsplit

database_url = os.environ["PATTERN_TEST_DATABASE_URL"]
target = urlsplit(database_url)
if target.hostname not in {"localhost", "127.0.0.1", "::1"} or target.path != "/lighthouse_runtime_contract_test":
    raise SystemExit("Compatibility regression requires the dedicated loopback test database")

preflight = Path("supabase/migrations/20260909142600_lighthouse_compat_type_preflight.sql").read_text()
guard_source = Path("supabase/migrations/20260801074427_math_engine_v21_correctness.sql").read_text()
guard_function = re.search(r"create or replace function public\.prevent_live_signal_observation_rewrite\(\).*?\$\$;", guard_source, re.S)
guard_trigger = re.search(r"create trigger immutable_live_signal_observation .*?;", guard_source, re.S)
if not guard_function or not guard_trigger:
    raise SystemExit("Production observation guard changed; review the trigger regression")
observation_guard = guard_function.group() + "\n" + guard_trigger.group()
runtime = Path("supabase/migrations/20260909143000_lighthouse_runtime_postgres_contract_v1.sql").read_text()
helpers = runtime.split("-- Ingestion and canonical registry contracts", 1)[0]
tables = ["ingest_runs", "ingested_records", "live_signals", "remedy_paths", "pattern_aggregation_runs"]
conversion_blocks = [block for block in re.findall(r"do \$\$.*?\$\$;", runtime, re.S)
    if "alter column" in block and " type " in block and any("public." + name in block for name in tables)]
if len(conversion_blocks) != 5:
    raise SystemExit("Runtime conversion blocks changed; review the production regression")
runtime_conversions = helpers + "\n".join(conversion_blocks)

fixture = """
create schema compat;
create role alias_reader;
create role alias_column_reader;
create role alias_unprivileged;
create table public.ingest_runs(id serial primary key,errors_run text);
create table public.ingested_records(id serial primary key,raw_json text,metadata_l1_l2 text,
  normalized_date text,normalized_amount text,processed_for_signals integer default 0);
create table public.live_signals(id serial primary key,supporting_statistics text default '{}',entity_aliases_json text,
  confidence_score text default '0.5',entity_confidence_score_ls text,role_confidence text,
  active boolean default true,status text default 'active',superseded_by integer);
create table public.remedy_paths(id serial primary key,prerequisites text,related_claim_types text,signal_id integer);
create table public.pattern_aggregation_runs(id serial primary key,case_ids_analyzed text,completed_at text);
insert into public.ingest_runs(errors_run) values ('not json');
insert into public.ingested_records(raw_json,metadata_l1_l2,normalized_date,normalized_amount,processed_for_signals)
values ('{"source":"original"}','unparsed metadata','20260409215528','99.50',1),
       ('[]','{}','not a date','not a number',0);
insert into public.live_signals(supporting_statistics,entity_aliases_json,confidence_score,entity_confidence_score_ls,role_confidence)
values ('{"records":3}','["original alias"]','0.85','0.75','not scored');
insert into public.remedy_paths(prerequisites,related_claim_types,signal_id) values ('["first"]','["claim"]',42);
insert into public.pattern_aggregation_runs(case_ids_analyzed,completed_at) values ('[11,12]','1770000000123');
create view compat.ingest_runs with (security_invoker=true,security_barrier=true) as select * from public.ingest_runs;
create view compat.ingested_records as select * from public.ingested_records;
create view compat.live_signals as select * from public.live_signals;
create view compat.remedy_paths as select id,prerequisites,related_claim_types,signal_id as signal_id_rp from public.remedy_paths;
create view compat.pattern_aggregation_runs as select * from public.pattern_aggregation_runs;
grant select on compat.ingest_runs to alias_reader with grant option;
grant select(errors_run) on compat.ingest_runs to alias_column_reader;
comment on view compat.ingest_runs is 'Preserve the private alias';
comment on column compat.ingest_runs.errors_run is 'Original error payload';
create temporary table original_aliases as
select c.relname,pg_get_viewdef(c.oid,false) as definition,c.relowner,c.reloptions,
  obj_description(c.oid,'pg_class') as comment
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='compat' and c.relkind='v';
-- Recreated views must not inherit this broader default grant.
alter default privileges in schema compat grant select on tables to public;
"""

assertions = """
do $$ begin
  if exists (select 1 from original_aliases s left join pg_class c on c.relname=s.relname
      and c.relnamespace='compat'::regnamespace
    where c.oid is null or pg_get_viewdef(c.oid,false) is distinct from s.definition
      or c.relowner<>s.relowner or c.reloptions is distinct from s.reloptions
      or obj_description(c.oid,'pg_class') is distinct from s.comment) then
    raise exception 'Compatibility view definition or metadata changed';
  end if;
  if has_table_privilege('alias_unprivileged','compat.ingest_runs','select')
    or has_table_privilege('alias_unprivileged','compat.ingested_records','select')
    or has_table_privilege('alias_unprivileged','compat.live_signals','select')
    or has_table_privilege('alias_unprivileged','compat.remedy_paths','select')
    or has_table_privilege('alias_unprivileged','compat.pattern_aggregation_runs','select') then
    raise exception 'Recreated aliases widened access through default privileges';
  end if;
  if not has_table_privilege('alias_reader','compat.ingest_runs','select with grant option')
    or not has_column_privilege('alias_column_reader','compat.ingest_runs','errors_run','select')
    or has_table_privilege('alias_column_reader','compat.ingest_runs','select') then
    raise exception 'Original table/column privileges were not preserved';
  end if;
  if col_description('compat.ingest_runs'::regclass,2)<>'Original error payload' then
    raise exception 'Original column comment was lost';
  end if;
  if (select count(*) from compat.ingested_records)<>2
    or not exists(select 1 from compat.ingest_runs where errors_run='{"legacy_text":"not json"}'::jsonb)
    or not exists(select 1 from compat.ingested_records where id=1
      and raw_json='{"source":"original"}'::jsonb and metadata_l1_l2='{"legacy_text":"unparsed metadata"}'::jsonb
      and normalized_date='2026-04-09 21:55:28+00'::timestamptz and normalized_amount=99.5 and processed_for_signals)
    or not exists(select 1 from public.ingested_records where id=2 and normalized_date is null
      and normalized_amount is null and normalized_date_legacy_text='not a date'
      and normalized_amount_legacy_text='not a number' and not processed_for_signals)
    or not exists(select 1 from compat.live_signals where confidence_score=0.85
      and supporting_statistics='{"records":3}'::jsonb and entity_confidence_score_ls=0.75 and role_confidence is null)
    or not exists(select 1 from public.live_signals where role_confidence_legacy_text='not scored')
    or not exists(select 1 from compat.remedy_paths where signal_id_rp=42 and prerequisites='["first"]'::jsonb)
    or not exists(select 1 from compat.pattern_aggregation_runs where completed_at=1770000000123
      and case_ids_analyzed='[11,12]'::jsonb) then
    raise exception 'Conversion lost original rows, values, or provenance';
  end if;
end $$;
"""

def run(query):
    return subprocess.run(["psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet", "--dbname", database_url],
        input=query, text=True, capture_output=True, timeout=60)

blocked = run("\n".join(["begin; set local timezone='UTC';", fixture, runtime_conversions, "rollback;"]))
if blocked.returncode == 0 or "cannot alter type of a column used by a view" not in blocked.stderr:
    raise SystemExit("Original production dependency blocker was not reproduced:\n" + blocked.stderr)
print("original_compat_dependency: PASS — actual runtime migration reproduces the production blocker")

verified = run("\n".join(["begin; set local timezone='UTC';",fixture,preflight,runtime_conversions,assertions,
    "create temporary table first_alias_ids as select oid,relname from pg_class where relnamespace='compat'::regnamespace and relkind='v';",
    preflight,runtime_conversions,assertions,
    """do $$ begin if exists(select 1 from first_alias_ids a left join pg_class c on c.oid=a.oid
      where c.oid is null) then raise exception 'Repeated preflight replaced a canonical alias'; end if; end $$;""",
    "insert into public.ingest_runs default values; insert into public.live_signals default values;",
    "rollback;"]))
if verified.returncode:
    raise SystemExit("compat_type_preflight: FAIL\n" + verified.stderr)
print("compat_type_preflight: PASS — conversion, original values, view metadata, private grants, defaults, repeat execution")

guard_receipt = """
create temporary table original_observation_guard as
select oid,tgfoid,tgenabled,pg_get_triggerdef(oid) as definition,
  pg_get_functiondef(tgfoid) as function_definition
from pg_trigger where tgrelid='public.live_signals'::regclass and tgname='immutable_live_signal_observation';
"""
guard_assertions = """
do $$ begin
  if exists(select 1 from original_observation_guard o left join pg_trigger t on t.oid=o.oid
    where t.oid is null or t.tgfoid<>o.tgfoid or t.tgenabled<>o.tgenabled
      or pg_get_triggerdef(t.oid)<>o.definition or pg_get_functiondef(t.tgfoid)<>o.function_definition) then
    raise exception 'Original immutability guard or enabled mode changed';
  end if;
  if (select tgenabled from original_observation_guard) in ('O','A') then
    begin
      update public.live_signals set confidence_score=0.01 where id=1;
      raise exception 'Observation rewrite was allowed';
    exception when raise_exception then
      if sqlerrm<>'live_signals observation fields are immutable; create a superseding observation instead' then raise; end if;
    end;
    begin
      update public.live_signals set role_confidence_legacy_text='invented provenance' where id=1;
      raise exception 'Provenance rewrite was allowed';
    exception when raise_exception then
      if sqlerrm<>'live_signals observation fields are immutable; create a superseding observation instead' then raise; end if;
    end;
  end if;
  update public.live_signals set active=false,status='superseded',superseded_by=2 where id=1;
end $$;
"""

# Reproduce the deployed failure with the actual immutable-observation function.
blocked = run("\n".join(["begin;", fixture, observation_guard,
    "alter table public.live_signals add column role_confidence_legacy_text text;",
    "update public.live_signals set role_confidence_legacy_text=role_confidence;", "rollback;"]))
if blocked.returncode == 0 or "live_signals observation fields are immutable" not in blocked.stderr:
    raise SystemExit("Original immutable provenance blocker was not reproduced:\n" + blocked.stderr)
print("original_immutable_provenance: PASS — deployed guard rejects the original provenance backfill")

for mode in ["enable", "enable always", "enable replica", "disable"]:
    verified = run("\n".join(["begin; set local timezone='UTC';", fixture, observation_guard,
        f"alter table public.live_signals {mode} trigger immutable_live_signal_observation;", guard_receipt,
        preflight, runtime_conversions, assertions, guard_assertions,
        preflight, runtime_conversions, assertions, guard_assertions, "rollback;"]))
    if verified.returncode:
        raise SystemExit(f"immutable_provenance_{mode}: FAIL\n" + verified.stderr)
    print(f"immutable_provenance_{mode}: PASS — original guard, immutable evidence, lifecycle writes, repeat execution")

# Force conversion to fail after the guard has been suspended. The real DO
# statement must restore every table/view/trigger change on failure.
rollback_assertions = """
do $failure_test$ begin
  begin
    execute $migration$__PREFLIGHT__$migration$;
    raise exception 'Oversized numeric observation did not abort conversion';
  exception when numeric_value_out_of_range then null;
  end;
  if exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='live_signals' and column_name like '%_legacy_text')
    or (select data_type from information_schema.columns where table_schema='public'
      and table_name='live_signals' and column_name='confidence_score')<>'text'
    or (select tgenabled from pg_trigger where tgrelid='public.live_signals'::regclass
      and tgname='immutable_live_signal_observation')<>'O'
    or not exists(select 1 from compat.live_signals where confidence_score='123456789' and role_confidence='not scored') then
    raise exception 'Failed conversion did not restore original storage, alias, or trigger';
  end if;
  begin
    update public.live_signals set confidence_score='rewritten' where id=1;
    raise exception 'Failed conversion left observation rewrites enabled';
  exception when raise_exception then
    if sqlerrm<>'live_signals observation fields are immutable; create a superseding observation instead' then raise; end if;
  end;
end $failure_test$;
""".replace("__PREFLIGHT__", preflight)
verified = run("\n".join(["begin;", fixture,
    "update public.live_signals set confidence_score='123456789' where id=1;",
    observation_guard, guard_receipt,
    rollback_assertions, "rollback;"]))
if verified.returncode:
    raise SystemExit("immutable_provenance_rollback: FAIL\n" + verified.stderr)
print("immutable_provenance_rollback: PASS — conversion failure restores original data, aliases, and immutable writes")
