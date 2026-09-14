import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: new Map<unknown, any[]>(),
  query: vi.fn(),
  insert: vi.fn(),
  references: [] as any[],
}));
vi.mock("./db", () => ({
  db: {
    select: () => ({ from: (table: unknown) => {
      const query: any = {
        where: () => query,
        then: (resolve: any, reject: any) => Promise.resolve(state.rows.get(table) ?? []).then(resolve, reject),
      };
      return query;
    } }),
    delete: () => ({ where: async () => undefined }),
    insert: () => ({ values: state.insert }),
  },
}));
vi.mock("./db-legacy", () => ({ query_with_diagnostics: state.query }));
vi.mock("./services/current-canonical-state", () => ({ getCurrentCanonicalState: vi.fn() }));
vi.mock("./engine-entrypoint-wrapper", () => ({ withEngineTracking: vi.fn(), ENGINE_IDS: {} }));

import { dualLensRouter } from "./routers/dual-lens";
import { viabilityEngineRouter } from "./routers/viability-engine";
import { claimDetectionResults, elementStrength, evidenceRecords } from "../drizzle/schema";

const authenticated = { user: { id: 1 }, auth: { auth_status: "authenticated" } } as never;

beforeEach(() => {
  state.rows.clear();
  state.insert.mockReset().mockResolvedValue(undefined);
  state.references = [
    { id: 1, claim_type: "Wage theft", jurisdiction: "CO", deadline_type: "filing", source_duration_days: 30 },
    { id: 2, claim_type: "Wage theft", jurisdiction: "WA", deadline_type: "filing", source_duration_days: 1 },
  ];
  state.query.mockReset().mockImplementation(async (_query, _params, options) => ({
    rows: options.label === "resolution_deadlines_references" ? state.references : [],
  }));
});

describe("deadline consumers share the applicability boundary", () => {
  it("Resolve normalizes a legacy request and never emits an unscoped interval as a filing instruction", async () => {
    const caller = dualLensRouter.createCaller(authenticated);
    const result = await caller.get_next_action({ claimType: "Wage theft", jurisdiction: "Colorado" });
    expect(result.deadline_assessment.references.map(reference => reference.id)).toEqual([1]);
    expect(result).toMatchObject({ has_urgent_deadline: null, nearest_deadline_days: null });
    expect(result.actions[0]).toMatchObject({ urgency: "unknown", type: "deadline", href: "/deadline-calculator" });
    expect(result.actions.map(action => action.action).join(" ")).not.toMatch(/File within|days to file/);
  });

  it("Where to File and Next Action use the same exact claim/jurisdiction reference set", async () => {
    const caller = dualLensRouter.createCaller(authenticated);
    const input = { claim_type: "Wage theft", jurisdiction: "CO" };
    const [agency, action] = await Promise.all([caller.find_agency_and_forum(input), caller.get_next_action(input)]);
    expect(agency.deadlines).toEqual(action.deadline_assessment.references);
    expect(agency.reference_status).toBe("applicability_not_established");
  });

  it("missing jurisdiction remains unresolved rather than matching every workflow", async () => {
    const result = await dualLensRouter.createCaller(authenticated).get_next_action({ claim_type: "Wage theft" });
    expect(result.deadline_assessment.reason).toBe("jurisdiction_unresolved");
    expect(result.workflow_available).toBe(false);
    expect(result.nearest_deadline_days).toBeNull();
  });

  it("T3 does not infer a trigger from the old incidentDate parameter", async () => {
    state.rows.set(claimDetectionResults, [{ claimType: "Wage theft", confidenceScore: "1" }]);
    const result = await viabilityEngineRouter.createCaller(authenticated).evaluate_deadlines({
      caseId: 12, incidentDate: 1, jurisdiction: "CO",
    });
    expect(result.results[0]).toMatchObject({ sol_status: "unknown", sol_days_remaining: null });
    expect(result.results[0].deadline_assessment.missing_context).toContain("trigger_event");
    expect(result.results[0].deadline_assessment.missing_context).toContain("event_date");
  });

  it("T7 persists unknown SOL and cannot reduce the evidence score for an unbound catalog deadline", async () => {
    state.rows.set(claimDetectionResults, [{ claimType: "Wage theft", confidenceScore: "1" }]);
    state.rows.set(elementStrength, [{ claimType: "Wage theft", strengthScore: "1", element: "Example element" }]);
    state.rows.set(evidenceRecords, Array.from({ length: 4 }, () => ({ relatedClaim: "Wage theft", reliabilityClass: "primary" })));
    const result = await viabilityEngineRouter.createCaller(authenticated).compute_viability({
      caseId: 12, incidentDate: 1, jurisdiction: "CO",
    });
    expect(result.viability[0]).toMatchObject({ sol_status: "unknown", sol_days_remaining: null, confidence_score: 0.75 });
    expect(state.insert).toHaveBeenCalledWith(expect.objectContaining({ caseId: 12, solStatus: "unknown", solDaysRemaining: null }));
    expect(result.viability[0].recommended_action).not.toMatch(/has expired|deadline approaching|Proceed with/);
  });

  it("keeps private viability procedures protected", async () => {
    const caller = viabilityEngineRouter.createCaller({ user: null, auth: { auth_status: "unauthenticated" } } as never);
    await expect(caller.evaluate_deadlines({ case_id: 12 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.compute_viability({ case_id: 12 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(state.query).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("propagates catalog read failures instead of reporting no deadlines", async () => {
    state.query.mockRejectedValue(new Error("Catalog unavailable"));
    await expect(dualLensRouter.createCaller(authenticated).get_next_action({
      claim_type: "Wage theft", jurisdiction: "CO",
    })).rejects.toThrow("Catalog unavailable");
  });
});
