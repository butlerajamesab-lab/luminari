import { describe, expect, it } from "vitest";
import {
  detectAgencyRole,
  normalizeJurisdiction,
  recommendDisposition,
  scoreCandidateMatch,
} from "./backbone-convergence.mjs";

describe("backbone convergence matcher", () => {
  it("normalizes jurisdiction variants", () => {
    expect(normalizeJurisdiction("WA")).toBe("WA");
    expect(normalizeJurisdiction("Washington")).toBe("WA");
    expect(normalizeJurisdiction("j_wa")).toBe("WA");
    expect(normalizeJurisdiction("US Virgin Islands")).toBe("VI");
  });

  it("detects agency roles", () => {
    expect(detectAgencyRole("Disability Rights Washington")).toBe("PA");
    expect(detectAgencyRole("Developmental Disabilities Council")).toBe("DDC");
    expect(detectAgencyRole("Division of Vocational Rehabilitation")).toBe("VR");
  });

  it("rejects cross-state matches", () => {
    const result = scoreCandidateMatch(
      { agency_role: "PA", state_code: "WA", agency_id: "DIS-WA-PA" },
      { resource_name: "Disability Rights Oregon", state: "OR" },
    );
    expect(result.score).toBe(0);
    expect(result.reasons).toContain("jurisdiction_conflict");
  });

  it("marks a verified canonical identity as duplicate", () => {
    const result = recommendDisposition(
      { agency_role: "PA", state_code: "WA", agency_id: "DIS-WA-PA", official_name: "Disability Rights Washington" },
      [{
        canonical_id: "DIS-WA-PA",
        resource_name: "Disability Rights Washington",
        state: "WA",
        verification_status: "verified",
        promotion_status: "promoted",
      }],
    );
    expect(result.disposition).toBe("duplicate");
    expect(result.confidence).toBe("high");
  });

  it("recommends enrichment for a strong legacy match", () => {
    const result = recommendDisposition(
      { agency_role: "PA", state_code: "CA", official_name: "Disability Rights California" },
      [{
        name: "Disability Rights California (DRC)",
        jurisdiction_id: "CA",
        verification_status: "unverified",
        promotion_status: "legacy_registry",
      }],
    );
    expect(result.disposition).toBe("enrich");
  });

  it("holds ambiguous close matches", () => {
    const candidate = { agency_role: "PA", state_code: "LA", official_name: "Disability Rights Louisiana" };
    const result = recommendDisposition(candidate, [
      { name: "Disability Rights Louisiana", jurisdiction_id: "LA", verification_status: "unverified" },
      { name: "Disability Rights Louisiana (DRLA)", jurisdiction_id: "LA", verification_status: "unverified" },
    ]);
    expect(result.disposition).toBe("hold");
    expect(result.confidence).toBe("ambiguous");
  });

  it("recommends insert when no role-aware match exists", () => {
    const result = recommendDisposition(
      { agency_role: "DDC", state_code: "AK", official_name: "Alaska Governor's Council on Disabilities and Special Education" },
      [{ name: "Disability Rights Alaska", jurisdiction_id: "AK" }],
    );
    expect(result.disposition).toBe("insert");
  });
});
