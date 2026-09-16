import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
import { get_civic_genome_rosetta_evaluation } from "./civic-genome-rosetta-evaluation";

const genome_bill_id = "00000000-0000-4000-8000-000000000001";
const bill_version_id = "00000000-0000-4000-8000-000000000002";
const source_registry_id = "00000000-0000-4000-8000-000000000003";
const source_document_key = "text:5631:9821";
const source_content_hash = "a".repeat(64);
const output_content_hash = "d".repeat(64);
const binding = {
  bill_version_id,
  version_type: "enrolled",
  source_document_key,
  source_document_id: 5631,
  source_content_hash,
};
const fetch_mock = vi.fn();

function currentResult(status: "complete" | "requires_review" | "awaiting_analysis" | "unavailable" = "complete") {
  return {
    contract: "rosetta-public-current-docket-result-v1",
    docket_source_key: source_document_key,
    source_content_hash,
    source_registry_id,
    status,
    current_result: status === "complete" ? {
      extraction_run_id: 9821,
      output_content_hash,
      engine_version: "rosetta-v3-deterministic-sql-2.5.33",
      rule_set_version: "rules-2.5.33",
      rule_manifest_hash: "b".repeat(64),
      configuration_hash: "c".repeat(64),
      completed_at: "2026-09-15T06:00:00Z",
      admissibility_state: "admissible",
    } : null,
    coverage: { definition: { status: "populated" } },
    validation_summary: { terminal: status === "complete", validator_count: status === "complete" ? 9 : 0 },
    public_reason: status === "complete" ? "Current result is assembly-ready." : `Current result is ${status}.`,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetch_mock);
  vi.stubEnv("ROSETTA_REVIEW_BASE_URL", "https://rosetta-v3-platform.onrender.com");
  query.mockResolvedValue({ rows: [binding] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Civic Genome current Rosetta result", () => {
  it("reads only the bounded current-docket endpoint with exact key and hash", async () => {
    fetch_mock.mockResolvedValue(Response.json(currentResult()));
    const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id, bill_version_id });
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain("where genome_bill_id = $1::uuid");
    expect(query.mock.calls[0][0]).toContain("bill_version_id = $2::uuid");
    expect(query.mock.calls[0][1]).toEqual([genome_bill_id, bill_version_id]);
    const url = new URL(String(fetch_mock.mock.calls[0][0]));
    expect(url.pathname).toBe("/api/public/current-docket-result");
    expect(url.searchParams.get("source_document_key")).toBe(source_document_key);
    expect(url.searchParams.get("source_content_hash")).toBe(source_content_hash);
    expect(url.searchParams.get("source_document_id")).toBeNull();
    expect(String(fetch_mock.mock.calls[0][0])).not.toContain("/api/review/laws/resolve");
    expect(fetch_mock.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "error" });
    expect(fetch_mock.mock.calls[0][1]).not.toHaveProperty("body");
    expect(result.review_url).toBe(`https://rosetta-v3-platform.onrender.com/review/${source_registry_id}`);
    expect(result.current_docket_result?.status).toBe("complete");
  });

  it.each(["requires_review", "awaiting_analysis", "unavailable"] as const)(
    "preserves explicit non-assembly state %s without fallback",
    async status => {
      fetch_mock.mockResolvedValue(Response.json(currentResult(status)));
      const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id });
      expect(result.current_docket_result?.status).toBe(status);
      expect(result.current_docket_result?.current_result).toBeNull();
      expect(fetch_mock).toHaveBeenCalledTimes(1);
    },
  );

  it("uses the configured host for both data reads and exact reader links", async () => {
    vi.stubEnv("ROSETTA_REVIEW_BASE_URL", "https://review.example.org/");
    fetch_mock.mockResolvedValue(Response.json(currentResult()));
    const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id });
    expect(new URL(String(fetch_mock.mock.calls[0][0])).origin).toBe("https://review.example.org");
    expect(new URL(result.review_url).origin).toBe("https://review.example.org");
  });

  it.each([
    null,
    { ...binding, source_document_key: null },
    { ...binding, source_document_id: null },
    { ...binding, source_content_hash: null },
    { ...binding, source_content_hash: "bad" },
  ])("does not infer missing source identity", async missing => {
    query.mockResolvedValue({ rows: missing ? [missing] : [] });
    const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id });
    expect(result.availability).toBe("binding_missing");
    expect(result.current_docket_result).toBeNull();
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("rejects a stale key result", async () => {
    fetch_mock.mockResolvedValue(Response.json({
      ...currentResult(),
      docket_source_key: "text:9999:9821",
    }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow(
      "rosetta_public_current_docket_result_source_document_key_mismatch",
    );
  });

  it("rejects a stale hash result", async () => {
    fetch_mock.mockResolvedValue(Response.json({
      ...currentResult(),
      source_content_hash: "b".repeat(64),
    }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow(
      "rosetta_public_current_docket_result_source_content_hash_mismatch",
    );
  });

  it.each([
    undefined,
    { ...currentResult(), contract: "rosetta-public-current-docket-result-v0" },
  ])("rejects a missing or mismatched public current contract: %j", async payload => {
    fetch_mock.mockResolvedValue(payload === undefined
      ? Response.json({})
      : Response.json(payload));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow();
  });

  it("rejects a historical review-detail payload on the current-only path", async () => {
    fetch_mock.mockResolvedValue(Response.json({
      ...currentResult(),
      selected_attempt: { attempt_id: "legacy" },
    }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow();
  });

  it("distinguishes an absent current result from a bound source", async () => {
    fetch_mock.mockResolvedValue(new Response("missing", { status: 404 }));
    expect(await get_civic_genome_rosetta_evaluation({ genome_bill_id })).toMatchObject({
      availability: "not_in_evaluation",
      current_docket_result: null,
    });
  });

  it.each([409, 500, 503])("keeps HTTP %s errors out of source statuses", async status => {
    fetch_mock.mockResolvedValue(new Response("private upstream detail", { status }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow(
      `rosetta_public_current_docket_result_read_failed:${status}`,
    );
  });

  it("bounds the whole read including a stalled response body", async () => {
    vi.useFakeTimers();
    fetch_mock.mockImplementation(async (_url, options) => ({
      ok: true,
      status: 200,
      json: () => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))),
    }));
    const promise = get_civic_genome_rosetta_evaluation({ genome_bill_id });
    const assertion = expect(promise).rejects.toThrow("rosetta_public_current_docket_result_read_timeout");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });
});
