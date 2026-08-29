-- Reconstruct the live-only legacy graph/signal relations counted by the
-- canonical Lighthouse state receipt.  They begin empty and service-only;
-- zero rows is an explicit absence, not a synthesized recovery.

create table if not exists public.world_nodes (
  id serial primary key,
  biome_type text,
  node_name_wn text,
  latitude text,
  longitude text,
  metadata_l10 text,
  active_remedy integer,
  last_verified_at_wn bigint,
  created_at_wn bigint,
  updated_at_wn bigint
);

create table if not exists public.signal_flow_logs (
  id serial primary key,
  signal_id_sfl text,
  vector_path text,
  flow_density text,
  visibility_metadata text,
  processed_at bigint
);

create table if not exists public.remedy_paths (
  id serial primary key,
  case_id integer,
  user_id integer,
  title text,
  description text,
  path_type text,
  viability text,
  estimated_timeline text,
  estimated_cost text,
  risk_level text,
  prerequisites text,
  related_claim_types text,
  generated_by text,
  remedy_status text,
  created_at bigint,
  updated_at bigint,
  signal_id text,
  route_direction text,
  target_node_id integer,
  block_reason text,
  canonical_remedy_status text
);

alter table public.world_nodes enable row level security;
alter table public.signal_flow_logs enable row level security;
alter table public.remedy_paths enable row level security;

revoke all on public.world_nodes, public.signal_flow_logs, public.remedy_paths
  from public, anon, authenticated;
grant select, insert, update, delete on public.world_nodes,
  public.signal_flow_logs, public.remedy_paths to service_role;
grant usage, select on sequence public.world_nodes_id_seq,
  public.signal_flow_logs_id_seq, public.remedy_paths_id_seq to service_role;

drop policy if exists service_role_all_world_nodes on public.world_nodes;
create policy service_role_all_world_nodes on public.world_nodes
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_signal_flow_logs on public.signal_flow_logs;
create policy service_role_all_signal_flow_logs on public.signal_flow_logs
  for all to service_role using (true) with check (true);
drop policy if exists service_role_all_remedy_paths on public.remedy_paths;
create policy service_role_all_remedy_paths on public.remedy_paths
  for all to service_role using (true) with check (true);

comment on table public.world_nodes is
  'Service-only legacy world-node lane reconstructed as an empty canonical-state input.';
comment on table public.signal_flow_logs is
  'Service-only legacy signal-flow lane reconstructed as an empty canonical-state input.';
comment on table public.remedy_paths is
  'Service-only legacy remedy lane reconstructed as an empty canonical-state input.';
