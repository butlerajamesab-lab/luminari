begin;

create table if not exists public.state_directory_legal_promotion (
  candidate_group_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  citation_key text not null,
  preferred_citation text not null,
  display_title text not null,
  canonical_jurisdiction text not null,
  source_jurisdictions text[] not null,
  source_logical_record_ids text[] not null,
  source_files text[] not null,
  source_row_count integer not null,
  source_rows jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('inserted','duplicate')),
  target_id uuid not null,
  target_citation text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, citation_key)
);

create index if not exists idx_state_directory_legal_promotion_run_id
  on public.state_directory_legal_promotion(run_id);
create index if not exists idx_state_directory_legal_promotion_disposition
  on public.state_directory_legal_promotion(disposition, canonical_jurisdiction);

alter table public.state_directory_legal_promotion enable row level security;
create policy "service_role_full_access" on public.state_directory_legal_promotion
  for all to service_role using (true) with check (true);
create policy "authenticated_read_only" on public.state_directory_legal_promotion
  for select to authenticated using (true);

create or replace view public.v_state_directory_legal_promotion_summary
with (security_invoker=true)
as
select run_id,disposition,count(*)::bigint as citation_groups,
  sum(source_row_count)::bigint as source_rows,
  count(distinct canonical_jurisdiction)::integer as jurisdictions
from public.state_directory_legal_promotion
group by run_id,disposition;

grant select on public.v_state_directory_legal_promotion_summary to authenticated,service_role;

comment on table public.state_directory_legal_promotion is
  'Normalized citation disposition ledger for v3.13 state directory legal-authority promotion.';

commit;
