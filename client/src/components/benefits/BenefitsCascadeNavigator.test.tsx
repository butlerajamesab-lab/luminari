import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/trpc", () => ({ trpc: {} }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a> }));
import { benefits_cascade_references, resolve_benefits_case_id } from "@shared/benefits-cascade-reference";
import { Benefits_case_actions, Benefits_cascade_navigator } from "./BenefitsCascadeNavigator";

describe("source-reviewed cascade navigation", () => {
  it("preserves four named scenarios and all17 individually placed stages", () => {
    expect(benefits_cascade_references.map(row => row.scenario_id)).toEqual(["CAS-001", "CAS-002", "CAS-003", "CAS-004"]);
    expect(benefits_cascade_references.flatMap(row => row.stages)).toHaveLength(17);
    for (const scenario of benefits_cascade_references) {
      const html = renderToStaticMarkup(<Benefits_cascade_navigator initial_scenario_id={scenario.scenario_id} case_id={12} state_code="CO" on_benefit_search={() => {}} />);
      for (const stage of scenario.stages) {
        expect(html).toContain(`data-stage-id="${stage.stage_id}"`);
        expect(html).toContain(stage.source_paragraphs);
      }
      expect(html).not.toContain('disabled=""');
      expect(html).toContain("jurisdiction=CO");
      expect(html).toContain("/resolve?case_id=12&amp;jurisdiction=CO");
      expect(html).toContain("different version from the enriched staging source");
      expect(html).not.toContain("300 days");
    }
  });

  it("connects CAS-004 topics to the exact claim identifiers consumed by Resolve", () => {
    const html = renderToStaticMarkup(<Benefits_cascade_navigator initial_scenario_id="CAS-004" case_id={12} state_code="CO" on_benefit_search={() => {}} />);
    expect(html).toContain("claim_type=dis_003_olmstead_community_integration_institutionalization&amp;case_id=12&amp;jurisdiction=CO");
    expect(html).toContain("claim_type=ben_001_medicaid_denial_wrongful_termination_or_reduction");
    expect(html).toContain("claim_type=emp_003_disability_discrimination_failure_to_accommodate");
    expect(html).toContain("claim_type=hou_002_housing_discrimination_disability_reasonable_accommodation");
    expect(html).toContain("applicability has not been established");
    expect(html).not.toContain("emtala");
  });

  it("renders actionable no-case guidance instead of inert Save controls", () => {
    const html = renderToStaticMarkup(<Benefits_case_actions case_id={null} />);
    expect(html).toContain("Choose or start a case to save these results.");
    expect(html).toContain('href="/cases"');
    expect(html).not.toContain("CASE_CONTEXT_BRIDGE_MISSING");
    expect(html).not.toContain("Save to Case</button>");
  });

  it("selects only a user-visible case and never substitutes another case for invalid input", () => {
    const cases = [{ id: 12 }, { id: 14 }];
    expect(resolve_benefits_case_id(null, 12, cases)).toBe(12);
    expect(resolve_benefits_case_id("14", 12, cases)).toBe(14);
    for (const invalid of ["9", "12garbage", "0", "NaN", "-12", "1.2"]) expect(resolve_benefits_case_id(invalid, 12, cases)).toBeNull();
    expect(resolve_benefits_case_id("12", 12, undefined)).toBeNull();
  });
});
