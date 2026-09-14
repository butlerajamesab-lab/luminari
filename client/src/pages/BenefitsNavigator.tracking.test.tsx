import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  case_id: 12 as number | null, user: { id: 7 } as { id: number } | null,
  applications: [] as any[], on_success: undefined as any,
  invalidate: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/core/hooks/useAuth", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/contexts/CaseContext", () => ({ useCase: () => ({
  currentCaseId: state.case_id, cases: [{ id: 12 }, { id: 13 }], setCurrentCaseId() {},
}) }));
vi.mock("wouter", () => ({
  useLocation: () => ["/benefits", () => {}],
  useSearch: () => "situation=health+coverage&state=CO",
  Link: ({ href, children, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock("@/components/benefits/BenefitsResourceSections", () => ({ Benefits_directory_categories: () => null, Benefits_resource_sections: () => null }));
vi.mock("@/components/benefits/BenefitsCascadeNavigator", () => ({ Benefits_case_actions: () => null, Benefits_cascade_navigator: () => null }));
vi.mock("@/components/benefits/BenefitsRegistryPrograms", () => ({ default: () => null }));
vi.mock("@/components/NextStepBar", () => ({ NextStepBar: () => null }));
vi.mock("@/components/CommitToCase", () => ({ FlagArea: () => null }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  benefits: {
    categories: { useQuery: () => ({ data: [] }) },
    statesWithOverlays: { useQuery: () => ({ data: ["CO"] }) },
    match: { useQuery: () => ({ data: [{ program: { id: "medicaid", name: "Medicaid", category: "healthcare", what_it_does: "Coverage", urgency: "soon" } }], refetch() {} }) },
  },
  benefitApps: {
    list: { _def: () => ({ path: ["benefitApps", "list"] }), useQuery: () => ({ data: state.applications }) },
    create: { useMutation: (options: any) => { state.on_success = options.onSuccess; return { mutate() {} }; } },
  },
} }));

import BenefitsNavigator from "./BenefitsNavigator";
import { tracked_benefit_program_ids } from "@shared/benefits-tracking-scope";
const render = () => renderToStaticMarkup(<BenefitsNavigator />);
const has_tracking_badge = (html: string) => />Tracking<\//.test(html);

beforeEach(() => {
  state.case_id = 12;
  state.user = { id: 7 };
  state.applications = [{ caseId: 12, programId: "medicaid" }];
  state.invalidate.mockClear();
});

describe("Benefits tracking across case transitions", () => {
  it("never renders another case's tracked badge while the next list is loading", () => {
    expect(has_tracking_badge(render())).toBe(true);
    state.case_id = 13;
    // Deliberately keep the previous response to exercise the transition boundary.
    expect(has_tracking_badge(render())).toBe(false);
    state.applications = [{ caseId: 13, programId: "medicaid" }];
    expect(has_tracking_badge(render())).toBe(true);
  });

  it("refreshes the submitting case when its mutation succeeds after a case switch", () => {
    render();
    state.case_id = 13;
    render();
    state.on_success({ caseId: 12, programId: "medicaid", programName: "Medicaid" }, { caseId: 12, programId: "medicaid" });
    expect(state.invalidate).toHaveBeenCalledWith({
      queryKey: [["benefitApps", "list"], { input: { caseId: 12 }, type: "query" }], exact: true,
    });
    expect(has_tracking_badge(render())).toBe(false);
  });

  it("keeps personal tracking separate and removes badges for signed-out visitors", () => {
    state.case_id = null;
    expect(has_tracking_badge(render())).toBe(false);
    state.applications = [{ caseId: null, programId: "medicaid" }];
    expect(has_tracking_badge(render())).toBe(true);
    state.user = null;
    expect(has_tracking_badge(render())).toBe(false);
    expect([...tracked_benefit_program_ids([{ programId: "missing-case" }, { caseId: "nonsense", programId: "bad-case" }], null)]).toEqual([]);
  });
});
