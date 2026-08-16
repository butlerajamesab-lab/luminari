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
    `select public.get_lighthouse_canonical_state_v1() as state`,
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
    { table: "derived_graph_edges", category: "graph", count: n(state.graph_edges) },
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
