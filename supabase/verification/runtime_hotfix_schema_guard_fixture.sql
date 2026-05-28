-- Fresh-DB fixture for runtime hotfix schema-guard CI.
-- This intentionally creates only the minimum upstream objects required
-- to validate the hotfix migration contract on an empty Postgres service.

create table if not exists public.legal_enforcement_records (
  id bigserial primary key,
  jurisdiction text,
  statutory_authority text,
  created_at timestamptz default now()
);

create table if not exists public.sunam_gate_log (
  id bigserial primary key,
  live_signal_id text,
  decided_at timestamptz default now(),
  created_at timestamptz default now()
);

create or replace view public.v_runtime_signal_scroll as
select
  null::bigint as id,
  null::text as signal_type,
  now() as created_at
where false;

create or replace view public.detected_signals_base as
select
  null::bigint as id,
  null::text as signal_type,
  now() as created_at
where false;

create or replace view public.entities as
select
  null::bigint as id,
  null::text as canonical_entity_name,
  now() as created_at
where false;
