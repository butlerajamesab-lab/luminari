create table if not exists public.spine_topology_edges (
  id uuid primary key default gen_random_uuid(),
  edge_key text not null unique,
  source_node text not null,
  target_node text not null,
  flow_type text not null,
  active boolean not null default true,
  constitutional_alignment boolean not null default true,
  deterministic boolean not null default true,
  provenance_complete boolean not null default true,
  verification_state text not null default 'verified',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace view public.v_spine_topology_edges as
select
  edge_key,
  source_node,
  target_node,
  flow_type,
  active,
  verification_state,
  created_at,
  metadata
from public.spine_topology_edges
order by created_at asc;

insert into public.spine_topology_edges
(edge_key, source_node, target_node, flow_type, metadata)
values
('atlas_to_viewfinder','Atlas','Viewfinder','signal_flow','{"description":"Atlas anomaly and signal propagation into Viewfinder"}'::jsonb),
('viewfinder_to_spine','Viewfinder','Spine','contradiction_flow','{"description":"Structural anomaly propagation into the governed substrate"}'::jsonb),
('library_to_spine','Legal Library','Spine','grounding_flow','{"description":"Grounded legal and enforcement structure flow into the Spine"}'::jsonb),
('spine_to_workshop','Spine','Workshop','procedural_flow','{"description":"Governed procedural continuity flow into repair environments"}'::jsonb),
('workshop_to_lumensend','Workshop','LumenSend','action_flow','{"description":"Repair continuity exported into procedural action"}'::jsonb),
('spine_to_civicmap','Spine','CivicMap','spatial_flow','{"description":"Procedural topology rendered into geographic observability"}'::jsonb),
('spine_to_esquire','Spine','Esquire','continuity_flow','{"description":"Governed procedural continuity propagated into individualized survivability layer"}'::jsonb)
on conflict (edge_key) do nothing;
