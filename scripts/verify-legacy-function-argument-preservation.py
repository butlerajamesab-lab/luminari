"""Verify fresh and existing named function bridges without dropping dependencies."""

from pathlib import Path
import os
import re
import subprocess
from urllib.parse import urlsplit

database_url = os.environ["PATTERN_TEST_DATABASE_URL"]
target = urlsplit(database_url)
if target.hostname not in {"localhost", "127.0.0.1", "::1"} or target.path != "/lighthouse_runtime_contract_test":
    raise SystemExit("Function regression requires the dedicated loopback test database")

migration = Path("supabase/migrations/20260829094000_legacy_function_resolution_bridges.sql").read_text()
# Run the unchanged migration statements inside a fixture-owned rollback.
migration = re.sub(r"(?m)^(begin|commit);\s*$", "", migration)
verification = Path("supabase/verification/20260829094000_legacy_function_resolution_bridges_verify.sql").read_text()
setup = """
create schema extensions;
create extension pgcrypto with schema extensions;
create role anon;
create role authenticated;
create role service_role;
grant usage on schema extensions to service_role;
"""

for name, arguments in [
    ("fresh_bridges", None),
    ("production_named_bridges", ("data", "type", "namespace", "key")),
    ("canonical_named_bridges", ("p_value", "p_algorithm", "p_namespace", "p_key")),
]:
    predecessor = ""
    named_calls = ""
    if arguments:
        value, algorithm, namespace, key = arguments
        predecessor = f"""
create function public.digest("{value}" text,"{algorithm}" text) returns bytea
language sql immutable strict as $fn$ select extensions.digest($1,$2); $fn$;
create function public.pg_advisory_xact_lock("{namespace}" integer,"{key}" bigint) returns void
language sql volatile strict as $fn$ select pg_catalog.pg_advisory_xact_lock($2); $fn$;
create view public.original_digest_dependency as select public.digest('Résumé — original','sha256') as receipt;
"""
        named_calls = f"""
do $test$ begin
  if public.digest("{value}"=>'Résumé — original',"{algorithm}"=>'sha256')
    is distinct from extensions.digest(convert_to('Résumé — original','UTF8'),'sha256') then
    raise exception 'Named digest call changed';
  end if;
  if (select receipt from public.original_digest_dependency)
    is distinct from public.digest('Résumé — original','sha256') then
    raise exception 'Existing function dependency changed';
  end if;
  perform public.pg_advisory_xact_lock("{namespace}"=>42,"{key}"=>4294967297::bigint);
end $test$;
"""
    assertions = """
do $test$ begin
  if exists(select 1 from original_functions s left join pg_proc p on p.oid=s.oid
    where p.oid is null or p.proargnames is distinct from s.proargnames) then
    raise exception 'Original function identity or argument names changed';
  end if;
end $test$;
"""
    query = "\n".join(["begin;",setup,predecessor,
        "create temporary table original_functions as select oid,proargnames from pg_proc where oid in (to_regprocedure('public.digest(text,text)'),to_regprocedure('public.pg_advisory_xact_lock(integer,bigint)'));",
        migration,verification,assertions,named_calls,
        migration,verification,assertions,named_calls,"rollback;"])
    result = subprocess.run(["psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet", "--dbname", database_url],
        input=query, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise SystemExit(f"{name}: FAIL\n{result.stderr}")
    print(f"{name}: PASS — OIDs, named calls, dependent view, UTF-8 digest, ACLs, and repeat execution")
