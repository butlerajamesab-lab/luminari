-- Math Engine v2.1.0 correctness and governed-input migration.
create extension if not exists postgis with schema extensions;

drop trigger if exists immutable_convergence_receipts on public.convergence_receipts;
delete from public.convergence_receipts where equation_id = 'trigger_test';

alter table public.geography_registry drop constraint if exists geography_registry_pkey;
alter table public.geography_registry add column if not exists centroid extensions.geography(point, 4326);
update public.geography_registry
set centroid = extensions.st_setsrid(extensions.st_makepoint(centroid_lon, centroid_lat), 4326)::extensions.geography
where centroid is null and centroid_lat is not null and centroid_lon is not null;
alter table public.geography_registry add constraint geography_registry_pkey primary key (version, id);
alter table public.geography_registry drop constraint if exists geography_registry_lat_check;
alter table public.geography_registry add constraint geography_registry_lat_check check (centroid_lat is null or centroid_lat between -90 and 90);
alter table public.geography_registry drop constraint if exists geography_registry_lon_check;
alter table public.geography_registry add constraint geography_registry_lon_check check (centroid_lon is null or centroid_lon between -180 and 180);
alter table public.geography_registry drop constraint if exists geography_registry_adjacency_check;
alter table public.geography_registry add constraint geography_registry_adjacency_check check (jsonb_typeof(adjacency) = 'array');

alter table public.convergence_receipts add column if not exists run_key text;
alter table public.convergence_receipts add column if not exists geography_id text;
update public.convergence_receipts
set run_key = coalesce(run_key, encode(extensions.digest(id::text, 'sha256'), 'hex')),
    geography_id = coalesce(geography_id, '*')
where run_key is null or geography_id is null;
alter table public.convergence_receipts alter column run_key set not null;
alter table public.convergence_receipts alter column geography_id set not null;
create unique index if not exists convergence_receipts_run_equation_geography_uq
  on public.convergence_receipts (run_key, equation_id, geography_id);

create table if not exists public.convergence_run_snapshot (
  run_key text primary key,
  engine_version text not null,
  as_of bigint not null,
  configuration jsonb not null,
  configuration_hash text not null,
  geography_registry_version text not null,
  raw_signal_snapshot jsonb not null,
  deduplicated_signal_snapshot jsonb not null,
  geography_registry_snapshot jsonb not null,
  input_hash text not null,
  result_payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.claim_definitions add column if not exists rule_manifest_hash text;
alter table public.claim_definitions add column if not exists version text not null default '1.0.0';
alter table public.claim_definitions add column if not exists source_rosetta_run_id text;
alter table public.claim_definitions alter column statute_of_limitations_days drop not null;

alter table public.case_evidence add column if not exists claim_definition_id uuid references public.claim_definitions(id);
alter table public.case_evidence add column if not exists source_document_id text;
alter table public.case_evidence add column if not exists verification_status text not null default 'unverified';

create table if not exists public.case_viability_context (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  claim_definition_id uuid not null references public.claim_definitions(id),
  incident_date bigint,
  filing_date bigint,
  as_of bigint not null,
  rule_manifest_hash text not null,
  source_event_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (case_id, claim_definition_id, as_of)
);

create table if not exists public.claim_element_evaluations (
  id uuid primary key default gen_random_uuid(),
  viability_context_id uuid not null references public.case_viability_context(id),
  element_id text not null,
  evaluation_status text not null check (evaluation_status in ('satisfied','unsatisfied','contradicted','unresolved')),
  prism_verification_id text not null,
  rule_manifest_hash text not null,
  source_evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (viability_context_id, element_id)
);

create or replace function public.prevent_governed_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception '% is immutable; UPDATE and DELETE are prohibited', tg_table_name;
end;
$$;

create or replace function public.prevent_live_signal_observation_rewrite()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  if (to_jsonb(new) - array['active','status','superseded_by'])
       is distinct from
     (to_jsonb(old) - array['active','status','superseded_by']) then
    raise exception 'live_signals observation fields are immutable; create a superseding observation instead';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_receipt_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'convergence_receipts are immutable. UPDATE and DELETE are prohibited.';
end;
$$;

drop trigger if exists immutable_convergence_receipts on public.convergence_receipts;
create trigger immutable_convergence_receipts before update or delete on public.convergence_receipts
for each row execute function public.prevent_receipt_mutation();

drop trigger if exists immutable_convergence_run_snapshot on public.convergence_run_snapshot;
create trigger immutable_convergence_run_snapshot before update or delete on public.convergence_run_snapshot
for each row execute function public.prevent_governed_mutation();

drop trigger if exists immutable_geography_registry on public.geography_registry;
create trigger immutable_geography_registry before update or delete on public.geography_registry
for each row execute function public.prevent_governed_mutation();

drop trigger if exists immutable_case_viability_context on public.case_viability_context;
create trigger immutable_case_viability_context before update or delete on public.case_viability_context
for each row execute function public.prevent_governed_mutation();

drop trigger if exists immutable_claim_element_evaluations on public.claim_element_evaluations;
create trigger immutable_claim_element_evaluations before update or delete on public.claim_element_evaluations
for each row execute function public.prevent_governed_mutation();

drop trigger if exists immutable_live_signal_observation on public.live_signals;
create trigger immutable_live_signal_observation before update on public.live_signals
for each row execute function public.prevent_live_signal_observation_rewrite();

alter table public.convergence_run_snapshot enable row level security;
alter table public.case_viability_context enable row level security;
alter table public.claim_element_evaluations enable row level security;

drop policy if exists service_role_all on public.convergence_run_snapshot;
create policy service_role_all on public.convergence_run_snapshot for all to service_role using (true) with check (true);
drop policy if exists service_role_all on public.case_viability_context;
create policy service_role_all on public.case_viability_context for all to service_role using (true) with check (true);
drop policy if exists service_role_all on public.claim_element_evaluations;
create policy service_role_all on public.claim_element_evaluations for all to service_role using (true) with check (true);

revoke all on public.geography_registry, public.convergence_receipts, public.convergence_run_snapshot,
  public.claim_definitions, public.case_evidence, public.case_viability_context,
  public.claim_element_evaluations from public, anon, authenticated;
grant select, insert on public.geography_registry, public.convergence_receipts,
  public.convergence_run_snapshot, public.claim_definitions, public.case_evidence,
  public.case_viability_context, public.claim_element_evaluations to service_role;
