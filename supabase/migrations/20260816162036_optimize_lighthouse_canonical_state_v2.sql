create or replace function public.get_lighthouse_canonical_state_v2()
returns jsonb
language sql
stable
set search_path = pg_catalog, public
as $$
with base as materialized (
  select public.get_lighthouse_canonical_state_v1() as state
), relationship_counts as materialized (
  select
    intended_edge_type,
    count(*) filter (where resolution_state = 'resolved_exact' and target_node_id is not null)::int as resolved_count,
    count(*) filter (where resolution_state <> 'resolved_exact' or target_node_id is null)::int as unresolved_count
  from public.v_lighthouse_graph_relationship_declarations_v1
  group by intended_edge_type
), combined_edge_counts as (
  select key as edge_type, value::int as cnt
  from base, lateral jsonb_each_text(coalesce(base.state->'graph_edge_types','{}'::jsonb))
  union all
  select intended_edge_type, resolved_count
  from relationship_counts
  where resolved_count > 0
), combined_edge_types as (
  select coalesce(jsonb_object_agg(edge_type,total_count),'{}'::jsonb) as edge_types
  from (
    select edge_type,sum(cnt)::int as total_count
    from combined_edge_counts
    group by edge_type
  ) x
), totals as (
  select
    coalesce(sum(resolved_count),0)::int as semantic_edges,
    coalesce(sum(unresolved_count),0)::int as unresolved_relationships
  from relationship_counts
)
select base.state || jsonb_build_object(
  'contract','lighthouse_canonical_state_v2',
  'graph_edges',coalesce((base.state->>'graph_edges')::bigint,0) + totals.semantic_edges,
  'structural_graph_edges',coalesce((base.state->>'graph_edges')::bigint,0),
  'semantic_graph_edges',totals.semantic_edges,
  'unresolved_relationships',totals.unresolved_relationships,
  'graph_edge_types',combined_edge_types.edge_types
)
from base cross join totals cross join combined_edge_types;
$$;

revoke execute on function public.get_lighthouse_canonical_state_v2() from public, anon, authenticated;
grant execute on function public.get_lighthouse_canonical_state_v2() to service_role;
comment on function public.get_lighthouse_canonical_state_v2() is 'Canonical Lighthouse state with v1 structural graph counts plus a single-pass aggregate of explicit source-declared semantic relationships and unresolved declarations.';