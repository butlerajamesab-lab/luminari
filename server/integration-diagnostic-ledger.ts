import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPool } from "./db";

const FIXTURE_PATH = resolve(process.cwd(), "config/integration-diagnostic-ledger-v1.json");

type LedgerFixture = {
  schema_version: string;
  ledger_id: string;
  reference_issue: string;
  constitutional_boundary: Record<string, string>;
  semantic_layers: Array<{ kind: string; description: string }>;
  source_families: Array<{
    family_key: string;
    label: string;
    canonical_objects: string[];
    relations: Array<{ relation: string; role: string }>;
    runtime_surfaces: Array<{ surface: string; query: string }>;
  }>;
  graph_edges: Array<{ edge_key: string; relation: string; description: string }>;
};

function fixtureFailure(error: string) {
  return {
    schema_version: "1.0.0",
    ledger_id: "integration_diagnostic_ledger_v1",
    reference_issue: "#383",
    constitutional_boundary: {},
    semantic_layers: [],
    source_family_coverage: [],
    graph_edge_coverage: [],
    runtime_projection_coverage: [],
    stranded_unpublished_records: {
      legal_authorities: { populated: 0, visible: 0, stranded: 0 },
      resources: { populated: 0, visible: 0, stranded: 0 },
      workflows: { populated: 0, visible: 0, stranded: 0 },
      case_resource_links: 0,
      signal_case_links: 0,
    },
    known_surface_mismatches: [],
    generated_at: new Date().toISOString(),
    error,
  };
}

function readFixture(): { fixture: LedgerFixture | null; error: string | null } {
  try {
    return {
      fixture: JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as LedgerFixture,
      error: null,
    };
  } catch (error) {
    return {
      fixture: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function countRelation(relation: string) {
  if (!/^public\.[a-z0-9_]+$/i.test(relation)) {
    return {
      relation,
      count: 0,
      available: false,
      error: "Unsupported relation name in integration ledger fixture",
    };
  }
  try {
    const { rows } = await getPool().query(`select count(*)::int as count from ${relation}`);
    return { relation, count: Number(rows[0]?.count ?? 0), available: true };
  } catch (error) {
    return {
      relation,
      count: 0,
      available: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readProjectionSnapshot() {
  try {
    const { rows } = await getPool().query(`
      select
        (select count(*)::int from public.v_lighthouse_legal_authority_catalog_v2 where object_class = 'legal_authority') as legal_total,
        (select count(*)::int from public.v_lighthouse_legal_authority_catalog_v2 where object_class = 'legal_authority' and legal_catalog_ready) as legal_catalog_ready,
        (select count(*)::int from public.v_lighthouse_legal_authority_catalog_v2 where object_class = 'legal_authority' and not legal_catalog_ready) as legal_stranded,
        (select count(*)::int from public.v_lighthouse_resource_program_catalog_v2) as resource_total,
        (select count(*)::int from public.v_lighthouse_resource_program_catalog_v2 where person_facing_ready) as resource_ready,
        (select count(*)::int from public.v_lighthouse_resource_program_catalog_v2 where not person_facing_ready) as resource_stranded,
        (select count(*)::int from public.v_lighthouse_workflow_accountability_catalog_v1) as workflow_total,
        (select count(*)::int from public.v_lighthouse_workflow_accountability_catalog_v1 where workflow_catalog_ready) as workflow_ready,
        (select count(*)::int from public.v_lighthouse_workflow_accountability_catalog_v1 where not workflow_catalog_ready) as workflow_stranded,
        (select count(*)::int from public.case_resource_links where removed_at is null) as case_resource_links,
        (select count(*)::int from public.signal_artifact_case_links_v1) as signal_case_links
    `);
    return rows[0] ?? {};
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildIntegrationDiagnosticLedger() {
  const { fixture, error } = readFixture();
  if (!fixture) {
    return fixtureFailure(`Unable to load integration ledger fixture: ${error ?? "unknown error"}`);
  }
  const familyCoverage = await Promise.all(
    fixture.source_families.map(async (family) => {
      const relations = await Promise.all(
        family.relations.map(({ relation, role }) =>
          countRelation(relation).then((value) => ({ ...value, role })),
        ),
      );
      return {
        family_key: family.family_key,
        label: family.label,
        canonical_objects: family.canonical_objects,
        runtime_surfaces: family.runtime_surfaces,
        relations,
        populated_relations: relations.filter((relation) => relation.count > 0).length,
        canonical_objects_found: relations.reduce((sum, relation) => sum + relation.count, 0),
      };
    }),
  );

  const graphEdgeCoverage = await Promise.all(
    fixture.graph_edges.map(async (edge) => ({
      ...edge,
      ...(await countRelation(edge.relation)),
    })),
  );

  const projection = await readProjectionSnapshot() as Record<string, unknown>;
  const knownMismatches = [] as Array<Record<string, unknown>>;

  if (Number(projection.legal_total ?? 0) > 0 && Number(projection.legal_stranded ?? 0) > 0) {
    knownMismatches.push({
      surface: "/legal-library",
      authoritative_boundary: "public.v_lighthouse_legal_authority_catalog_v2",
      break_contract: "legal_catalog_ready can strand populated current-corpus legal authorities behind an empty runtime surface",
      populated_substrate: Number(projection.legal_total ?? 0),
      visible_projection: Number(projection.legal_catalog_ready ?? 0),
      stranded_records: Number(projection.legal_stranded ?? 0),
    });
  }
  if (Number(projection.resource_total ?? 0) > 0 && Number(projection.resource_stranded ?? 0) > 0) {
    knownMismatches.push({
      surface: "/resources",
      authoritative_boundary: "public.v_lighthouse_resource_program_catalog_v2",
      break_contract: "person_facing_ready can lag the populated current resource/program substrate",
      populated_substrate: Number(projection.resource_total ?? 0),
      visible_projection: Number(projection.resource_ready ?? 0),
      stranded_records: Number(projection.resource_stranded ?? 0),
    });
  }
  if (Number(projection.workflow_total ?? 0) > 0 && Number(projection.workflow_stranded ?? 0) > 0) {
    knownMismatches.push({
      surface: "workflow/accountability readers",
      authoritative_boundary: "public.v_lighthouse_workflow_accountability_catalog_v1",
      break_contract: "workflow_catalog_ready can lag the populated accountability substrate",
      populated_substrate: Number(projection.workflow_total ?? 0),
      visible_projection: Number(projection.workflow_ready ?? 0),
      stranded_records: Number(projection.workflow_stranded ?? 0),
    });
  }

  return {
    ...fixture,
    generated_at: new Date().toISOString(),
    source_family_coverage: familyCoverage,
    graph_edge_coverage: graphEdgeCoverage,
    runtime_projection_coverage: fixture.source_families.flatMap((family) =>
      family.runtime_surfaces.map((surface) => ({
        family_key: family.family_key,
        ...surface,
      })),
    ),
    stranded_unpublished_records: {
      legal_authorities: {
        populated: Number(projection.legal_total ?? 0),
        visible: Number(projection.legal_catalog_ready ?? 0),
        stranded: Number(projection.legal_stranded ?? 0),
      },
      resources: {
        populated: Number(projection.resource_total ?? 0),
        visible: Number(projection.resource_ready ?? 0),
        stranded: Number(projection.resource_stranded ?? 0),
      },
      workflows: {
        populated: Number(projection.workflow_total ?? 0),
        visible: Number(projection.workflow_ready ?? 0),
        stranded: Number(projection.workflow_stranded ?? 0),
      },
      case_resource_links: Number(projection.case_resource_links ?? 0),
      signal_case_links: Number(projection.signal_case_links ?? 0),
    },
    known_surface_mismatches: knownMismatches,
  };
}
