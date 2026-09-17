import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
import { get_civic_genome_rosetta_evaluation } from "./civic-genome-rosetta-evaluation";

const genome_bill_id = "00000000-0000-4000-8000-000000000001";
const bill_version_id = "00000000-0000-4000-8000-000000000002";
const source_registry_id = "00000000-0000-4000-8000-000000000003";
const stage_id = "00000000-0000-4000-8000-000000000004";
const attempt_id = "00000000-0000-4000-8000-000000000005";
const source_document_key = "text:5631:9821";
const source_content_hash = "a".repeat(64);
const output_content_hash = "d".repeat(64);
const rule_manifest_hash = "b".repeat(64);
const configuration_hash = "c".repeat(64);
const closure_hash = "e".repeat(64);
const receipt_hash = "f".repeat(64);
const binding = {
  bill_version_id,
  version_type: "enrolled",
  source_document_key,
  source_document_id: 5631,
  source_content_hash,
};
const fetch_mock = vi.fn();

type precise_state = "complete" | "processing" | "held" | "failed" | "not_admitted";
function current_source_status_fixture(state: precise_state = "complete") {
  const admitted = state !== "not_admitted";
  const complete = state === "complete";
  const processing = state === "processing";
  const failed = state === "failed";
  return {
    contract: "rosetta-current-source-result-v1",
    state,
    source_document_key,
    source_content_hash,
    rosetta_source_document_id: 5631,
    rosetta_source_registry_id: admitted ? source_registry_id : null,
    source_registry_id: admitted ? source_registry_id : null,
    current_engine_id: admitted ? source_registry_id : null,
    current_engine_version: admitted ? "rosetta-v3-deterministic-sql-2.5.33" : null,
    current_rule_set_version: admitted ? "rules-2.5.33" : null,
    current_rule_manifest_hash: admitted ? rule_manifest_hash : null,
    current_manifest_hash: admitted ? rule_manifest_hash : null,
    current_closure_hash: admitted ? closure_hash : null,
    current_configuration_hash: admitted ? configuration_hash : null,
    stage_id: admitted ? stage_id : null,
    attempt_id: admitted ? attempt_id : null,
    extraction_run_id: complete ? 9821 : null,
    assembly_run_id: null,
    assembly_required: false,
    validation_run_id: null,
    validation_receipt_id: complete ? "manifest:9821" : null,
    validation_receipt_hash: complete ? rule_manifest_hash : null,
    output_content_hash: complete ? output_content_hash : null,
    result_eligible: complete,
    failure_class: failed ? "timeout" : null,
    failure_code: failed ? "57014" : null,
    failure_stage: failed ? "extraction" : null,
    failure_message_safe: failed ? "Database statement canceled at the recorded stage." : null,
    held_reason: state === "held" ? "awaiting_result_reconciliation" : null,
    started_at: admitted ? "2026-09-15T05:59:00Z" : null,
    amendment_readiness: admitted ? "not_applicable" : null,
    base_source_document_key: null,
    base_source_content_hash: null,
    amendment_attachment_state: null,
    amendment_attachment_receipt_hash: null,
    observed_at: "2026-09-15T06:00:00Z",
    completed_at: complete || failed ? "2026-09-15T06:00:00Z" : null,
    receipt_hash: complete || failed ? receipt_hash : null,
    automatic_retry: false,
    replay_policy: "explicit_distinct_remediation_only",
  };
}

function current_result_fixture(status: "complete" | "requires_review" | "awaiting_analysis" | "unavailable" = "complete") {
  const precise: precise_state = status === "complete" ? "complete"
    : status === "requires_review" ? "held"
      : status === "awaiting_analysis" ? "processing" : "not_admitted";
  return {
    contract: "rosetta-public-current-docket-result-v1",
    docket_source_key: source_document_key,
    source_content_hash,
    source_registry_id: status === "unavailable" ? null : source_registry_id,
    status,
    current_result: status === "complete" ? {
      extraction_run_id: 9821,
      output_content_hash,
      engine_version: "rosetta-v3-deterministic-sql-2.5.33",
      rule_set_version: "rules-2.5.33",
      rule_manifest_hash,
      configuration_hash,
      completed_at: "2026-09-15T06:00:00Z",
      admissibility_state: "admissible",
    } : null,
    coverage: Object.fromEntries(["help", "workflow", "accountability", "override", "definition"].map(key => [key, { status: "populated" }])),
    validation_summary: { terminal: status === "complete", validator_count: status === "complete" ? 9 : 0 },
    public_reason: status === "complete" ? "Current result is assembly-ready." : `Current result is ${status}.`,
    current_source_status: current_source_status_fixture(precise),
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
    fetch_mock.mockResolvedValue(Response.json(current_result_fixture()));
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
    expect(result.current_docket_result?.current_source_status?.state).toBe("complete");
  });

  it.each([
    ["requires_review", "held"],
    ["awaiting_analysis", "processing"],
    ["unavailable", "not_admitted"],
  ] as const)(
    "preserves compatibility state %s and precise state %s without fallback",
    async (status, precise) => {
      fetch_mock.mockResolvedValue(Response.json(current_result_fixture(status)));
      const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id });
      expect(result.current_docket_result?.status).toBe(status);
      expect(result.current_docket_result?.current_source_status?.state).toBe(precise);
      expect(result.current_docket_result?.current_result).toBeNull();
      expect(fetch_mock).toHaveBeenCalledTimes(1);
    },
  );

  it("accepts the pre-cutover compatibility payload while Rosetta and Lighthouse deploy independently", async () => {
    const payload = current_result_fixture("unavailable");
    const { current_source_status: _precise, ...compatibility } = payload;
    fetch_mock.mockResolvedValue(Response.json(compatibility));
    const result = await get_civic_genome_rosetta_evaluation({ genome_bill_id });
    expect(result.current_docket_result?.status).toBe("unavailable");
    expect(result.current_docket_result?.current_source_status).toBeUndefined();
  });

  it("rejects precise identity disagreement rather than falling back", async () => {
    const payload = current_result_fixture("unavailable");
    payload.current_source_status.source_document_key = "text:other:version";
    fetch_mock.mockResolvedValue(Response.json(payload));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow();
  });

  it("uses the configured host for both data reads and exact reader links", async () => {
    vi.stubEnv("ROSETTA_REVIEW_BASE_URL", "https://review.example.org/");
    fetch_mock.mockResolvedValue(Response.json(current_result_fixture()));
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
      ...current_result_fixture(),
      docket_source_key: "text:9999:9821",
    }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow(
      "rosetta_public_current_docket_result_source_document_key_mismatch",
    );
  });

  it("rejects a stale hash result", async () => {
    fetch_mock.mockResolvedValue(Response.json({
      ...current_result_fixture(),
      source_content_hash: "b".repeat(64),
    }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow(
      "rosetta_public_current_docket_result_source_content_hash_mismatch",
    );
  });

  it.each([
    undefined,
    { ...current_result_fixture(), contract: "rosetta-public-current-docket-result-v0" },
  ])("rejects a missing or mismatched public current contract: %j", async payload => {
    fetch_mock.mockResolvedValue(payload === undefined
      ? Response.json({})
      : Response.json(payload));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow();
  });

  it("rejects a historical review-detail payload on the current-only path", async () => {
    fetch_mock.mockResolvedValue(Response.json({
      ...current_result_fixture(),
      selected_attempt: { attempt_id: "legacy" },
    }));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow();
  });

  it.each([
    { ...current_result_fixture(), current_result: null },
    { ...current_result_fixture(), coverage: { attempts: [] } },
    { ...current_result_fixture(), coverage: { definition: { status: "populated", route_history: [] } } },
    { ...current_result_fixture(), validation_summary: { validator_count: 9, historical_validation: [] } },
    ...(["requires_review", "awaiting_analysis", "unavailable"] as const).map(status => ({ ...current_result_fixture(), status })),
    ...["rejected", "pending"].map(admissibility_state => ({ ...current_result_fixture(), current_result: { ...current_result_fixture().current_result!, admissibility_state } })),
    ...[0, "0", "00", "-1", "1.5", Number.MAX_SAFE_INTEGER + 1].map(extraction_run_id => ({ ...current_result_fixture(), current_result: { ...current_result_fixture().current_result!, extraction_run_id } })),
    ...["yesterday", "2026-09-15", "2026-09-15T06:00:00"].map(completed_at => ({ ...current_result_fixture(), current_result: { ...current_result_fixture().current_result!, completed_at } })),
  ])("rejects inconsistent or malformed current result %# without fallback", async payload => {
    fetch_mock.mockResolvedValue(Response.json(payload));
    await expect(get_civic_genome_rosetta_evaluation({ genome_bill_id })).rejects.toThrow();
    expect(fetch_mock).toHaveBeenCalledOnce();
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
