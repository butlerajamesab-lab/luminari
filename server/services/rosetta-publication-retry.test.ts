import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assert_rosetta_current_publication } from "./rosetta-publication-eligibility";
import { classify_prism_queue_failure } from "./prism-rosetta-queue-worker";
import { enrich_rosetta_binding_request } from "./prism-rosetta-structural-context";
import { query_with_diagnostics } from "../db";

vi.mock("./prism-verification-contract", () => ({
  canonical_json: JSON.stringify,
  sha256_hex: (value: string) => value,
  deep_rosetta_binding_request_schema: { parse: vi.fn() },
}));

vi.mock("../db", () => ({ query_with_diagnostics: vi.fn() }));
vi.mock("./prism-rosetta-activation", () => ({
  PrismRosettaPartialActivationError: class extends Error {},
  activate_prism_for_rosetta_assembly: vi.fn(),
}));
vi.mock("./prism-rosetta-contract-v2", () => ({
  PRISM_ROSETTA_RULE_SET_ID: "test", PRISM_ROSETTA_RULE_SET_VERSION: "test",
}));
vi.mock("./prism-rosetta-client", () => ({
  get_prism_rosetta_circuit_snapshot: vi.fn(), prism_rosetta_circuit_allows_request: vi.fn(),
  prism_rosetta_circuit_cooldown_ms: vi.fn(), prism_rosetta_circuit_failure_threshold: vi.fn(),
  prism_rosetta_request_timeout_ms: vi.fn(),
}));
vi.mock("./prism-verification-client", () => ({ PrismBoundaryError: class extends Error {} }));
vi.mock("../runtime-role", () => ({ background_feature_enabled: vi.fn() }));

const binding = {
  source_document_id: 7, extraction_run_id: "12",
  rosetta_source_identity_hash: "a".repeat(64), rosetta_source_content_hash: "b".repeat(64),
  rosetta_output_content_hash: "c".repeat(64), rosetta_rule_manifest_hash: "d".repeat(64),
  rosetta_configuration_hash: "e".repeat(64),
};

async function rejected_lookup() {
  try { await assert_rosetta_current_publication(binding); }
  catch (error) { return error; }
  throw new Error("lookup unexpectedly admitted the request");
}

function expect_retry(error: unknown, failure_class: string) {
  for (const prior_attempt_count of [0, 4, 5, 20]) {
    for (const receipt_count of [0, 3]) {
      const decision = classify_prism_queue_failure({ error, prior_attempt_count, receipt_count });
      expect(decision).toMatchObject({
        terminal: false, failure_class,
        queue_state: receipt_count ? "receipt_partial" : "degraded",
      });
      expect(decision.retry_delay_seconds).toBeGreaterThan(0);
      expect(decision.retry_delay_seconds).toBeLessThanOrEqual(3600);
    }
  }
}

describe("publication lookup failures remain recoverable in the real queue classifier", () => {
  beforeEach(() => {
    vi.stubEnv("ROSETTA_SUPABASE_URL", "https://rosetta.example");
    vi.stubEnv("ROSETTA_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_unit_test_placeholder");
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

  it.each([408, 429, 500, 502, 503, 504])("keeps HTTP %s retryable beyond five attempts", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    expect_retry(await rejected_lookup(), "transient_upstream");
  });
  it("keeps network failures retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect_retry(await rejected_lookup(), "network");
  });
  it("keeps timeouts retryable", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const lookup = rejected_lookup();
    await vi.advanceTimersByTimeAsync(8_000);
    expect_retry(await lookup, "timeout");
  });
  it("keeps an unavailable owner response retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid json")));
    expect_retry(await rejected_lookup(), "transient_upstream");
  });
  it("rechecks mutable publication eligibility without admitting unpublished work", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]")));
    expect_retry(await rejected_lookup(), "publication_pending");
  });
  it.each([401, 403])("keeps owner authentication HTTP %s recoverable", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    expect_retry(await rejected_lookup(), "authentication");
  });
  it("keeps missing configuration recoverable", async () => {
    vi.stubEnv("ROSETTA_SUPABASE_URL", "");
    expect_retry(await rejected_lookup(), "authentication");
  });
  it("does not retry a deterministic binding mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('[{"extraction_run_id":99}]')));
    const decision = classify_prism_queue_failure({ error: await rejected_lookup(), prior_attempt_count: 0, receipt_count: 0 });
    expect(decision).toMatchObject({ terminal: true, queue_state: "permanent_failure", retry_delay_seconds: 0 });
  });
  it("preserves the existing limit for unrelated unknown errors", () => {
    const decision = classify_prism_queue_failure({ error: new Error("unrelated"), prior_attempt_count: 4, receipt_count: 0 });
    expect(decision.terminal).toBe(true);
  });
});


describe("source snapshot transport failures remain recoverable after publication succeeds", () => {
  beforeEach(() => {
    vi.stubEnv("ROSETTA_SUPABASE_URL", "https://rosetta.example");
    vi.stubEnv("ROSETTA_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_unit_test_placeholder");
    vi.mocked(query_with_diagnostics).mockImplementation(async (_sql, _parameters, options) => ({
      rows: options.label === "prism_rosetta_load_document_context"
        ? [{ document_family: "text", adopted: null }]
        : [{ trait_id: "trait", source_block_id: "block", normalized_value_json: {} }],
    }) as any);
  });
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  async function rejected_source_snapshot(status: number) {
    const published = {
      extraction_run_id: 12, source_document_id: 7,
      source_identity_hash: binding.rosetta_source_identity_hash,
      source_content_hash: binding.rosetta_source_content_hash,
      output_content_hash: binding.rosetta_output_content_hash,
      rule_manifest_hash: binding.rosetta_rule_manifest_hash,
      configuration_hash: binding.rosetta_configuration_hash,
    };
    const upstream = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([published])))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ code: "PGRST002", message: "Source service unavailable" }), { status },
      ));
    vi.stubGlobal("fetch", upstream);
    let failure: unknown;
    try {
      await enrich_rosetta_binding_request({
        rosetta_binding: {
          ...binding, genome_bill_id: "bill", assembly_run_id: "assembly",
          assembly_input_hash: "f".repeat(64), assembly_output_hash: "1".repeat(64),
        },
      } as Parameters<typeof enrich_rosetta_binding_request>[0]);
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(
      new RegExp(`^prism_rosetta_source_snapshot_failed:${status}:`),
    );
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(upstream.mock.calls[0][0]).toContain("/v_civic_genome_law_view_v1?");
    expect(upstream.mock.calls[1][0]).toContain("/source_document_content?");
    return failure;
  }

  it.each([408, 429, 500, 502, 503, 504])(
    "keeps source HTTP %s retryable with or without partial receipts", async (status) => {
      expect_retry(await rejected_source_snapshot(status), "transient_upstream");
    },
  );
  it.each([401, 403])(
    "keeps source authentication HTTP %s recoverable beyond five attempts", async (status) => {
      expect_retry(await rejected_source_snapshot(status), "authentication");
    },
  );
  it.each([400, 404, 422])(
    "preserves deterministic source HTTP %s failures", async (status) => {
      const error = await rejected_source_snapshot(status);
      for (const receipt_count of [0, 3]) {
        expect(classify_prism_queue_failure({ error, prior_attempt_count: 0, receipt_count }))
          .toMatchObject({ terminal: true, queue_state: "permanent_failure", retry_delay_seconds: 0 });
      }
    },
  );
  it.each([
    "prism_rosetta_source_snapshot_hash_mismatch",
    "prism_rosetta_source_snapshot_binding_hash_mismatch",
    "prism_rosetta_source_snapshot_identity_mismatch",
    "prism_rosetta_source_snapshot_not_found",
    "prism_rosetta_source_snapshot_failed:5030:malformed_status",
  ])("preserves deterministic evidence failure %s", (message) => {
    expect(classify_prism_queue_failure({
      error: new Error(message), prior_attempt_count: 0, receipt_count: 3,
    })).toMatchObject({ terminal: true, queue_state: "permanent_failure", retry_delay_seconds: 0 });
  });
});
