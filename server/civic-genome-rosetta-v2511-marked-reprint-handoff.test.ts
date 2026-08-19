import { describe, expect, it } from "vitest";
import {
  is_v2511_marked_full_text_reprint_handoff,
  ROSETTA_V2511_ENGINE_VERSION,
  ROSETTA_V2511_RULE_MANIFEST_HASH,
  ROSETTA_V2511_RULE_SET_VERSION,
} from "./civic-genome-rosetta-assembly";
import type { civic_genome_rosetta_law_view } from "./civic-genome-rosetta-contract";

function make_view(
  overrides: Partial<civic_genome_rosetta_law_view> = {},
): civic_genome_rosetta_law_view {
  const base: civic_genome_rosetta_law_view = {
    extraction_run_id: 13148,
    source_document_id: 5654,
    corpus_id: 1,
    document_name: "marked amendment fixture",
    document_type: "bill_amendment",
    document_identifier: "fixture-5654",
    run_version: 1,
    run_status: "completed",
    confidence_threshold: 1,
    created_at: null,
    completed_at: null,
    handoff_contract_version: "rosetta-civic-genome-handoff-v2",
    structural_representations: [],
    engine_version: ROSETTA_V2511_ENGINE_VERSION,
    rule_set_version: ROSETTA_V2511_RULE_SET_VERSION,
    rule_manifest_hash: ROSETTA_V2511_RULE_MANIFEST_HASH,
    configuration_hash: "a".repeat(64),
    source_identity_hash: "b".repeat(64),
    source_content_hash: "c".repeat(64),
    output_content_hash: "d".repeat(64),
    admissibility_state: "admissible",
    source_url: "https://example.invalid/amendment.pdf",
    source_version: "fixture-v1",
    media_type: "application/pdf",
    source_byte_hash: null,
    source_provider_hash: null,
    law_view: {
      objects: [],
      coverage: {
        help: 1,
        workflow: 1,
        accountability: 1,
        override: 1,
        definition: 1,
      },
      provenanceState: "complete",
    },
  };
  return {
    ...base,
    ...overrides,
    law_view: overrides.law_view ?? base.law_view,
  };
}

describe("Rosetta 2.5.11 marked full-text reprint handoff", () => {
  it("accepts only the exact current zero-object zero-structural amendment receipt", () => {
    expect(is_v2511_marked_full_text_reprint_handoff(make_view())).toBe(true);
  });

  it("rejects the same zero-zero shape from an older generation", () => {
    expect(is_v2511_marked_full_text_reprint_handoff(make_view({
      engine_version: "rosetta-v3-deterministic-sql-2.5.10",
    }))).toBe(false);
  });

  it("rejects manifest drift", () => {
    expect(is_v2511_marked_full_text_reprint_handoff(make_view({
      rule_manifest_hash: "0".repeat(64),
    }))).toBe(false);
  });

  it("rejects non-amendment zero-zero runs", () => {
    expect(is_v2511_marked_full_text_reprint_handoff(make_view({ document_type: "bill" }))).toBe(false);
  });

  it("rejects incomplete five-layer coverage", () => {
    expect(is_v2511_marked_full_text_reprint_handoff(make_view({
      law_view: {
        objects: [],
        coverage: { help: 1, workflow: 1, accountability: 1, override: 1, definition: 0 },
        provenanceState: "complete",
      },
    }))).toBe(false);
  });

  it("rejects non-admissible runs", () => {
    expect(is_v2511_marked_full_text_reprint_handoff(make_view({ admissibility_state: "rejected" }))).toBe(false);
  });

  it("does not consume operation-sheet structural evidence as a marked reprint", () => {
    expect(is_v2511_marked_full_text_reprint_handoff(make_view({
      structural_representations: [{
        key: "fixture-op",
        representation_type: "source_stated_amendment_operation",
        source_object_type: "rosetta_structural_representation",
        source_object_id: "fixture-op",
        source_block_id: "fixture-block",
        extraction_run_id: "13148",
        normalized_value: { operative_effect_applied: false },
        confidence: 1,
        confirmed: true,
      }],
    }))).toBe(false);
  });
});
