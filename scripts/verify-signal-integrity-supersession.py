"""Test ordered replay and the recorded production signal-view successor."""

from pathlib import Path
import os
import subprocess
from urllib.parse import urlsplit

database_url = os.environ["PATTERN_TEST_DATABASE_URL"]
target = urlsplit(database_url)
if target.hostname not in {"localhost", "127.0.0.1", "::1"} or target.path != "/lighthouse_runtime_contract_test":
    raise SystemExit("Supersession regression requires the dedicated loopback test database")

migration = Path("supabase/migrations/20260818095500_signal_architecture_runtime_projection_truth.sql").read_text()
successor = Path("supabase/migrations/20260822080454_atlas_domain3_integrity_review_projection.sql").read_text()
successor_view = "create or replace view public.v_signal_architecture_integrity" + successor.split(
    "create or replace view public.v_signal_architecture_integrity", 1
)[1].split(";", 1)[0] + ";"

fixture = """
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
create table public.atlas_stream_runtime_projection_v1 (
  observation_count bigint, identity_bound_observation_count bigint,
  latest_observed_at timestamptz, is_current boolean
);
insert into public.atlas_stream_runtime_projection_v1 values (10,8,'2026-09-01',true);
create table public.detected_signals(id integer);
create table public.live_signals(id integer);
create table public.detected_signals_v2(id integer);
create table public.intake_signals(is_current boolean);
create table public.legal_patterns(is_current boolean);
create table public.live_data_signals(is_current boolean, governance_status text);
create table public.signal_convergences(is_current boolean);
insert into public.live_data_signals values (true,'observation_candidate'),(true,'promoted'),(false,'promoted');
"""
assertions = """
do $$ begin
  if (select count(*) from information_schema.columns where table_schema='public'
      and table_name='v_signal_architecture_integrity') <> 15 then
    raise exception 'Successor columns were lost';
  end if;
  if exists (select 1 from public.v_signal_architecture_integrity
    where atlas_raw_observation_count<>10 or atlas_unique_observation_count<>8
       or atlas_replay_observation_count<>2 or live_data_signal_count<>2
       or live_data_candidate_count<>1 or live_data_promoted_count<>1) then
    raise exception 'Recorded successor values changed';
  end if;
  if (select definition from saved_definition) is distinct from
     pg_get_viewdef('public.v_signal_architecture_integrity'::regclass,true) then
    raise exception 'The pending migration rewrote the successor definition';
  end if;
end $$;
"""
for fixture_name, recorded in [("ordered_replay", False), ("production_successor", True), ("invalid_successor", True)]:
    # All ledger writes below are synthetic, isolated, rolled-back test setup.
    setup = successor_view if recorded else migration + successor_view
    if recorded:
        setup += "insert into supabase_migrations.schema_migrations values ('20260822080454');"
    if fixture_name == "invalid_successor":
        setup += "drop view public.v_signal_architecture_integrity; create view public.v_signal_architecture_integrity as select 1 as unexpected;"
    query = "\n".join([
        "begin;", fixture, setup,
        "create temporary table saved_definition as select pg_get_viewdef('public.v_signal_architecture_integrity'::regclass,true) as definition;",
        migration + migration if recorded else "", assertions, "rollback;",
    ])
    result = subprocess.run(
        ["psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--quiet", "--dbname", database_url],
        input=query, text=True, capture_output=True, timeout=60,
    )
    if fixture_name == "invalid_successor":
        if result.returncode == 0 or "does not satisfy its live view contract" not in result.stderr:
            raise SystemExit(f"{fixture_name}: FAIL\n{result.stderr}")
    elif result.returncode:
        raise SystemExit(f"{fixture_name}: FAIL\n{result.stderr}")
    print(f"{fixture_name}: PASS")
