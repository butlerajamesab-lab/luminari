-- Dedupe merge ledger v1 (2026-11-15): one row per absorbed entity.
-- `moved` carries full row copies of every re-pointed/deleted row plus
-- the survivor's prior field values, so any merge reverses mechanically.
create table if not exists public.luminari_dedupe_merges (
  merge_id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  cluster_id text not null,
  survivor_entity_id uuid not null references public.luminari_resource_entities(resource_entity_id),
  absorbed_entity_id uuid not null references public.luminari_resource_entities(resource_entity_id),
  evidence jsonb not null,
  moved jsonb not null,
  status text not null default 'applied' check (status in ('applied', 'reversed')),
  created_at timestamptz not null default now(),
  unique (batch_id, absorbed_entity_id)
);
create index if not exists luminari_dedupe_merges_cluster_idx
  on public.luminari_dedupe_merges (batch_id, cluster_id);
comment on table public.luminari_dedupe_merges is
  'Dedupe merge ledger v1: address+contact correlated duplicate merges; reversible via moved snapshots.';
