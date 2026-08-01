import { describe, expect, it } from "vitest";
import {
  LIGHTHOUSE_PRISM_ROSETTA_RUNTIME_VERSION,
  build_rosetta_binding_request,
} from "./prism-rosetta-activation";

const genome_bill_id = "f17747ae-24c6-40b3-a389-4ca24825ad0c";
const assembly_run_id = "009fd940-2ace-4f96-bbb4-4b3bf09bb63b";
const trait_id = "11111111-1111-4111-8111-111111111111";
const hash_a = "a".repeat(64);
const hash_b = "b".repeat(64);
const hash_c = "c".repeat(64);
const hash_d = "d".repeat(64);
const hash_e = "e".repeat(64);
const hash_f = "f".repeat(64);

const assembly = {
  assembly_run_id,
  genome_bill_id,
  source_document_id: 17,
  extraction_run_id: "18",
  input_hash: hash_a,
  output_hash: hash_b,
  verification_state: "complete",
  trait_count: 1,
  run_status: "completed",
  completed_at: "2026-08-01T09:24:33.404607Z",
  rosetta_engine_version: "rosetta-v3-deterministic-sql-1.0.0",
  rosetta_rule_set_version: "rosetta-five-layer-exact-patterns-1.0.0",
  rosetta_rule_manifest_hash: hash_c,
  rosetta_configuration_hash: hash_d,
  rosetta_source_identity_hash: hash_e,
  rosetta_source_content_hash: hash_f,
  rosetta_output_content_hash: hash_a,
  rosetta_source_url: "https://example.gov/HB2487.pdf",
  rosetta_source_version: "legiscan_text:3411116:Chaptered",
};

function trait() {
  return {
    trait_id,
    genome_bill_id,
    trait_class: "definition" as const,
    trait_key: `td-v1-${hash_e}-001`,
    source_object_type: "term_definition",
    source_object_id: `td-v1-${hash_e}-001`,
    source_block_id: `blk-v1-${hash_e}`,
    extraction_run_id: "18",
    trait_fingerprint: hash_b,
    source_document_id: 17,
    verification_state: "confirmed",
    engine_version: assembly.rosetta_engine_version,
    rule_version: assembly.rosetta_rule_set_version,
    content_hash: hash_c,
    source_trace: [{
      source_document_id: 17,
      source_object_type: "term_definition",
      source_object_id: `td-v1-${hash_e}-001`,
      source_block_id: `blk-v1-${hash_e}`,
      extraction_run_id: "18",
      source_span: {
        char_offset_start: 0,
        char_offset_end: 100,
        block_content_hash: hash_f,
      },
      rosetta_rule_manifest_hash: hash_c,
      rosetta_configuration_hash: hash_d,
      rosetta_source_identity_hash: hash_e,
      rosetta_source_content_hash: hash_f,
      rosetta_output_content_hash: hash_a,
    }],
  };
}

describe("Rosetta Prism activation contract", () => {
  it("builds a deterministic source-bound request", () => {
    const first = build_rosetta_binding_request({
      assembly,
      trait: trait(),
      lighthouse_commit: "2ca7b4ecbde54a9a55c07dba85465b08b7169e54",
    });
    const second = build_rosetta_binding_request({
      assembly: JSON.parse(JSON.stringify(assembly)),
      trait: JSON.parse(JSON.stringify(trait())),
      lighthouse_commit: "2ca7b4ecbde54a9a55c07dba85465b08b7169e54",
    });

    expect(first).toEqual(second);
    expect(first.rule_set_id).toBe("prism-rosetta-structural-binding");
    expect(first.subject_id).toBe(trait_id);
    expect(first.rosetta_binding.assembly_run_id).toBe(assembly_run_id);
    expect(first.rosetta_binding.rosetta_source_content_hash).toBe(hash_f);
    expect(first.originating_lighthouse_runtime_version).toBe(
      LIGHTHOUSE_PRISM_ROSETTA_RUNTIME_VERSION,
    );
  });

  it("fails closed when the trait and assembly identities diverge", () => {
    const changed = trait();
    changed.extraction_run_id = "19";
    expect(() => build_rosetta_binding_request({
      assembly,
      trait: changed,
      lighthouse_commit: "2ca7b4ecbde54a9a55c07dba85465b08b7169e54",
    })).toThrow("prism_rosetta_identity_mismatch");
  });

  it("changes the request identity when governed trait content changes", () => {
    const first = build_rosetta_binding_request({
      assembly,
      trait: trait(),
      lighthouse_commit: "2ca7b4ecbde54a9a55c07dba85465b08b7169e54",
    });
    const changed = trait();
    changed.content_hash = hash_d;
    const second = build_rosetta_binding_request({
      assembly,
      trait: changed,
      lighthouse_commit: "2ca7b4ecbde54a9a55c07dba85465b08b7169e54",
    });
    expect(second.request_id).not.toBe(first.request_id);
  });
});
