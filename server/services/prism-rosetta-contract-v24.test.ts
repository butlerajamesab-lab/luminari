import { describe, expect, it } from "vitest";
import * as active from "./prism-rosetta-contract-v2";
import * as v22 from "./prism-rosetta-contract-v22";
import * as v23 from "./prism-rosetta-contract-v23";
import * as envelope from "./prism-verification-contract";

const uuid = "00000000-0000-4000-8000-000000000024";
const sourceText = "The department, after review, must issue a notice.";
const sourceHash = active.sha256_hex(sourceText);

function requestFixture() {
  return {
    request_id: "prism-rosetta-v24-contract-fixture",
    lighthouse_case_id: "civic-genome",
    evidence_document_id: "24",
    evidence_fingerprint: sourceHash,
    source_content_hash: sourceHash,
    claim_assertion_id: "workflow-notice",
    rule_set_id: active.PRISM_ROSETTA_RULE_SET_ID,
    rule_set_version: "2.4.0",
    requested_checks: [
      "verify_identity_chain", "verify_hash_chain", "verify_source_binding",
      "verify_rule_binding", "recompute_source_hash", "locate_source_evidence",
      "verify_section_binding", "verify_trait_structure",
      "detect_cross_trait_conflicts", "classify_support_state",
    ],
    originating_lighthouse_commit: "a".repeat(40),
    originating_lighthouse_runtime_version: "fixture-runtime-a",
    evidence_refs: [],
    subject_type: "civic_genome_trait",
    subject_id: uuid,
    rosetta_binding: {
      genome_bill_id: uuid,
      assembly_run_id: uuid,
      source_document_id: 24,
      extraction_run_id: "extraction-24",
      trait_id: uuid,
      trait_class: "workflow",
      trait_key: "workflow-notice",
      source_object_type: "workflow",
      source_object_id: "workflow-notice",
      source_block_id: "section-1",
      source_span: {
        char_offset_start: 0,
        char_offset_end: sourceText.length,
        block_content_hash: sourceHash,
      },
      trait_fingerprint: sourceHash,
      trait_content_hash: sourceHash,
      source_trace_hash: sourceHash,
      assembly_input_hash: sourceHash,
      assembly_output_hash: sourceHash,
      rosetta_source_identity_hash: sourceHash,
      rosetta_source_content_hash: sourceHash,
      rosetta_output_content_hash: sourceHash,
      rosetta_rule_manifest_hash: sourceHash,
      rosetta_configuration_hash: sourceHash,
    },
    source_snapshot: {
      source_text: sourceText,
      source_url: "https://example.org/fixture",
      source_version: "fixture-source-v1",
      media_type: "text/plain",
      source_identity_hash: sourceHash,
      source_content_hash: sourceHash,
    },
    document_context: { document_family: "bill", adopted: true },
    trait_payload: { steps: [{ step_name: sourceText, modal: "must" }] },
    trait_payload_hash: sourceHash,
    peer_traits: [{
      trait_id: uuid,
      trait_class: "workflow",
      trait_key: "workflow-notice",
      source_object_type: "workflow",
      source_object_id: "workflow-notice",
      source_block_id: "section-1",
      content_hash: sourceHash,
      normalized_value: { steps: [{ step_name: sourceText, modal: "must" }] },
    }],
  };
}

function receiptFixture() {
  return {
    verification_receipt_id: uuid,
    request_id: "prism-rosetta-v24-contract-fixture",
    prism_engine_version: "2.4.0",
    rule_set_id: active.PRISM_ROSETTA_RULE_SET_ID,
    rule_set_version: "2.4.0",
    rule_set_hash: active.PRISM_ROSETTA_RULE_SET_HASH,
    input_hash: "a".repeat(64),
    output_hash: "b".repeat(64),
    status: "supported_by_one_source",
    supported_findings: [{
      check: "workflow_modal_present",
      evaluated_span: sourceText,
      matched_modal: "must",
    }],
    contradictions: [],
    missing_evidence: [],
    unresolved_conditions: [],
    cited_evidence_identifiers: ["section-1"],
    deterministic_replay_key: "c".repeat(64),
    completion_timestamp: "2026-09-10T00:00:00.000Z",
    idempotency_reused: false,
  };
}

describe("Prism Rosetta 2.4 consumer contract", () => {
  it("pins both active boundaries to the upstream immutable modal-evidence definition", () => {
    // Canonical definition from Prism's rosetta-binding-contract-v24.ts.
    const definition = {
      engine_version: "2.4.0",
      purpose: "independently replay immutable Rosetta source text, distinguish operative modal tokens from quoted or definitional uses, and prevent unevaluated workflow modal evidence from being promoted as a contradiction",
      required_checks: requestFixture().requested_checks,
      rule_set_id: "prism-rosetta-structural-binding",
      rule_set_version: "2.4.0",
      semantic_request_identity_excludes: [
        "originating_lighthouse_commit", "originating_lighthouse_runtime_version",
      ],
      status_ceiling: "supported_by_one_source",
      modal_evidence_rules: [
        "evaluate_the_located_workflow_step_span_not_only_an_anchored_actor_prefix",
        "match_shall_must_may_and_their_negated_forms_as_whole_tokens",
        "quoted_or_definitional_modal_tokens_are_unresolved_not_contradicted",
        "persist_the_evaluated_span_and_matched_modal_in_the_finding",
      ],
    };
    const definitionHash = active.sha256_hex(active.canonical_json(definition));
    expect(definitionHash).toBe("78cf62b9cd452d8de62397c775fa71a2507777ebf81b1ea53915782d573768a6");
    for (const contract of [active, envelope]) {
      expect(contract.PRISM_ROSETTA_ENGINE_VERSION).toBe("2.4.0");
      expect(contract.PRISM_ROSETTA_RULE_SET_VERSION).toBe("2.4.0");
      expect(contract.PRISM_ROSETTA_RULE_SET_HASH).toBe(definitionHash);
    }
    const parsed = envelope.verification_request_schema.parse(requestFixture());
    expect(envelope.prism_contract_for_request(parsed)).toEqual({
      engine_version: "2.4.0", rule_set_hash: definitionHash,
    });
  });

  it("preserves evaluated modal evidence through both active receipt boundaries", () => {
    const receipt = receiptFixture();
    expect(active.prism_receipt_schema.parse(receipt)).toEqual(receipt);
    expect(envelope.prism_receipt_schema.parse(receipt)).toEqual(receipt);
  });

  it.each([
    { prism_engine_version: "2.3.0" },
    { rule_set_version: "2.3.0" },
    { rule_set_hash: v23.PRISM_ROSETTA_RULE_SET_HASH },
    { rule_set_hash: "0".repeat(64) },
  ])("rejects a receipt with a mismatched version or hash: %j", (mismatch) => {
    const receipt = { ...receiptFixture(), ...mismatch };
    expect(active.prism_receipt_schema.safeParse(receipt).success).toBe(false);
    expect(envelope.prism_receipt_schema.safeParse(receipt).success).toBe(false);
  });

  it.each([v22, v23])("accepts a historical generation only through its explicit replay contract", (legacy) => {
    const request = { ...requestFixture(), rule_set_version: legacy.PRISM_ROSETTA_RULE_SET_VERSION };
    const receipt = {
      ...receiptFixture(),
      prism_engine_version: legacy.PRISM_ROSETTA_ENGINE_VERSION,
      rule_set_version: legacy.PRISM_ROSETTA_RULE_SET_VERSION,
      rule_set_hash: legacy.PRISM_ROSETTA_RULE_SET_HASH,
    };
    expect(legacy.deep_rosetta_binding_request_schema.safeParse(request).success).toBe(true);
    expect(legacy.prism_receipt_schema.safeParse(receipt).success).toBe(true);
    expect(active.deep_rosetta_binding_request_schema.safeParse(request).success).toBe(false);
    expect(envelope.verification_request_schema.safeParse(request).success).toBe(false);
    expect(active.prism_receipt_schema.safeParse(receipt).success).toBe(false);
    expect(envelope.prism_receipt_schema.safeParse(receipt).success).toBe(false);
  });

  it("keeps replay identity stable across deployment metadata while separating 2.3 and 2.4", () => {
    const request = active.deep_rosetta_binding_request_schema.parse(requestFixture());
    const redeployed = active.deep_rosetta_binding_request_schema.parse({
      ...request,
      originating_lighthouse_commit: "b".repeat(40),
      originating_lighthouse_runtime_version: "fixture-runtime-b",
    });
    const semantic = active.rosetta_semantic_request_payload(request);
    const inputHash = active.sha256_hex(active.canonical_json(semantic));
    const replayKey = active.sha256_hex(`${active.PRISM_ROSETTA_RULE_SET_HASH}:${inputHash}`);
    expect(active.rosetta_semantic_request_payload(redeployed)).toEqual(semantic);
    expect(semantic).toHaveProperty("rule_set_version", "2.4.0");
    expect(semantic).not.toHaveProperty("originating_lighthouse_commit");
    expect(semantic).not.toHaveProperty("originating_lighthouse_runtime_version");

    const legacyRequest = v23.deep_rosetta_binding_request_schema.parse({ ...request, rule_set_version: "2.3.0" });
    const legacyInputHash = active.sha256_hex(active.canonical_json(v23.rosetta_semantic_request_payload(legacyRequest)));
    const legacyReplayKey = active.sha256_hex(`${v23.PRISM_ROSETTA_RULE_SET_HASH}:${legacyInputHash}`);
    expect(legacyInputHash).not.toBe(inputHash);
    expect(legacyReplayKey).not.toBe(replayKey);
    // Docket disposition remains semantic evidence, unlike deployment metadata.
    const changedDisposition = active.rosetta_semantic_request_payload({
      ...request, document_context: { ...request.document_context, adopted: false },
    });
    expect(active.sha256_hex(active.canonical_json(changedDisposition))).not.toBe(inputHash);
  });
});
