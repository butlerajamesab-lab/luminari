import { describe, expect, it } from "vitest";
import {
  DISTRICT_OF_COLUMBIA,
  LEGACY_JURISDICTION_TYPE_MAP,
  US_STATES,
  US_TERRITORIES,
  buildJurisdictionAssertionsFromSource,
  createCoverageRun,
  createCursorPage,
  stableInventoryHash,
} from "./jurisdiction-substrate";

describe("integration-safe jurisdiction substrate", () => {
  it("keeps all states, DC, and minimum territories first-class without declaring a new canonical table", () => {
    expect(US_STATES).toHaveLength(50);
    expect(DISTRICT_OF_COLUMBIA).toEqual({ name: "District of Columbia", code: "DC" });
    expect(US_TERRITORIES.map((territory) => territory.code)).toEqual(["PR", "GU", "VI", "AS", "MP"]);
  });

  it("preserves tribal jurisdiction as a review-required tribal assertion", () => {
    const assertions = buildJurisdictionAssertionsFromSource({
      sourceTable: "normalized_civic_resource",
      sourceRecordId: "resource-1",
      tribal: {
        tribalNation: "Navajo Nation",
        federalRecognitionStatus: "federally_recognized",
        sourceAuthority: "source record",
        icwaRelevance: "mentioned",
        biaOverlap: ["BIA"],
        ihsOverlap: ["IHS"],
      },
    });

    expect(assertions).toHaveLength(1);
    expect(assertions[0].jurisdictionType).toBe("tribal");
    expect(assertions[0].tribalNation).toBe("Navajo Nation");
    expect(assertions[0].reviewStatus).toBe("review_required");
  });

  it("emits multiple assertions for overlapping tribal, state, and federal jurisdiction evidence", () => {
    const assertions = buildJurisdictionAssertionsFromSource({
      sourceTable: "source_blocks",
      sourceRecordId: "block-1",
      stateCode: "AZ",
      tribal: { tribalNation: "Navajo Nation", federalAgencyOverlap: ["BIA"] },
      jurisdictionalText: "Federal BIA and Arizona state court records mention ICWA and tribal jurisdiction.",
    });

    expect(assertions.some((assertion) => assertion.jurisdictionType === "tribal")).toBe(true);
    expect(assertions.some((assertion) => assertion.jurisdictionType === "state" && assertion.jurisdictionCode === "AZ")).toBe(true);
    expect(assertions.some((assertion) => assertion.jurisdictionType === "federal")).toBe(true);
    expect(assertions.length).toBeGreaterThanOrEqual(3);
  });

  it("does not false-match IN/OR/ME/AS abbreviations from arbitrary prose", () => {
    const assertions = buildJurisdictionAssertionsFromSource({
      sourceTable: "documents",
      sourceRecordId: "doc-1",
      arbitraryText: "I live in a rural area, or maybe me as a tenant needs help.",
    });

    expect(assertions).toHaveLength(1);
    expect(assertions[0].jurisdictionType).toBe("unknown");
    expect(assertions[0].createdFromRule).toBe("fallback_unknown");
  });

  it("maps existing city terminology to municipal explicitly", () => {
    expect(LEGACY_JURISDICTION_TYPE_MAP.city).toBe("municipal");
    const assertions = buildJurisdictionAssertionsFromSource({
      sourceTable: "registry_programs",
      sourceRecordId: "prog-1",
      municipality: "Seattle",
      municipalCode: "SEA",
    });

    expect(assertions[0].jurisdictionType).toBe("municipal");
  });

  it("uses cursor pages over already-fetched windows without creating a top-N boundary", () => {
    const firstWindow = [0, 1, 2, 3];
    const first = createCursorPage(firstWindow, null, 3);
    const secondWindow = [3, 4, 5, 6];
    const second = createCursorPage(secondWindow, first.nextCursor, 3);
    const thirdWindow = [6];
    const third = createCursorPage(thirdWindow, second.nextCursor, 3);

    expect(first.items).toEqual([0, 1, 2]);
    expect(first.nextCursor).toBe("3");
    expect(second.items).toEqual([3, 4, 5]);
    expect(second.nextCursor).toBe("6");
    expect(third.items).toEqual([6]);
    expect(third.nextCursor).toBeNull();
  });

  it("creates reproducible coverage runs from report inputs and source inventory", () => {
    const input = {
      reportKind: "domain_by_jurisdiction_coverage_matrix",
      scope: "nationwide",
      sourceInventory: { tables: ["registry_jurisdictions", "jurisdiction_hierarchy"], snapshot: "2026-06-07" },
      generatedAt: "2026-06-07T00:00:00.000Z",
      generatedBy: "test",
      notes: "fixture",
    };

    const runA = createCoverageRun(input);
    const runB = createCoverageRun({ ...input, sourceInventory: { snapshot: "2026-06-07", tables: ["registry_jurisdictions", "jurisdiction_hierarchy"] } });

    expect(runA.runKey).toBe(runB.runKey);
    expect(runA.sourceInventoryHash).toBe(stableInventoryHash(input.sourceInventory));
  });
});
