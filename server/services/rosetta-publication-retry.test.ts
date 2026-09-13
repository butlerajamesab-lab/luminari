import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assert_rosetta_current_publication } from "./rosetta-publication-eligibility";
import { classify_prism_queue_failure } from "./prism-rosetta-queue-worker";

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
