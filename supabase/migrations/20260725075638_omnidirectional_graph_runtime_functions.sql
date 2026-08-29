create or replace function public.omnidirectional_path_score(
  p_authority_sum numeric,
  p_provenance_count integer,
  p_snapshot_match_count integer,
  p_distance integer,
  p_contradiction_count integer,
  p_ruleset_id uuid
) returns numeric language sql stable as $$
  select (p_authority_sum * authority_weight)
    + (p_provenance_count * provenance_weight)
    + (p_snapshot_match_count * snapshot_weight)
    - (p_distance * distance_penalty)
    - (p_contradiction_count * contradiction_penalty)
  from public.omnidirectional_traversal_rulesets
  where ruleset_id=p_ruleset_id and enabled=true
$$;

create or replace function public.omnidirectional_resolve(
  p_start_node_ids uuid[],
  p_ruleset_key text,
  p_snapshot_hash text default null,
  p_as_of timestamptz default now()
) returns table(
  node_id uuid,
  node_type text,
  depth integer,
  path_node_ids uuid[],
  path_edge_ids uuid[],
  path_score numeric,
  result_hash text
) language sql stable as $$
with recursive rules as (
  select * from public.omnidirectional_traversal_rulesets
  where ruleset_key=p_ruleset_key and enabled=true
), walk as (
  select n.node_id,n.node_type,0 depth,array[n.node_id]::uuid[] path_node_ids,array[]::uuid[] path_edge_ids,
    n.authority_level::numeric authority_sum,1 provenance_count,
    case when p_snapshot_hash is null or n.snapshot_hash=p_snapshot_hash then 1 else 0 end snapshot_match_count,
    0 contradiction_count
  from public.omnidirectional_graph_nodes n cross join rules r
  where n.node_id=any(p_start_node_ids)
    and n.valid_from<=p_as_of and p_as_of<n.valid_to and n.superseded_at is null
    and (cardinality(r.allowed_node_types)=0 or n.node_type=any(r.allowed_node_types))
    and (p_snapshot_hash is null or n.snapshot_hash is null or n.snapshot_hash=p_snapshot_hash)
  union all
  select nn.node_id,nn.node_type,w.depth+1,w.path_node_ids||nn.node_id,w.path_edge_ids||e.edge_id,
    w.authority_sum+nn.authority_level,w.provenance_count+1,
    w.snapshot_match_count+case when p_snapshot_hash is null or nn.snapshot_hash=p_snapshot_hash then 1 else 0 end,
    w.contradiction_count+case when e.edge_type='contradicts' then 1 else 0 end
  from walk w cross join rules r
  join public.omnidirectional_graph_edges e on (
    (r.direction='forward' and e.from_node_id=w.node_id) or
    (r.direction='backward' and e.to_node_id=w.node_id) or
    (r.direction='both' and (e.from_node_id=w.node_id or e.to_node_id=w.node_id))
  )
  join public.omnidirectional_graph_nodes nn on nn.node_id=case when e.from_node_id=w.node_id then e.to_node_id else e.from_node_id end
  where w.depth<r.max_depth and not(nn.node_id=any(w.path_node_ids))
    and e.valid_from<=p_as_of and p_as_of<e.valid_to and e.superseded_at is null
    and nn.valid_from<=p_as_of and p_as_of<nn.valid_to and nn.superseded_at is null
    and (cardinality(r.allowed_edge_types)=0 or e.edge_type=any(r.allowed_edge_types))
    and (cardinality(r.allowed_node_types)=0 or nn.node_type=any(r.allowed_node_types))
    and (p_snapshot_hash is null or e.snapshot_hash is null or e.snapshot_hash=p_snapshot_hash)
    and (p_snapshot_hash is null or nn.snapshot_hash is null or nn.snapshot_hash=p_snapshot_hash)
    and not(w.node_type=any(r.stop_node_types))
)
select w.node_id,w.node_type,w.depth,w.path_node_ids,w.path_edge_ids,
  public.omnidirectional_path_score(w.authority_sum,w.provenance_count,w.snapshot_match_count,w.depth,w.contradiction_count,r.ruleset_id),
  encode(digest(concat_ws('|',array_to_string(w.path_node_ids,','),array_to_string(w.path_edge_ids,','),r.ruleset_key,r.version,coalesce(p_snapshot_hash,''),p_as_of::text),'sha256'),'hex')
from walk w cross join rules r
$$;

create or replace function public.omnidirectional_materialize_paths(
  p_start_node_ids uuid[], p_ruleset_key text, p_snapshot_hash text default null, p_as_of timestamptz default now()
) returns integer language plpgsql as $$
declare c integer;
begin
 insert into public.omnidirectional_graph_paths(start_node_ids,end_node_id,ruleset_id,snapshot_hash,as_of,node_ids,edge_ids,path_depth,path_score,result_hash)
 select p_start_node_ids,r.node_id,t.ruleset_id,p_snapshot_hash,p_as_of,r.path_node_ids,r.path_edge_ids,r.depth,r.path_score,r.result_hash
 from public.omnidirectional_resolve(p_start_node_ids,p_ruleset_key,p_snapshot_hash,p_as_of) r
 join public.omnidirectional_traversal_rulesets t on t.ruleset_key=p_ruleset_key
 on conflict(result_hash) do nothing;
 get diagnostics c=row_count;
 return c;
end$$;

create or replace function public.omnidirectional_capture_health(
  p_snapshot_hash text default null, p_as_of timestamptz default now()
) returns uuid language plpgsql as $$
declare id uuid:=gen_random_uuid(); cc bigint; ca bigint; ac bigint; tc bigint; nc bigint; ec bigint; uc bigint; xc bigint; mh text;
begin
 select count(*) into nc from public.omnidirectional_graph_nodes where valid_from<=p_as_of and p_as_of<valid_to and superseded_at is null and (p_snapshot_hash is null or snapshot_hash is null or snapshot_hash=p_snapshot_hash);
 select count(*) into ec from public.omnidirectional_graph_edges where valid_from<=p_as_of and p_as_of<valid_to and superseded_at is null and (p_snapshot_hash is null or snapshot_hash is null or snapshot_hash=p_snapshot_hash);
 select count(*) into cc from public.omnidirectional_graph_nodes where node_type='claim' and valid_from<=p_as_of and p_as_of<valid_to and superseded_at is null and (p_snapshot_hash is null or snapshot_hash is null or snapshot_hash=p_snapshot_hash);
 select count(distinct e.from_node_id) into ca from public.omnidirectional_graph_edges e join public.omnidirectional_graph_nodes n on n.node_id=e.from_node_id and n.node_type='claim' where e.edge_type='governed_by' and e.valid_from<=p_as_of and p_as_of<e.valid_to and e.superseded_at is null and (p_snapshot_hash is null or e.snapshot_hash is null or e.snapshot_hash=p_snapshot_hash);
 select count(distinct e.from_node_id) into ac from public.omnidirectional_graph_edges e join public.omnidirectional_graph_nodes n on n.node_id=e.to_node_id and n.node_type='action' where e.edge_type in('routes_to','escalates_to') and e.valid_from<=p_as_of and p_as_of<e.valid_to and e.superseded_at is null and (p_snapshot_hash is null or e.snapshot_hash is null or e.snapshot_hash=p_snapshot_hash);
 select count(*) into tc from public.omnidirectional_graph_nodes where provenance_ref<>'{}'::jsonb and valid_from<=p_as_of and p_as_of<valid_to and superseded_at is null and (p_snapshot_hash is null or snapshot_hash is null or snapshot_hash=p_snapshot_hash);
 select count(*) filter(where edge_type='unresolved'),count(*) filter(where edge_type='contradicts') into uc,xc from public.omnidirectional_graph_edges where valid_from<=p_as_of and p_as_of<valid_to and superseded_at is null and (p_snapshot_hash is null or snapshot_hash is null or snapshot_hash=p_snapshot_hash);
 mh:=encode(digest(concat_ws('|',p_snapshot_hash,p_as_of::text,cc,ca,ac,tc,nc,ec,uc,xc),'sha256'),'hex');
 insert into public.omnidirectional_graph_health_snapshots(health_snapshot_id,snapshot_hash,as_of,claim_count,claims_with_governing_authority,actionable_node_count,traceable_node_count,active_node_count,active_edge_count,coverage_ratio,actionability_ratio,traceability_ratio,unresolved_count,contradiction_edge_count,metrics_hash)
 values(id,p_snapshot_hash,p_as_of,cc,ca,ac,tc,nc,ec,case when cc=0 then 1 else ca::numeric/cc end,case when nc=0 then 1 else ac::numeric/nc end,case when nc=0 then 1 else tc::numeric/nc end,uc,xc,mh)
 on conflict(metrics_hash) do nothing;
 return id;
end$$;
