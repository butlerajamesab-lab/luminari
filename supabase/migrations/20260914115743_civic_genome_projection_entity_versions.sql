begin;

create table if not exists public.civic_genome_projection_entity_version (
  entity_version_id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('family', 'bill')),
  entity_id uuid not null,
  family_id uuid not null,
  observed_at timestamptz not null,
  record_hash text not null check (record_hash ~ '^[0-9a-f]{64}$'),
  record_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, record_hash)
);

create index if not exists civic_genome_projection_entity_version_as_of_idx
  on public.civic_genome_projection_entity_version
  (entity_type, entity_id, observed_at desc, entity_version_id desc);

create index if not exists civic_genome_projection_entity_version_family_idx
  on public.civic_genome_projection_entity_version
  (family_id, entity_type, observed_at desc);

alter table public.civic_genome_projection_entity_version enable row level security;
revoke all on table public.civic_genome_projection_entity_version
  from public, anon, authenticated;
grant select, insert on table public.civic_genome_projection_entity_version
  to service_role;

drop policy if exists civic_genome_projection_entity_version_service
  on public.civic_genome_projection_entity_version;
create policy civic_genome_projection_entity_version_service
  on public.civic_genome_projection_entity_version
  for all to service_role using (true) with check (true);

comment on table public.civic_genome_projection_entity_version is
  'Immutable family/bill current-row versions captured around recurring Docket projection mutations for reproducible as-of snapshots.';

commit;
