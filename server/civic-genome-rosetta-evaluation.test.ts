import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
import { get_civic_genome_rosetta_evaluation } from "./civic-genome-rosetta-evaluation";

const genome_bill_id = "00000000-0000-4000-8000-000000000001";
const bill_version_id = "00000000-0000-4000-8000-000000000002";
const source_registry_id = "00000000-0000-4000-8000-000000000003";
const other_id = "00000000-0000-4000-8000-000000000004";
const attempt_id = "00000000-0000-4000-8000-000000000005";
const source_content_hash = "a".repeat(64);
const binding = { bill_version_id, version_type: "enrolled", source_document_id: 5631, source_content_hash };
const fetch_mock = vi.fn();

function detail() {
  const attempt = { attempt_id, source_registry_id, extraction_run_id: 9821, engine_version: "2.5.33", status: "passed", identity_valid: true, validator_count: 9, all_validators_pass: true };
  return {
    contract: "rosetta-review-law-v1", observed_at: "2026-09-15T06:00:00Z", publication_status: "candidate", status: "passed",
    failure_class: null, parser_invoked: false, evidence_created: false,
    source: { source_registry_id, source_document_id: 5631, source_content_id: other_id, source_content_hash, source_url: "https://example.org/law", document_name: "Example law", document_identifier: "2028058" },
    selected_attempt: attempt, attempts: [attempt],
    law_view: { objects: [{ layer: "definition", key: "term", source_object_type: "term_definition", source_object_id: "term-1", source_block_id: "block-1", extraction_run_id: "9821", normalized_value: { defined_term: "term", definition: "Example." }, confidence: 1, confirmed: true }], coverage: {} },
    validation_results: [{ test_name: "source_spans", test_result: "pass" }], source_receipt: {}, extraction_manifest: {},
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
    expect(url.searchParams.get("source_document_id")).toBe("5631");
    expect(url.searchParams.get("source_content_hash")).toBe(source_content_hash);
    expect(fetch_mock.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "error" });
    expect(fetch_mock.mock.calls[0][1]).not.toHaveProperty("body");
    expect(result.review_url).toBe(`https://rosetta-v3-platform.onrender.com/review/laws/${source_registry_id}?attempt_id=${attempt_id}`);
    expect(result.evaluation?.status).toBe("passed");
    expect(result.evaluation?.publication_status).toBe("candidate");
  });

  it.each(["failed", "held", "unprocessed", "processing"] as const)("preserves %s instead of manufacturing a pass", async status => {
    const payload = { ...detail(), status, selected_attempt: null, attempts: [], law_view: null };
    fetch_mock.mockResolvedValue(Response.json(payload));
    expect((await get_civic_genome_rosetta_evaluation({ genome_bill_id })).evaluation?.status).toBe(status);
  });

  it.each([null, { ...binding, source_document_id: null }, { ...binding, source_content_hash: null }, { ...binding, source_content_hash: "bad" }])("does not infer missing source identity", async missing => {
    query.mockResolvedValue({ rows: missing ? [missing] : [] });
    const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id });
    expect(result.availability).toBe("binding_missing");
    expect(result.evaluation).toBeNull();
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("distinguishes an absent evaluation from an unprocessed source", async () => {
    fetch_mock.mockResolvedValue(new Response("missing", { status: 404 }));
    expect(await get_civic_genome_rosetta_evaluation({ genome_bill_id })).toMatchObject({ availability: "not_in_evaluation", evaluation: null });
  });

  it.each([409, 500, 503])("keeps HTTP %s errors out of source statuses", async status => {
    fetch_mock.mockResolvedValue(new Response("private upstream detail", { status }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow(`rosetta_evaluation_read_failed:${status}`);
  });

  it.each(["document", "hash", "attempt_source", "history_source", "object_run"])("rejects a mismatched %s identity", async mismatch => {
    const payload = detail();
    if (mismatch === "document") payload.source.source_document_id++;
    if (mismatch === "hash") payload.source.source_content_hash = "b".repeat(64);
    if (mismatch === "attempt_source") payload.selected_attempt = { ...payload.selected_attempt, source_registry_id: other_id };
    if (mismatch === "history_source") payload.attempts = [{ ...payload.attempts[0], source_registry_id: other_id }];
    if (mismatch === "object_run") payload.law_view.objects[0].extraction_run_id = "9822";
    fetch_mock.mockResolvedValue(Response.json(payload));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow("rosetta_evaluation_source_identity_mismatch");
  });

  it.each(["parser_invoked", "evidence_created"])("rejects a read that reports %s", async field => {
    fetch_mock.mockResolvedValue(Response.json({ ...detail(), [field]: true }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow();
  });

  it.each(["identity_valid", "all_validators_pass"])("rejects a claimed pass without %s", async field => {
    const payload = detail();
    payload.selected_attempt = { ...payload.selected_attempt, [field]: false };
    fetch_mock.mockResolvedValue(Response.json(payload));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow("rosetta_evaluation_pass_evidence_missing");
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
