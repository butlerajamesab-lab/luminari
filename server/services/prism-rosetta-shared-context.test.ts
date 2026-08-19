import { describe, expect, it } from "vitest";
import { build_rosetta_binding_request } from "./prism-rosetta-activation";
import { rosetta_assembly_context_cache_key } from "./prism-rosetta-structural-context";

const hash_a = "a".repeat(64);
const hash_b = "b".repeat(64);
const hash_c = "c".repeat(64);
const hash_d = "d".repeat(64);
const hash_e = "e".repeat(64);
const hash_f = "f".repeat(64);
const genome_bill_id = "f17747ae-24c6-40b3-a389-4ca24825ad0c";
const assembly_run_id = "009fd940-2ace-4f96-bbb4-4b3bf09bb63b";

const assembly = {
  assembly_run_id,
  genome_bill_id,
  source_document_id: 17,
  extraction_run_id: "18",
  input_hash: hash_a,
  output_hash: hash_b,
  verification_state: "complete",
  trait_count: 2,
  run_status: "completed",
  completed_at: "2026-08-01T09:24:33.404607Z",
  rosetta_engine_version: "rosetta-v3-deterministic-sql-2.5.11",
  rosetta_rule_set_version: "rosetta-five-layer-structural-correctness-2.5.11",
  rosetta_rule_manifest_hash: hash_c,
  rosetta_configuration_hash: hash_d,
  rosetta_source_identity_hash: hash_e,
  rosetta_source_content_hash: hash_f,
  rosetta_output_content_hash: hash_a,
  rosetta_source_url: "https://example.gov/HB2487.pdf",
  rosetta_source_version: "legiscan_text:3411116:Chaptered",
};

function trait(index: number) {
  const id = index === 1
    ? "11111111-1111-4111-8111-111111111111"
    : "22222222-2222-4222-8222-222222222222";
  const object_id = `td-v1-${hash_e}-${String(index).padStart(3, "0")}`;
  return {
    trait_id: id,
    genome_bill_id,
    trait_class: "definition" as const,
    trait_key: object_id,
    source_object_type: "term_definition",
    source_object_id: object_id,
    source_block_id: `blk-v1-${hash_e}`,
    extraction_run_id: "18",
    trait_fingerprint: index === 1 ? hash_b : hash_d,
    source_document_id: 17,
    verification_state: "confirmed",
    engine_version: assembly.rosetta_engine_version,
    rule_version: assembly.rosetta_rule_set_version,
    content_hash: index === 1 ? hash_c : hash_e,
    source_trace: [{
      source_document_id: 17,
      source_object_type: "term_definition",
      source_object_id: object_id,
      source_block_id: `blk-v1-${hash_e}`,
      extraction_run_id: "18",
      source_span: {
        char_offset_start: index * 100,
        char_offset_end: (index * 100) + 99,
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

function request(index: number) {
  return build_rosetta_binding_request({
    assembly,
    trait: trait(index),
    lighthouse_commit: "2ca7b4ecbde54a9a55c07dba85465b08b7169e54",
  });
}

describe("Prism shared assembly verification context", () => {
  it("shares one context identity across different traits in the same immutable assembly", () => {
    const first = request(1);
    const second = request(2);
    expect(first.subject_id).not.toBe(second.subject_id);
    expect(first.rosetta_binding.source_object_id)
      .not.toBe(second.rosetta_binding.source_object_id);
    expect(rosetta_assembly_context_cache_key(first))
      .toBe(rosetta_assembly_context_cache_key(second));
  });

  it("changes context identity when immutable assembly/source identity changes", () => {
    const first = request(1);
    const changed = structuredClone(first);
    changed.rosetta_binding.rosetta_source_content_hash = hash_b;
    expect(rosetta_assembly_context_cache_key(changed))
      .not.toBe(rosetta_assembly_context_cache_key(first));
  });
});
