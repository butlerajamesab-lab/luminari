begin;

-- These five production relations predated the checked-in Math Engine v2.1
-- migrations. Reconstruct their pre-v2.1 shape so the governed evolution can
-- replay from zero instead of assuming manually created database state.
create table if not exists public.geography_registry (
  id text primary key,
  area_sq_km numeric not null check (area_sq_km > 0),
  centroid_lat numeric,
  centroid_lon numeric,
  adjacency jsonb default '[]'::jsonb,
  version text not null default '1.0.0',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.convergence_receipts (
  id uuid primary key default gen_random_uuid(),
  equation_id text not null,
  engine_version text not null,
  rule_manifest_hash text not null,
  as_of bigint not null,
  configuration_hash text not null,
  input_hash text not null,
  source_signal_ids jsonb not null default '[]'::jsonb,
  geography_registry_version text not null,
  expected_count numeric,
  observed_count integer not null,
  computed_outputs jsonb not null default '{}'::jsonb,
  timestamp_computed bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists public.claim_definitions (
  id uuid primary key default gen_random_uuid(),
  claim_type text not null,
  jurisdiction text not null,
  elements jsonb not null default '[]'::jsonb,
  statute_of_limitations_days integer not null,
  source_statute text,
  source_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.case_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  element_id text not null,
  strength numeric not null check (strength between 0 and 1),
  source_verified boolean not null default false,
  document_type text not null default 'document',
  source_url text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.live_signals (
  id serial primary key,
  case_id text,
  signal_type text,
  dataset_id text,
  jurisdiction text,
  domain text,
  severity text,
  title text,
  explanation text,
  pattern_summary text,
  supporting_statistics text,
  confidence_score text,
  detected_at bigint,
  ingest_run_id text,
  signal_fingerprint text unique,
  entity_type text,
  status text,
  created_at bigint,
  signal_type_ls timestamptz,
  dataset_id_ls timestamptz,
  jurisdiction_ls timestamptz,
  domain_ls timestamptz,
  severity_ls text,
  title_ls timestamptz,
  detected_at_ls integer,
  signal_registry_id text,
  superseded_by text,
  active_ls integer,
  entity_type_ls text,
  entity_confidence_score_ls text,
  canonical_entity_name text,
  entity_aliases_json text,
  entity_role text,
  role_confidence text,
  explanation_ls timestamptz,
  active boolean default true,
  source_url_ls text,
  source_timestamp_ls bigint,
  bridge_source_id text,
  bridge_hash text,
  bridge_received_at timestamptz,
  bridge_transport_version text
);

do $security$
declare
  target text;
begin
  foreach target in array array[
    'geography_registry',
    'convergence_receipts',
    'claim_definitions',
    'case_evidence',
    'live_signals'
  ] loop
    execute format('alter table public.%I enable row level security', target);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated',
      target
    );
    execute format('grant select, insert on table public.%I to service_role', target);
  end loop;
end
$security$;

revoke all on sequence public.live_signals_id_seq
  from public, anon, authenticated;
grant usage, select on sequence public.live_signals_id_seq to service_role;

commit;
