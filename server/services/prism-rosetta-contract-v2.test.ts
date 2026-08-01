import { describe, expect, it } from "vitest";
import {
  PRISM_ROSETTA_ENGINE_VERSION,
  PRISM_ROSETTA_RULE_SET_HASH,
  PRISM_ROSETTA_RULE_SET_VERSION,
  canonical_json,
  rosetta_binding_request_schema,
  rosetta_semantic_request_payload,
  sha256_hex,
} from "./prism-rosetta-contract-v2";

const h = (value: string) => value.repeat(64).slice(0, 64);

function request(commit: string, runtime: string) {
  return rosetta_binding_request_schema.parse({
    request_id: `prism-rosetta-v1-${h("a")}`,
    lighthouse_case_id: "f17747ae-24c6-40b3-a389-4ca24825ad0c",
    evidence_document_id: "rosetta-source-document:17",
    evidence_fingerprint: h("b"),
    source_content_hash: h("c"),
    claim_assertion_id: "td-v1-source-001",
    rule_set_id: "prism-rosetta-structural-binding",
    rule_set_version: "1.0.1",
    requested_checks: [
      "verify_identity_chain",
      "verify_hash_chain",
      "verify_source_binding",
      "verify_rule_binding",
      "classify_support_state",
    ],
    originating_lighthouse_commit: commit,
    originating_lighthouse_runtime_version: runtime,
    subject_type: "civic_genome_trait",
    subject_id: "0311ab58-e12c-4d41-8034-2a191b88792a",
    evidence_refs: [{
      evidence_id: "rosetta-object:td-v1-source-001",
      document_id: "rosetta-source-document:17",
      evidence_fingerprint: h("b"),
      source_content_hash: h("c"),
      relationship: "supports",
      independent_source_id: `rosetta-source:${h("d")}`,
    }],
    rosetta_binding: {
      genome_bill_id: "f17747ae-24c6-40b3-a389-4ca24825ad0c",
      assembly_run_id: "009fd940-2ace-4f96-bbb4-4b3bf09bb63b",
      source_document_id: 17,
      extraction_run_id: "18",
      trait_id: "0311ab58-e12c-4d41-8034-2a191b88792a",
      trait_class: "definition",
      trait_key: "td-v1-source-001",
      source_object_type: "term_definition",
      source_object_id: "td-v1-source-001",
      source_block_id: "blk-v1-source",
      source_span: {
        char_offset_start: 0,
        char_offset_end: 100,
        block_content_hash: h("c"),
      },
      trait_fingerprint: h("b"),
      trait_content_hash: h("e"),
      source_trace_hash: h("f"),
      assembly_input_hash: h("1"),
      assembly_output_hash: h("2"),
      rosetta_source_identity_hash: h("d"),
      rosetta_source_content_hash: h("c"),
      rosetta_output_content_hash: h("3"),
      rosetta_rule_manifest_hash: h("4"),
      rosetta_configuration_hash: h("5"),
    },
  });
}

describe("Prism Rosetta deployment-stable identity", () => {
  it("uses the installed v1.1.1 / 1.0.1 contract", () => {
    expect(PRISM_ROSETTA_ENGINE_VERSION).toBe("1.1.1");
    expect(PRISM_ROSETTA_RULE_SET_VERSION).toBe("1.0.1");
    expect(PRISM_ROSETTA_RULE_SET_HASH).toBe(
      "4ca3bd0361bb0056496c88f201e4cc692b2d2cd3f189567949dc937f7ef058b7",
    );
  });

  it("excludes deployment metadata from semantic identity", () => {
    const first = request("27c1c5c7717390c5f48ed243adbeb179c0c819be", "runtime-a");
    const second = request("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "runtime-b");
    expect(
      sha256_hex(canonical_json(rosetta_semantic_request_payload(first))),
    ).toBe(
      sha256_hex(canonical_json(rosetta_semantic_request_payload(second))),
    );
  });

  it("changes semantic identity when governed content changes", () => {
    const first = request("27c1c5c7717390c5f48ed243adbeb179c0c819be", "runtime-a");
    const second = {
      ...first,
      rosetta_binding: {
        ...first.rosetta_binding,
        trait_content_hash: h("9"),
      },
    };
    expect(
      sha256_hex(canonical_json(rosetta_semantic_request_payload(first))),
    ).not.toBe(
      sha256_hex(canonical_json(rosetta_semantic_request_payload(second))),
    );
  });
});
