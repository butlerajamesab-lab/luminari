import { describe, expect, it } from "vitest";
import {
  assess_resolution_deadlines, deadline_jurisdiction_code,
  deadline_review_action, type deadline_reference,
} from "./resolution-deadline-contract";

const reference = (overrides: Partial<deadline_reference> = {}): deadline_reference => ({
  id: 1, claim_type: "Wage theft", jurisdiction: "Colorado", deadline_type: "filing",
  source_duration_days: 30, trigger_event: "Receipt of a decision", authority: "Unverified catalog citation",
  extended_duration_days: null, extended_condition: null, tolling_conditions: null, notes: null,
  ...overrides,
});

describe("resolution deadline applicability", () => {
  it("never substitutes a shorter rule from another jurisdiction or a related claim", () => {
    const result = assess_resolution_deadlines([
      reference(), reference({ id: 2, jurisdiction: "WA", source_duration_days: 1 }),
      reference({ id: 3, claim_type: "Wage discrimination", source_duration_days: 2 }),
    ], { claim_type: "Wage theft", jurisdiction: "CO" });
    expect(result.references.map(row => row.id)).toEqual([1]);
    expect(result.nearest_deadline_days).toBeNull();
    expect(result.has_urgent_deadline).toBeNull();
    expect(deadline_review_action(result)).toMatchObject({ urgency: "unknown", href: "/deadline-calculator" });
    expect(deadline_review_action(result).action).not.toMatch(/within \d/);
  });

  it("keeps a source interval distinct from days remaining even when context is supplied", () => {
    const result = assess_resolution_deadlines([reference()], {
      claim_type: "Wage theft", jurisdiction: "CO", forum: "Example agency",
      trigger_event: "Receipt of a decision", event_date: "2000-01-01",
    });
    expect(result).toMatchObject({ status: "unresolved", reason: "applicability_unverified", missing_context: [], deadline_date: null });
    expect(result.references[0].source_duration_days).toBe(30);
    expect(result.unresolved_requirements).toContain("verified_authority_version");
    expect(result.nearest_deadline_days).toBeNull();
  });

  it("does not present extensions or tolling as applicable", () => {
    const result = assess_resolution_deadlines([reference({
      extended_duration_days: 90, extended_condition: "Only after a qualifying event", tolling_conditions: ["Candidate exception"],
    })], { claim_type: "Wage theft", jurisdiction: "CO" });
    expect(result.references[0]).toMatchObject({ extended_duration_days: 90, extended_condition: "Only after a qualifying event" });
    expect(result.status).toBe("unresolved");
    expect(result.deadline_date).toBeNull();
  });

  it("does not replace an absent jurisdiction with Federal", () => {
    const result = assess_resolution_deadlines([reference({ jurisdiction: "federal" })], { claim_type: "Wage theft" });
    expect(result.reason).toBe("jurisdiction_unresolved");
    expect(result.references).toEqual([]);
    expect(result.missing_context).toEqual(["jurisdiction", "forum", "trigger_event", "event_date"]);
  });

  it("does not assert that a missing exact identity means no legal deadline exists", () => {
    const result = assess_resolution_deadlines([reference()], { claim_type: "EMP-002", jurisdiction: "CO" });
    expect(result.reason).toBe("no_exact_reference");
    expect(result.message).toContain("Other forums or legal theories may have deadlines");
    expect(result.has_urgent_deadline).toBeNull();
  });

  it("normalizes nationwide and territorial aliases without substring matching", () => {
    expect(deadline_jurisdiction_code("Colorado")).toBe("CO");
    expect(deadline_jurisdiction_code("Nebraska")).toBe("NE");
    expect(deadline_jurisdiction_code("American Samoa")).toBe("AS");
    expect(deadline_jurisdiction_code("USVI")).toBe("VI");
    expect(deadline_jurisdiction_code("CNMI")).toBe("MP");
    expect(deadline_jurisdiction_code("Federal/State")).toBeNull();
    expect(deadline_jurisdiction_code("Tribal/Federal")).toBeNull();
    expect(deadline_jurisdiction_code("Washington County")).toBeNull();
  });

  it("does not inherit federal reference applicability into a territory", () => {
    const result = assess_resolution_deadlines([
      reference({ jurisdiction: "federal" }), reference({ id: 2, jurisdiction: "AS" }),
    ], { claim_type: "Wage theft", jurisdiction: "American Samoa" });
    expect(result.references.map(row => row.id)).toEqual([2]);
  });

  it("preserves zero or absent source intervals as reference data without urgency", () => {
    const result = assess_resolution_deadlines([
      reference({ source_duration_days: 0 }), reference({ id: 2, source_duration_days: null }),
    ], { claim_type: "Wage theft", jurisdiction: "CO" });
    expect(result.references.map(row => row.source_duration_days)).toEqual([0, null]);
    expect(result.has_urgent_deadline).toBeNull();
  });
});
