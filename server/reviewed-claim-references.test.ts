import { describe, expect, it } from "vitest";
import { get_reviewed_claim_reference, match_catalog_claims, reviewed_barrier_references, reviewed_claim_catalog, reviewed_proof_reference_issue } from "./reviewed-claim-references";

describe("reviewed claim source connections", () => {
  it("keeps the 27 existing claim identities, source spans and uncertainty", () => {
    const claims = reviewed_claim_catalog.claims;
    expect(claims).toHaveLength(27);
    expect(new Set(claims.map(row => row.existing_claim_catalog_id)).size).toBe(27);
    expect(claims.every(row => row.legal_verification === "unverified" && row.automatic_legal_actions_allowed === false)).toBe(true);
    expect(get_reviewed_claim_reference("EMP-005")?.claim_type_id).toBe("emp_005_wage_theft_minimum_wage_violation");
    expect(get_reviewed_claim_reference("wage") === null).toBe(true);
    const disability = get_reviewed_claim_reference("BEN-003")!;
    expect(disability.elements[0].text).toContain("medically determinable impairment");
    expect(disability.proof_reference.text).not.toContain("unemployment");
  });

  it("connects wages to arbitration and immigration-access review without declaring barriers applicable", () => {
    const barriers = reviewed_barrier_references("emp_005_wage_theft_minimum_wage_violation");
    expect(barriers.map(row => row.barrier_id)).toEqual(["BAR-001", "BAR-006", "BAR-008"]);
    expect(barriers.every(row => row.case_applicability === "not_assessed" && row.applicability_questions.length > 0)).toBe(true);
    expect(reviewed_barrier_references("unknown_claim")).toEqual([]);
  });

  it("keeps barrier relationships closed over source identities and legacy ingestion references out", () => {
    const ids = new Set(reviewed_claim_catalog.claims.map(row => row.source_claim_id));
    expect(reviewed_barrier_references()).toHaveLength(10);
    for (const barrier of reviewed_claim_catalog.barriers) {
      expect(barrier.related_source_claim_ids.every(id => ids.has(id))).toBe(true);
      expect(barrier.automatic_legal_actions_allowed).toBe(false);
    }
    expect(reviewed_barrier_references().some(row => row.description.includes("resource contacts — ingestion"))).toBe(false);
  });

  it("matches topic evidence, preserves exact identity, and never manufactures a case score", () => {
    const source = get_reviewed_claim_reference("EMP-005")!;
    const rows = [{id: source.existing_claim_catalog_id,claim_type_id:source.claim_type_id,canonical_name:source.canonical_name,domain:source.domain,description:null}];
    const matches = match_catalog_claims(rows,"My Colorado employer did not pay minimum wage","Employment");
    expect(matches).toHaveLength(1);
    expect(matches[0].claim_type).toBe(source.claim_type_id);
    expect(matches[0].case_applicability).toBe("not_assessed");
    expect(matches[0]).not.toHaveProperty("confidence");
    expect(matches[0]).not.toHaveProperty("sol_years");
    expect(match_catalog_claims(rows,"Colorado employment","Employment")).toEqual([]);
  });

  it("holds the specifically inspected wrong-process proof mappings without blanket domain substitution", () => {
    expect(reviewed_proof_reference_issue("SSDI_Denial", "unemployment")).toContain("unemployment proceedings");
    expect(reviewed_proof_reference_issue("Medicaid_Wrongful_Denial", "food_nutrition")).toContain("food-benefit proceedings");
    expect(reviewed_proof_reference_issue("Housing_Discrimination_FHA", "housing")).toContain("administrative eligibility");
    expect(reviewed_proof_reference_issue("SSDI_Denial", "benefits")).toBeNull();
    expect(reviewed_barrier_references().find(row => row.barrier_id === "BAR-003")?.related_claims).toEqual([]);
  });
});
