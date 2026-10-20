import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { get_live } = vi.hoisted(() => ({ get_live: vi.fn() }));
vi.mock("./current-law-rosetta-live", () => ({
  get_current_rosetta_live_detail: get_live,
}));
import {
  admit_v12_live_detail,
  inspect_v12_admission_for_binding,
  require_v12_admission_for_binding,
  resolve_v12_source_content,
  v12_output_sha256,
  type v12_certification_receipt,
  type v12_genome_binding,
  type v12_source_resolution,
} from "./civic-genome-rosetta-v12-admission";
import type { current_rosetta_live_detail } from "./current-law-rosetta-live";

const source_content_id = "11111111-1111-4111-8111-111111111111";
const source_document_key = "text:42:8";
const source_text = "Example enacted rule.";
const source_content_hash = createHash("sha256").update(source_text).digest("hex");
const ruleset_sha256 = "b".repeat(64);
const binding: v12_genome_binding = {
  bill_version_id: "00000000-0000-4000-8000-000000000001",
  source_document_key,
  rosetta_source_document_id: 42,
  source_content_hash,
  rosetta_source_content_id: source_content_id,
};
const source: v12_source_resolution = {
  source_content_id,
  source_document_id: 42,
  source_content_hash,
  source_document_key,
};
const fetch_mock = vi.fn();
const deep_clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function detail(): current_rosetta_live_detail {
  return {
    contract: "rosetta-rule-live-detail-v1",
    observed_at: "2026-10-20T10:00:00Z",
    target: {
      identity_valid: true,
      engine_version: "selected-runtime-version",
      ruleset_version: "rosetta-rule-ref-v12",
      ruleset_sha256,
      selected_at: "2026-10-20T09:00:00Z",
    },
    source: {
      source_content_id,
      source_document_id: 42,
      source_content_hash,
      source_text,
      source_url: "https://example.test/source",
      source_version: "enrolled",
      media_type: "text/plain",
      document_name: "Example",
      document_identifier: "SB 5",
      document_type: "bill",
    },
    decomposition: { outcome: "decomposed" },
    sections: [{ section_ord: 1 }],
    units: [{
      unit_ord: 1,
      section_ord: 1,
      kind: "sentence",
      disposition: "OPERATIVE",
      layers: ["W", "R"],
      raw_start: 0,
      raw_end: source_text.length,
      raw_text: source_text,
      effective_text: source_text,
    }],
    markup_events: [],
    hold_receipt: null,
    failure_receipts: [],
  };
}
function cert(payload: current_rosetta_live_detail): v12_certification_receipt {
  return {
    contract: "rosetta-v12-certification-receipt-v1",
    source_content_id,
    source_document_id: 42,
    source_content_hash,
    ruleset_version: "rosetta-rule-ref-v12",
    ruleset_sha256,
    output_sha256: v12_output_sha256(payload),
    certification_sha256: "c".repeat(64),
    certified_at: "2026-10-20T09:10:00Z",
  };
}
function row() {
  return {
    source_content_id,
    source_document_id: 42,
    source_content_hash,
    source_metadata: { docket_source_document_key: source_document_key },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetch_mock);
  vi.stubEnv("ROSETTA_SUPABASE_URL", "https://rosetta-db.example.test");
  vi.stubEnv("ROSETTA_SUPABASE_SERVICE_ROLE_KEY", "sb_secret_fixture_only");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("V12 certified admission — fixtures only", () => {
  it("admits exact selected-runtime source, ruleset, decomposition, spans and independent certification", () => {
    const data = detail();
    const output = admit_v12_live_detail(binding, source, data, cert(data));
    expect(output.receipt).toMatchObject({
      admitted: true, reason: null, admission_state: "admitted",
      source_content_id, source_document_id: 42, source_content_hash,
      ruleset_version: "rosetta-rule-ref-v12", ruleset_sha256,
      selected_at: "2026-10-20T09:00:00Z",
      output_sha256: v12_output_sha256(data),
    });
    expect(output.canonical_unit_layers).toEqual([{ unit_ord: 1, layers: ["W"] }]);
    expect(output.canonical_unit_layers.flatMap(x => x.layers)).not.toContain("R");
  });

  it.each([
    ["source content ID", { source_content_id: "22222222-2222-4222-8222-222222222222" }],
    ["source document ID", { source_document_id: 43 }],
    ["source content hash", { source_content_hash: "a".repeat(64) }],
    ["Genome source key", { source_document_key: "text:other" }],
  ])("rejects mismatch of %s (predicate a)", (_name, changes) => {
    const data = detail();
    expect(() => admit_v12_live_detail(binding, { ...source, ...changes }, data, cert(data)))
      .toThrow("rosetta_v12_source_identity_mismatch");
  });

  it("rejects source text whose bytes do not hash to the bound source (a)", () => {
    const data = detail();
    data.source.source_text += "!";
    expect(() => admit_v12_live_detail(binding, source, data, cert(data)))
      .toThrow("rosetta_v12_source_text_hash_mismatch");
  });

  it.each([
    ["identity_valid", { identity_valid: false }, "rosetta_v12_target_identity_invalid"],
    ["ruleset_version", { ruleset_version: null }, "rosetta_v12_target_provenance_missing"],
    ["ruleset_sha256", { ruleset_sha256: null }, "rosetta_v12_target_provenance_missing"],
    ["selected_at", { selected_at: null }, "rosetta_v12_target_provenance_missing"],
  ])("rejects invalid %s (b)", (_name, change, reason) => {
    const data = detail();
    data.target = { ...data.target, ...change };
    expect(() => admit_v12_live_detail(binding, source, data, cert(data))).toThrow(reason);
  });

  it.each([null, { outcome: "held" }, { outcome: "failed" }])
    ("rejects missing/non-decomposed outcomes (c)", decomposition => {
      const data = detail();
      data.decomposition = decomposition;
      expect(() => admit_v12_live_detail(binding, source, data, cert(data)))
        .toThrow("rosetta_v12_decomposition_not_decomposed");
    });

  it("never substitutes hold or failure receipts for decomposed output (c)", () => {
    const held = detail();
    held.hold_receipt = { reason: "awaiting_source" };
    expect(() => admit_v12_live_detail(binding, source, held, cert(held)))
      .toThrow("rosetta_v12_hold_receipt_present");
    const failed = detail();
    failed.failure_receipts = [{ reason: "invalid_stage" }];
    expect(() => admit_v12_live_detail(binding, source, failed, cert(failed)))
      .toThrow("rosetta_v12_failure_receipts_present");
  });

  it.each([
    ["negative start", -1, 3, "rosetta_v12_unit_span_out_of_bounds"],
    ["end beyond source", 0, source_text.length + 1, "rosetta_v12_unit_span_out_of_bounds"],
    ["empty span", 3, 3, "rosetta_v12_unit_span_out_of_bounds"],
    ["incorrect text slice", 1, source_text.length, "rosetta_v12_unit_source_slice_mismatch"],
  ])("rejects %s (d)", (_name, raw_start, raw_end, reason) => {
    const data = detail();
    data.units[0].raw_start = raw_start;
    data.units[0].raw_end = raw_end;
    expect(() => admit_v12_live_detail(binding, source, data, cert(data))).toThrow(reason);
  });

  it("fails closed on missing independent certification (e)", () => {
    const data = detail();
    expect(() => admit_v12_live_detail(binding, source, data, null))
      .toThrow("rosetta_v12_certification_receipt_missing");
  });

  it.each([
    ["source", { source_content_id: "22222222-2222-4222-8222-222222222222" }],
    ["ruleset", { ruleset_sha256: "f".repeat(64) }],
    ["output", { output_sha256: "e".repeat(64) }],
  ])("rejects certification mismatch for %s (e)", (_name, change) => {
    const data = detail();
    expect(() => admit_v12_live_detail(binding, source, data, { ...cert(data), ...change }))
      .toThrow("rosetta_v12_certification_receipt_mismatch");
  });

  it("excludes R-only units from Genome's H/W/A/O/D ontology (f)", () => {
    const data = detail();
    data.units[0].layers = ["R"];
    const admitted = admit_v12_live_detail(binding, source, data, cert(data));
    expect(admitted.canonical_unit_layers[0].layers).toEqual([]);
    expect(data.units[0].layers).toEqual(["R"]); // Rosetta classification retained separately
  });
});

describe("exact source resolution and bounded remote reads", () => {
  it("requires exactly one source-content match using key, document ID, and SHA", async () => {
    fetch_mock.mockResolvedValue(Response.json([row()]));
    await expect(resolve_v12_source_content(binding)).resolves.toEqual(source);
    const url = new URL(String(fetch_mock.mock.calls[0][0]));
    expect(url.pathname).toBe("/rest/v1/source_document_content");
    expect(url.searchParams.get("source_document_id")).toBe("eq.42");
    expect(url.searchParams.get("source_content_hash")).toBe(`eq.${source_content_hash}`);
    expect(url.searchParams.get("source_metadata->>docket_source_document_key")).toBe(`eq.${source_document_key}`);
    expect(url.searchParams.get("limit")).toBe("2");
    expect(fetch_mock.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "error" });
  });

  it.each([
    [[], "rosetta_v12_source_resolution_zero_matches"],
    [[row(), row()], "rosetta_v12_source_resolution_ambiguous"],
    [[{ ...row(), source_metadata: { docket_source_document_key: "wrong" } }], "rosetta_v12_source_resolution_identity_mismatch"],
  ])("rejects source resolution cardinality/identity failures", async (rows, code) => {
    fetch_mock.mockResolvedValue(Response.json(rows));
    await expect(resolve_v12_source_content(binding)).rejects.toThrow(code);
  });

  it.each([404, 410])("returns named source resolution HTTP %i errors", async status => {
    fetch_mock.mockResolvedValue(new Response("retired", { status }));
    await expect(resolve_v12_source_content(binding)).rejects.toThrow(`rosetta_v12_source_resolution_http_${status}`);
  });

  it.each([
    ["404", null, "rosetta_v12_live_rule_http_404"],
    ["410", new Error("current_rosetta_live_read_failed:410"), "rosetta_v12_live_rule_http_410"],
    ["timeout", new Error("current_rosetta_live_read_timeout"), "rosetta_v12_live_rule_timeout"],
  ])("fails closed on V12 live-detail %s (distinct from retired errors)", async (_name, response, reason) => {
    fetch_mock.mockImplementation(async () => Response.json([row()]));
    if (response === null) get_live.mockResolvedValue(null);
    else get_live.mockRejectedValue(response);
    const result = await inspect_v12_admission_for_binding(binding);
    expect(result.receipt).toMatchObject({ admitted: false, reason, admission_state: "rejected" });
    await expect(require_v12_admission_for_binding(binding)).rejects.toThrow(reason);
  });

  it("marks raw held and failed receipts distinctly and keeps them visible", async () => {
    fetch_mock.mockImplementation(async () => Response.json([row()]));
    const data = detail();
    data.hold_receipt = { reason: "awaiting_certification" };
    get_live.mockResolvedValue(data);
    const result = await inspect_v12_admission_for_binding(binding);
    expect(result.receipt).toMatchObject({
      admitted: false, admission_state: "held", reason: "rosetta_v12_hold_receipt_present",
      hold_receipt: { reason: "awaiting_certification" },
    });
    const failing = detail();
    failing.failure_receipts = [{ code: "stage_failed" }];
    get_live.mockResolvedValue(failing);
    const failure = await inspect_v12_admission_for_binding(binding);
    expect(failure.receipt).toMatchObject({
      admission_state: "failed", reason: "rosetta_v12_failure_receipts_present",
      failure_receipts: [{ code: "stage_failed" }],
    });
  });

  it("production admission remains blocked until independent Rosetta certification exists", async () => {
    fetch_mock.mockResolvedValue(Response.json([row()]));
    get_live.mockResolvedValue(deep_clone(detail()));
    const result = await inspect_v12_admission_for_binding(binding);
    expect(result.receipt).toMatchObject({
      admitted: false, admission_state: "rejected",
      reason: "rosetta_v12_certification_receipt_missing",
      ruleset_sha256, source_content_hash,
    });
  });
});
