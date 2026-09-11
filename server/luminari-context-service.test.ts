import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCaseById: vi.fn(),
  getJurisdictionById: vi.fn(),
  getWorkflows: vi.fn(),
  getPrograms: vi.fn(),
  getEntities: vi.fn(),
  getSignals: vi.fn(),
  getCaseTimeline: vi.fn(),
  getCaseNotes: vi.fn(),
  getCaseActionContext: vi.fn(),
}));

vi.mock("./services/caseService", () => ({
  getCaseById: mocks.getCaseById,
  getCaseTimeline: mocks.getCaseTimeline,
  getCaseNotes: mocks.getCaseNotes,
}));

vi.mock("./services/registryService", () => ({
  getJurisdictionById: mocks.getJurisdictionById,
  getWorkflows: mocks.getWorkflows,
  getPrograms: mocks.getPrograms,
  getEntities: mocks.getEntities,
  getSignals: mocks.getSignals,
}));

vi.mock("./services/case-action-context", () => ({
  getCaseActionContext: mocks.getCaseActionContext,
}));

import { getCaseContext } from "./services/luminariContextService";

describe("luminari context service", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("fills previously empty runtime arrays from the bounded action context", async () => {
    mocks.getCaseById.mockResolvedValue({ id: 5, jurisdiction_id: 3, category: "Housing", selected_workflow_id: 10, status: "active", created_at: 100 });
    mocks.getJurisdictionById.mockResolvedValue({ id: 3, code: "WA", name: "Washington" });
    mocks.getWorkflows.mockResolvedValue([{ id: 10 }]);
    mocks.getPrograms.mockResolvedValue([{ id: 11 }]);
    mocks.getEntities.mockResolvedValue([{ id: 12 }]);
    mocks.getSignals.mockResolvedValue([{ id: 13 }]);
    mocks.getCaseTimeline.mockResolvedValue([{ type: "event" }]);
    mocks.getCaseNotes.mockResolvedValue([{ content: "urgent" }]);
    mocks.getCaseActionContext.mockResolvedValue({
      legal: {
        statutes: [{ id: "statute:1" }],
        case_law: [{ id: "case:1" }],
        enforcement: [{ id: "enf:1" }],
        weak_joints: [{ id: "wj_1" }],
        contradictions: [{ id: 7 }],
      },
      resources: { directory_results: [{ resource_entity_id: "res_1" }], attached_to_case: [] },
      workflow: {
        enforcement_pathways: { pathways: [{ id: "path_1" }] },
        investigation: { workflow: { immediateActions: [{ action: "Act" }], timelineTasks: [{ task: "File" }], agencySteps: [] } },
        filing_deadlines: [{ formId: 22 }],
      },
      signals: { lineage: [] },
      diagnostics: { legal_library_stats: {}, fallback_surfaces: [], notes: [] },
    });

    const context = await getCaseContext(5);

    expect(context.legal_library).toHaveLength(5);
    expect(context.resources).toEqual([{ resource_entity_id: "res_1" }]);
    expect(context.enforcement_pathways).toEqual([{ id: "path_1" }]);
    expect(context.deadlines).toEqual([{ action: "Act" }, { task: "File" }, { formId: 22 }]);
    expect(context.case.notes).toEqual(["urgent"]);
    expect(context.diagnostics.total_legal_library_records).toBe(5);
    expect(context.diagnostics.total_resources).toBe(1);
    expect(context.diagnostics.total_deadlines).toBe(3);
  });
});
