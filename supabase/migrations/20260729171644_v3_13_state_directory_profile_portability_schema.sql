begin;

create table if not exists public.state_directory_profile_promotion (
  candidate_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  logical_record_id text not null references public.state_directory_logical_record(logical_record_id),
  source_row_index integer not null,
  jurisdiction_code text not null,
  row_class text not null,
  row_payload jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('inserted','duplicate')),
  target_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, logical_record_id, source_row_index)
);

create table if not exists public.state_directory_portability_promotion (
  candidate_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  logical_record_id text not null references public.state_directory_logical_record(logical_record_id),
  jurisdiction_code text not null,
  source_row_count integer not null,
  assessments jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('enriched','held')),
  target_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, logical_record_id)
);

create table if not exists public.state_directory_review_hold (
  logical_record_id text primary key references public.state_directory_logical_record(logical_record_id),
  run_id text not null references public.state_directory_reassembly_run(run_id),
  jurisdiction_key text not null,
  source_file text not null,
  row_class text not null,
  hold_reason text not null,
  source_payload jsonb not null,
  status text not null default 'held' check (status='held'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_state_directory_profile_promotion_run_id
  on public.state_directory_profile_promotion(run_id);
create index if not exists idx_state_directory_profile_promotion_logical
  on public.state_directory_profile_promotion(logical_record_id);
create index if not exists idx_state_directory_portability_promotion_run_id
  on public.state_directory_portability_promotion(run_id);
create index if not exists idx_state_directory_portability_promotion_logical
  on public.state_directory_portability_promotion(logical_record_id);
create index if not exists idx_state_directory_review_hold_run_id
  on public.state_directory_review_hold(run_id);

alter table public.state_directory_profile_promotion enable row level security;
alter table public.state_directory_portability_promotion enable row level security;
alter table public.state_directory_review_hold enable row level security;

create policy "service_role_full_access" on public.state_directory_profile_promotion
  for all to service_role using (true) with check (true);
create policy "authenticated_read_only" on public.state_directory_profile_promotion
  for select to authenticated using (true);
create policy "service_role_full_access" on public.state_directory_portability_promotion
  for all to service_role using (true) with check (true);
create policy "authenticated_read_only" on public.state_directory_portability_promotion
  for select to authenticated using (true);
create policy "service_role_full_access" on public.state_directory_review_hold
  for all to service_role using (true) with check (true);
create policy "authenticated_read_only" on public.state_directory_review_hold
  for select to authenticated using (true);

create or replace view public.v_state_directory_profile_promotion_summary
with (security_invoker=true)
as
select run_id,disposition,row_class,count(*)::bigint as assertions,
  count(distinct jurisdiction_code)::integer as jurisdictions
from public.state_directory_profile_promotion
group by run_id,disposition,row_class;

create or replace view public.v_state_directory_portability_promotion_summary
with (security_invoker=true)
as
select run_id,disposition,count(*)::bigint as jurisdiction_records,
  sum(source_row_count)::bigint as assessments,
  count(distinct jurisdiction_code)::integer as jurisdictions
from public.state_directory_portability_promotion
group by run_id,disposition;

grant select on public.v_state_directory_profile_promotion_summary to authenticated,service_role;
grant select on public.v_state_directory_portability_promotion_summary to authenticated,service_role;

commit;
