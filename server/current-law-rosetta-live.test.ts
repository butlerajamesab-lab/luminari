import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./civic-genome-rosetta-evaluation", () => ({
  get_rosetta_review_base_url: () => "https://rosetta.example.org",
}));

import { get_current_rosetta_live_detail } from "./current-law-rosetta-live";
import { v12_output_sha256 } from "./civic-genome-rosetta-v12-admission";

const fetch_mock = vi.fn();
const source_content_id = "11111111-1111-4111-8111-111111111111";
const source_content_hash = "a".repeat(64);
const source_text = "The agency shall act.";

const fixture = {
  contract: "rosetta-rule-live-detail-v1",
  observed_at: "2026-10-07T12:00:00Z",
  target: {
    ruleset_version: "rosetta-rule-ref-v10",
    ruleset_sha256: "b".repeat(64),
    identity_valid: true,
  },
  source: {
    source_content_id,
    source_document_id: 42,
    source_content_hash,
    source_url: "https://example.org/law.pdf",
    source_version: "chaptered",
    media_type: "text/plain",
    source_text,
    document_name: "Example law",
    document_identifier: "SB1",
    document_type: "bill",
  },
  decomposition: {
    outcome: "decomposed",
    unit_count: 1,
    section_count: 1,
    layer_counts: { H: 0, W: 1, A: 0, O: 0, D: 0, R: 1 },
  },
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

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetch_mock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("current Rosetta live presentation reader", () => {
  it("reads the selected-runtime detail and preserves R without changing Genome ontology", async () => {
    fetch_mock.mockResolvedValue(Response.json(fixture));
    const result = await get_current_rosetta_live_detail({
      source_content_id,
      source_content_hash,
    });
    expect(result?.contract).toBe("rosetta-rule-live-detail-v1");
    expect(result?.units[0].layers).toEqual(["W", "R"]);
    expect(result?.source.source_content_hash).toBe(source_content_hash);
    const url = new URL(String(fetch_mock.mock.calls[0][0]));
    expect(url.pathname).toBe(`/api/live-rule/${source_content_id}`);
    expect(fetch_mock.mock.calls[0][1]).toMatchObject({ method: "GET", redirect: "error" });
  });

  it("hashes the real JSONB-shaped nested unit wire, never the normalized UI projection", async () => {
    // Matches Rosetta production rosetta_rule_live_detail_v1: to_jsonb(u)
    // plus raw_text, effective_text and deleted_spans. PostgreSQL's nested
    // JSONB key order is deliberately distinct from normalize_unit's order.
    const wire_unit = {
      path: "Section 1",
      rules: ["v12:section"],
      kind: "sentence",
      layers: ["W", "R"],
      raw_end: source_text.length,
      raw_text: source_text,
      unit_ord: 1,
      text_sha256: createHash("sha256").update(source_text).digest("hex"),
      raw_start: 0,
      section_ord: 1,
      disposition: "OPERATIVE",
      effective_text: source_text,
      deleted_spans: [],
      source_content_id,
      ruleset_version: "rosetta-rule-ref-v12",
    };
    const raw_payload = {
      ...fixture,
      target: { ...fixture.target, ruleset_version: "rosetta-rule-ref-v12" },
      units: [wire_unit],
      decomposition: { outcome: "decomposed", unit_count: 1, section_count: 1 },
      sections: [{ section_ord: 1, raw_start: 0, raw_end: source_text.length }],
    };
    const producer_output = {
      decomposition: raw_payload.decomposition,
      sections: raw_payload.sections,
      units: raw_payload.units,
      markup_events: raw_payload.markup_events,
    };
    const producer_sha = createHash("sha256").update(JSON.stringify(producer_output), "utf8").digest("hex");
    fetch_mock.mockResolvedValue(Response.json(raw_payload));
    const normalized = await get_current_rosetta_live_detail({ source_content_id, source_content_hash });
    expect(normalized).not.toBeNull();
    if (!normalized) throw new Error("test_reader_missing");
    expect(normalized.units[0]).not.toHaveProperty("text_sha256");
    expect(normalized.units[0]).not.toHaveProperty("rules");
    expect(normalized.source_bound_raw_units).toEqual([wire_unit]);
    expect(v12_output_sha256(normalized)).toBe(producer_sha);
    const lossy_sha = createHash("sha256").update(JSON.stringify({
      decomposition: normalized.decomposition,
      sections: normalized.sections,
      units: normalized.units,
      markup_events: normalized.markup_events,
    }), "utf8").digest("hex");
    expect(lossy_sha).not.toBe(producer_sha);
    normalized.units[0].layers = ["A"];
    expect(() => v12_output_sha256(normalized)).toThrow("rosetta_v12_wire_unit_projection_mismatch");
  });

  it("returns null for a source with no selected-runtime result", async () => {
    fetch_mock.mockResolvedValue(new Response("not found", { status: 404 }));
    await expect(get_current_rosetta_live_detail({
      source_content_id,
      source_content_hash,
    })).resolves.toBeNull();
  });

  it("fails closed on source hash mismatch", async () => {
    fetch_mock.mockResolvedValue(Response.json({
      ...fixture,
      source: { ...fixture.source, source_content_hash: "c".repeat(64) },
    }));
    await expect(get_current_rosetta_live_detail({
      source_content_id,
      source_content_hash,
    })).rejects.toThrow("source_identity_mismatch");
  });

  it("fails closed on unknown semantic layers", async () => {
    fetch_mock.mockResolvedValue(Response.json({
      ...fixture,
      units: [{ ...fixture.units[0], layers: ["X"] }],
    }));
    await expect(get_current_rosetta_live_detail({
      source_content_id,
      source_content_hash,
    })).rejects.toThrow("unit_layer_invalid");
  });

  it("fails closed when the selected runtime identity is invalid", async () => {
    fetch_mock.mockResolvedValue(Response.json({
      ...fixture,
      target: { ...fixture.target, identity_valid: false },
    }));
    await expect(get_current_rosetta_live_detail({
      source_content_id,
      source_content_hash,
    })).rejects.toThrow("contract_invalid");
  });
});
