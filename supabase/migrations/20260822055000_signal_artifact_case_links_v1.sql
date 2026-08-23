begin;

create table if not exists public.signal_artifact_case_links_v1 (
  link_id uuid primary key default gen_random_uuid(),
  case_id integer not null references public.cases(id) on delete cascade,
  domain_code text not null,
  intake_signal_id uuid references public.intake_signals(signal_id),
  legal_pattern_id uuid references public.legal_patterns(pattern_id),
  live_data_signal_id uuid references public.live_data_signals(live_data_signal_id),
  convergence_id uuid references public.signal_convergences(convergence_id),
  relationship_type text not null,
  reviewer_notes text not null default '',
  linked_by_user_id integer not null,
  artifact_title_snapshot text not null,
  artifact_type_snapshot text not null,
  artifact_source_hash text not null,
  link_hash text not null unique,
  created_at timestamptz not null default now(),
  constraint signal_artifact_case_links_domain_check check (
    domain_code in ('case_intake', 'legal_pattern', 'live_data', 'convergence')
  ),
  constraint signal_artifact_case_links_relationship_check check (
    relationship_type in (
      'context',
      'supporting_candidate',
      'contradiction_candidate',
      'pattern_candidate',
      'routing_context'
    )
  ),
  constraint signal_artifact_case_links_source_hash_check check (
    artifact_source_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint signal_artifact_case_links_link_hash_check check (
    link_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint signal_artifact_case_links_one_artifact_check check (
    num_nonnulls(
      intake_signal_id,
      legal_pattern_id,
      live_data_signal_id,
      convergence_id
    ) = 1
  ),
  constraint signal_artifact_case_links_domain_artifact_check check (
    (domain_code = 'case_intake' and intake_signal_id is not null)
    or (domain_code = 'legal_pattern' and legal_pattern_id is not null)
    or (domain_code = 'live_data' and live_data_signal_id is not null)
    or (domain_code = 'convergence' and convergence_id is not null)
  )
);

create index if not exists idx_signal_artifact_case_links_case_created
  on public.signal_artifact_case_links_v1(case_id, created_at desc);
create index if not exists idx_signal_artifact_case_links_legal_pattern
  on public.signal_artifact_case_links_v1(legal_pattern_id)
  where legal_pattern_id is not null;
create index if not exists idx_signal_artifact_case_links_live_data
  on public.signal_artifact_case_links_v1(live_data_signal_id)
  where live_data_signal_id is not null;
create index if not exists idx_signal_artifact_case_links_convergence
  on public.signal_artifact_case_links_v1(convergence_id)
  where convergence_id is not null;

create or replace function public.guard_signal_artifact_case_link_update_v1()
returns trigger
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
begin
  raise exception 'signal artifact case links are immutable; create a new governed relationship instead';
end
$function$;

revoke all on function public.guard_signal_artifact_case_link_update_v1()
  from public, anon, authenticated, service_role;

create or replace trigger signal_artifact_case_links_immutable_v1
before update on public.signal_artifact_case_links_v1
for each row execute function public.guard_signal_artifact_case_link_update_v1();

alter table public.signal_artifact_case_links_v1 enable row level security;

revoke all on table public.signal_artifact_case_links_v1
  from public, anon, authenticated;
grant select, insert on table public.signal_artifact_case_links_v1
  to service_role;

comment on table public.signal_artifact_case_links_v1 is
  'Server-owned, human-created receipts connecting canonical Signal Architecture artifacts to cases. A link supplies review context and is never itself a finding.';
comment on column public.signal_artifact_case_links_v1.relationship_type is
  'Reviewer-selected relationship. No value asserts wrongdoing or automatically changes a case finding.';

commit;
