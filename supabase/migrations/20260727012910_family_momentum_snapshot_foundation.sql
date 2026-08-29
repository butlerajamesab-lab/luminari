-- Momentum history existed before its deterministic producer was tracked.
-- Restore the dated family snapshot contract required by the producer and
-- trigger without synthesizing any historical measurements.
create table if not exists public.family_momentum_snapshot (
  momentum_snapshot_id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.civic_genome_family(family_id) on delete cascade,
  snapshot_date date not null,
  active_state_count integer not null default 0,
  introduced_state_count integer not null default 0,
  enacted_state_count integer not null default 0,
  failed_state_count integer not null default 0,
  new_state_count integer not null default 0,
  velocity_score numeric not null default 0,
  acceleration_score numeric not null default 0,
  collapse_score numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (family_id, snapshot_date)
);

create index if not exists idx_family_momentum_snapshot_family_id
  on public.family_momentum_snapshot(family_id);

alter table public.family_momentum_snapshot enable row level security;
revoke all on table public.family_momentum_snapshot from anon, authenticated;
grant select on table public.family_momentum_snapshot to authenticated;
grant all on table public.family_momentum_snapshot to service_role;

do $policies$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'family_momentum_snapshot'
      and policyname = 'family_momentum_snapshot_authenticated_read'
  ) then
    create policy family_momentum_snapshot_authenticated_read
      on public.family_momentum_snapshot for select to authenticated using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'family_momentum_snapshot'
      and policyname = 'family_momentum_snapshot_service_role_all'
  ) then
    create policy family_momentum_snapshot_service_role_all
      on public.family_momentum_snapshot for all to service_role
      using (true) with check (true);
  end if;
end
$policies$;
