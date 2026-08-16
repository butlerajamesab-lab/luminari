import { getPool } from "../db";

function boundedPageSize(value: unknown, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), 250);
}

function nonnegativeOffset(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(Math.trunc(parsed), 0);
}

export async function readCurrentGraphNodePage(input: {
  nodeType?: string;
  query?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const limit = boundedPageSize(input.limit, 100);
  const offset = nonnegativeOffset(input.offset);
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (input.nodeType?.trim()) {
    params.push(input.nodeType.trim());
    conditions.push(`node_type = $${params.length}`);
  }
  if (input.query?.trim()) {
    params.push(`%${input.query.trim()}%`);
    const p = `$${params.length}`;
    conditions.push(`(coalesce(label,'') ilike ${p} or coalesce(jurisdiction_code,'') ilike ${p} or coalesce(source_locator,'') ilike ${p})`);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  params.push(limit, offset);
  const result = await getPool().query(
    `select node_id,node_type,label,jurisdiction_code,node_origin,node_state,object_ref,
            artifact_key,source_locator,source_content_sha256,source_candidate_hash,metadata,
            count(*) over()::int as filtered_total
       from public.v_lighthouse_graph_nodes_v1
       ${where}
      order by case when node_origin='civic_object' then 0 else 1 end,node_type,label,node_id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  return {
    total: Number(result.rows[0]?.filtered_total ?? 0),
    limit,
    offset,
    items: result.rows.map(({ filtered_total: _filteredTotal, ...row }) => row),
    universe: "v_lighthouse_graph_nodes_v1",
    window_only: true,
  };
}

export async function readCurrentGraphEdgePage(input: {
  edgeType?: string;
  nodeId?: string;
  semanticOnly?: boolean;
  limit?: number;
  offset?: number;
} = {}) {
  const limit = boundedPageSize(input.limit, 100);
  const offset = nonnegativeOffset(input.offset);
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (input.edgeType?.trim()) {
    params.push(input.edgeType.trim());
    conditions.push(`e.edge_type = $${params.length}`);
  }
  if (input.nodeId?.trim()) {
    params.push(input.nodeId.trim());
    conditions.push(`(e.from_node_id = $${params.length} or e.to_node_id = $${params.length})`);
  }

  const sourceView = input.semanticOnly
    ? "public.v_lighthouse_graph_relationship_edges_v1"
    : "public.v_lighthouse_graph_edges_v2";
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  params.push(limit, offset);
  const result = await getPool().query(
    `select e.edge_id,e.from_node_id,e.to_node_id,e.edge_type,e.evidence_state,e.evidence_hash,e.metadata,
            f.label as from_label,f.node_type as from_node_type,
            t.label as to_label,t.node_type as to_node_type,
            count(*) over()::int as filtered_total
       from ${sourceView} e
       left join public.v_lighthouse_graph_nodes_v1 f on f.node_id=e.from_node_id
       left join public.v_lighthouse_graph_nodes_v1 t on t.node_id=e.to_node_id
       ${where}
      order by e.edge_type,coalesce(f.label,e.from_node_id),coalesce(t.label,e.to_node_id),e.edge_id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  return {
    total: Number(result.rows[0]?.filtered_total ?? 0),
    limit,
    offset,
    items: result.rows.map(({ filtered_total: _filteredTotal, ...row }) => row),
    universe: sourceView,
    window_only: true,
  };
}

export async function readCurrentUnresolvedRelationshipPage(input: {
  relationshipType?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const limit = boundedPageSize(input.limit, 100);
  const offset = nonnegativeOffset(input.offset);
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (input.relationshipType?.trim()) {
    params.push(input.relationshipType.trim());
    conditions.push(`u.intended_edge_type = $${params.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  params.push(limit, offset);
  const result = await getPool().query(
    `select u.declaration_id,u.from_node_id,u.intended_edge_type,u.source_field,u.target_reference,
            u.resolution_state,u.target_match_count,u.evidence_hash,u.metadata,
            f.label as from_label,f.node_type as from_node_type,
            count(*) over()::int as filtered_total
       from public.v_lighthouse_graph_unresolved_relationships_v1 u
       left join public.v_lighthouse_graph_nodes_v1 f on f.node_id=u.from_node_id
       ${where}
      order by u.resolution_state,u.intended_edge_type,coalesce(f.label,u.from_node_id),u.target_reference,u.declaration_id
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  return {
    total: Number(result.rows[0]?.filtered_total ?? 0),
    limit,
    offset,
    items: result.rows.map(({ filtered_total: _filteredTotal, ...row }) => row),
    universe: "v_lighthouse_graph_unresolved_relationships_v1",
    window_only: true,
  };
}
