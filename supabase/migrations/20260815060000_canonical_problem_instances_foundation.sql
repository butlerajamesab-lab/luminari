-- Reconcile the early record-id problem framework with the later canonical
-- Lighthouse UUID problem-instance contract.  A fresh replay may preserve the
-- empty early relation for its historical foreign keys; populated legacy data
-- must never be moved implicitly.

do $compatibility$
declare
  legacy_row_count bigint;
begin
  if to_regclass('public.problem_instances') is not null
     and not exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'problem_instances'
          and column_name = 'id'
     ) then
    if to_regclass('public.problem_instances_legacy_v1') is not null then
      raise exception
        'both canonical and legacy problem_instances relations exist without the UUID contract';
    end if;

    lock table public.problem_instances in access exclusive mode;
    select count(*) into legacy_row_count from public.problem_instances;
    if legacy_row_count <> 0 then
      raise exception
        'legacy public.problem_instances contains % rows; explicit audited migration required',
        legacy_row_count;
    end if;

    alter table public.problem_instances rename to problem_instances_legacy_v1;
    alter table public.problem_instances_legacy_v1
      rename constraint problem_instances_pkey to problem_instances_legacy_v1_pkey;
    alter index if exists public.idx_pi_problem_type rename to idx_pi_legacy_v1_problem_type;
    alter index if exists public.idx_pi_scale rename to idx_pi_legacy_v1_scale;
    alter index if exists public.idx_pi_validation_status rename to idx_pi_legacy_v1_validation_status;
    alter index if exists public.idx_pi_domain rename to idx_pi_legacy_v1_domain;
  end if;
end
$compatibility$;

create table if not exists public.problem_instances (
  id uuid primary key default gen_random_uuid(),
  record_id text not null unique,
  problem_type text not null,
  jurisdiction text not null,
  system_primary text not null,
  risk_level text not null,
  friction jsonb,
  alignment jsonb,
  findings jsonb default '[]'::jsonb,
  resolution_pathways jsonb default '[]'::jsonb,
  evidence jsonb default '[]'::jsonb,
  grounding_entities jsonb default '[]'::jsonb,
  actions jsonb default '[]'::jsonb,
  feedback_history jsonb default '[]'::jsonb,
  traceability jsonb,
  coordination jsonb,
  intake_ready boolean default false,
  recommended_next_action jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.problem_instances enable row level security;
revoke all on public.problem_instances from public, anon, authenticated;
grant select, insert, update, delete on public.problem_instances to service_role;

drop policy if exists service_role_all_problem_instances on public.problem_instances;
create policy service_role_all_problem_instances
  on public.problem_instances for all to service_role
  using (true) with check (true);

comment on table public.problem_instances is
  'Canonical service-only Lighthouse UUID problem instances; the empty early record-id contract is retained separately for historical foreign keys.';
