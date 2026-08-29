begin;

-- Production contains this append-only event relation, but its creating DDL
-- was absent from the repository ledger. Reconstruct it before the subsequent
-- index and reassignment migrations so a database can replay from zero.
create table if not exists public.civic_genome_event (
  event_id uuid primary key default gen_random_uuid(),
  family_id uuid not null
    references public.civic_genome_family(family_id) on delete cascade,
  genome_bill_id uuid not null
    references public.civic_genome_bill(genome_bill_id) on delete cascade,
  bill_id uuid not null,
  state_code text not null,
  event_type text not null,
  event_timestamp timestamptz not null,
  prior_status text,
  next_status text,
  amendment_version text,
  source_trace jsonb not null default '[]'::jsonb,
  event_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint civic_genome_event_genome_bill_id_bill_id_family_id_fkey
    foreign key (genome_bill_id, bill_id, family_id)
    references public.civic_genome_bill(genome_bill_id, bill_id, family_id)
    on update cascade on delete cascade
);

create index if not exists idx_civic_genome_event_family_id
  on public.civic_genome_event(family_id);

create index if not exists idx_civic_genome_event_event_timestamp
  on public.civic_genome_event(event_timestamp desc);

alter table public.civic_genome_event enable row level security;

revoke all on table public.civic_genome_event from public, anon, authenticated;
grant select on table public.civic_genome_event to authenticated;
grant all on table public.civic_genome_event to service_role;

drop policy if exists civic_genome_event_authenticated_read
  on public.civic_genome_event;
create policy civic_genome_event_authenticated_read
  on public.civic_genome_event
  for select
  to authenticated
  using (true);

drop policy if exists civic_genome_event_service_role_all
  on public.civic_genome_event;
create policy civic_genome_event_service_role_all
  on public.civic_genome_event
  for all
  to service_role
  using (true)
  with check (true);

commit;
