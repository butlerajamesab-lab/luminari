-- ============================================================================
-- Migration 18 -- candidate/replay security boundary.
--
-- Neither schema is a browser-facing API.  PostgreSQL grants EXECUTE on new
-- functions to PUBLIC by default, so an unpublished parser can still become a
-- callable surface unless privileges are revoked explicitly.  This migration
-- closes that default and enables RLS as defense in depth on every candidate
-- and replay table.  The database owner retains normal migration/test access;
-- Supabase service_role is granted access only when that role exists.
-- ============================================================================

do $block$
declare
  v_schema text;
  v_table record;
  v_function record;
begin
  foreach v_schema in array array['rosetta_v2513','rosetta_replay'] loop
    execute format('revoke all privileges on schema %I from public',v_schema);
    execute format('revoke all privileges on all tables in schema %I from public',v_schema);
    execute format('revoke all privileges on all sequences in schema %I from public',v_schema);
    execute format('revoke all privileges on all functions in schema %I from public',v_schema);
    execute format('alter default privileges in schema %I revoke all on tables from public',v_schema);
    execute format('alter default privileges in schema %I revoke all on sequences from public',v_schema);
    execute format('alter default privileges in schema %I revoke execute on functions from public',v_schema);

    for v_table in
      select c.oid::regclass qualified_name
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname=v_schema and c.relkind in ('r','p')
    loop
      execute format('alter table %s enable row level security',v_table.qualified_name);
    end loop;

    -- Pin every packet-owned function, including trigger helpers and legacy
    -- fail-closed entry points.  A revoked function should still never resolve
    -- an attacker-controlled object through the caller's mutable search_path.
    for v_function in
      select p.oid::regprocedure qualified_name
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname=v_schema
    loop
      if v_schema='rosetta_replay' then
        execute format(
          'alter function %s set search_path to pg_catalog,rosetta_replay,rosetta_v2513,extensions',
          v_function.qualified_name);
      else
        execute format(
          'alter function %s set search_path to pg_catalog,rosetta_v2513,extensions',
          v_function.qualified_name);
      end if;
    end loop;
  end loop;

  if exists(select 1 from pg_roles where rolname='anon') then
    -- Dynamic SQL prevents a disposable PostgreSQL instance without Supabase
    -- roles from resolving a missing role while compiling this DO block.
    execute 'revoke all privileges on schema rosetta_v2513,rosetta_replay from anon';
    execute 'revoke all privileges on all tables in schema rosetta_v2513,rosetta_replay from anon';
    execute 'revoke all privileges on all sequences in schema rosetta_v2513,rosetta_replay from anon';
    execute 'revoke all privileges on all functions in schema rosetta_v2513,rosetta_replay from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all privileges on schema rosetta_v2513,rosetta_replay from authenticated';
    execute 'revoke all privileges on all tables in schema rosetta_v2513,rosetta_replay from authenticated';
    execute 'revoke all privileges on all sequences in schema rosetta_v2513,rosetta_replay from authenticated';
    execute 'revoke all privileges on all functions in schema rosetta_v2513,rosetta_replay from authenticated';
  end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'grant usage on schema rosetta_v2513,rosetta_replay to service_role';
    execute 'grant select,insert,update,delete on all tables in schema rosetta_v2513,rosetta_replay to service_role';
    execute 'grant usage,select on all sequences in schema rosetta_v2513,rosetta_replay to service_role';
    execute 'grant execute on all functions in schema rosetta_v2513,rosetta_replay to service_role';
  end if;
end;
$block$;

comment on schema rosetta_v2513 is
  'Unpublished Rosetta 2.5.13 candidate. No PUBLIC/anon/authenticated access; RLS enabled on all tables.';
comment on schema rosetta_replay is
  'Internal replay, evidence, diff, and promotion-request ledger. No PUBLIC/anon/authenticated access; RLS enabled on all tables.';
