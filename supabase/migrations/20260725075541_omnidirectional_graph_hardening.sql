create extension if not exists pgcrypto;

create table if not exists public.omnidirectional_node_types (
  node_type text primary key,
  description text not null,
  requires_provenance boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.omnidirectional_edge_types (
  edge_type text primary key,
  description text not null,
  is_negative boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.omnidirectional_node_types(node_type,description) values
('source','Raw source material'),('quote','Source-anchored quotation'),('event','Timeline event'),('entity','Person, organization, institution, or actor'),('claim','Structured claim'),('finding','Validated finding'),('pattern','Detected recurring structure'),('signal','Accountable condition declaration'),('statute','Statutory authority'),('doctrine','Doctrine or governing rule'),('workflow','Procedural workflow'),('deadline','Time-bound requirement'),('action','Available or instantiated action'),('export','Generated output artifact'),('outcome','Recorded resolution or outcome'),('agency','Authority or responsible institution'),('jurisdiction','Geographic or legal jurisdiction'),('contradiction','Structured conflict'),('absence','Expected-but-missing relationship')
on conflict do nothing;

insert into public.omnidirectional_edge_types(edge_type,description,is_negative) values
('supports','Evidence supports another node',false),('contradicts','One assertion conflicts with another',false),('belongs_to','Hierarchy or ownership relation',false),('triggered_by','Triggered by another node',false),('governed_by','Governed by identified authority',false),('routes_to','Routes to workflow, agency, or action',false),('escalates_to','Escalates to authority or process',false),('depends_on','Depends on another node',false),('derived_from','Derived from another node',false),('located_in','Located in a jurisdiction',false),('missing_edge','Expected relationship is absent',true),('unresolved','No valid downstream resolution exists',true)
on conflict do nothing;

create table if not exists public.omnidirectional_domain_packs (
  pack_id uuid primary key default gen_random_uuid(), pack_key text not null unique, pack_name text not null,
  version text not null, constraints jsonb not null default '{}'::jsonb,
  allowed_node_types text[] not null default '{}', allowed_edge_types text[] not null default '{}',
  enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.omnidirectional_graph_snapshots (
  snapshot_hash text primary key, rules_version text not null, graph_version text not null,
  description text, sealed_at timestamptz not null default now(), node_count bigint, edge_count bigint,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.omnidirectional_graph_nodes (
  node_id uuid primary key default gen_random_uuid(), node_type text not null references public.omnidirectional_node_types(node_type),
  canonical_key text not null, payload jsonb not null default '{}'::jsonb, provenance_ref jsonb not null,
  source_table text, source_id text, snapshot_hash text references public.omnidirectional_graph_snapshots(snapshot_hash),
  version text not null default '1.0.0', authority_level smallint not null default 0 check(authority_level between 0 and 10),
  feasibility_score numeric(6,5) check(feasibility_score is null or feasibility_score between 0 and 1),
  valid_from timestamptz not null default '-infinity', valid_to timestamptz not null default 'infinity',
  content_hash text not null default '', created_at timestamptz not null default now(), superseded_at timestamptz,
  unique(node_type,canonical_key,version), check(valid_from < valid_to),
  check(jsonb_typeof(provenance_ref)='object' and provenance_ref <> '{}'::jsonb)
);

create table if not exists public.omnidirectional_edge_constraints (
  from_node_type text not null references public.omnidirectional_node_types(node_type),
  edge_type text not null references public.omnidirectional_edge_types(edge_type),
  to_node_type text not null references public.omnidirectional_node_types(node_type),
  enabled boolean not null default true, description text,
  primary key(from_node_type,edge_type,to_node_type)
);

create table if not exists public.omnidirectional_graph_edges (
  edge_id uuid primary key default gen_random_uuid(), from_node_id uuid not null references public.omnidirectional_graph_nodes(node_id),
  to_node_id uuid not null references public.omnidirectional_graph_nodes(node_id), edge_type text not null references public.omnidirectional_edge_types(edge_type),
  provenance_ref jsonb not null, snapshot_hash text references public.omnidirectional_graph_snapshots(snapshot_hash),
  version text not null default '1.0.0', weight numeric(8,5) not null default 1 check(weight>=0),
  confidence numeric(6,5) not null default 1 check(confidence between 0 and 1),
  valid_from timestamptz not null default '-infinity', valid_to timestamptz not null default 'infinity',
  content_hash text not null default '', created_at timestamptz not null default now(), superseded_at timestamptz,
  unique(from_node_id,edge_type,to_node_id,version), check(from_node_id<>to_node_id), check(valid_from<valid_to),
  check(jsonb_typeof(provenance_ref)='object' and provenance_ref <> '{}'::jsonb)
);

create table if not exists public.omnidirectional_traversal_rulesets (
  ruleset_id uuid primary key default gen_random_uuid(), ruleset_key text not null unique, name text not null, version text not null,
  allowed_node_types text[] not null default '{}', allowed_edge_types text[] not null default '{}',
  max_depth integer not null check(max_depth between 0 and 32), direction text not null check(direction in('forward','backward','both')),
  stop_node_types text[] not null default '{}', authority_weight numeric(8,5) not null default 1,
  provenance_weight numeric(8,5) not null default 1, snapshot_weight numeric(8,5) not null default 1,
  distance_penalty numeric(8,5) not null default 1, contradiction_penalty numeric(8,5) not null default 1,
  enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.omnidirectional_graph_paths (
  path_id uuid primary key default gen_random_uuid(), start_node_ids uuid[] not null,
  end_node_id uuid not null references public.omnidirectional_graph_nodes(node_id),
  ruleset_id uuid not null references public.omnidirectional_traversal_rulesets(ruleset_id),
  snapshot_hash text references public.omnidirectional_graph_snapshots(snapshot_hash), as_of timestamptz not null,
  node_ids uuid[] not null, edge_ids uuid[] not null, path_depth integer not null check(path_depth>=0),
  path_score numeric(18,8) not null, result_hash text not null unique, materialized_at timestamptz not null default now()
);

create table if not exists public.omnidirectional_contradiction_clusters (
  cluster_id uuid primary key default gen_random_uuid(), snapshot_hash text references public.omnidirectional_graph_snapshots(snapshot_hash),
  node_ids uuid[] not null, edge_ids uuid[] not null, support_count integer not null default 0,
  contradiction_count integer not null default 0,
  severity numeric(12,6) generated always as (contradiction_count::numeric/greatest(support_count,1)) stored,
  cluster_hash text not null unique, created_at timestamptz not null default now()
);

create table if not exists public.omnidirectional_graph_health_snapshots (
  health_snapshot_id uuid primary key default gen_random_uuid(), snapshot_hash text references public.omnidirectional_graph_snapshots(snapshot_hash),
  as_of timestamptz not null default now(), claim_count bigint not null, claims_with_governing_authority bigint not null,
  actionable_node_count bigint not null, traceable_node_count bigint not null, active_node_count bigint not null,
  active_edge_count bigint not null, coverage_ratio numeric(12,8) not null, actionability_ratio numeric(12,8) not null,
  traceability_ratio numeric(12,8) not null, unresolved_count bigint not null, contradiction_edge_count bigint not null,
  metrics_hash text not null unique, created_at timestamptz not null default now()
);

create index if not exists idx_omni_nodes_type on public.omnidirectional_graph_nodes(node_type);
create index if not exists idx_omni_nodes_snapshot on public.omnidirectional_graph_nodes(snapshot_hash);
create index if not exists idx_omni_nodes_validity on public.omnidirectional_graph_nodes(valid_from,valid_to);
create index if not exists idx_omni_nodes_authority on public.omnidirectional_graph_nodes(authority_level desc);
create index if not exists idx_omni_edges_from on public.omnidirectional_graph_edges(from_node_id,edge_type);
create index if not exists idx_omni_edges_to on public.omnidirectional_graph_edges(to_node_id,edge_type);
create index if not exists idx_omni_edges_validity on public.omnidirectional_graph_edges(valid_from,valid_to);
create index if not exists idx_omni_paths_start on public.omnidirectional_graph_paths using gin(start_node_ids);
create index if not exists idx_omni_paths_score on public.omnidirectional_graph_paths(path_score desc);

create or replace function public.omnidirectional_compute_node_hash() returns trigger language plpgsql as $$
begin
 new.content_hash:=encode(digest(concat_ws('|',new.node_type,new.canonical_key,new.version,new.payload::text,new.provenance_ref::text,new.authority_level::text,new.feasibility_score::text,new.valid_from::text,new.valid_to::text),'sha256'),'hex');
 return new;
end$$;

create or replace function public.omnidirectional_compute_edge_hash() returns trigger language plpgsql as $$
begin
 new.content_hash:=encode(digest(concat_ws('|',new.from_node_id::text,new.edge_type,new.to_node_id::text,new.version,new.provenance_ref::text,new.weight::text,new.confidence::text,new.valid_from::text,new.valid_to::text),'sha256'),'hex');
 return new;
end$$;

drop trigger if exists trg_omni_node_hash on public.omnidirectional_graph_nodes;
create trigger trg_omni_node_hash before insert or update on public.omnidirectional_graph_nodes for each row execute function public.omnidirectional_compute_node_hash();
drop trigger if exists trg_omni_edge_hash on public.omnidirectional_graph_edges;
create trigger trg_omni_edge_hash before insert or update on public.omnidirectional_graph_edges for each row execute function public.omnidirectional_compute_edge_hash();

create or replace function public.omnidirectional_enforce_edge_shape() returns trigger language plpgsql as $$
declare f text; t text;
begin
 select node_type into f from public.omnidirectional_graph_nodes where node_id=new.from_node_id;
 select node_type into t from public.omnidirectional_graph_nodes where node_id=new.to_node_id;
 if not exists(select 1 from public.omnidirectional_edge_constraints where from_node_type=f and edge_type=new.edge_type and to_node_type=t and enabled) then
  raise exception 'Forbidden omnidirectional edge shape: % -[%]-> %',f,new.edge_type,t;
 end if;
 return new;
end$$;

drop trigger if exists trg_omni_edge_shape on public.omnidirectional_graph_edges;
create trigger trg_omni_edge_shape before insert or update of from_node_id,to_node_id,edge_type on public.omnidirectional_graph_edges for each row execute function public.omnidirectional_enforce_edge_shape();

insert into public.omnidirectional_edge_constraints(from_node_type,edge_type,to_node_type,description) values
('source','supports','quote','Source contains quote'),('quote','supports','claim','Quote supports claim'),('event','supports','claim','Event supports claim'),
('claim','governed_by','statute','Claim governed by statute'),('claim','governed_by','doctrine','Claim governed by doctrine'),
('claim','contradicts','finding','Claim conflicts with finding'),('finding','supports','pattern','Finding supports pattern'),
('signal','triggered_by','pattern','Signal is triggered by pattern'),('signal','located_in','jurisdiction','Signal has jurisdiction'),
('statute','routes_to','workflow','Statute authorizes workflow'),('doctrine','routes_to','workflow','Doctrine authorizes workflow'),
('workflow','routes_to','agency','Workflow routes to agency'),('workflow','depends_on','deadline','Workflow depends on deadline'),
('workflow','routes_to','action','Workflow exposes action'),('action','escalates_to','agency','Action escalates to agency'),
('action','depends_on','deadline','Action depends on deadline'),('export','derived_from','finding','Export derives from finding'),
('export','derived_from','claim','Export derives from claim'),('outcome','derived_from','action','Outcome derives from action'),
('absence','missing_edge','claim','Expected relation absent for claim'),('claim','unresolved','absence','Claim has no valid resolution'),
('contradiction','contradicts','claim','Contradiction targets claim'),('contradiction','contradicts','finding','Contradiction targets finding')
on conflict do nothing;

insert into public.omnidirectional_traversal_rulesets(ruleset_key,name,version,allowed_edge_types,max_depth,direction,stop_node_types,authority_weight,provenance_weight,snapshot_weight,distance_penalty,contradiction_penalty)
values('constitutional_default','Constitutional Default Omnidirectional Traversal','1.0.0',array['supports','contradicts','belongs_to','triggered_by','governed_by','routes_to','escalates_to','depends_on','derived_from','located_in','missing_edge','unresolved'],8,'both',array['export','outcome'],2,3,2,1,2.5)
on conflict(ruleset_key) do nothing;

alter table public.omnidirectional_node_types enable row level security;
alter table public.omnidirectional_edge_types enable row level security;
alter table public.omnidirectional_domain_packs enable row level security;
alter table public.omnidirectional_graph_snapshots enable row level security;
alter table public.omnidirectional_graph_nodes enable row level security;
alter table public.omnidirectional_edge_constraints enable row level security;
alter table public.omnidirectional_graph_edges enable row level security;
alter table public.omnidirectional_traversal_rulesets enable row level security;
alter table public.omnidirectional_graph_paths enable row level security;
alter table public.omnidirectional_contradiction_clusters enable row level security;
alter table public.omnidirectional_graph_health_snapshots enable row level security;

revoke all on all tables in schema public from anon, authenticated;
