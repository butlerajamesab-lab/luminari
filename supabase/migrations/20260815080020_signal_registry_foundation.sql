-- Reconstruct the live Lighthouse signal-type registry that was referenced by
-- the unified signal catalog but absent from the migration ledger.  Schema is
-- created empty; no signal definitions are fabricated.

create table if not exists public.signal_registry (
  id serial primary key,
  signal_type text,
  domain text,
  trigger_patterns text,
  linked_doctrine text,
  linked_weak_joints text,
  linked_contradiction_templates text,
  severity text,
  explanation text,
  recommended_next_steps text,
  added_by text,
  created_at bigint,
  updated_at bigint,
  cluster_id text,
  route_to_pattern_engine integer,
  route_to_strategy_engine integer,
  route_to_procedural_engine integer
);

create index if not exists idx_signal_registry_signal_type
  on public.signal_registry(signal_type);

alter table public.signal_registry enable row level security;
revoke all on public.signal_registry from public, anon, authenticated;
grant select, insert, update, delete on public.signal_registry to service_role;
grant usage, select on sequence public.signal_registry_id_seq to service_role;

drop policy if exists service_role_all_signal_registry on public.signal_registry;
create policy service_role_all_signal_registry
  on public.signal_registry for all to service_role
  using (true) with check (true);

comment on table public.signal_registry is
  'Service-only Lighthouse signal-type registry reconstructed for executable migration replay.';
