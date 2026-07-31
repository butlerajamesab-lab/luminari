import { describe, expect, it } from "vitest";
import {
  PRISM_RULE_SET_HASH,
  canonical_json,
  prism_receipt_schema,
  sha256_hex,
  verification_request_schema,
} from "./prism-verification-contract";

describe("Lighthouse Prism verification contract", () => {
  it("uses deterministic key ordering", () => {
    expect(canonical_json({ b: 2, a: 1 })).toBe(canonical_json({ a: 1, b: 2 }));
  });

  it("pins the canonical rule-set hash", () => {
    const definition = {
      rule_set_id: "prism-core-assertion",
      rule_set_version: "1.0.0",
      engine_version: "1.0.0",
      precedence: [
        "contradicted",
        "incomplete",
        "unresolved",
        "supported_by_one_source",
        "supported_by_multiple_sources",
        "verified",
      ],
      verified_requirement: "explicit finalize_verified check, at least two independent supporting sources, and zero contradictions or neutral evidence",
    };
    expect(sha256_hex(canonical_json(definition))).toBe(PRISM_RULE_SET_HASH);
  });

  it("rejects private content fields", () => {
    const result = verification_request_schema.safeParse({
      request_id: "fixture",
      lighthouse_case_id: "case",
      evidence_document_id: "document",
      evidence_fingerprint: "a".repeat(64),
      source_content_hash: "b".repeat(64),
      claim_assertion_id: "assertion",
      rule_set_id: "prism-core-assertion",
      rule_set_version: "1.0.0",
      requested_checks: ["classify_support_state"],
      originating_lighthouse_commit: "817be553ead1a573bc7025ac239e23099930042f",
      originating_lighthouse_runtime_version: "test",
      evidence_refs: [],
      document_content: "forbidden",
    });
    expect(result.success).toBe(false);
  });

  it("rejects receipts from another rule identity", () => {
    const result = prism_receipt_schema.safeParse({
      verification_receipt_id: "00000000-0000-4000-8000-000000000000",
      request_id: "fixture",
      prism_engine_version: "1.0.0",
      rule_set_id: "prism-core-assertion",
      rule_set_version: "1.0.0",
      rule_set_hash: "0".repeat(64),
      input_hash: "a".repeat(64),
      output_hash: "b".repeat(64),
      status: "incomplete",
      supported_findings: [],
      contradictions: [],
      missing_evidence: [],
      unresolved_conditions: [],
      cited_evidence_identifiers: [],
      deterministic_replay_key: "c".repeat(64),
      completion_timestamp: new Date(0).toISOString(),
      idempotency_reused: false,
    });
    expect(result.success).toBe(false);
  });
});
