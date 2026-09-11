import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPool as get_pool } from "./db";
import { getRuntimeLegalLibraryStats as get_runtime_legal_library_stats } from "./legal-library-runtime-db";
import { read_availability, type read_availability_result } from "./read-availability";

const FIXTURE_PATH = resolve(process.cwd(), "config/integration-diagnostic-ledger-v1.json");
type ledger_fixture = {
  schema_version: string; ledger_id: string; reference_issue: string;
  constitutional_boundary: Record<string, string>;
  semantic_layers: Array<{ kind: string; description: string }>;
  source_families: Array<{ family_key: string; label: string; canonical_objects: string[];
    relations: Array<{ relation: string; role: string }>;
    runtime_surfaces: Array<{ surface: string; query: string }> }>;
  graph_edges: Array<{ edge_key: string; relation: string; description: string }>;
};

type projection_read = {
  visible: number | null; populated: number | null; catalog_ready: number | null; stranded: number | null;
  availability: read_availability_result;
};

function unknown_projection(error: unknown): projection_read {
  return { visible: null, populated: null, catalog_ready: null, stranded: null, availability: read_availability(null, error) };
}

async function count_relation(relation: string, active_only = false) {
  try {
    if (!/^public\.[a-z0-9_]+$/.test(relation)) throw new Error("Unsupported relation name in integration ledger fixture");
    const { rows } = await get_pool().query(`select count(*)::int as count from ${relation}${active_only ? " where removed_at is null" : ""}`);
    const count = measured_count(rows[0]?.count);
    return { relation, count, available: true, ...read_availability(count) };
  } catch (error) {
    return { relation, count: null, available: false, ...read_availability(null, error) };
  }
}

function measured_count(value: unknown): number {
  if (value === null || value === undefined || value === "") throw new Error("Count was not returned by the database");
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid database count");
  return count;
}

async function read_projection(relation: string, readiness: string, predicate = "true"): Promise<projection_read> {
  try {
    // Identifiers come only from the three fixed calls below.
    const { rows } = await get_pool().query(`select count(*)::int as populated,
      count(*) filter (where ${readiness})::int as catalog_ready,
      count(*) filter (where ${readiness} is not true)::int as stranded
      from ${relation} where ${predicate}`);
    const row = rows[0];
    const populated = measured_count(row?.populated);
    return { visible: null, populated, catalog_ready: measured_count(row?.catalog_ready), stranded: measured_count(row?.stranded),
      availability: read_availability(populated) };
  } catch (error) { return unknown_projection(error); }
}

export async function build_integration_diagnostic_ledger() {
  let fixture: ledger_fixture;
  try {
    fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ledger_fixture;
    if (!Array.isArray(fixture.source_families) || !Array.isArray(fixture.graph_edges)) throw new Error("Invalid integration ledger fixture");
  } catch (error) {
    return {
      schema_version: "1.0.0", ledger_id: "integration_diagnostic_ledger_v1", reference_issue: "#383",
      source_family_coverage: [], graph_edge_coverage: [], runtime_projection_coverage: [],
      semantic_layers: [], known_surface_mismatches: [],
      legal_runtime_measurement: { count: null, availability: read_availability(null, error), source: "getRuntimeLegalLibraryStats" },
      link_availability: { case_resource_links: read_availability(null, error), signal_case_links: read_availability(null, error) },
      stranded_unpublished_records: {
        legal_authorities: unknown_projection(error), resources: unknown_projection(error), workflows: unknown_projection(error),
        case_resource_links: null, signal_case_links: null,
      },
      availability: read_availability(null, error), generated_at: new Date().toISOString(),
    };
  }
  const source_family_coverage = await Promise.all(fixture.source_families.map(async family => {
    const relations = await Promise.all(family.relations.map(async ({ relation, role }) => ({ ...await count_relation(relation), role })));
    const complete = relations.every(relation => relation.available);
    return { ...family, relations,
      populated_relations: complete ? relations.filter(relation => relation.count! > 0).length : null,
      relation_row_total: complete ? relations.reduce((sum, relation) => sum + relation.count!, 0) : null,
      measurement_complete: complete,
    };
  }));
  const graph_edge_coverage = await Promise.all(fixture.graph_edges.map(async edge => ({ ...edge, ...await count_relation(edge.relation) })));
  const [legal, resources, workflows, case_links, signal_links] = await Promise.all([
    read_projection("public.v_lighthouse_legal_authority_catalog_v2", "legal_catalog_ready", "object_class = 'legal_authority'"),
    read_projection("public.v_lighthouse_resource_program_catalog_v2", "person_facing_ready"),
    read_projection("public.v_lighthouse_workflow_accountability_catalog_v1", "workflow_catalog_ready"),
    count_relation("public.case_resource_links", true), count_relation("public.signal_artifact_case_links_v1"),
  ]);
  let runtime_count: number | null = null;
  let runtime_availability: read_availability_result;
  try {
    const stats = await get_runtime_legal_library_stats();
    runtime_count = measured_count(stats.currentCorpusLegalAuthorities);
    runtime_availability = read_availability(runtime_count);
  } catch (error) { runtime_availability = read_availability(null, error); }
  const known_surface_mismatches: Array<Record<string, unknown>> = [];
  if (legal.populated !== null && legal.populated > 0 && runtime_count === 0) {
    known_surface_mismatches.push({ surface: "/legal-library", authoritative_boundary: "public.v_lighthouse_legal_authority_catalog_v2",
      populated_substrate: legal.populated, visible_projection: runtime_count,
      break_contract: "populated legal substrate returned no current-corpus authorities through the runtime reader" });
  }
  return {
    ...fixture, generated_at: new Date().toISOString(), source_family_coverage, graph_edge_coverage,
    runtime_projection_coverage: fixture.source_families.flatMap(family => family.runtime_surfaces.map(surface => ({
      family_key: family.family_key, ...surface, measurement_state: "not_measured", runtime_count: null,
    }))),
    legal_runtime_measurement: { count: runtime_count, availability: runtime_availability, source: "getRuntimeLegalLibraryStats" },
    stranded_unpublished_records: {
      legal_authorities: { ...legal, visible: runtime_count },
      resources: { ...resources, visible: null }, workflows: { ...workflows, visible: null },
      case_resource_links: case_links.count, signal_case_links: signal_links.count,
    },
    link_availability: { case_resource_links: case_links, signal_case_links: signal_links },
    known_surface_mismatches,
  };
}
