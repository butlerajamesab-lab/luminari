import { getPool } from "../db";

const PER_CLASS_LIMIT = 150;
const MAX_NODES = 5000;

const CLASS_TO_WORLD_TYPE: Record<string, "agency" | "program" | "jurisdiction" | "signal" | "workflow"> = {
  agency: "agency",
  organization: "agency",
  oversight_body: "agency",
  legislator: "agency",
  advocacy_target: "agency",
  agency_status: "agency",
  resource: "program",
  program: "program",
  legal_authority: "program",
  workflow: "workflow",
  enforcement_pathway: "workflow",
  oversight_route: "workflow",
  deadline: "workflow",
  case_resolution_pathway: "workflow",
  strategy_path: "workflow",
  policy_alert: "signal",
  policy_pattern: "signal",
  pressure_indicator: "signal",
  jurisdiction_fact: "jurisdiction",
  tribal_governance_record: "jurisdiction",
  jurisdiction_override: "jurisdiction",
};

function mapWorldType(objectClass: string) {
  return CLASS_TO_WORLD_TYPE[objectClass] ?? null;
}

function safeText(value: unknown, fallback = "unknown") {
  const rendered = value == null ? "" : String(value).trim();
  return rendered || fallback;
}

export async function getBoundedWorldIndex() {
  const pool = getPool();
  const supportedClasses = Object.keys(CLASS_TO_WORLD_TYPE);

  const [countsResult, rowsResult] = await Promise.all([
    pool.query(`
      select object_class, count(*)::int as count
      from public.v_lighthouse_civic_object_current_v1
      where typed_ready
      group by object_class
      order by count desc, object_class
    `),
    pool.query(`
      with ranked as (
        select
          civic_object_uid,
          object_ref,
          object_class,
          target_surface,
          current_run_role,
          artifact_role,
          source_locator,
          source_candidate_hash,
          jurisdiction,
          state_code,
          name,
          organization_name,
          category,
          layer,
          phone,
          email,
          website_url,
          address,
          description,
          statutory_authority,
          deadline,
          source_created_at,
          reconciled_at,
          row_number() over (
            partition by object_class
            order by reconciled_at desc nulls last, source_created_at desc nulls last, civic_object_uid
          ) as class_rank
        from public.v_lighthouse_civic_object_current_v1
        where typed_ready
          and object_class = any($1::text[])
      )
      select *
      from ranked
      where class_rank <= $2
      order by object_class, class_rank, civic_object_uid
      limit $3
    `, [supportedClasses, PER_CLASS_LIMIT, MAX_NODES]),
  ]);

  const jurisdictionCodes = new Set<string>();
  for (const row of rowsResult.rows) {
    const jurisdiction = safeText(row.state_code ?? row.jurisdiction, "unknown");
    if (jurisdiction !== "unknown") jurisdictionCodes.add(jurisdiction);
  }

  const jurisdictionNodes = [...jurisdictionCodes].sort().map((code) => ({
    id: `jurisdiction_${code.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
    type: "jurisdiction" as const,
    jurisdiction: code,
    domain: "jurisdiction",
    source_table: "v_lighthouse_civic_object_current_v1",
    source_id: code,
    metadata: {
      name: code,
      abbreviation: code,
      bounded_projection_anchor: true,
    },
  }));

  const nodes = rowsResult.rows.map((row) => {
    const worldType = mapWorldType(String(row.object_class));
    const jurisdiction = safeText(row.state_code ?? row.jurisdiction, "unknown");
    return {
      id: `civic_${safeText(row.civic_object_uid, safeText(row.object_ref))}`,
      type: worldType!,
      jurisdiction,
      domain: safeText(row.category ?? row.object_class, "general"),
      source_table: "v_lighthouse_civic_object_current_v1",
      source_id: safeText(row.object_ref, safeText(row.civic_object_uid)),
      metadata: {
        object_class: row.object_class,
        target_surface: row.target_surface,
        current_run_role: row.current_run_role,
        artifact_role: row.artifact_role,
        source_locator: row.source_locator,
        source_candidate_hash: row.source_candidate_hash,
        name: row.name ?? row.organization_name ?? row.object_class,
        organization_name: row.organization_name,
        category: row.category,
        layer: row.layer,
        phone: row.phone,
        email: row.email,
        website: row.website_url,
        address: row.address,
        description: row.description,
        statutory_authority: row.statutory_authority,
        deadline: row.deadline,
        reconciled_at: row.reconciled_at,
        bounded_projection: true,
      },
    };
  });

  const edges = nodes
    .filter((node) => node.jurisdiction !== "unknown" && node.type !== "jurisdiction")
    .map((node, index) => ({
      id: `bounded_edge_${index + 1}`,
      from: node.id,
      to: `jurisdiction_${node.jurisdiction.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
      type: node.type === "signal"
        ? "signal_link" as const
        : node.type === "agency"
          ? "oversight" as const
          : "program_access" as const,
      metadata: {
        bounded_projection: true,
        source_table: node.source_table,
      },
    }));

  const classCounts = Object.fromEntries(
    countsResult.rows.map((row) => [String(row.object_class), Number(row.count ?? 0)]),
  );
  const totalAvailable = Object.values(classCounts).reduce((sum, value) => sum + Number(value), 0);

  return {
    nodes: [...jurisdictionNodes, ...nodes],
    edges,
    meta: {
      projection: "bounded_current_civic_objects_v1",
      total_available: totalAvailable,
      returned_nodes: jurisdictionNodes.length + nodes.length,
      returned_object_nodes: nodes.length,
      returned_edges: edges.length,
      per_class_limit: PER_CLASS_LIMIT,
      max_nodes: MAX_NODES,
      truncated: totalAvailable > nodes.length,
      class_counts: classCounts,
      note: "The complete civic-object universe remains in Postgres. This endpoint returns a bounded representative page so the web process does not materialize tens of thousands of objects into one Node heap.",
    },
  };
}
