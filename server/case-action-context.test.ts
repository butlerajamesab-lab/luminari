import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
const mocks = vi.hoisted(() => ({
  subject: vi.fn(), authorities: vi.fn(), statutes: vi.fn(), cases: vi.fn(), enforcement: vi.fn(),
  weak_joints: vi.fn(), contradictions: vi.fn(), stats: vi.fn(), resources: vi.fn(), paths: vi.fn(), query: vi.fn(), intake: vi.fn(), registry: vi.fn(), resolve: vi.fn(),
}));
vi.mock("./services/case-context-subject", () => ({ read_case_context_subject: mocks.subject }));
vi.mock("./services/current-legal-authority-reader", () => ({ read_current_legal_authorities: mocks.authorities }));
vi.mock("./services/case-context-reader-boundary", () => ({
  read_case_statutes: mocks.statutes, read_case_law: mocks.cases,
  read_case_enforcement: mocks.enforcement, read_case_weak_joints: mocks.weak_joints,
  read_case_contradictions: mocks.contradictions, read_case_legal_stats: mocks.stats,
  read_case_resources: mocks.resources, read_case_enforcement_pathways: mocks.paths,
}));
vi.mock("./db", () => ({ getPool: () => ({ query: mocks.query }) }));
vi.mock("./intake-case-layer-reader", () => ({ read_canonical_case_layer_outputs: mocks.intake }));
vi.mock("./intake-governed-legal-registry", () => ({ load_governed_legal_registry: mocks.registry }));
vi.mock("./legal-reference-runtime", () => ({ resolve_legal_reference: mocks.resolve }));
import { get_case_action_context } from "./services/case-action-context";

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset());
  mocks.subject.mockResolvedValue({ id: 41, user_id: 7, jurisdiction_id: null, jurisdiction: "Washington", jurisdiction_code: "WA", category: "Housing", case_namespace: "public.cases" });
  mocks.authorities.mockResolvedValue({ items: [{ object_ref: "source-1", source_locator: "lines:1-4:statutory_authority", state_code: "WA" }] });
  mocks.statutes.mockResolvedValue([{ id: "8b300280-3e91-4f4e-999c-5d5b43a01cbe", citation: "RCW 59.18.280" }]);
  mocks.cases.mockResolvedValue([]); mocks.enforcement.mockResolvedValue([]); mocks.weak_joints.mockResolvedValue([]);
  mocks.contradictions.mockResolvedValue([]); mocks.resources.mockResolvedValue({ items: [] });
  mocks.paths.mockResolvedValue({ pathways: [] }); mocks.stats.mockResolvedValue({ statutes: 1 });
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.intake.mockResolvedValue({ state: "not_projected", outputs: [] });
  mocks.registry.mockResolvedValue({ rule_manifest_hash: "registry-hash", manifest: { claims: [], workflows: [], deadlines: [] } });
  mocks.resolve.mockResolvedValue({ committed_ref: "case_law:abc", status: "unresolved", record: null });
});

describe("workspace case action context", () => {
  it("retains original IDs and sources while scoping every discovery read to recorded case jurisdiction", async () => {
    mocks.query.mockImplementation(async (sql: string, values: unknown[]) => {
      expect(values[0]).toBe(41);
      if (sql.includes("case_resource_links")) return { rows: [{ resource_ref: "resource-1", source_lane: "directory" }] };
      return { rows: [{ signal_record_id: "signal-1", relationship_type: "supports_case" }] };
    });
    const result = await get_case_action_context({ case_id: 41, user_id: 7, limit_per_surface: 4 });
    expect(mocks.subject).toHaveBeenCalledWith(41, 7);
    expect(result.subject.case_namespace).toBe("public.cases");
    expect(result.legal.statutes[0]).toMatchObject({ id: "8b300280-3e91-4f4e-999c-5d5b43a01cbe" });
    expect(result.legal.source_authorities[0]).toMatchObject({ object_ref: "source-1", source_locator: "lines:1-4:statutory_authority" });
    for (const reader of [mocks.authorities,mocks.statutes,mocks.cases,mocks.enforcement,mocks.weak_joints,mocks.contradictions,mocks.resources,mocks.paths]) {
      for (const [input] of reader.mock.calls) expect(input.jurisdiction).toBe("WA");
    }
    expect(result.resources.attached_to_case).toEqual([{ resource_ref: "resource-1", source_lane: "directory" }]);
    expect(result.signals.lineage).toEqual([{ signal_record_id: "signal-1", relationship_type: "supports_case" }]);
  });

  it.each(["FORBIDDEN", "NOT_FOUND"] as const)("performs no joins or discovery after %s", async code => {
    mocks.subject.mockRejectedValueOnce(new TRPCError({ code }));
    await expect(get_case_action_context({ case_id: 41, user_id: 9 })).rejects.toMatchObject({ code });
    for (const [name,reader] of Object.entries(mocks)) if (name !== "subject") expect(reader).not.toHaveBeenCalled();
  });

  it("leaves missing case jurisdiction unavailable instead of loading global records", async () => {
    mocks.subject.mockResolvedValue({ id: 41, user_id: 7, jurisdiction_code: null, jurisdiction: null, category: "Housing" });
    const result = await get_case_action_context({ case_id: 41, user_id: 7 });
    for (const reader of [mocks.authorities,mocks.statutes,mocks.cases,mocks.enforcement,mocks.weak_joints,mocks.contradictions,mocks.resources,mocks.paths,mocks.stats]) expect(reader).not.toHaveBeenCalled();
    expect(result.diagnostics.unavailable_surfaces).toContain("legal.statutes");
    expect(result.diagnostics.legal_library_stats).toBeNull();
  });

  it("keeps failed attachment reads distinct from successful emptiness", async () => {
    mocks.query.mockRejectedValue(Object.assign(new Error("missing relation"), { code: "42P01" }));
    const result = await get_case_action_context({ case_id: 41, user_id: 7 });
    expect(result.resources.attached_to_case).toBeNull();
    expect(result.resources.attachment_availability.status).toBe("unavailable");
    expect(result.signals.lineage).toBeNull();
    expect(result.signals.availability.status).toBe("unavailable");
  });

  it("keeps empty searches empty and does not calculate deadlines from an incident date alone", async () => {
    mocks.statutes.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "same-source-id" }]);
    const result = await get_case_action_context({ case_id: 41, user_id: 7, incident_date: "2026-03-01" });
    expect(result.diagnostics.fallback_surfaces).toEqual([]);
    expect(result.legal.statutes).toEqual([]);
    expect(mocks.statutes).toHaveBeenCalledTimes(1);
    expect(result.workflow.filing_deadlines).toEqual([]);
    expect(result.diagnostics.unavailable_surfaces).toContain("workflow.filing_deadlines");
    expect(result.diagnostics.notes.join(" ")).toContain("incident date alone");
  });

  it("retains governed intake path receipts, workflow IDs, and currentness without recomputing them", async () => {
    const projection = { state: "canonical_projection", outputs: [{ intake_session_id: "intake-1", output_hash: "hash-1",
      receipt_hash: "receipt-1", projection_current: false, data: [{ path_id: "path-1", workflow_registry_id: "workflow-uuid", status: "candidate_unverified" }] }] };
    mocks.intake.mockResolvedValueOnce(projection);
    const result = await get_case_action_context({ case_id: 41, user_id: 7 });
    expect(mocks.intake).toHaveBeenCalledWith(41, "action_paths");
    expect(result.workflow.intake_action_paths).toEqual(projection);
    expect(result.workflow.intake_action_path_availability.status).toBe("available");
  });

  it.each(["WA", null])("emits snake_case context keys including unavailable nested surfaces for %s", async jurisdiction => {
    mocks.subject.mockResolvedValueOnce({ id: 41, user_id: 7, jurisdiction_code: jurisdiction,
      jurisdiction, category: "Housing", case_namespace: "public.cases" });
    const result = await get_case_action_context({ case_id: 41, user_id: 7 });
    const inspect = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(inspect);
      if (!value || typeof value !== "object") return;
      for (const [key, nested] of Object.entries(value)) {
        expect(key).not.toMatch(/[a-z][A-Z]/);
        inspect(nested);
      }
    };
    inspect(result);
  });
});

it("preserves explicit saved references and isolates registry failure from sealed output", async () => {
  mocks.subject.mockResolvedValueOnce({ id: 41, user_id: 7, jurisdiction_code: "WA", jurisdiction: "WA", claim_type: "test_claim", committed_statute_ids: ["case_law:abc"] });
  mocks.registry.mockRejectedValueOnce(new Error("Registry unavailable"));
  const result = await get_case_action_context({ case_id: 41, user_id: 7 });
  expect(result.legal.attachments.items).toEqual([{ committed_ref: "case_law:abc", status: "unresolved", record: null }]);
  expect(result.workflow.source_candidates.availability.status).toBe("error");
  expect(result.workflow.intake_action_paths).toMatchObject({ state: "not_projected" });
});

it("matches declared workflows and deadline domains only within the browsing jurisdiction", async () => {
  mocks.subject.mockResolvedValueOnce({ id: 41, user_id: 7, jurisdiction_code: "WA", jurisdiction: "WA", claim_type: "test_claim" });
  mocks.registry.mockResolvedValueOnce({ rule_manifest_hash: "registry-hash", manifest: {
    claims: [{ claim_type_id: "test_claim", domain: "housing" }],
    workflows: [{ workflow_id: "wa-source", jurisdiction: "WA", issue_types: ["test_claim"] }, { workflow_id: "or-source", jurisdiction: "OR", issue_types: ["test_claim"] }],
    deadlines: [{ deadline_id: "wa-deadline", jurisdiction: "WA", claim_domain: "housing" }, { deadline_id: "or-deadline", jurisdiction: "OR", claim_domain: "housing" }],
  } });
  const projection = { state: "canonical_projection", outputs: [{ output_hash: "sealed-WA-hash", data: [] }] };
  mocks.intake.mockResolvedValueOnce(projection);
  const result = await get_case_action_context({ case_id: 41, user_id: 7, jurisdiction: "OR" });
  expect(result.request.jurisdiction_source).toBe("explicit_browse_request");
  expect(result.subject.jurisdiction_code).toBe("WA");
  expect(result.workflow.source_candidates.items).toEqual([expect.objectContaining({ workflow_id: "or-source", registry_hash: "registry-hash" })]);
  expect(result.workflow.deadline_sources.items).toEqual([expect.objectContaining({ deadline_id: "or-deadline", calculation_state: "not_calculated" })]);
  expect(result.workflow.intake_action_paths).toBe(projection);
});

it("keeps independent sources readable when one catalog fails", async () => {
  mocks.authorities.mockRejectedValueOnce(new Error("Source catalog unavailable"));
  const result = await get_case_action_context({ case_id: 41, user_id: 7 });
  expect(result.diagnostics.unavailable_surfaces).toContain("legal.source_authorities");
  expect(result.legal.statutes).toHaveLength(1);
  expect(result.resources.attachment_availability.status).toBe("empty");
});
