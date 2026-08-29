import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  FRESH_CORPUS_PARSER_VERSION,
  docxStructuredCellsToLines,
  workbookSheetRoute,
} from "./services/fresh-corpus-reconciliation-v1";

describe("authoritative backbone workbook routing", () => {
  it("preserves DOCX table-cell boundaries as typed label/value lines", () => {
    expect(docxStructuredCellsToLines("Example Center\tAddress\t123 Main Street\tPhone\t(555) 555-1212")).toEqual([
      "Example Center",
      "Address: 123 Main Street",
      "Phone: (555) 555-1212",
    ]);
  });

  it.each([
    ["wa_resource_directory", "resource", "resource_directory"],
    ["clean_partial_program", "resource", "resource_directory"],
    ["wa_oversight_body", "oversight_body", "enforcement_intelligence"],
    ["coalition_agency", "agency", "atlas"],
    ["pass3_key_contact", "contact_record", "population_engine"],
    ["address_audit_org", "resource_contact_audit", "resource_directory_review"],
    ["tribal_data_row", "tribal_governance_record", "population_engine"],
    ["advocacy_target", "advocacy_target", "atlas"],
    ["federal_enforcement_pathway", "enforcement_pathway", "prism"],
    ["pattern_registry", "policy_pattern", "kaleidoscope"],
    ["_platform_spec_master", "platform_specification", "platform_control_plane"],
  ])("routes %s without pretending every sheet is a resource", (sheet, candidateType, targetSurface) => {
    expect(workbookSheetRoute(sheet)).toEqual({ candidateType, targetSurface, routingState: "routed" });
  });

  it("preserves unknown sheets for operator review instead of dropping them", () => {
    expect(workbookSheetRoute("new_gold_sheet")).toEqual({
      candidateType: "workbook_record",
      targetSurface: "operator_review",
      routingState: "review_required",
    });
  });

  it("bumps the parser contract for a complete replay", () => {
    expect(FRESH_CORPUS_PARSER_VERSION).toBe("fresh_registry_typed_parser_v1.2.2");
    const source = readFileSync(new URL("./services/fresh-corpus-reconciliation-v1.ts", import.meta.url), "utf8");
    expect(source).toContain("run_id: ctx.runId");
    expect(source).toContain("candidate_hash: candidateHash");
    expect(source).toContain("candidate_key: candidateKey");
  });
});
