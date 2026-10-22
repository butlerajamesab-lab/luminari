import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query, inspect } = vi.hoisted(() => ({ query: vi.fn(), inspect: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
vi.mock("./civic-genome-rosetta-v12-admission", () => ({
  inspect_v12_admission_for_binding: inspect,
}));
import {
  get_civic_genome_rosetta_evaluation,
  load_rosetta_current_docket_result_for_binding,
} from "./civic-genome-rosetta-evaluation";

const genome_bill_id = "00000000-0000-4000-8000-000000000001";
const bill_version_id = "00000000-0000-4000-8000-000000000002";
const source_document_key = "text:5631:9821";
const source_content_hash = "a".repeat(64);
const source_content_id = "11111111-1111-4111-8111-111111111111";
const binding = {
  bill_version_id,
  version_type: "enrolled",
  source_document_key,
  source_document_id: 5631,
  source_content_hash,
  source_content_id,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ROSETTA_REVIEW_BASE_URL", "https://rosetta.example.test");
  query.mockResolvedValue({ rows: [binding] });
});
afterEach(() => vi.unstubAllEnvs());

function observe(admission_state: "admitted" | "rejected" | "held" | "failed", reason: string | null) {
  inspect.mockResolvedValue({
    receipt: {
      admitted: admission_state === "admitted",
      admission_state,
      reason,
      source_document_key,
      source_content_hash,
    },
    canonical_unit_layers: [],
  });
}

describe("Civic Genome V12 evaluation", () => {
  it("reads exact saved version binding and returns V12 rejection rather than legacy current result", async () => {
    observe("rejected", "rosetta_v12_certification_receipt_missing");
    const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id, bill_version_id });
    expect(query.mock.calls[0][0]).toContain("bill_version_id = $2::uuid");
    expect(inspect).toHaveBeenCalledWith({
      bill_version_id, source_document_key, source_content_hash,
      rosetta_source_document_id: 5631,
      rosetta_source_content_id: source_content_id,
    });
    expect(result.current_docket_result).toBeNull();
    expect(result.availability).toBe("rejected");
    expect(result.v12_admission?.reason).toBe("rosetta_v12_certification_receipt_missing");
  });

  it.each([
    ["admitted", null, "available"],
    ["held", "rosetta_v12_hold_receipt_present", "held"],
    ["failed", "rosetta_v12_failure_receipts_present", "failed"],
    ["rejected", "rosetta_v12_live_rule_http_404", "not_in_evaluation"],
  ] as const)("maps %s to the truthful V12 visibility state", async (state, reason, expected) => {
    observe(state, reason);
    const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id });
    expect(result.availability).toBe(expected);
    expect(result.current_docket_result).toBeNull();
  });

  it.each([
    null,
    { ...binding, source_document_key: null },
    { ...binding, source_document_id: null },
    { ...binding, source_content_hash: null },
    { ...binding, source_content_hash: "bad" },
  ])("does not infer missing source identity", async row => {
    query.mockResolvedValue({ rows: row ? [row] : [] });
    const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id });
    expect(result.availability).toBe("binding_missing");
    expect(result.v12_admission).toBeNull();
    expect(inspect).not.toHaveBeenCalled();
  });

  it("rejects all attempts to revive the retired reader; makes no network request", async () => {
    const fetch_mock = vi.fn();
    vi.stubGlobal("fetch", fetch_mock);
    await expect(load_rosetta_current_docket_result_for_binding({
      source_document_key, source_content_hash,
    })).rejects.toThrow("rosetta_v12_legacy_current_docket_reader_retired");
    expect(fetch_mock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
