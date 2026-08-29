begin;

create or replace function public.state_directory_contact_url(p_text text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  with m as (
    select (regexp_match(p_text, '(https?://[^[:space:]]+|www\.[^[:space:]]+|[A-Za-z0-9.-]+\.(gov|org|com|net)(/[A-Za-z0-9_./-]+)?)'))[1] as value
  )
  select case
    when value is null then null
    when value ~* '^(https?://|www\.)' then value
    else 'https://' || value
  end
  from m;
$$;

create table if not exists public.state_directory_oversight_promotion (
  candidate_group_id text primary key,
  run_id text not null references public.state_directory_reassembly_run(run_id),
  jurisdiction_code text not null,
  normalized_identity text not null,
  display_name text not null,
  source_logical_record_ids text[] not null,
  source_files text[] not null,
  source_row_count integer not null,
  source_rows jsonb not null,
  record_fingerprint text not null,
  disposition text not null check (disposition in ('inserted','duplicate')),
  target_uuid text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, jurisdiction_code, normalized_identity)
);

create index if not exists idx_state_directory_oversight_promotion_run_id
  on public.state_directory_oversight_promotion(run_id);
create index if not exists idx_state_directory_oversight_promotion_disposition
  on public.state_directory_oversight_promotion(disposition, jurisdiction_code);

alter table public.state_directory_oversight_promotion enable row level security;
create policy "service_role_full_access" on public.state_directory_oversight_promotion
  for all to service_role using (true) with check (true);
create policy "authenticated_read_only" on public.state_directory_oversight_promotion
  for select to authenticated using (true);

create or replace view public.v_state_directory_oversight_promotion_summary
with (security_invoker=true)
as
select run_id,disposition,count(*)::bigint as oversight_identities,
  sum(source_row_count)::bigint as source_rows,
  count(distinct jurisdiction_code)::integer as jurisdictions
from public.state_directory_oversight_promotion
group by run_id,disposition;

grant select on public.v_state_directory_oversight_promotion_summary to authenticated,service_role;

comment on table public.state_directory_oversight_promotion is
  'Deterministic jurisdiction-bound oversight identity disposition ledger for v3.13 state directory promotion.';

commit;
