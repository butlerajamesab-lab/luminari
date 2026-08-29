begin;

create table if not exists public.state_directory_organization_resource_promotion (
  candidate_group_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  jurisdiction_code text not null,
  normalized_identity text not null,
  display_name text not null,
  logical_record_id text not null references public.state_directory_logical_record(logical_record_id),
  source_file text not null,
  row_payload jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('inserted','duplicate_entity','duplicate_registry')),
  target_table text not null,
  target_record_id text not null,
  canonical_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id,jurisdiction_code,normalized_identity)
);

create table if not exists public.state_directory_field_resource_promotion (
  candidate_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  logical_record_id text not null references public.state_directory_logical_record(logical_record_id),
  jurisdiction_code text not null,
  display_name text not null,
  service_type text,
  website_url text,
  url_key text,
  phone_value text,
  phone_key text,
  source_payload jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('inserted','enriched','held_ambiguous')),
  match_method text not null,
  target_resource_entity_id uuid,
  canonical_id text,
  matched_resource_entity_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id,logical_record_id)
);

create index if not exists idx_state_directory_org_resource_run_id
  on public.state_directory_organization_resource_promotion(run_id);
create index if not exists idx_state_directory_org_resource_logical
  on public.state_directory_organization_resource_promotion(logical_record_id);
create index if not exists idx_state_directory_org_resource_disposition
  on public.state_directory_organization_resource_promotion(disposition,jurisdiction_code);
create index if not exists idx_state_directory_field_resource_run_id
  on public.state_directory_field_resource_promotion(run_id);
create index if not exists idx_state_directory_field_resource_logical
  on public.state_directory_field_resource_promotion(logical_record_id);
create index if not exists idx_state_directory_field_resource_disposition
  on public.state_directory_field_resource_promotion(disposition,jurisdiction_code);

alter table public.state_directory_organization_resource_promotion enable row level security;
alter table public.state_directory_field_resource_promotion enable row level security;
create policy "service_role_full_access" on public.state_directory_organization_resource_promotion
  for all to service_role using (true) with check (true);
create policy "authenticated_read_only" on public.state_directory_organization_resource_promotion
  for select to authenticated using (true);
create policy "service_role_full_access" on public.state_directory_field_resource_promotion
  for all to service_role using (true) with check (true);
create policy "authenticated_read_only" on public.state_directory_field_resource_promotion
  for select to authenticated using (true);

create or replace view public.v_state_directory_remaining_resource_summary
with (security_invoker=true)
as
select 'organization_list'::text as resource_lane,run_id,disposition,
  count(*)::bigint as candidates,count(distinct jurisdiction_code)::integer as jurisdictions
from public.state_directory_organization_resource_promotion
group by run_id,disposition
union all
select 'field_information'::text,run_id,disposition,
  count(*)::bigint,count(distinct jurisdiction_code)::integer
from public.state_directory_field_resource_promotion
group by run_id,disposition;

grant select on public.v_state_directory_remaining_resource_summary to authenticated,service_role;

commit;
