"""Verify pending foundations preserve production views and fresh tables."""

from pathlib import Path
import os
import subprocess
from urllib.parse import urlsplit

database_url = os.environ["PATTERN_TEST_DATABASE_URL"]
target = urlsplit(database_url)
if target.hostname not in {"localhost", "127.0.0.1", "::1"} or target.path != "/lighthouse_runtime_contract_test":
    raise SystemExit("Foundation regression requires the dedicated loopback test database")

migrations = "\n".join(Path("supabase/migrations", name).read_text() for name in [
    "20260815081130_case_surface_tables_foundation.sql",
    "20260816063000_visibility_legacy_tables_foundation.sql",
])
roles = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
"""
view_fixture = """
create table public.source_fixture(id integer, name text);
insert into public.source_fixture values (1, 'Synthetic source A'), (2, 'Synthetic source B');
create view public.entities as select id, name from public.source_fixture;
create view public.unified_resources as select id, name from public.source_fixture;
create temporary table view_definitions as
select c.relname, pg_get_viewdef(c.oid) as definition from pg_class c
where c.oid in ('public.entities'::regclass, 'public.unified_resources'::regclass);
"""
assertions = """
do $$ declare relation_name text; begin
  foreach relation_name in array array['entities', 'unified_resources'] loop
    if exists (select 1 from pg_class where oid=format('public.%I',relation_name)::regclass and relkind='v') then
      if exists (select 1 from view_definitions d where d.relname=relation_name
        and d.definition is distinct from pg_get_viewdef(format('public.%I',relation_name)::regclass)) then
        raise exception 'Foundation replaced the canonical view definition';
      end if;
      if not exists (select 1 from pg_class where oid=format('public.%I',relation_name)::regclass
        and 'security_invoker=true'=any(reloptions)) then
        raise exception 'View security boundary is missing';
      end if;
    elsif not exists (select 1 from pg_class where oid=format('public.%I',relation_name)::regclass
      and relkind='r' and relrowsecurity) then
      raise exception 'Fresh table RLS is missing';
    end if;
    if has_table_privilege('anon', format('public.%I',relation_name), 'SELECT')
       or has_table_privilege('authenticated', format('public.%I',relation_name), 'SELECT') then
      raise exception 'A client role can read a private foundation';
    end if;
  end loop;
end $$;
"""
for fixture_name, fixture in [("production_views", view_fixture), ("fresh_tables", "")]:
    query = "\n".join([
        "begin;", roles,
        "do $$ begin if to_regclass('public.entities') is not null or to_regclass('public.unified_resources') is not null then raise exception 'Test database is not empty'; end if; end $$;",
        fixture, migrations, assertions, migrations, assertions,
        "do $$ begin if (select count(*) from public.entities)<>2 or (select count(*) from public.unified_resources)<>2 then raise exception 'Source rows were lost'; end if; end $$;" if fixture else "",
        "rollback;",
    ])
    result = subprocess.run(
        ["psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet", "--dbname", database_url],
        input=query, text=True, capture_output=True, timeout=60,
    )
    if result.returncode:
        raise SystemExit(f"{fixture_name}: FAIL\n{result.stderr}")
    print(f"{fixture_name}: PASS — canonical relations preserved, private access, idempotent replay")
