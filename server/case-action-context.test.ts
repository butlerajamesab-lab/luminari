import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCaseById: vi.fn(),
  getJurisdictionById: vi.fn(),
  searchRuntimeStatutes: vi.fn(),
  searchRuntimeCaseLaw: vi.fn(),
  searchRuntimeEnforcement: vi.fn(),
  searchRuntimeWeakJoints: vi.fn(),
  listRuntimeContradictions: vi.fn(),
  getRuntimeLegalLibraryStats: vi.fn(),
  searchPublishableResourceDirectory: vi.fn(),
  read_investigation_workflow: vi.fn(),
  read_enforcement_pathways: vi.fn(),
  list_filing_deadline_records: vi.fn(),
  query: vi.fn(),
}));

vi.mock("./services/caseService", () => ({
  getCaseById: mocks.getCaseById,
}));

vi.mock("./services/registryService", () => ({
  getJurisdictionById: mocks.getJurisdictionById,
}));

vi.mock("./legal-library-runtime-db", () => ({
  searchRuntimeStatutes: mocks.searchRuntimeStatutes,
  searchRuntimeCaseLaw: mocks.searchRuntimeCaseLaw,
  searchRuntimeEnforcement: mocks.searchRuntimeEnforcement,
  searchRuntimeWeakJoints: mocks.searchRuntimeWeakJoints,
  listRuntimeContradictions: mocks.listRuntimeContradictions,
  getRuntimeLegalLibraryStats: mocks.getRuntimeLegalLibraryStats,
}));

vi.mock("./services/resource-directory-publishable", () => ({
  searchPublishableResourceDirectory: mocks.searchPublishableResourceDirectory,
}));

vi.mock("./investigation-workflow-runtime-compat", () => ({
  read_investigation_workflow: mocks.read_investigation_workflow,
}));

vi.mock("./enforcement-pathway-runtime-compat", () => ({
  read_enforcement_pathways: mocks.read_enforcement_pathways,
}));

vi.mock("./filing-deadline-runtime-compat", () => ({
  list_filing_deadline_records: mocks.list_filing_deadline_records,
}));

vi.mock("./db", () => ({
  getPool: () => ({ query: mocks.query }),
}));

import { getCaseActionContext } from "./services/case-action-context";

describe("case action context", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("pulls populated runtime data through bounded surfaces and preserves stranded-substrate diagnostics", async () => {
    mocks.getCaseById.mockResolvedValue({ id: 41, jurisdiction_id: 9, category: "Housing" });
    mocks.getJurisdictionById.mockResolvedValue({ id: 9, code: "wa", name: "Washington" });
    mocks.searchRuntimeStatutes
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "statute:1", citation: "RCW 59.18.280" }]);
    mocks.searchRuntimeCaseLaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "case:1", citation: "Smith v. Housing Auth." }]);
    mocks.searchPublishableResourceDirectory
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [{ resource_entity_id: "res_1", resource_name: "Tenant Union" }] });
    mocks.searchRuntimeEnforcement
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "enf:1", agency_name: "AGO" }]);
    mocks.searchRuntimeWeakJoints.mockResolvedValue([{ id: "wj_1" }]);
    mocks.listRuntimeContradictions.mockResolvedValue([{ id: 2 }]);
    mocks.read_investigation_workflow.mockResolvedValue({ workflow: { immediateActions: [{ action: "Preserve notices" }], timelineTasks: [], agencySteps: [] } });
    mocks.read_enforcement_pathways.mockResolvedValue({ pathways: [{ id: "path_1" }] });
    mocks.list_filing_deadline_records.mockResolvedValue([]);
    mocks.getRuntimeLegalLibraryStats.mockResolvedValue({
      statutes: 1,
      caseLaw: 1,
      enforcementRecords: 1,
      weakJoints: 1,
      contradictions: 1,
      currentCorpusLegalAuthorities: 5,
      strandedCurrentCorpusStatutes: 1,
      strandedCurrentCorpusCaseLaw: 1,
      strandedCurrentCorpusLegalAuthorities: 2,
    });
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes("case_resource_links")) {
        return { rows: [{ resource_ref: "res_1", resource_name: "Tenant Union", source_lane: "directory", created_at: 1 }] };
      }
      if (sql.includes("v_signal_lineage")) {
        return { rows: [{ detected_signal_id: "sig_1", signal_type: "housing_delay", jurisdiction_raw_value: "WA" }] };
      }
      return { rows: [] };
    });

    const result = await getCaseActionContext({ caseId: 41, limitPerSurface: 4 });

    expect(result.contract_version).toBe("case_action_context_v1");
    expect(result.legal.statutes).toEqual([{ id: "statute:1", citation: "RCW 59.18.280" }]);
    expect(result.legal.case_law).toEqual([{ id: "case:1", citation: "Smith v. Housing Auth." }]);
    expect(result.resources.directory_results).toEqual([{ resource_entity_id: "res_1", resource_name: "Tenant Union" }]);
    expect(result.resources.attached_to_case).toHaveLength(1);
    expect(result.workflow.enforcement_pathways).toEqual({ pathways: [{ id: "path_1" }] });
    expect(result.signals.lineage).toEqual([{ detected_signal_id: "sig_1", signal_type: "housing_delay", jurisdiction_raw_value: "WA" }]);
    expect(result.diagnostics.fallback_surfaces).toEqual([
      "legal.statutes",
      "legal.case_law",
      "resources.directory",
      "legal.enforcement",
    ]);
    expect(result.diagnostics.notes).toContain(
      "Filing deadline calculations stay bounded to source text and require an incident_date; none was supplied.",
    );
    expect(result.diagnostics.notes.join(" ")).toContain("observed-but-not-catalog-ready authorities");
    expect(result.semantics.finding).toContain("No findings are invented");
  });
});
