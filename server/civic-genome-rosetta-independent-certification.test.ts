import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INDEPENDENT_CERTIFIER,
  independent_certification_enabled,
  issue_independent_certification,
} from "./civic-genome-rosetta-independent-certification";
import {
  admit_v12_live_detail,
  v12_output_sha256,
  type v12_source_resolution,
} from "./civic-genome-rosetta-v12-admission";
import type { current_rosetta_live_detail } from "./current-law-rosetta-live";

// Real V15 output for MI SB1169 (Rosetta source_document_id 20416), captured read-only.
const fixture = JSON.parse(
  readFileSync(new URL("./__fixtures__/rosetta_v15_mi_sb1169_live_detail.json", import.meta.url), "utf8"),
) as { source_document_key: string; detail: current_rosetta_live_detail };

function fresh_detail(): current_rosetta_live_detail {
  return structuredClone(fixture.detail);
}

const source: v12_source_resolution = {
  source_content_id: fixture.detail.source.source_content_id,
  source_document_id: fixture.detail.source.source_document_id,
  source_content_hash: fixture.detail.source.source_content_hash,
  source_document_key: fixture.source_document_key,
};

describe("independent certification on real V15 output", () => {
  it("certifies the real decomposition and the existing admission accepts it", () => {
    const detail = fresh_detail();
    const receipt = issue_independent_certification(source, detail, "2026-11-23T19:00:00.000Z");
    expect(receipt.certifier).toBe(INDEPENDENT_CERTIFIER);
    expect(receipt.output_sha256).toBe(v12_output_sha256(detail));
    expect(receipt.verified_invariants.unit_count).toBe(3);
    expect(receipt.verified_invariants.section_count).toBe(2);
    // The existing admission checks (unchanged) accept this receipt for this exact output.
    const admission = admit_v12_live_detail(
      {
        source_document_key: fixture.source_document_key,
        rosetta_source_document_id: source.source_document_id,
        source_content_hash: source.source_content_hash,
      },
      source,
      { ...detail, target: { ...detail.target, identity_valid: true, engine_identity_valid: true,
        read_identity_valid: true, read_contract_sha256: "a".repeat(64), selected_at: "2026-11-21T16:20:08.981Z" } },
      receipt,
    );
    expect(admission.receipt.admitted).toBe(true);
    expect(admission.receipt.certification_sha256).toBe(receipt.certification_sha256);
  });

  it("is deterministic for the same output and time", () => {
    const a = issue_independent_certification(source, fresh_detail(), "2026-11-23T19:00:00.000Z");
    const b = issue_independent_certification(source, fresh_detail(), "2026-11-23T19:00:00.000Z");
    expect(a.certification_sha256).toBe(b.certification_sha256);
  });

  it("refuses a changed source text", () => {
    const detail = fresh_detail();
    detail.source.source_text = detail.source.source_text.replace("7 judges", "8 judges");
    expect(() => issue_independent_certification(source, detail)).toThrow("independent_certification_source_text_hash_mismatch");
  });

  it("refuses a different engine ruleset", () => {
    const detail = fresh_detail();
    (detail.target as Record<string, unknown>).installed_ruleset_sha256 = "b".repeat(64);
    expect(() => issue_independent_certification(source, detail)).toThrow("independent_certification_ruleset_mismatch");
  });

  it("refuses a run made under another ruleset", () => {
    const detail = fresh_detail();
    (detail.decomposition as Record<string, unknown>).ruleset_sha256 = "c".repeat(64);
    expect(() => issue_independent_certification(source, detail)).toThrow("independent_certification_run_ruleset_mismatch");
  });

  it("refuses a missing or non-decomposed run", () => {
    const detail = fresh_detail();
    detail.decomposition = null;
    expect(() => issue_independent_certification(source, detail)).toThrow("independent_certification_not_decomposed");
  });

  it("refuses a unit whose text does not match its source slice", () => {
    const detail = fresh_detail();
    detail.units[1].raw_text = detail.units[1].raw_text.replace("Ingham", "Wayne");
    expect(() => issue_independent_certification(source, detail)).toThrow("independent_certification_unit_slice_mismatch");
  });

  it("refuses a unit span outside the source", () => {
    const detail = fresh_detail();
    detail.units[2].raw_end = detail.source.source_text.length + 5;
    expect(() => issue_independent_certification(source, detail)).toThrow("independent_certification_unit_span_invalid");
  });

  it("refuses a dropped unit", () => {
    const detail = fresh_detail();
    detail.units.pop();
    expect(() => issue_independent_certification(source, detail)).toThrow("independent_certification_unit_count_mismatch");
  });

  it("refuses a held or failed run", () => {
    const held = fresh_detail();
    held.hold_receipt = { gate: "operative_text" };
    expect(() => issue_independent_certification(source, held)).toThrow("independent_certification_hold_present");
    const failed = fresh_detail();
    failed.failure_receipts = [{ error: "x" }];
    expect(() => issue_independent_certification(source, failed)).toThrow("independent_certification_failure_present");
  });

  it("stays off unless explicitly switched on", () => {
    expect(independent_certification_enabled({})).toBe(false);
    expect(independent_certification_enabled({ GENOME_ROSETTA_INDEPENDENT_CERTIFICATION_ENABLED: "1" })).toBe(false);
    expect(independent_certification_enabled({ GENOME_ROSETTA_INDEPENDENT_CERTIFICATION_ENABLED: "true" })).toBe(true);
  });
});
