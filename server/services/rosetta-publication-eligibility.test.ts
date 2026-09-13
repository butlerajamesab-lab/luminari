import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assert_rosetta_current_publication } from "./rosetta-publication-eligibility";

const binding = {
  source_document_id: 7, extraction_run_id: "12",
  rosetta_source_identity_hash: "a".repeat(64),
  rosetta_source_content_hash: "b".repeat(64),
  rosetta_output_content_hash: "c".repeat(64),
  rosetta_rule_manifest_hash: "d".repeat(64),
  rosetta_configuration_hash: "e".repeat(64),
};
const row = {
  source_document_id: 7, extraction_run_id: 12,
  source_identity_hash: binding.rosetta_source_identity_hash,
  source_content_hash: binding.rosetta_source_content_hash,
  output_content_hash: binding.rosetta_output_content_hash,
  rule_manifest_hash: binding.rosetta_rule_manifest_hash,
  configuration_hash: binding.rosetta_configuration_hash,
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("Rosetta publication eligibility at the Prism consumer boundary", () => {
  beforeEach(() => {
    vi.stubEnv("ROSETTA_SUPABASE_URL", "https://rosetta.example/");
    vi.stubEnv("ROSETTA_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_unit_test_placeholder");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("accepts only the exact run, source and complete hash binding returned by Rosetta", async () => {
    const fetch_mock = vi.fn().mockResolvedValue(response([row]));
    vi.stubGlobal("fetch", fetch_mock);
    await expect(assert_rosetta_current_publication(binding)).resolves.toBeUndefined();
    const [url, options] = fetch_mock.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/rest/v1/v_civic_genome_law_view_v1");
    expect(parsed.searchParams.get("extraction_run_id")).toBe("eq.12");
    expect(parsed.searchParams.get("source_document_id")).toBe("eq.7");
    expect(options.headers.has("authorization")).toBe(false);
  });

  it.each([[row, row], { data: [row] }, null])("rejects ambiguous or malformed publication responses", async (rows) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(rows)));
    await expect(assert_rosetta_current_publication(binding)).rejects.toThrow("invalid_response");
  });

  it.each(Object.keys(row))("rejects a changed %s", async (column) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([{ ...row, [column]: "different" }])));
    await expect(assert_rosetta_current_publication(binding)).rejects.toThrow("binding_mismatch");
  });

  it.each(["12oops", "0", "1e1", "2147483648"])("rejects an invalid textual run ID %s before fetching", async (extraction_run_id) => {
    const fetch_mock = vi.fn();
    vi.stubGlobal("fetch", fetch_mock);
    await expect(assert_rosetta_current_publication({ ...binding, extraction_run_id })).rejects.toThrow("run_id_invalid");
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("does not cache a passing decision across later revocation", async () => {
    const fetch_mock = vi.fn()
      .mockResolvedValueOnce(response([row]))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal("fetch", fetch_mock);
    await assert_rosetta_current_publication(binding);
    await expect(assert_rosetta_current_publication(binding)).rejects.toThrow("not_eligible");
    expect(fetch_mock).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the owner service cannot answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({}, 503)));
    await expect(assert_rosetta_current_publication(binding)).rejects.toThrow("lookup_failed:503");
  });

  it("bounds the lookup including response body consumption", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })));
    const checked = expect(assert_rosetta_current_publication(binding)).rejects.toThrow("lookup_timeout");
    await vi.advanceTimersByTimeAsync(8_000);
    await checked;
  });

  it("fails before sending when the owner connection is unconfigured", async () => {
    vi.stubEnv("ROSETTA_SUPABASE_URL", "");
    const fetch_mock = vi.fn();
    vi.stubGlobal("fetch", fetch_mock);
    await expect(assert_rosetta_current_publication(binding)).rejects.toThrow("backend_unconfigured");
    expect(fetch_mock).not.toHaveBeenCalled();
  });
});
