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
  type EnforcementPathwaySourceRows,
} from "./enforcement-pathway-runtime-compat";

function source_rows(): EnforcementPathwaySourceRows {
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
    agencyForms: [{
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

  it("maps exact live snake-case rows to a camel source-text-only DTO", () => {
    const result = build_enforcement_pathway_dto(
      { agencyShort: "EEOC" },
      source_rows(),
    );

    expect(result).toMatchObject({
      availability: { status: "source_text_only" },
      matchedBy: "agencyShort",
      requested: {
        agencyShort: "EEOC",
        claimType: null,
        pipelineCategory: null,
      },
      sourceContract: "current_civic_object_enforcement_pathways_v1",
      pathways: [{
        pathwayId: "fed_source_001",
        pathwayName: "EEOC",
        agencyShort: "EEOC",
        claimTypes: ["discrimination_employment"],
        pipelineCategories: ["employment_discrimination"],
        sourceState: "source_text_only",
        sourcePending: true,
      }],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /key_deadlines|process_steps|remedies|actions|penalties|success_rate|legacy deadline|legacy action|legacy penalty|legacy success/i,
    );
  });

  it("uses exact source tags and returns unavailable instead of a fallback model", () => {
    const claimResult = build_enforcement_pathway_dto(
      { claimType: "discrimination_employment" },
      source_rows(),
    );
    expect(claimResult.pathways).toHaveLength(1);

    const pipelineResult = build_enforcement_pathway_dto(
      { pipelineCategory: "employment_discrimination" },
      source_rows(),
    );
    expect(pipelineResult.pathways).toHaveLength(1);

    const unavailable = build_enforcement_pathway_dto(
      { claimType: "not_in_the_live_row" },
      source_rows(),
    );
    expect(unavailable).toMatchObject({
      availability: { status: "unavailable" },
      matchedBy: "none",
      pathways: [],
    });
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
    rows.agencyForms[0] = {
      agency: "HUD Fair Housing (Discrimination)",
      agency_short: "HUD",
      pipeline_category: "housing_violation",
    };

    const all = build_enforcement_pathway_dto({}, rows);
    expect(all.pathways[0].agencyShort).toBeNull();
    expect(all.pathways[0].pipelineCategories).toEqual([]);

    const filtered = build_enforcement_pathway_dto({ agencyShort: "HUD" }, rows);
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
    expect(all.totalSourceRows).toBe(250);
    expect(all.matchedSourceRows).toBe(250);
    expect(all.returnedSourceRows).toBe(200);
    expect(all.pathways).toHaveLength(200);
  });

  it("takes one pool snapshot from current reconciled civic objects and exact candidate payloads", async () => {
    const source = source_rows();
    query.mockResolvedValueOnce({
      rows: [{ pathways: source.pathways, agency_forms: source.agencyForms }],
    });

    const result = await read_enforcement_pathways({ claimType: "discrimination_employment" });

    expect(result.pathways).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("from public.v_lighthouse_civic_object_current_v1");
    expect(sql).toContain("object_class = 'enforcement_pathway'");
    expect(sql).toContain("public.luminari_corpus_candidate_v1");
    expect(sql).toContain("p.candidate_hash = c.source_candidate_hash");
    expect(sql).toContain("p.artifact_key = c.artifact_key");
    expect(sql).toContain("from public.agency_forms");
    expect(sql).not.toContain("from public.enforcement_pathway_models");
    expect(sql).not.toMatch(/\b(?:insert|update|delete|alter|create)\b/i);
  });

  it("wires the active route and UI to camel filters without operational claims", () => {
    const routerSource = readFileSync(
      fileURLToPath(new URL("./routers/enforcement-intelligence.ts", import.meta.url)),
      "utf8",
    );
    const route = routerSource.slice(
      routerSource.indexOf("getEnforcementPathway:"),
      routerSource.indexOf("// ═══ List ALL enforcement pathway"),
    );
    const uiSource = readFileSync(
      fileURLToPath(new URL("../client/src/pages/EnforcementPathway.tsx", import.meta.url)),
      "utf8",
    );

    expect(route).toContain("agencyShort:");
    expect(route).toContain("claimType:");
    expect(route).toContain("pipelineCategory:");
    expect(route).toContain("read_enforcement_pathways");
    expect(route).not.toContain("agency_short");
    expect(route).not.toContain("pathwayModels");

    expect(uiSource).toContain("availability.status");
    expect(uiSource).toMatch(/source text only/i);
    expect(uiSource).not.toContain("CommitToCase");
    expect(uiSource).not.toMatch(/successRate|keyDeadlines|typicalOutcomes|userAction|typicalDuration/);
    expect(uiSource).not.toMatch(/\[(?:"EEOC"|"HUD"|"OSHA"|"FTC")/);
  });
});