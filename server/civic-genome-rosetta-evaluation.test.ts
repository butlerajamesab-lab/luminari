import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
import { get_civic_genome_rosetta_evaluation } from "./civic-genome-rosetta-evaluation";

const genome_bill_id = "00000000-0000-4000-8000-000000000001";
const bill_version_id = "00000000-0000-4000-8000-000000000002";
const source_registry_id = "00000000-0000-4000-8000-000000000003";
const other_id = "00000000-0000-4000-8000-000000000004";
const attempt_id = "00000000-0000-4000-8000-000000000005";
const source_document_key = "text:5631:9821";
const source_content_hash = "a".repeat(64);
const binding = { bill_version_id, version_type: "enrolled", source_document_key, source_document_id: 5631, source_content_hash };
const fetch_mock = vi.fn();

function detail(version = "2.5.33") {
  const engine_version = `rosetta-v3-deterministic-sql-${version}`;
  const rule_set_version = `rules-${version}`;
  const configuration_hash = "c".repeat(64);
  const output_content_hash = "d".repeat(64);
  const suffix = version.replaceAll(".", "");
  const names = ["canonical_rows_source_bound", `exact_source_structure_v${suffix}`, "five_layer_coverage", `independent_structure_v${suffix}`, "no_pending_coverage", "output_hash_verified", "source_bytes_receipted", "source_hash_verified", "structural_correctness_v2"];
  const attempt = { attempt_id, source_registry_id, source_document_id: 5631, source_content_hash, extraction_run_id: 9821, engine_version, rule_set_version, configuration_hash, output_content_hash, status: "passed" };
  return {
    contract: "rosetta-review-law-v1", observed_at: "2026-09-15T06:00:00Z", publication_status: "candidate", status: "passed",
    failure_class: null, parser_invoked: false, evidence_created: false,
    source: { source_registry_id, source_document_id: 5631, source_content_id: other_id, source_content_hash, source_url: "https://example.org/law", document_name: "Example law", document_identifier: "2028058" },
    current_docket_bound_result: {
      contract: "rosetta-current-docket-bound-result-v1",
      source_document_key,
      source_content_hash,
    },
    selected_attempt: attempt, attempts: [attempt],
    law_view: { extraction_run_id: 9821, source_document_id: 5631, source_content_hash, engine_version, rule_set_version, configuration_hash, output_content_hash, objects: [{ layer: "definition", key: "term", source_object_type: "term_definition", source_object_id: "term-1", source_block_id: "block-1", extraction_run_id: "9821", normalized_value: { defined_term: "term", definition: "Example." }, confidence: 1, confirmed: true }], coverage: {} },
    validation_results: names.map(test_name => ({ extraction_run_id: 9821, test_name, test_result: "pass", failure_count: 0 })),
    source_receipt: { source_document_id: 5631, source_content_id: other_id, source_content_hash },
    extraction_manifest: { extraction_run_id: 9821, source_document_id: 5631, source_content_id: other_id, source_hash: source_content_hash, engine_version, rule_set_version, configuration_hash, output_hash: output_content_hash },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetch_mock);
  vi.stubEnv("ROSETTA_REVIEW_BASE_URL", "https://rosetta-v3-platform.onrender.com");
  query.mockResolvedValue({ rows: [binding] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Civic Genome saved Rosetta evaluation", () => {
  it("reads the exact version's stored Rosetta document and content hash, with an attempt-pinned reader link", async () => {
    fetch_mock.mockResolvedValue(Response.json(detail()));
    const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id, bill_version_id });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain("where genome_bill_id = $1::uuid");
    expect(query.mock.calls[0][0]).toContain("bill_version_id = $2::uuid");
    expect(query.mock.calls[0][1]).toEqual([genome_bill_id, bill_version_id]);
    const url = new URL(String(fetch_mock.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/review/laws/resolve");
    expect(url.searchParams.get("source_document_key")).toBe(source_document_key);
    expect(url.searchParams.get("source_content_hash")).toBe(source_content_hash);
    expect(url.searchParams.get("source_document_id")).toBeNull();
    expect(fetch_mock.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "error" });
    expect(fetch_mock.mock.calls[0][1]).not.toHaveProperty("body");
    expect(result.review_url).toBe(`https://rosetta-v3-platform.onrender.com/review/${source_registry_id}/${attempt_id}`);
    expect(result.evaluation?.status).toBe("passed");
    expect(result.evaluation?.publication_status).toBe("candidate");
  });

  it.each(["failed", "held", "unprocessed", "processing"] as const)("preserves %s instead of manufacturing a pass", async status => {
    const payload = { ...detail(), status, selected_attempt: null, attempts: [], law_view: null, validation_results: [], extraction_manifest: null };
    fetch_mock.mockResolvedValue(Response.json(payload));
    expect((await get_civic_genome_rosetta_evaluation({ genome_bill_id })).evaluation?.status).toBe(status);
  });

  it("uses the configured host for both data reads and exact reader links", async () => {
    vi.stubEnv("ROSETTA_REVIEW_BASE_URL", "https://review.example.org/");
    fetch_mock.mockResolvedValue(Response.json(detail()));
    const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id });
    expect(new URL(String(fetch_mock.mock.calls[0][0])).origin).toBe("https://review.example.org");
    expect(new URL(result.review_url).origin).toBe("https://review.example.org");
  });

  it.each([null, { ...binding, source_document_key: null }, { ...binding, source_document_id: null }, { ...binding, source_content_hash: null }, { ...binding, source_content_hash: "bad" }])("does not infer missing source identity", async missing => {
    query.mockResolvedValue({ rows: missing ? [missing] : [] });
    const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id });
    expect(result.availability).toBe("binding_missing");
    expect(result.evaluation).toBeNull();
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("rejects a key mismatch in the current docket compact payload", async () => {
    fetch_mock.mockResolvedValue(Response.json({
      ...detail(),
      current_docket_bound_result: {
        contract: "rosetta-current-docket-bound-result-v1",
        source_document_key: "text:9999:9821",
        source_content_hash,
      },
    }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow(
      "rosetta_current_docket_bound_result_source_document_key_mismatch",
    );
  });

  it("rejects a hash mismatch in the current docket compact payload", async () => {
    fetch_mock.mockResolvedValue(Response.json({
      ...detail(),
      current_docket_bound_result: {
        contract: "rosetta-current-docket-bound-result-v1",
        source_document_key,
        source_content_hash: "b".repeat(64),
      },
    }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow(
      "rosetta_current_docket_bound_result_source_content_hash_mismatch",
    );
  });

  it.each([
    undefined,
    null,
    { contract: "rosetta-current-docket-bound-result-v0", source_document_key, source_content_hash },
  ])("rejects a missing or mismatched compact docket payload: %j", async current_docket_bound_result => {
    fetch_mock.mockResolvedValue(Response.json({
      ...detail(),
      current_docket_bound_result,
    }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow(
      current_docket_bound_result
        ? "rosetta_current_docket_bound_result_contract_mismatch"
        : "rosetta_current_docket_bound_result_missing",
    );
  });

  it("does not fall back to a document-id-only resolve selector", async () => {
    fetch_mock.mockResolvedValue(Response.json({
      ...detail(),
      current_docket_bound_result: {
        contract: "rosetta-current-docket-bound-result-v1",
        source_content_hash,
      },
    }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow(
      "rosetta_current_docket_bound_result_source_document_key_missing",
    );
    const url = new URL(String(fetch_mock.mock.calls[0][0]));
    expect(url.searchParams.get("source_document_key")).toBe(source_document_key);
    expect(url.searchParams.get("source_document_id")).toBeNull();
  });

  it("distinguishes an absent evaluation from an unprocessed source", async () => {
    fetch_mock.mockResolvedValue(new Response("missing", { status: 404 }));
    expect(await get_civic_genome_rosetta_evaluation({ genome_bill_id })).toMatchObject({ availability: "not_in_evaluation", evaluation: null });
  });

  it.each([409, 500, 503])("keeps HTTP %s errors out of source statuses", async status => {
    fetch_mock.mockResolvedValue(new Response("private upstream detail", { status }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow(`rosetta_evaluation_read_failed:${status}`);
  });

  it.each(["document", "hash", "attempt_source", "attempt_hash", "history_source", "object_run", "view_run", "view_document", "view_hash", "view_engine", "view_rules", "view_config", "view_output", "validation_run", "manifest_run", "manifest_hash", "manifest_content", "manifest_rules", "manifest_config", "manifest_output", "receipt_hash", "receipt_content"])("rejects a mismatched %s identity", async mismatch => {
    const payload = detail();
    if (mismatch === "document") payload.source.source_document_id++;
    if (mismatch === "hash") payload.source.source_content_hash = "b".repeat(64);
    if (mismatch === "attempt_source") payload.selected_attempt = { ...payload.selected_attempt, source_registry_id: other_id };
    if (mismatch === "attempt_hash") payload.selected_attempt = { ...payload.selected_attempt, source_content_hash: "b".repeat(64) };
    if (mismatch === "history_source") payload.attempts = [{ ...payload.attempts[0], source_registry_id: other_id }];
    if (mismatch === "object_run") payload.law_view.objects[0].extraction_run_id = "9822";
    if (mismatch === "view_run") payload.law_view.extraction_run_id++;
    if (mismatch === "view_document") payload.law_view.source_document_id++;
    if (mismatch === "view_hash") payload.law_view.source_content_hash = "b".repeat(64);
    if (mismatch === "view_engine") payload.law_view.engine_version += "-different";
    if (mismatch === "view_rules") payload.law_view.rule_set_version += "-different";
    if (mismatch === "view_config") payload.law_view.configuration_hash = "b".repeat(64);
    if (mismatch === "view_output") payload.law_view.output_content_hash = "b".repeat(64);
    if (mismatch === "validation_run") payload.validation_results[0].extraction_run_id++;
    if (mismatch === "manifest_run") payload.extraction_manifest.extraction_run_id++;
    if (mismatch === "manifest_hash") payload.extraction_manifest.source_hash = "b".repeat(64);
    if (mismatch === "manifest_content") payload.extraction_manifest.source_content_id = source_registry_id;
    if (mismatch === "manifest_rules") payload.extraction_manifest.rule_set_version += "-different";
    if (mismatch === "manifest_config") payload.extraction_manifest.configuration_hash = "b".repeat(64);
    if (mismatch === "manifest_output") payload.extraction_manifest.output_hash = "b".repeat(64);
    if (mismatch === "receipt_hash") payload.source_receipt.source_content_hash = "b".repeat(64);
    if (mismatch === "receipt_content") payload.source_receipt.source_content_id = source_registry_id;
    fetch_mock.mockResolvedValue(Response.json(payload));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow("rosetta_evaluation_source_identity_mismatch");
  });

  it.each(["parser_invoked", "evidence_created"])("rejects a read that reports %s", async field => {
    fetch_mock.mockResolvedValue(Response.json({ ...detail(), [field]: true }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow();
  });

  it.each(["renamed_validator", "wrong_generation_validator", "duplicate_validator", "missing_validator", "extra_validator", "failed_validator", "failure_count"])("rejects a claimed pass with %s", async defect => {
    const payload = detail();
    if (defect === "renamed_validator") payload.validation_results[0].test_name = "something_else";
    if (defect === "wrong_generation_validator") payload.validation_results[1].test_name = "exact_source_structure_v2528";
    if (defect === "duplicate_validator") payload.validation_results[0].test_name = payload.validation_results[1].test_name;
    if (defect === "missing_validator") payload.validation_results.pop();
    if (defect === "extra_validator") payload.validation_results.push(payload.validation_results[0]);
    if (defect === "failed_validator") payload.validation_results[0].test_result = "fail";
    if (defect === "failure_count") payload.validation_results[0].failure_count = 1;
    fetch_mock.mockResolvedValue(Response.json(payload));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow("rosetta_evaluation_pass_evidence_missing");
  });

  it.each(["2.5.28", "2.5.29", "2.5.30", "2.5.32", "2.5.33"])("accepts the exact nine validators for %s without optional summary flags", async version => {
    fetch_mock.mockResolvedValue(Response.json(detail(version)));
    expect((await get_civic_genome_rosetta_evaluation({ genome_bill_id })).evaluation?.status).toBe("passed");
  });

  it("bounds the whole read including a stalled response body", async () => {
    vi.useFakeTimers();
    fetch_mock.mockImplementation(async (_url, options) => ({ ok: true, status: 200, json: () => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))) }));
    const promise = get_civic_genome_rosetta_evaluation({ genome_bill_id });
    const assertion = expect(promise).rejects.toThrow("rosetta_evaluation_read_timeout");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });
});
