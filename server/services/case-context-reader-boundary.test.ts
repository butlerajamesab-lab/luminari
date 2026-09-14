import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ statutes: vi.fn(), stats: vi.fn(), pathways: vi.fn(), timeline: vi.fn() }));
vi.mock("../legal-library-runtime-db", () => ({
  searchRuntimeStatutes: mocks.statutes, getRuntimeLegalLibraryStats: mocks.stats,
  listRuntimeContradictions: vi.fn(), searchRuntimeCaseLaw: vi.fn(),
  searchRuntimeEnforcement: vi.fn(), searchRuntimeWeakJoints: vi.fn(),
}));
vi.mock("./resource-directory-publishable", () => ({ search_publishable_resource_directory: vi.fn() }));
vi.mock("../enforcement-pathway-runtime-compat", () => ({ read_enforcement_pathways: mocks.pathways }));
vi.mock("../case-timeline-intake-compat", () => ({ getCaseTimelineData: mocks.timeline }));
import { read_case_statutes, read_case_legal_stats, read_case_enforcement_pathways, read_case_timeline } from "./case-context-reader-boundary";

function expect_snake_keys(value: unknown) {
  if (Array.isArray(value)) return value.forEach(expect_snake_keys);
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    expect(key).not.toMatch(/[a-z][A-Z]/);
    expect_snake_keys(nested);
  }
}

beforeEach(() => Object.values(mocks).forEach(mock => mock.mockReset()));

it("normalizes legacy statute fields while preserving source identity, text, and provenance", async () => {
  const metadata = { runtime_source: "legacy_compat", field_provenance: { citation: { source_locator: "lines:1-3" } } };
  mocks.statutes.mockResolvedValueOnce([{ id: "statute-uuid", runtime_entity_id: "statute-uuid",
    keyProvisions: "Unchanged source text", metadata }]);
  const records = await read_case_statutes({ jurisdiction: "WA" });
  expect(records).toEqual([{ id: "statute-uuid", runtime_entity_id: "statute-uuid",
    key_provisions: "Unchanged source text", metadata }]);
  expect(records[0].metadata).toBe(metadata);
  expect_snake_keys(records);
});

it("normalizes every legal-statistics key without conflating ready and held totals", async () => {
  mocks.stats.mockResolvedValueOnce({ statutes: 12, case_law: 3, enforcement_records: 4, weak_joints: 5,
    contradictions: 6, current_corpus_legal_authorities: 1762, held_legal_references: 177 });
  const stats = await read_case_legal_stats("WA");
  expect(stats).toEqual({ statutes: 12, case_law: 3, enforcement_records: 4, weak_joints: 5,
    contradictions: 6, current_corpus_legal_authorities: 1762, held_legal_references: 177 });
  expect_snake_keys(stats);
});

it("passes through owned enforcement DTOs and preserves exact pathway identity and source status", async () => {
  mocks.pathways.mockResolvedValueOnce({
    availability: { status: "source_text_only", reason: "Stored source text" }, matched_by: "pipeline_category",
    requested: { agency_short: null, claim_type: null, pipeline_category: "housing" },
    filter_options: { agency_shorts: ["AGENCY"], claim_types: ["claim-source"], pipeline_categories: ["housing"] },
    total_source_rows: 2, matched_source_rows: 1, returned_source_rows: 1, return_limit: 50,
    source_contract: "enforcement_model_step_source_references_v2",
    pathways: [{ id: "source-uuid", pathway_id: "pathway-source-id", pathway_name: "Agency", jurisdiction: "WA",
      domain: "housing", description: "Stored text", agency_short: "AGENCY", claim_types: ["claim-source"],
      pipeline_categories: ["housing"], source_state: "source_text_only", source_pending: true,
      source_url: "https://example.gov", source_file: "source.json", source_sha256: "source-hash", created_at: "source-date" }],
  });
  const result = await read_case_enforcement_pathways({ jurisdiction: "WA", pipeline_category: "housing" });
  expect(mocks.pathways).toHaveBeenCalledWith({ jurisdiction: "WA", pipeline_category: "housing" });
  expect(result).toMatchObject({ matched_by: "pipeline_category", total_source_rows: 2, matched_source_rows: 1,
    pathways: [{ id: "source-uuid", pathway_id: "pathway-source-id", source_state: "source_text_only",
      source_pending: true, source_sha256: "source-hash", source_file: "source.json" }] });
  expect_snake_keys(result);
});

it("normalizes timeline presentation fields without changing event IDs or canonical provenance", async () => {
  const hashes = ["sealed-output-hash"];
  mocks.timeline.mockResolvedValueOnce([{ id: "event-uuid", datePrecision: "day", sortKey: 10, documentId: 51,
    documentName: "Source", entityNames: ["Person"], evidentiaryWeight: "unverified",
    canonical_output_hashes: hashes, canonical_receipt_hashes: ["receipt-hash"], canonical_source_artifact_key: "source-key" }]);
  const result = await read_case_timeline(41);
  expect(result).toEqual([{ id: "event-uuid", date_precision: "day", sort_key: 10, document_id: 51,
    document_name: "Source", entity_names: ["Person"], evidentiary_weight: "unverified",
    canonical_output_hashes: hashes, canonical_receipt_hashes: ["receipt-hash"], canonical_source_artifact_key: "source-key" }]);
  expect(result[0].canonical_output_hashes).toBe(hashes);
  expect_snake_keys(result);
});
