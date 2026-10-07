import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./civic-genome-rosetta-evaluation", () => ({
  get_rosetta_review_base_url: () => "https://rosetta.example.org",
}));

import { get_current_rosetta_live_detail } from "./current-law-rosetta-live";

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
