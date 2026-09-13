import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as v24 from "./prism-rosetta-contract-v24";
import * as active from "./prism-rosetta-contract-v2";
import * as v22 from "./prism-rosetta-contract-v22";
import * as v23 from "./prism-rosetta-contract-v23";
import * as envelope from "./prism-verification-contract";
import { query_with_diagnostics } from "../db";
import { enrich_rosetta_binding_request } from "./prism-rosetta-structural-context";
import { reset_prism_rosetta_circuit, submit_rosetta_prism_request } from "./prism-rosetta-client";

vi.mock("../db", () => ({ query_with_diagnostics: vi.fn() }));
vi.mock("./prism-rosetta-structural-context", () => ({ enrich_rosetta_binding_request: vi.fn() }));

const uuid = "00000000-0000-4000-8000-000000000025";
const sourceText = "The department, on May 10, must issue a notice.";
const sourceHash = active.sha256_hex(sourceText);

function requestFixture() {
  return {
    request_id: "prism-rosetta-v25-contract-fixture",
    lighthouse_case_id: "civic-genome",
    evidence_document_id: "25",
    evidence_fingerprint: sourceHash,
    source_content_hash: sourceHash,
    claim_assertion_id: "workflow-notice",
    rule_set_id: active.PRISM_ROSETTA_RULE_SET_ID,
    rule_set_version: "2.5.0",
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
      source_document_id: 25,
      extraction_run_id: "extraction-25",
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
    request_id: "prism-rosetta-v25-contract-fixture",
    prism_engine_version: "2.5.0",
    rule_set_id: active.PRISM_ROSETTA_RULE_SET_ID,
    rule_set_version: "2.5.0",
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

describe("Prism Rosetta 2.5 active consumer contract", () => {
  it("pins both active boundaries and request routing to the upstream immutable 2.5 definition", () => {
    // Canonical definition from Prism's rosetta-binding-contract-v25.ts.
    const definition = {
      engine_version: "2.5.0",
      purpose: "independently replay immutable Rosetta source text, distinguish operative modal tokens from calendar dates, proper names, quoted text, and definitions, and prevent unevaluated workflow modal evidence from being promoted as a contradiction",
      required_checks: requestFixture().requested_checks,
      rule_set_id: "prism-rosetta-structural-binding",
      rule_set_version: "2.5.0",
      semantic_request_identity_excludes: [
        "originating_lighthouse_commit", "originating_lighthouse_runtime_version",
      ],
      status_ceiling: "supported_by_one_source",
      modal_evidence_rules: [
        "evaluate_the_located_workflow_step_span_not_only_an_anchored_actor_prefix",
        "match_shall_must_may_and_their_negated_forms_as_whole_tokens",
        "quoted_or_definitional_modal_tokens_are_unresolved_not_contradicted",
        "persist_the_evaluated_span_and_matched_modal_in_the_finding",
        "exclude_calendar_month_may_tokens_before_evaluating_operative_modals",
        "capitalized_may_without_an_unambiguous_modal_use_is_unresolved",
        "nonoperative_spans_do_not_create_missing_modal_coverage",
      ],
    };
    const definitionHash = active.sha256_hex(active.canonical_json(definition));
    expect(definitionHash).toBe("26e4ef9f6c0d389154d9a2259c99b6e7eb83a51c096e738a9470fb20ff04ec8b");
    for (const contract of [active, envelope]) {
      expect(contract.PRISM_ROSETTA_ENGINE_VERSION).toBe("2.5.0");
      expect(contract.PRISM_ROSETTA_RULE_SET_VERSION).toBe("2.5.0");
      expect(contract.PRISM_ROSETTA_RULE_SET_HASH).toBe(definitionHash);
    }
    const parsed = envelope.verification_request_schema.parse(requestFixture());
    expect(envelope.prism_contract_for_request(parsed)).toEqual({
      engine_version: "2.5.0", rule_set_hash: definitionHash,
    });
  });

  it("preserves evaluated modal evidence through both active receipt boundaries", () => {
    const receipt = receiptFixture();
    expect(active.prism_receipt_schema.parse(receipt)).toEqual(receipt);
    expect(envelope.prism_receipt_schema.parse(receipt)).toEqual(receipt);
  });

  it("keeps core assertion routing pinned to its independent 1.0 identity", () => {
    const request = envelope.verification_request_schema.parse({
      request_id: "prism-core-route-control",
      lighthouse_case_id: "fixture",
      evidence_document_id: "fixture",
      evidence_fingerprint: sourceHash,
      source_content_hash: sourceHash,
      claim_assertion_id: "fixture",
      rule_set_id: "prism-core-assertion",
      rule_set_version: "1.0.0",
      requested_checks: ["classify_support_state"],
      originating_lighthouse_commit: "a".repeat(40),
      originating_lighthouse_runtime_version: "fixture",
      evidence_refs: [],
    });
    expect(envelope.prism_contract_for_request(request)).toEqual({
      engine_version: "1.0.0",
      rule_set_hash: "298eaf14df23f17c07dbc253fb6a2abe2f55ac9425942a46ab08f6bdd05401b0",
    });
  });

  it.each([
    { prism_engine_version: "2.4.0" },
    { rule_set_version: "2.4.0" },
    { rule_set_hash: v24.PRISM_ROSETTA_RULE_SET_HASH },
    { rule_set_hash: "0".repeat(64) },
  ])("rejects a receipt with a mismatched version or hash: %j", (mismatch) => {
    const receipt = { ...receiptFixture(), ...mismatch };
    expect(active.prism_receipt_schema.safeParse(receipt).success).toBe(false);
    expect(envelope.prism_receipt_schema.safeParse(receipt).success).toBe(false);
  });

  it.each([v22, v23, v24])("accepts a historical generation only through its explicit replay contract", (legacy) => {
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

  it("keeps replay identity stable across deployment metadata while separating 2.4 and 2.5", () => {
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
    expect(semantic).toHaveProperty("rule_set_version", "2.5.0");
    expect(semantic).not.toHaveProperty("originating_lighthouse_commit");
    expect(semantic).not.toHaveProperty("originating_lighthouse_runtime_version");

    const legacyRequest = v24.deep_rosetta_binding_request_schema.parse({ ...request, rule_set_version: "2.4.0" });
    const legacyInputHash = active.sha256_hex(active.canonical_json(v24.rosetta_semantic_request_payload(legacyRequest)));
    const legacyReplayKey = active.sha256_hex(`${v24.PRISM_ROSETTA_RULE_SET_HASH}:${legacyInputHash}`);
    expect(legacyInputHash).not.toBe(inputHash);
    expect(legacyReplayKey).not.toBe(replayKey);
    // Docket disposition remains semantic evidence, unlike deployment metadata.
    const changedDisposition = active.rosetta_semantic_request_payload({
      ...request, document_context: { ...request.document_context, adopted: false },
    });
    expect(active.sha256_hex(active.canonical_json(changedDisposition))).not.toBe(inputHash);
  });
});

function completeReceipt(request: active.DeepRosettaBindingRequest) {
  const semanticOutput = {
    prism_engine_version: "2.5.0",
    rule_set_id: active.PRISM_ROSETTA_RULE_SET_ID,
    rule_set_version: "2.5.0",
    status: "supported_by_one_source",
    supported_findings: receiptFixture().supported_findings,
    contradictions: [],
    missing_evidence: [],
    unresolved_conditions: [],
    cited_evidence_identifiers: ["section-1"],
  };
  const input_hash = active.sha256_hex(active.canonical_json(active.rosetta_semantic_request_payload(request)));
  return active.prism_receipt_schema.parse({
    ...receiptFixture(),
    ...semanticOutput,
    request_id: request.request_id,
    input_hash,
    output_hash: active.sha256_hex(active.canonical_json(semanticOutput)),
    deterministic_replay_key: active.sha256_hex(`${active.PRISM_ROSETTA_RULE_SET_HASH}:${input_hash}`),
  });
}

function baseRequestFixture() {
  const { source_snapshot, document_context, trait_payload, trait_payload_hash, peer_traits, ...request } = requestFixture();
  return active.rosetta_binding_request_schema.parse(request);
}

describe("Prism 2.5 receipt integrity through the actual Rosetta client", () => {
  let mirror: { prism_verification_receipt_id: string; input_hash: string; output_hash: string } | null;
  let returnedReceipt: Record<string, unknown>;
  let sentRequests: active.DeepRosettaBindingRequest[];

  beforeEach(() => {
    reset_prism_rosetta_circuit();
    vi.clearAllMocks();
    vi.stubEnv("PRISM_BRIDGE_SECRET", "fixture-secret");
    mirror = null;
    sentRequests = [];
    returnedReceipt = completeReceipt(active.deep_rosetta_binding_request_schema.parse(requestFixture()));
    vi.mocked(enrich_rosetta_binding_request).mockImplementation(async (base) =>
      active.deep_rosetta_binding_request_schema.parse({ ...requestFixture(), ...base }),
    );
    vi.mocked(query_with_diagnostics).mockImplementation(async (_sql, params, options) => {
      switch (options.label) {
        case "prism_rosetta_record_request": return { rows: [{ input_hash: params[11] }] } as never;
        case "prism_rosetta_mirror_receipt":
          mirror = { prism_verification_receipt_id: String(params[0]), input_hash: String(params[6]), output_hash: String(params[7]) };
          return { rows: [] } as never;
        case "prism_rosetta_verify_mirror": return { rows: mirror ? [mirror] : [] } as never;
        case "prism_rosetta_record_attempt":
        case "prism_rosetta_complete_request":
        case "prism_rosetta_fail_request": return { rows: [] } as never;
        default: throw new Error(`unexpected query: ${options.label}`);
      }
    });
    vi.stubGlobal("fetch", vi.fn(async (url: string, options: RequestInit) => {
      expect(url).toBe("https://prism.fixture/api/v1/verification-requests");
      const request = active.deep_rosetta_binding_request_schema.parse(JSON.parse(String(options.body)));
      sentRequests.push(request);
      const headers = options.headers as Record<string, string>;
      expect(headers["x-prism-signature"]).toBe(active.sign_prism_request(
        "fixture-secret", headers["x-prism-timestamp"], "POST", "/api/v1/verification-requests", String(options.body),
      ));
      return new Response(JSON.stringify(returnedReceipt), { status: 200 });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    reset_prism_rosetta_circuit();
  });

  it("submits and mirrors a verified 2.5 receipt and reuses its semantic identity after redeployment", async () => {
    const first = await submit_rosetta_prism_request(baseRequestFixture(), { base_url: "https://prism.fixture" });
    returnedReceipt = { ...first, idempotency_reused: true };
    const replay = await submit_rosetta_prism_request({
      ...baseRequestFixture(),
      originating_lighthouse_commit: "b".repeat(40),
      originating_lighthouse_runtime_version: "fixture-runtime-b",
    }, { base_url: "https://prism.fixture" });
    expect(sentRequests).toHaveLength(2);
    expect(sentRequests.map((request) => request.rule_set_version)).toEqual(["2.5.0", "2.5.0"]);
    expect(replay).toEqual({ ...first, idempotency_reused: true });
    expect(mirror).toEqual({
      prism_verification_receipt_id: first.verification_receipt_id,
      input_hash: first.input_hash,
      output_hash: first.output_hash,
    });
  });

  it.each([
    { prism_engine_version: "2.4.0" },
    { rule_set_version: "2.4.0" },
    { rule_set_hash: v24.PRISM_ROSETTA_RULE_SET_HASH },
    { prism_engine_version: "2.4.0", rule_set_version: "2.4.0", rule_set_hash: v24.PRISM_ROSETTA_RULE_SET_HASH },
  ])("rejects old generation receipt identity before mirroring: %j", async (mismatch) => {
    returnedReceipt = { ...returnedReceipt, ...mismatch };
    await expect(submit_rosetta_prism_request(baseRequestFixture(), { base_url: "https://prism.fixture" }))
      .rejects.toMatchObject({ failure_class: "validation", message: "invalid_prism_receipt" });
    expect(mirror).toBeNull();
  });

  it("rejects a 2.5 receipt whose replay key was calculated with the historical 2.4 hash", async () => {
    returnedReceipt.deterministic_replay_key = active.sha256_hex(`${v24.PRISM_ROSETTA_RULE_SET_HASH}:${returnedReceipt.input_hash}`);
    await expect(submit_rosetta_prism_request(baseRequestFixture(), { base_url: "https://prism.fixture" }))
      .rejects.toMatchObject({ failure_class: "validation", message: "prism_receipt_integrity_failure" });
    expect(mirror).toBeNull();
  });

  it("rejects a relabelled historical semantic input even when the output and 2.5 replay key are self-consistent", async () => {
    const oldRequest = v24.deep_rosetta_binding_request_schema.parse({ ...requestFixture(), rule_set_version: "2.4.0" });
    returnedReceipt.input_hash = v24.sha256_hex(v24.canonical_json(v24.rosetta_semantic_request_payload(oldRequest)));
    returnedReceipt.deterministic_replay_key = active.sha256_hex(`${active.PRISM_ROSETTA_RULE_SET_HASH}:${returnedReceipt.input_hash}`);
    await expect(submit_rosetta_prism_request(baseRequestFixture(), { base_url: "https://prism.fixture" }))
      .rejects.toMatchObject({ failure_class: "validation", message: "prism_receipt_integrity_failure" });
    expect(mirror).toBeNull();
  });

  it("rejects a historical request at the active client before enrichment, persistence, or HTTP", async () => {
    await expect(submit_rosetta_prism_request({ ...baseRequestFixture(), rule_set_version: "2.4.0" }))
      .rejects.toMatchObject({ name: "ZodError" });
    expect(enrich_rosetta_binding_request).not.toHaveBeenCalled();
    expect(query_with_diagnostics).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
