import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("./db", () => ({
  getPool: () => ({ query }),
}));

import { buildIntegrationDiagnosticLedger } from "./integration-diagnostic-ledger";

describe("integration diagnostic ledger", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("reports populated substrate and stranded runtime mismatches from the source-controlled fixture", async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes("from public.v_lighthouse_legal_authority_catalog_v2") && sql.includes("legal_total")) {
        return {
          rows: [{
            legal_total: 9,
            legal_catalog_ready: 3,
            legal_stranded: 6,
            resource_total: 4,
            resource_ready: 4,
            resource_stranded: 0,
            workflow_total: 2,
            workflow_ready: 1,
            workflow_stranded: 1,
            case_resource_links: 5,
            signal_case_links: 7,
          }],
        };
      }
      if (sql.includes("public.v_lighthouse_legal_authority_catalog_v2")) return { rows: [{ count: 9 }] };
      if (sql.includes("public.luminari_corpus_candidate_v1")) return { rows: [{ count: 20 }] };
      if (sql.includes("public.legal_statutes")) return { rows: [{ count: 2 }] };
      if (sql.includes("public.legal_case_law")) return { rows: [{ count: 1 }] };
      if (sql.includes("public.v_lighthouse_resource_program_catalog_v2")) return { rows: [{ count: 4 }] };
      if (sql.includes("public.case_resource_links")) return { rows: [{ count: 5 }] };
      if (sql.includes("public.registry_deadline_rules")) return { rows: [{ count: 8 }] };
      if (sql.includes("public.v_lighthouse_workflow_accountability_catalog_v1")) return { rows: [{ count: 2 }] };
      if (sql.includes("public.v_signal_lineage")) return { rows: [{ count: 6 }] };
      if (sql.includes("public.signal_artifact_case_links_v1")) return { rows: [{ count: 7 }] };
      if (sql.includes("public.detected_signals")) return { rows: [{ count: 6 }] };
      if (sql.includes("public.legal_weak_joints")) return { rows: [{ count: 3 }] };
      if (sql.includes("public.legal_contradictions")) return { rows: [{ count: 2 }] };
      if (sql.includes("public.doctrine_graph_edges")) return { rows: [{ count: 1 }] };
      if (sql.includes("public.v_lighthouse_case_attachable_objects_v1")) return { rows: [{ count: 12 }] };
      if (sql.includes("public.v_lighthouse_graph_edges_v2")) return { rows: [{ count: 14 }] };
      return { rows: [{ count: 0 }] };
    });

    const ledger = await buildIntegrationDiagnosticLedger();

    expect(ledger.ledger_id).toBe("integration_diagnostic_ledger_v1");
    expect(ledger.reference_issue).toBe("#383");
    expect(ledger.semantic_layers.map((layer: any) => layer.kind)).toEqual([
      "source_record",
      "observation",
      "candidate",
      "signal",
      "convergence",
      "finding",
    ]);
    expect(ledger.stranded_unpublished_records.legal_authorities).toEqual({
      populated: 9,
      visible: 3,
      stranded: 6,
    });
    expect(ledger.known_surface_mismatches).toContainEqual(
      expect.objectContaining({
        surface: "/legal-library",
        stranded_records: 6,
      }),
    );
  });
});
