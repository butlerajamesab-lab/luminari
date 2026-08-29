begin;

create table if not exists public.state_directory_workflow_promotion (
  candidate_group_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  jurisdiction_code text not null,
  workflow_type text not null,
  preferred_logical_record_id text not null references public.state_directory_logical_record(logical_record_id),
  source_logical_record_ids text[] not null,
  source_files text[] not null,
  source_record_count integer not null,
  preferred_steps jsonb not null,
  source_payloads jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('inserted','duplicate')),
  target_uuid text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, jurisdiction_code, workflow_type)
);

create index if not exists idx_state_directory_workflow_promotion_run_id
  on public.state_directory_workflow_promotion(run_id);
create index if not exists idx_state_directory_workflow_promotion_preferred
  on public.state_directory_workflow_promotion(preferred_logical_record_id);
create index if not exists idx_state_directory_workflow_promotion_disposition
  on public.state_directory_workflow_promotion(disposition, jurisdiction_code);

alter table public.state_directory_workflow_promotion enable row level security;
create policy "service_role_full_access" on public.state_directory_workflow_promotion
  for all to service_role using (true) with check (true);
create policy "authenticated_read_only" on public.state_directory_workflow_promotion
  for select to authenticated using (true);

create or replace view public.v_state_directory_workflow_promotion_summary
with (security_invoker=true)
as
select run_id,disposition,workflow_type,count(*)::bigint as workflows,
  sum(source_record_count)::bigint as source_logical_records,
  count(distinct jurisdiction_code)::integer as jurisdictions
from public.state_directory_workflow_promotion
group by run_id,disposition,workflow_type;

grant select on public.v_state_directory_workflow_promotion_summary to authenticated,service_role;

comment on table public.state_directory_workflow_promotion is
  'Deterministic jurisdiction and workflow-type disposition ledger for v3.13 state directory workflow promotion.';

commit;
