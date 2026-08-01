-- Final Math Engine v2.1 governed-input constraints.

alter table public.claim_definitions
  alter column rule_manifest_hash set not null,
  alter column source_rosetta_run_id set not null;

alter table public.claim_definitions
  drop constraint if exists claim_definitions_claim_type_jurisdiction_key;
create unique index if not exists claim_definitions_identity_version_uq
  on public.claim_definitions (claim_type, jurisdiction, version);

alter table public.claim_definitions
  drop constraint if exists claim_definitions_elements_nonempty_check;
alter table public.claim_definitions
  add constraint claim_definitions_elements_nonempty_check
  check (jsonb_typeof(elements) = 'array' and jsonb_array_length(elements) > 0);

alter table public.claim_definitions
  drop constraint if exists claim_definitions_manifest_hash_check;
alter table public.claim_definitions
  add constraint claim_definitions_manifest_hash_check
  check (rule_manifest_hash ~ '^[0-9a-f]{64}$');

alter table public.claim_element_evaluations
  drop constraint if exists claim_element_evaluations_source_array_check;
alter table public.claim_element_evaluations
  add constraint claim_element_evaluations_source_array_check
  check (jsonb_typeof(source_evidence_ids) = 'array');

alter table public.claim_element_evaluations
  drop constraint if exists claim_element_evaluations_satisfied_source_check;
alter table public.claim_element_evaluations
  add constraint claim_element_evaluations_satisfied_source_check
  check (evaluation_status <> 'satisfied' or jsonb_array_length(source_evidence_ids) > 0);

alter table public.claim_element_evaluations
  drop constraint if exists claim_element_evaluations_manifest_hash_check;
alter table public.claim_element_evaluations
  add constraint claim_element_evaluations_manifest_hash_check
  check (rule_manifest_hash ~ '^[0-9a-f]{64}$');

create table if not exists public.priority_utility_snapshot (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  as_of bigint not null,
  urgency numeric not null check (urgency between 0 and 1),
  equity numeric not null check (equity between 0 and 1),
  feasibility numeric not null check (feasibility between 0 and 1),
  confidence numeric not null check (confidence between 0 and 1),
  urgency_source_record_id text not null,
  equity_source_record_id text not null,
  feasibility_source_record_id text not null,
  confidence_source_record_id text not null,
  rule_manifest_hash text not null check (rule_manifest_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create unique index if not exists priority_utility_snapshot_identity_uq
  on public.priority_utility_snapshot (
    version, as_of, urgency_source_record_id, equity_source_record_id,
    feasibility_source_record_id, confidence_source_record_id
  );

create or replace function public.prevent_governed_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception '% is immutable; UPDATE and DELETE are prohibited', tg_table_name;
end;
$$;

drop trigger if exists immutable_claim_definitions on public.claim_definitions;
create trigger immutable_claim_definitions before update or delete on public.claim_definitions
for each row execute function public.prevent_governed_mutation();

drop trigger if exists immutable_priority_utility_snapshot on public.priority_utility_snapshot;
create trigger immutable_priority_utility_snapshot before update or delete on public.priority_utility_snapshot
for each row execute function public.prevent_governed_mutation();

alter table public.priority_utility_snapshot enable row level security;
drop policy if exists service_role_all on public.priority_utility_snapshot;
create policy service_role_all on public.priority_utility_snapshot for all to service_role using (true) with check (true);
revoke all on public.priority_utility_snapshot from public, anon, authenticated;
grant select, insert on public.priority_utility_snapshot to service_role;
