import { describe, expect, it } from "vitest";
import {
  US_STATES,
  US_TERRITORIES,
  buildCoverageMatrix,
  detectJurisdictionFromText,
  hasOverlappingJurisdiction,
  paginateCompleteExport,
  type JurisdictionAwareRecord,
} from "./jurisdiction-substrate";

describe("nationwide jurisdiction substrate", () => {
  it("keeps all states, DC, and minimum territories in first-class coverage rows", () => {
    const matrix = buildCoverageMatrix([]);

    expect(US_STATES).toHaveLength(50);
    expect(US_TERRITORIES.map((territory) => territory.code)).toEqual(["PR", "GU", "VI", "AS", "MP"]);
    expect(matrix.filter((row) => row.reportKind === "fifty_state_coverage_matrix")).toHaveLength(50);
    expect(matrix.some((row) => row.reportKind === "district_of_columbia_coverage_report" && row.jurisdictionCode === "DC")).toBe(true);
    expect(matrix.filter((row) => row.reportKind === "territory_coverage_matrix")).toHaveLength(5);
    expect(matrix.every((row) => row.coverageState === "known_gap")).toBe(true);
  });

  it("preserves tribal jurisdiction as tribal instead of flattening it into state or federal", () => {
    const detected = detectJurisdictionFromText("Navajo Nation ICWA child welfare matter overlapping Arizona state court and BIA services");

    expect(detected.jurisdictionType).toBe("tribal");
    expect(detected.jurisdictionNotes).toContain("not as generic state/federal");
  });

  it("supports overlapping jurisdiction links and reports pipeline/domain/runtime coverage", () => {
    const record: JurisdictionAwareRecord = {
      recordId: "rec-1",
      pipelineContext: "candidate",
      domain: "child_welfare",
      runtimeSurface: "benefits_navigator",
      jurisdiction: { jurisdiction: "Mixed", jurisdictionType: "mixed", jurisdictionCode: "MIXED" },
      jurisdictions: [
        { relation: "primary", jurisdiction: "Navajo Nation", jurisdictionType: "tribal", tribalNation: "Navajo Nation" },
        { relation: "overlap", jurisdiction: "Arizona", jurisdictionType: "state", stateCode: "AZ" },
        { relation: "administered_by", jurisdiction: "United States", jurisdictionType: "federal", jurisdictionCode: "US" },
      ],
    };

    const matrix = buildCoverageMatrix([record]);

    expect(hasOverlappingJurisdiction(record)).toBe(true);
    expect(matrix.some((row) => row.reportKind === "tribal_jurisdiction_coverage_report" && row.coverageState === "candidate_only")).toBe(true);
    expect(matrix.some((row) => row.reportKind === "domain_by_jurisdiction_coverage_matrix" && row.domain === "child_welfare")).toBe(true);
    expect(matrix.some((row) => row.reportKind === "runtime_surface_by_jurisdiction_coverage_matrix" && row.runtimeSurface === "benefits_navigator")).toBe(true);
    expect(matrix.some((row) => row.reportKind === "pipeline_context_by_jurisdiction_coverage_matrix" && row.pipelineContext === "candidate")).toBe(true);
  });

  it("paginates complete exports without using a top-N system boundary", () => {
    const records = Array.from({ length: 2505 }, (_, index) => index);
    const first = paginateCompleteExport(records, 0, 1000);
    const second = paginateCompleteExport(records, first.nextCursor ?? 0, 1000);
    const third = paginateCompleteExport(records, second.nextCursor ?? 0, 1000);

    expect(first.items).toHaveLength(1000);
    expect(second.items).toHaveLength(1000);
    expect(third.items).toHaveLength(505);
    expect(third.nextCursor).toBeNull();
    expect(first.total).toBe(2505);
  });
});
