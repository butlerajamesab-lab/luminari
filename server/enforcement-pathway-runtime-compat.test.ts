import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("./db", () => ({
  getPool: () => ({ query }),
}));

import {
  build_enforcement_pathway_dto,
  read_enforcement_pathways,
  type enforcement_pathway_source_rows,
} from "./enforcement-pathway-runtime-compat";

function source_rows(): enforcement_pathway_source_rows {
  return {
    pathways: [{
      id: "corpus:519931a8-a3f3-49fc-b5db-f90c18d62f91",
      pathway_id: "fed_source_001",
      pathway_name: "EEOC",
      jurisdiction: "federal",
      domain: "Charge-Based Model",
      description: "Stored source description",
      metadata: {
        source_pending: true,
        source_file: "source.json",
        source_sha256: "abc123",
        original_record: {
          agency: "EEOC",
          claim_types: ["discrimination_employment"],
          key_deadlines: [{ deadline: "legacy deadline text" }],
          process_steps: [{ actions: ["legacy action text"] }],
          remedies: { penalties: "legacy penalty text" },
          historical_success_rate: "legacy success-rate text",
        },
      },
      source_url: null,
      created_at: "2026-05-15T07:27:56.915Z",
    }],
    agency_forms: [{
      agency: "EEOC Seattle Field Office",
      agency_short: "EEOC",
      pipeline_category: "employment_discrimination",
    }],
  };
}

describe("source-bound enforcement pathway compatibility", () => {
  beforeEach(() => {
    query.mockReset();
  });

  it("maps exact live snake-case rows to a source-text-only DTO", () => {
    const result = build_enforcement_pathway_dto(
      { agency_short: "EEOC" },
      source_rows(),
    );

    expect(result).toMatchObject({
      availability: { status: "source_text_only" },
      matched_by: "agency_short",
      requested: {
        agency_short: "EEOC",
        claim_type: null,
        pipeline_category: null,
      },
      source_contract: "enforcement_model_step_source_references_v2",
      pathways: [{
        pathway_id: "fed_source_001",
        pathway_name: "EEOC",
        agency_short: "EEOC",
        claim_types: ["discrimination_employment"],
        pipeline_categories: ["employment_discrimination"],
        source_state: "source_text_only",
        source_pending: true,
      }],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /key_deadlines|process_steps|remedies|actions|penalties|success_rate|legacy deadline|legacy action|legacy penalty|legacy success/i,
    );
  });

  it("uses exact source tags and returns unavailable instead of a fallback model", () => {
    const claim_result = build_enforcement_pathway_dto(
      { claim_type: "discrimination_employment" },
      source_rows(),
    );
    expect(claim_result.pathways).toHaveLength(1);

    const pipeline_result = build_enforcement_pathway_dto(
      { pipeline_category: "employment_discrimination" },
      source_rows(),
    );
    expect(pipeline_result.pathways).toHaveLength(1);

    const unavailable = build_enforcement_pathway_dto(
      { claim_type: "not_in_the_live_row" },
      source_rows(),
    );
    expect(unavailable).toMatchObject({
      availability: { status: "unavailable" },
      matched_by: "none",
      pathways: [],
    });
  });

  it("scopes jurisdiction before limiting the response window", () => {
    const rows = source_rows();
    const source = rows.pathways[0];
    rows.pathways = [
      ...Array.from({ length: 70 }, (_, i) => ({ ...source, id: `OR-${i}`, jurisdiction: "OR" })),
      { ...source, id: "WA-exact", jurisdiction: "Washington" },
    ];
    const result = build_enforcement_pathway_dto({ agency_short: "EEOC", jurisdiction: "WA" }, rows);
    expect(result.pathways.map(row => row.id)).toEqual(["WA-exact"]);
    expect(build_enforcement_pathway_dto({ jurisdiction: "unresolved" }, rows).pathways).toEqual([]);
  });

  it("accepts the normalized context pipeline filter without requiring legacy camelCase emission", () => {
    const rows = source_rows();
    rows.pathways[0].jurisdiction = "WA";
    const result = build_enforcement_pathway_dto({ jurisdiction: "WA", pipeline_category: "employment_discrimination" }, rows);
    expect(result.pathways.map(row => row.id)).toEqual(["corpus:519931a8-a3f3-49fc-b5db-f90c18d62f91"]);
    expect(build_enforcement_pathway_dto({ jurisdiction: "WA", pipeline_category: "unmatched" }, rows).pathways).toEqual([]);
  });

  it("does not infer an agency short from a pathway-name prefix", () => {
    const rows = source_rows();
    rows.pathways[0] = {
      ...rows.pathways[0],
      pathway_name: "HUD - Office of Fair Housing",
      metadata: {
        original_record: { agency: "HUD - Office of Fair Housing" },
      },
    };
    rows.agency_forms[0] = {
      agency: "HUD Fair Housing (Discrimination)",
      agency_short: "HUD",
      pipeline_category: "housing_violation",
    };

    const all = build_enforcement_pathway_dto({}, rows);
    expect(all.pathways[0].agency_short).toBeNull();
    expect(all.pathways[0].pipeline_categories).toEqual([]);

    const filtered = build_enforcement_pathway_dto({ agency_short: "HUD" }, rows);
    expect(filtered.availability.status).toBe("unavailable");
    expect(filtered.pathways).toEqual([]);
  });

  it("bounds the returned payload while preserving total current-corpus count", () => {
    const rows = source_rows();
    rows.pathways = Array.from({ length: 250 }, (_, index) => ({
      ...rows.pathways[0],
      id: `corpus:${index}`,
      pathway_id: `path-${index}`,
      pathway_name: `Path ${index}`,
    }));
    const all = build_enforcement_pathway_dto({}, rows);
    expect(all.total_source_rows).toBe(250);
    expect(all.matched_source_rows).toBe(250);
    expect(all.returned_source_rows).toBe(200);
    expect(all.pathways).toHaveLength(200);
  });

  it("takes one pool snapshot from current reconciled civic objects and exact candidate payloads", async () => {
    const source = source_rows();
    query.mockResolvedValueOnce({
      rows: [{ pathways: source.pathways, agency_forms: source.agency_forms }],
    });

    const result = await read_enforcement_pathways({ claim_type: "discrimination_employment" });

    expect(result.pathways).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("from public.v_lighthouse_civic_object_current_v1");
    expect(sql).toContain("object_class = 'enforcement_pathway'");
    expect(sql).toContain("public.luminari_corpus_candidate_v1");
    expect(sql).toContain("p.candidate_hash = c.source_candidate_hash");
    expect(sql).toContain("p.artifact_key = c.artifact_key");
    expect(sql).toContain("from public.agency_forms");
    expect(sql).toContain("from public.enforcement_pathway_models");
    expect(sql).not.toMatch(/\b(?:insert|update|delete|alter|create)\b/i);
  });

  it("keeps Colorado visible with its existing identity and no invented sequence", () => {
    const model_references = JSON.parse(readFileSync(new URL("./fixtures/enforcement-pathway-reviewed-parents.json", import.meta.url), "utf8"));
    const result = build_enforcement_pathway_dto({ jurisdiction: "CO", pathway_id: "state_wage_co" }, {
      pathways: [], agency_forms: [], model_references,
    });
    expect(result.pathways).toHaveLength(1);
    expect(result.pathways[0]).toMatchObject({
      id: "e27c8480-7ef3-4bc2-a9a0-75be3cf29198", pathway_id: "state_wage_co",
      agency_name: "Colorado Department of Labor and Employment", jurisdiction: "Colorado",
      record_kind: "model", source_identity_status: "reviewed_content_match",
      source_state: "source_text_only", source_pending: true, steps: [],
      source_locator: "json:$.state_labor_board_pathways.wage_theft.colorado",
      source_sha256: "900f6f9934285346f360da45de862a1a1a1388ec3b30374601ef924b571d102f",
    });
    expect(JSON.stringify(result)).not.toMatch(/3 years|35%|72%|statute_of_limitations|remedies|success_rate/);
    expect(build_enforcement_pathway_dto({ jurisdiction: "WA", pathway_id: "state_wage_co" }, {
      pathways: [], agency_forms: [], model_references,
    }).pathways).toEqual([]);
  });

  function reviewed_model_rows(): enforcement_pathway_source_rows {
    const model_references = JSON.parse(readFileSync(new URL("./fixtures/enforcement-pathway-reviewed-parents.json", import.meta.url), "utf8"));
    const model = model_references.find((row: any) => row.pathway_id === "fed_dol_001");
    return {
      model_references,
      agency_forms: [],
      pathways: model.metadata.original_record.process_steps.map((step: any, index: number) => ({
        id: `corpus:step-${index}`, pathway_id: `step-${index}`, pathway_name: step.name,
        metadata: {
          source_file: "Everything backbone related/enforcement_pathway_models_complete(1).json",
          source_sha256: "900f6f9934285346f360da45de862a1a1a1388ec3b30374601ef924b571d102f",
          source_locator: `json:$.federal_pathways.dol_wage_hour_model.process_steps[${index}]`,
          original_record: step,
        },
      })),
    };
  }

  it("binds ordered child identities only after the full reviewed parent and child content match", () => {
    const result = build_enforcement_pathway_dto({ pathway_id: "step-1" }, reviewed_model_rows());
    expect(result.pathways).toHaveLength(1);
    expect(result.pathways[0].pathway_id).toBe("fed_dol_001");
    expect(result.pathways[0].claim_types).toContain("wage_theft");
    expect(result.pathways[0].steps.map(step => [step.source_order, step.civic_object_uid])).toEqual([
      [1, "corpus:step-0"], [2, "corpus:step-1"], [3, "corpus:step-2"],
    ]);
    expect(result.unlinked_step_count).toBe(0);
    expect(result.linked_step_count).toBe(3);
    expect(JSON.stringify(result)).not.toMatch(/key_deadlines|timeline|historical_success_rate|actions/);
  });

  it.each(["source_sha256", "source_file", "source_locator", "original_record"])(
    "keeps a changed %s child separate instead of silently merging source versions", field => {
      const rows = reviewed_model_rows();
      (rows.pathways[0].metadata as any)[field] = field === "original_record" ? { name: "Different step" } : "different";
      const result = build_enforcement_pathway_dto({}, rows);
      expect(result.pathways.some(row => row.id === "corpus:step-0")).toBe(true);
      expect(result.linked_step_count).toBe(2);
    },
  );

  it("keeps a changed parent or duplicate candidate unlinked and rejects container pseudo-models", () => {
    const rows = reviewed_model_rows();
    const model = rows.model_references!.find(row => row.pathway_id === "fed_dol_001")!;
    (model.metadata as any).original_record.agency = "Changed agency";
    rows.model_references!.push({ id: "container", pathway_id: "wage_theft", metadata: { original_record: { colorado: {} } } });
    const result = build_enforcement_pathway_dto({}, rows);
    expect(result.model_count).toBe(2);
    expect(result.unlinked_step_count).toBe(3);
    expect(result.linked_step_count).toBe(0);
    expect(result.pathways.find(row => row.pathway_id === "fed_dol_001")?.source_sha256).toBeNull();
    const duplicate = reviewed_model_rows();
    duplicate.pathways.push({ ...duplicate.pathways[0], id: "corpus:duplicate" });
    expect(build_enforcement_pathway_dto({}, duplicate).unlinked_step_count).toBe(2);
  });

  it("requires every filter and supports full agency names without inventing abbreviations", () => {
    const rows = reviewed_model_rows();
    const agency_name = "Colorado Department of Labor and Employment";
    expect(build_enforcement_pathway_dto({ agency_name, jurisdiction: "CO" }, rows).pathways).toHaveLength(1);
    expect(build_enforcement_pathway_dto({ agency_name, jurisdiction: "WA" }, rows).pathways).toHaveLength(0);
    expect(build_enforcement_pathway_dto({ agency_name, claim_type: "wage_theft" }, rows).pathways).toHaveLength(0);
    expect(build_enforcement_pathway_dto({ jurisdiction: "federal" }, rows).pathways).toHaveLength(1);
  });

  it("wires the active route and UI to snake filters without operational claims", () => {
    const router_source = readFileSync(
      fileURLToPath(new URL("./routers/enforcement-intelligence.ts", import.meta.url)),
      "utf8",
    );
    const route = router_source.slice(
      router_source.indexOf("get_enforcement_pathway:"),
      router_source.indexOf("// ═══ All model references"),
    );
    const ui_source = readFileSync(
      fileURLToPath(new URL("../client/src/pages/EnforcementPathway.tsx", import.meta.url)),
      "utf8",
    );

    expect(route).toContain("agency_short:");
    expect(route).toContain("claim_type:");
    expect(route).toContain("pipeline_category:");
    expect(route).toContain("read_enforcement_pathways");
    expect(route).toContain("jurisdiction:");
    expect(route).not.toContain("pathwayModels");

    expect(ui_source).toContain("availability.status");
    expect(ui_source).toMatch(/source text only/i);
    expect(ui_source).not.toContain("CommitToCase");
    expect(ui_source).not.toMatch(/successRate|keyDeadlines|typicalOutcomes|userAction|typicalDuration/);
    expect(ui_source).not.toMatch(/\[(?:"EEOC"|"HUD"|"OSHA"|"FTC")/);
  });
});
