-- Civic Genome family and bill rows existed before the tracked operating
-- substrate. Restore their canonical keys and lifecycle fields so downstream
-- traits, relationships, comparisons, and Rosetta assembly can replay.
create table if not exists public.civic_genome_family (
  family_id uuid primary key default gen_random_uuid(),
  family_key text not null unique,
  family_label text not null,
  policy_domain text not null,
  family_status text not null default 'active',
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  first_enacted_at timestamptz,
  last_event_at timestamptz,
  active_state_count integer not null default 0,
  introduced_state_count integer not null default 0,
  enacted_state_count integer not null default 0,
  failed_state_count integer not null default 0,
  momentum_score numeric not null default 0,
  acceleration_score numeric not null default 0,
  collapse_score numeric not null default 0,
  signature_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.civic_genome_bill (
  genome_bill_id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.civic_genome_family(family_id) on delete cascade,
  bill_id uuid not null unique,
  state_code text not null,
  session_key text not null,
  source_bill_number text not null,
  source_bill_title text,
  source_bill_url text,
  bill_status text,
  introduced_at timestamptz,
  last_action_at timestamptz,
  enacted_at timestamptz,
  rosetta_extraction_run_id text,
  structural_dna_hash text not null,
  structural_dna_json jsonb not null default '{}'::jsonb,
  procedural_lifecycle_json jsonb not null default '{}'::jsonb,
  jurisdiction_lineage_json jsonb not null default '{}'::jsonb,
  constitutional_dependency_json jsonb not null default '{}'::jsonb,
  fiscal_effects_json jsonb not null default '{}'::jsonb,
  enforcement_graph_json jsonb not null default '{}'::jsonb,
  downstream_impact_graph_json jsonb not null default '{}'::jsonb,
  current_state_position text not null default 'introduced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (genome_bill_id, bill_id, family_id)
);

create index if not exists idx_civic_genome_bill_family_id
  on public.civic_genome_bill(family_id);
create index if not exists idx_civic_genome_bill_state_code
  on public.civic_genome_bill(state_code);

alter table public.civic_genome_family enable row level security;
alter table public.civic_genome_bill enable row level security;

revoke all on table public.civic_genome_family from anon, authenticated;
revoke all on table public.civic_genome_bill from anon, authenticated;
grant select on table public.civic_genome_family to authenticated;
grant select on table public.civic_genome_bill to authenticated;
grant all on table public.civic_genome_family to service_role;
grant all on table public.civic_genome_bill to service_role;

do $policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'civic_genome_family'
      and policyname = 'civic_genome_family_authenticated_read'
  ) then
    create policy civic_genome_family_authenticated_read
      on public.civic_genome_family for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'civic_genome_family'
      and policyname = 'civic_genome_family_service_role_all'
  ) then
    create policy civic_genome_family_service_role_all
      on public.civic_genome_family for all to service_role
      using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'civic_genome_bill'
      and policyname = 'civic_genome_bill_authenticated_read'
  ) then
    create policy civic_genome_bill_authenticated_read
      on public.civic_genome_bill for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'civic_genome_bill'
      and policyname = 'civic_genome_bill_service_role_all'
  ) then
    create policy civic_genome_bill_service_role_all
      on public.civic_genome_bill for all to service_role
      using (true) with check (true);
  end if;
end
$policies$;
