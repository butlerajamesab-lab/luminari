import { getPool } from "../db";

export type CurrentLegalExplorerInput = {
  query?: string;
  jurisdiction?: string;
  nodeTypes?: string[];
  limit?: number;
};

const DEFAULT_NODE_TYPES = [
  "legal_authority",
  "workflow",
  "enforcement_pathway",
  "agency",
  "oversight_route",
  "oversight_body",
  "deadline",
  "policy_alert",
  "policy_pattern",
  "organization",
  "resource",
  "program",
  "contact_record",
];

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(parsed)));
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

export async function readCurrentLegalExplorer(input: CurrentLegalExplorerInput = {}) {
  const pool = getPool();
  const nodeTypes = uniqueStrings(input.nodeTypes?.length ? input.nodeTypes : DEFAULT_NODE_TYPES).slice(0, 40);
  const limit = clamp(input.limit, 40, 400, 220);
  const query = input.query?.trim() || null;
  const jurisdiction = input.jurisdiction?.trim().toUpperCase() || null;

  const [typeCountsResult, doctrineResult, doctrineEdgeResult, caseLawResult, barrierResult, weakJointResult, referenceCountResult] = await Promise.all([
    pool.query(`
      select node_type,count(*)::int as count
        from public.v_lighthouse_graph_nodes_v1
       group by node_type
       order by count desc,node_type
    `),
    pool.query(`
      select id::text,name,description,primary_cases,domains,added_by,created_at,updated_at
        from public.doctrine_registry
       order by name
    `),
    pool.query(`
      select id,from_type,from_id,edge_type,to_type,to_id,strength,notes,added_by,created_at,updated_at
        from public.doctrine_graph_edges
       order by from_type,edge_type,id
    `),
    pool.query(`
      select id::text,citation,case_name,jurisdiction,domains,year_decided,court,summary,
             source_url,verification_status,date_checked
        from public.legal_case_law
       order by case_name,citation
    `),
    pool.query(`
      select id::text,barrier_id,barrier_type,name,domains,description,leading_authorities,
             what_it_blocks,common_trigger_patterns,usual_outcome,severity,linked_weak_joints,
             possible_workarounds,notes
        from public.litigation_barriers
       order by barrier_type,name
    `),
    pool.query(`
      select id::text,weak_joint_id,title,description,severity_level,severity_rationale,
             source_url,reform_status,metadata
        from public.legal_weak_joints
       order by title
    `),
    pool.query(`
      select
        (select count(*)::int from public.claim_element_matrix) as claim_elements,
        (select count(distinct claim_type)::int from public.claim_element_matrix) as claim_types,
        (select count(*)::int from public.proof_frameworks) as proof_frameworks,
        (select count(*)::int from public.workflow_master) as legacy_workflows,
        (select count(*)::int from public.workflow_steps) as legacy_workflow_steps,
        (select count(*)::int from public.deadline_rules) as legacy_deadline_rules
    `),
  ]);

  const params: unknown[] = [nodeTypes];
  const where: string[] = [`n.node_type = any($1::text[])`];
  if (query) {
    params.push(`%${query}%`);
    const p = `$${params.length}`;
    where.push(`(
      coalesce(n.label,'') ilike ${p}
      or coalesce(n.node_type,'') ilike ${p}
      or coalesce(n.jurisdiction_code,'') ilike ${p}
      or coalesce(n.source_locator,'') ilike ${p}
      or coalesce(n.metadata::text,'') ilike ${p}
    )`);
  }
  if (jurisdiction) {
    params.push(jurisdiction);
    where.push(`upper(coalesce(n.jurisdiction_code,'')) = $${params.length}`);
  }
  params.push(limit);
  const nodeResult = await pool.query(`
    with filtered as (
      select n.node_id,n.node_type,n.label,n.jurisdiction_code,n.node_origin,n.node_state,
             n.object_ref,n.artifact_key,n.source_locator,n.source_content_sha256,n.source_candidate_hash,n.metadata
        from public.v_lighthouse_graph_nodes_v1 n
       where ${where.join(" and ")}
    ), ranked as (
      select f.*,row_number() over(partition by f.node_type order by coalesce(f.label,''),f.node_id) as type_rank,
             count(*) over()::int as filtered_total
        from filtered f
    )
    select *
      from ranked
     order by type_rank,node_type,coalesce(label,''),node_id
     limit $${params.length}
  `, params);

  const selectedIds = nodeResult.rows.map((row) => String(row.node_id));
  let currentEdges: any[] = [];
  let neighborhoodNodes: any[] = [];
  if (selectedIds.length > 0) {
    const edgeResult = await pool.query(`
      select edge_id,from_node_id,to_node_id,edge_type,evidence_state,evidence_hash,metadata
        from public.v_lighthouse_graph_edges_v2
       where (from_node_id = any($1::text[]) or to_node_id = any($1::text[]))
         and edge_type <> 'sourced_from'
       order by case when edge_type='within_jurisdiction' then 2 else 1 end,
                edge_type,edge_id
       limit 1600
    `, [selectedIds]);
    currentEdges = edgeResult.rows;
    const neighborhoodIds = uniqueStrings(
      edgeResult.rows.flatMap((edge) => [edge.from_node_id, edge.to_node_id]),
    ).filter((nodeId) => !selectedIds.includes(nodeId)).slice(0, 800);
    if (neighborhoodIds.length > 0) {
      const neighborhoodResult = await pool.query(`
        select node_id,node_type,label,jurisdiction_code,node_origin,node_state,
               object_ref,artifact_key,source_locator,source_content_sha256,source_candidate_hash,metadata
          from public.v_lighthouse_graph_nodes_v1
         where node_id = any($1::text[])
      `, [neighborhoodIds]);
      neighborhoodNodes = neighborhoodResult.rows;
    }
  }

  const typeCounts = Object.fromEntries(
    typeCountsResult.rows.map((row) => [String(row.node_type), Number(row.count ?? 0)]),
  );
  const defaultCurrentTotal = DEFAULT_NODE_TYPES.reduce(
    (sum, nodeType) => sum + Number(typeCounts[nodeType] ?? 0),
    0,
  );
  const selectedCurrentTotal = nodeTypes.reduce(
    (sum, nodeType) => sum + Number(typeCounts[nodeType] ?? 0),
    0,
  );
  const filteredTotal = Number(nodeResult.rows[0]?.filtered_total ?? 0);
  const referenceCounts = referenceCountResult.rows[0] ?? {};

  return {
    contract: "lighthouse_legal_explorer_current_v1",
    scope: {
      query,
      jurisdiction,
      node_types: nodeTypes,
      transport_limit: limit,
      window_only: true,
    },
    totals: {
      graph_nodes_all_types: typeCountsResult.rows.reduce((sum, row) => sum + Number(row.count ?? 0), 0),
      default_current_explorer_nodes: defaultCurrentTotal,
      selected_current_explorer_nodes: selectedCurrentTotal,
      filtered_current_nodes: filteredTotal,
      loaded_current_nodes: nodeResult.rows.length,
      loaded_neighborhood_nodes: neighborhoodNodes.length,
      current_edges_in_working_neighborhood: currentEdges.length,
      doctrines: doctrineResult.rows.length,
      doctrine_edges: doctrineEdgeResult.rows.length,
      case_law: caseLawResult.rows.length,
      litigation_barriers: barrierResult.rows.length,
      weak_joints: weakJointResult.rows.length,
      claim_elements: Number(referenceCounts.claim_elements ?? 0),
      claim_types: Number(referenceCounts.claim_types ?? 0),
      proof_frameworks: Number(referenceCounts.proof_frameworks ?? 0),
      legacy_workflows: Number(referenceCounts.legacy_workflows ?? 0),
      legacy_workflow_steps: Number(referenceCounts.legacy_workflow_steps ?? 0),
      legacy_deadline_rules: Number(referenceCounts.legacy_deadline_rules ?? 0),
    },
    node_type_counts: typeCounts,
    current_nodes: nodeResult.rows.map(({ type_rank: _typeRank, filtered_total: _filteredTotal, ...row }) => row),
    neighborhood_nodes: neighborhoodNodes,
    current_edges: currentEdges,
    doctrines: doctrineResult.rows,
    doctrine_edges: doctrineEdgeResult.rows,
    case_law: caseLawResult.rows,
    litigation_barriers: barrierResult.rows,
    weak_joints: weakJointResult.rows,
  };
}
