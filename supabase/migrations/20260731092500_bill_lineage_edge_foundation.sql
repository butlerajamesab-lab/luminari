begin;

-- Reconstruct the production lineage relation that later Civic Genome ACL
-- migrations expect but the historical repository never created.
create table if not exists public.bill_lineage_edge (
  lineage_edge_id uuid primary key default gen_random_uuid(),
  family_id uuid
    references public.civic_genome_family(family_id) on delete cascade,
  from_bill_id uuid not null,
  to_bill_id uuid not null,
  relationship_type text not null,
  confidence_score numeric not null default 0,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint bill_lineage_edge_from_bill_id_to_bill_id_relationship_type_key
    unique (from_bill_id, to_bill_id, relationship_type)
);

create index if not exists idx_bill_lineage_edge_family_id
  on public.bill_lineage_edge(family_id);

alter table public.bill_lineage_edge enable row level security;

revoke all on table public.bill_lineage_edge
  from public, anon, authenticated;
grant all on table public.bill_lineage_edge to service_role;

drop policy if exists bill_lineage_edge_service_role_all
  on public.bill_lineage_edge;
create policy bill_lineage_edge_service_role_all
  on public.bill_lineage_edge
  for all
  to service_role
  using (true)
  with check (true);

commit;
