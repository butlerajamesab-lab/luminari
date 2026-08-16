import { getPool } from "../db";

export type CurrentCanonicalState = {
  contract: string;
  source_artifacts: number;
  candidate_records: number;
  current_civic_objects: number;
  typed_ready: number;
  jurisdiction_ready: number;
  unresolved_or_held: number;
  jurisdictions: number;
  programs: number;
  resources: number;
  agencies: number;
  workflows: number;
  legal_authorities: number;
  contacts: number;
  organizations: number;
  current_signals: number;
  signal_domains: Record<string, number>;
  cases: number;
  documents: number;
  claims: number;
  findings: number;
  graph_nodes: number;
  graph_object_nodes: number;
  graph_edges: number;
  structural_graph_edges: number;
  semantic_graph_edges: number;
  unresolved_relationships: number;
  graph_node_types: Record<string, number>;
  graph_edge_types: Record<string, number>;
  legacy_manual_world_nodes: number;
  legacy_detected_signals: number;
  signal_flow_logs: number;
  canonical_remedy_paths: number;
  generated_at: string;
};

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getCurrentCanonicalState(): Promise<CurrentCanonicalState> {
  const result = await getPool().query(
    `select public.get_lighthouse_canonical_state_v2() as state`,
  );
  return (result.rows[0]?.state ?? {}) as CurrentCanonicalState;
}

function categoryForNodeType(nodeType: string): string {
  if (["resource", "program", "contact_record", "organization", "tribal_governance_record", "jurisdiction", "jurisdiction_fact"].includes(nodeType)) return "registry";
  if (["legal_authority", "unresolved_legal_reference"].includes(nodeType)) return "legal";
  if (["agency", "agency_status", "oversight_body", "oversight_route", "enforcement_pathway", "deadline", "workflow"].includes(nodeType)) return "governance";
  if (["policy_alert", "policy_pattern", "pressure_indicator"].includes(nodeType)) return "signals";
  if (["case_instance", "case_evidence", "case_finding", "case_resolution_pathway"].includes(nodeType)) return "cases";
  return "knowledge";
}

export async function getCurrentCanonicalCoreHealth() {
  const state = await getCurrentCanonicalState();
  const nodeTypes = Object.entries(state.graph_node_types ?? {})
    .filter(([type]) => type !== "source_artifact")
    .map(([type, count]) => ({
      table: `civic_object:${type}`,
      category: categoryForNodeType(type),
      count: n(count),
    }))
    .sort((a, b) => b.count - a.count || a.table.localeCompare(b.table));

  const substrate = [
    { table: "source_artifacts", category: "substrate", count: n(state.source_artifacts) },
    { table: "candidate_records", category: "substrate", count: n(state.candidate_records) },
    { table: "current_civic_objects", category: "substrate", count: n(state.current_civic_objects) },
    { table: "structural_graph_edges", category: "graph", count: n(state.structural_graph_edges) },
    { table: "semantic_graph_edges", category: "graph", count: n(state.semantic_graph_edges) },
    { table: "unresolved_relationships", category: "graph", count: n(state.unresolved_relationships) },
  ];
  const tables = [...substrate, ...nodeTypes];

  return {
    contract: state.contract,
    tables,
    total_records: n(state.current_civic_objects),
    totalRecords: n(state.current_civic_objects),
    populatedTables: tables.filter((row) => row.count > 0).length,
    emptyTables: tables.filter((row) => row.count === 0).length,
    sourceArtifacts: n(state.source_artifacts),
    candidateRecords: n(state.candidate_records),
    graphNodes: n(state.graph_nodes),
    graphEdges: n(state.graph_edges),
    structuralGraphEdges: n(state.structural_graph_edges),
    semanticGraphEdges: n(state.semantic_graph_edges),
    unresolvedRelationships: n(state.unresolved_relationships),
    unresolvedOrHeld: n(state.unresolved_or_held),
  };
}

export async function getCurrentSystemSummary() {
  const state = await getCurrentCanonicalState();
  return {
    jurisdictions: n(state.jurisdictions),
    programs: n(state.programs),
    resources: n(state.resources),
    oversightBodies: n(state.agencies),
    agencies: n(state.agencies),
    workflows: n(state.workflows),
    liveSignals: n(state.current_signals),
    detectedSignals: n(state.current_signals),
    cases: n(state.cases),
    documents: n(state.documents),
    entities: n(state.graph_object_nodes),
    claims: n(state.claims),
    findings: n(state.findings),
    patterns: n(state.signal_domains?.legal),
    legalStatutes: n(state.legal_authorities),
    foiaRequests: 0,
    lighthouseJobs: 0,
    lighthousePosts: 0,
    lighthouseEvents: 0,
    docketEntries: 0,
    governanceEvents: 0,
    pipelineEvents: 0,
    graphNodes: n(state.graph_nodes),
    graphEdges: n(state.graph_edges),
    structuralGraphEdges: n(state.structural_graph_edges),
    semanticGraphEdges: n(state.semantic_graph_edges),
    unresolvedRelationships: n(state.unresolved_relationships),
    sourceArtifacts: n(state.source_artifacts),
    candidateRecords: n(state.candidate_records),
    unresolvedOrHeld: n(state.unresolved_or_held),
    contacts: n(state.contacts),
    organizations: n(state.organizations),
    legalAuthorities: n(state.legal_authorities),
  };
}

export async function getCurrentGraphNodes(input: { limit?: number; nodeType?: string } = {}) {
  const limit = Math.min(Math.max(Number(input.limit ?? 20), 1), 200);
  const params: unknown[] = [];
  let where = "";
  if (input.nodeType?.trim()) {
    params.push(input.nodeType.trim());
    where = `where node_type = $${params.length}`;
  }
  params.push(limit);
  const result = await getPool().query(
    `select node_id,node_type,label,jurisdiction_code,node_origin,node_state,object_ref,artifact_key,source_locator,source_content_sha256,source_candidate_hash,metadata
       from public.v_lighthouse_graph_nodes_v1
       ${where}
      order by case when node_origin='civic_object' then 0 else 1 end, node_type, label, node_id
      limit $${params.length}`,
    params,
  );
  return result.rows;
}

export async function getCurrentGraphEdges(input: {
  limit?: number;
  edgeType?: string;
  nodeId?: string;
  semanticOnly?: boolean;
} = {}) {
  const limit = Math.min(Math.max(Number(input.limit ?? 40), 1), 200);
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
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  params.push(limit);

  const result = await getPool().query(
    `select
       e.edge_id,e.from_node_id,e.to_node_id,e.edge_type,e.evidence_state,e.evidence_hash,e.metadata,
       f.label as from_label,f.node_type as from_node_type,
       t.label as to_label,t.node_type as to_node_type
     from ${sourceView} e
     left join public.v_lighthouse_graph_nodes_v1 f on f.node_id = e.from_node_id
     left join public.v_lighthouse_graph_nodes_v1 t on t.node_id = e.to_node_id
     ${where}
     order by e.edge_type,coalesce(f.label,e.from_node_id),coalesce(t.label,e.to_node_id),e.edge_id
     limit $${params.length}`,
    params,
  );
  return result.rows;
}

export async function getCurrentUnresolvedRelationships(input: {
  limit?: number;
  relationshipType?: string;
} = {}) {
  const limit = Math.min(Math.max(Number(input.limit ?? 40), 1), 200);
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (input.relationshipType?.trim()) {
    params.push(input.relationshipType.trim());
    conditions.push(`u.intended_edge_type = $${params.length}`);
  }
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  params.push(limit);

  const result = await getPool().query(
    `select
       u.declaration_id,u.from_node_id,u.intended_edge_type,u.source_field,u.target_reference,
       u.resolution_state,u.target_match_count,u.evidence_hash,u.metadata,
       f.label as from_label,f.node_type as from_node_type
     from public.v_lighthouse_graph_unresolved_relationships_v1 u
     left join public.v_lighthouse_graph_nodes_v1 f on f.node_id = u.from_node_id
     ${where}
     order by u.resolution_state,u.intended_edge_type,coalesce(f.label,u.from_node_id),u.target_reference
     limit $${params.length}`,
    params,
  );
  return result.rows;
}
