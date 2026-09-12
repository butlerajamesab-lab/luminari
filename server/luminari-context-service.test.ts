import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ action: vi.fn(), timeline: vi.fn() }));
vi.mock("./services/case-action-context", () => ({ get_case_action_context: mocks.action }));
vi.mock("./services/case-context-reader-boundary", () => ({ read_case_timeline: mocks.timeline }));
import { get_case_context } from "./services/luminariContextService";

beforeEach(() => {
  mocks.action.mockReset().mockResolvedValue({
    subject: { id: 41, name: "Workspace case", category: "housing", status: "open", created_at: 100, updated_at: 200, case_namespace: "public.cases" },
    jurisdiction: { id: null, code: "WA", name: "Washington" },
    legal: { statutes: [{ id: "statute-source" }], case_law: [], enforcement: [], weak_joints: [], contradictions: [], source_authorities: [{ object_ref: "authority-source" }] },
    resources: { directory_results: [{ resource_entity_id: "resource-source" }] },
    workflow: { enforcement_pathways: { pathways: [] }, filing_deadlines: [] },
    signals: { lineage: [] }, diagnostics: { unavailable_surfaces: ["workflow.filing_deadlines"] },
  });
  mocks.timeline.mockReset().mockResolvedValue([{ id: "canonical-event-uuid", document_id: 51 }]);
});

it("composes only authorized workspace data and preserves UUID chronology/source references", async () => {
  const result = await get_case_context(41, 7);
  expect(mocks.action).toHaveBeenCalledWith({ case_id: 41, user_id: 7, limit_per_surface: 6 });
  expect(result.case).toMatchObject({ id: 41, jurisdiction_id: null, selected_workflow_id: null, case_namespace: "public.cases" });
  expect(result.case.timeline).toEqual([{ id: "canonical-event-uuid", document_id: 51 }]);
  expect(result.legal_library).toEqual([{ id: "statute-source" }]);
  expect(result.source_authorities).toEqual([{ object_ref: "authority-source" }]);
  expect(result.resources).toEqual([{ resource_entity_id: "resource-source" }]);
  expect(result.diagnostics.total_programs).toBeNull();
});

it("does not query chronology when case access fails", async () => {
  mocks.action.mockRejectedValueOnce(new Error("Access denied"));
  await expect(get_case_context(41, 9)).rejects.toThrow("Access denied");
  expect(mocks.timeline).not.toHaveBeenCalled();
});

it("keeps chronology errors separate from an empty event list", async () => {
  mocks.timeline.mockRejectedValueOnce(new Error("Chronology unavailable"));
  const result = await get_case_context(41, 7);
  expect(result.case.timeline).toBeNull();
  expect(result.diagnostics.timeline_availability.status).toBe("error");
});
