import { query_with_diagnostics } from "../db";

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

const CANONICAL_CORE_QUERY_TIMEOUT_MS = 7_000;
const CANONICAL_CORE_POOL_ACQUIRE_TIMEOUT_MS = 1_000;
let current_canonical_state_in_flight: Promise<CurrentCanonicalState> | null =
  null;
const CANONICAL_SAMPLE_CACHE_TTL_MS = 60_000;
const canonical_sample_cache = new Map<
  string,
  { expires_at: number; rows: unknown[] }
>();
const canonical_sample_in_flight = new Map<string, Promise<unknown[]>>();

async function cached_canonical_sample<T>(
  key: string,
  loader: () => Promise<T[]>,
): Promise<T[]> {
  const now = Date.now();
  const cached = canonical_sample_cache.get(key);
  if (cached && cached.expires_at > now) return cached.rows as T[];

  const in_flight = canonical_sample_in_flight.get(key);
  if (in_flight) return in_flight as Promise<T[]>;

  const active_request = loader() as Promise<unknown[]>;
  canonical_sample_in_flight.set(key, active_request);
  try {
    const rows = await active_request;
    canonical_sample_cache.set(key, {
      rows,
      expires_at: Date.now() + CANONICAL_SAMPLE_CACHE_TTL_MS,
    });
    return rows as T[];
  } finally {
    if (canonical_sample_in_flight.get(key) === active_request) {
      canonical_sample_in_flight.delete(key);
    }
  }
}

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function load_current_canonical_state(): Promise<CurrentCanonicalState> {
  const result = await query_with_diagnostics<{ state: CurrentCanonicalState }>(
    `select public.get_lighthouse_canonical_state_v2() as state`,
    [],
    {
      label: "canonical_core_current_state",
      pool_acquire_timeout_ms: CANONICAL_CORE_POOL_ACQUIRE_TIMEOUT_MS,
      query_timeout_ms: CANONICAL_CORE_QUERY_TIMEOUT_MS,
    },
  );
  return (result.rows[0]?.state ?? {}) as CurrentCanonicalState;
}

export async function getCurrentCanonicalState(): Promise<CurrentCanonicalState> {
  if (current_canonical_state_in_flight)
    return current_canonical_state_in_flight;

  const active_request = load_current_canonical_state();
  current_canonical_state_in_flight = active_request;
  try {
    return await active_request;
  } finally {
    if (current_canonical_state_in_flight === active_request) {
      current_canonical_state_in_flight = null;
    }
  }
}

function categoryForNodeType(nodeType: string): string {
  if (
    [
      "resource",
      "program",
      "contact_record",
      "organization",
      "tribal_governance_record",
      "jurisdiction",
      "jurisdiction_fact",
    ].includes(nodeType)
  )
    return "registry";
  if (["legal_authority", "unresolved_legal_reference"].includes(nodeType))
    return "legal";
  if (
    [
      "agency",
      "agency_status",
      "oversight_body",
      "oversight_route",
      "enforcement_pathway",
      "deadline",
      "workflow",
    ].includes(nodeType)
  )
    return "governance";
  if (
    ["policy_alert", "policy_pattern", "pressure_indicator"].includes(nodeType)
  )
    return "signals";
  if (
    [
      "case_instance",
      "case_evidence",
      "case_finding",
      "case_resolution_pathway",
    ].includes(nodeType)
  )
    return "cases";
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
    {
      table: "source_artifacts",
      category: "substrate",
      count: n(state.source_artifacts),
    },
    {
      table: "candidate_records",
      category: "substrate",
      count: n(state.candidate_records),
    },
    {
      table: "current_civic_objects",
      category: "substrate",
      count: n(state.current_civic_objects),
    },
    {
      table: "structural_graph_edges",
      category: "graph",
      count: n(state.structural_graph_edges),
    },
    {
      table: "semantic_graph_edges",
      category: "graph",
      count: n(state.semantic_graph_edges),
    },
    {
      table: "unresolved_relationships",
      category: "graph",
      count: n(state.unresolved_relationships),
    },
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

export async function getCurrentGraphNodes(
  input: { limit?: number; nodeType?: string } = {},
) {
  const limit = Math.min(Math.max(Number(input.limit ?? 20), 1), 200);
  const nodeType = input.nodeType?.trim() || null;
  const cacheKey = `nodes:${nodeType ?? "civic_object"}:${limit}`;

  return cached_canonical_sample(cacheKey, async () => {
    // Derived anchor types remain available for explicit compatibility calls.
    // The default Mission Control sample reads civic objects directly instead
    // of materializing and sorting the full object + artifact + jurisdiction
    // graph union before applying a sixteen-row limit.
    if (nodeType === "jurisdiction" || nodeType === "source_artifact") {
      const result = await query_with_diagnostics(
        `select node_id,node_type,label,jurisdiction_code,node_origin,node_state,object_ref,artifact_key,source_locator,source_content_sha256,source_candidate_hash,metadata
           from public.v_lighthouse_graph_nodes_v1
          where node_type=$1
          order by label,node_id
          limit $2`,
        [nodeType, limit],
        {
          label: "canonical_core_graph_anchor_nodes",
          pool_acquire_timeout_ms: CANONICAL_CORE_POOL_ACQUIRE_TIMEOUT_MS,
          query_timeout_ms: CANONICAL_CORE_QUERY_TIMEOUT_MS,
        },
      );
      return result.rows;
    }

    const params: unknown[] = [];
    const conditions: string[] = [];
    if (nodeType) {
      params.push(nodeType);
      conditions.push(`object_class=$${params.length}`);
    }
    params.push(limit);
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const result = await query_with_diagnostics(
      `with limited_objects as materialized (
         select *
           from public.v_lighthouse_civic_object_current_v1
           ${where}
          order by reconciled_at desc nulls last,civic_object_uid
          limit $${params.length}
       )
       select
         'object:' || civic_object_uid as node_id,
         object_class as node_type,
         coalesce(nullif(name,''),nullif(organization_name,''),object_class || ' ' || left(object_ref,16)) as label,
         coalesce(nullif(state_code,''),nullif(jurisdiction,'')) as jurisdiction_code,
         'civic_object'::text as node_origin,
         case when typed_ready then 'ready' else 'held' end as node_state,
         object_ref,artifact_key,source_locator,source_content_sha256,source_candidate_hash,
         jsonb_build_object(
           'target_surface',target_surface,
           'category',category,
           'section_name',section_name,
           'parser_version',parser_version,
           'current_run_role',current_run_role,
           'data_state',data_state,
           'typed_ready',typed_ready,
           'jurisdiction_ready',jurisdiction_ready,
           'direct_access_ready',direct_access_ready,
           'field_provenance',coalesce(field_provenance,'{}'::jsonb)
         ) as metadata
         from limited_objects
        order by reconciled_at desc nulls last,civic_object_uid`,
      params,
      {
        label: "canonical_core_graph_nodes",
        pool_acquire_timeout_ms: CANONICAL_CORE_POOL_ACQUIRE_TIMEOUT_MS,
        query_timeout_ms: CANONICAL_CORE_QUERY_TIMEOUT_MS,
      },
    );
    return result.rows;
  });
}

export async function getCurrentGraphEdges(
  input: {
    limit?: number;
    edgeType?: string;
    nodeId?: string;
    semanticOnly?: boolean;
  } = {},
) {
  const limit = Math.min(Math.max(Number(input.limit ?? 40), 1), 200);
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (input.edgeType?.trim()) {
    params.push(input.edgeType.trim());
    conditions.push(`e.edge_type = $${params.length}`);
  }
  if (input.nodeId?.trim()) {
    params.push(input.nodeId.trim());
    conditions.push(
      `(e.from_node_id = $${params.length} or e.to_node_id = $${params.length})`,
    );
  }

  const sourceView = input.semanticOnly
    ? "public.v_lighthouse_graph_relationship_edges_v1"
    : "public.v_lighthouse_graph_edges_v2";
  const where =
    conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  params.push(limit);

  const cacheKey = `edges:${sourceView}:${input.edgeType ?? ""}:${input.nodeId ?? ""}:${limit}`;
  return cached_canonical_sample(cacheKey, async () => {
    const result = await query_with_diagnostics(
      `with limited_edges as materialized (
         select e.edge_id,e.from_node_id,e.to_node_id,e.edge_type,e.evidence_state,e.evidence_hash,e.metadata
           from ${sourceView} e
           ${where}
          order by e.edge_type,e.edge_id
          limit $${params.length}
       ), needed_node_ids as materialized (
         select from_node_id as node_id from limited_edges
         union
         select to_node_id from limited_edges
       ), needed_nodes as materialized (
         select
           'object:' || civic_object_uid as node_id,
           coalesce(nullif(name,''),nullif(organization_name,''),object_class || ' ' || left(object_ref,16)) as label,
           object_class as node_type
           from public.v_lighthouse_civic_object_current_v1
          where 'object:' || civic_object_uid in (select node_id from needed_node_ids)
         union all
         select node_id,substring(node_id from length('jurisdiction:') + 1),'jurisdiction'
           from needed_node_ids
          where node_id like 'jurisdiction:%'
         union all
         select 'artifact:' || md5(a.artifact_key),coalesce(nullif(a.object_name,''),a.artifact_key),'source_artifact'
           from public.luminari_corpus_source_artifact_v1 a
          where 'artifact:' || md5(a.artifact_key) in (select node_id from needed_node_ids)
       )
       select
         e.edge_id,e.from_node_id,e.to_node_id,e.edge_type,e.evidence_state,e.evidence_hash,e.metadata,
         f.label as from_label,f.node_type as from_node_type,
         t.label as to_label,t.node_type as to_node_type
         from limited_edges e
         left join needed_nodes f on f.node_id=e.from_node_id
         left join needed_nodes t on t.node_id=e.to_node_id
        order by e.edge_type,coalesce(f.label,e.from_node_id),coalesce(t.label,e.to_node_id),e.edge_id`,
      params,
      {
        label: "canonical_core_graph_edges",
        pool_acquire_timeout_ms: CANONICAL_CORE_POOL_ACQUIRE_TIMEOUT_MS,
        query_timeout_ms: CANONICAL_CORE_QUERY_TIMEOUT_MS,
      },
    );
    return result.rows;
  });
}

export async function getCurrentUnresolvedRelationships(
  input: {
    limit?: number;
    relationshipType?: string;
  } = {},
) {
  const limit = Math.min(Math.max(Number(input.limit ?? 40), 1), 200);
  const params: unknown[] = [];
  const conditions: string[] = [];
  if (input.relationshipType?.trim()) {
    params.push(input.relationshipType.trim());
    conditions.push(`u.intended_edge_type = $${params.length}`);
  }
  const where =
    conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  params.push(limit);

  const cacheKey = `unresolved:${input.relationshipType ?? ""}:${limit}`;
  return cached_canonical_sample(cacheKey, async () => {
    const result = await query_with_diagnostics(
      `with limited_unresolved as materialized (
         select u.declaration_id,u.from_node_id,u.intended_edge_type,u.source_field,u.target_reference,
                u.resolution_state,u.target_match_count,u.evidence_hash,u.metadata
           from public.v_lighthouse_graph_unresolved_relationships_v1 u
           ${where}
          order by u.resolution_state,u.intended_edge_type,u.declaration_id
          limit $${params.length}
       ), needed_nodes as materialized (
         select
           'object:' || civic_object_uid as node_id,
           coalesce(nullif(name,''),nullif(organization_name,''),object_class || ' ' || left(object_ref,16)) as label,
           object_class as node_type
           from public.v_lighthouse_civic_object_current_v1
          where 'object:' || civic_object_uid in (select from_node_id from limited_unresolved)
       )
       select
         u.declaration_id,u.from_node_id,u.intended_edge_type,u.source_field,u.target_reference,
         u.resolution_state,u.target_match_count,u.evidence_hash,u.metadata,
         f.label as from_label,f.node_type as from_node_type
         from limited_unresolved u
         left join needed_nodes f on f.node_id=u.from_node_id
        order by u.resolution_state,u.intended_edge_type,coalesce(f.label,u.from_node_id),u.target_reference`,
      params,
      {
        label: "canonical_core_unresolved_relationships",
        pool_acquire_timeout_ms: CANONICAL_CORE_POOL_ACQUIRE_TIMEOUT_MS,
        query_timeout_ms: CANONICAL_CORE_QUERY_TIMEOUT_MS,
      },
    );
    return result.rows;
  });
}
