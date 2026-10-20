import { describe, expect, it } from "vitest";
import { map_v12_live_target_for_genome } from "./civic-genome-rosetta-generation-target-sync";
import type { v12_admission_receipt } from "./civic-genome-rosetta-v12-admission";

const sha = "a".repeat(64);
const target = {
  identity_valid: true,
  engine_version: "runtime-identity-attested-by-rosetta",
  ruleset_version: "rosetta-rule-ref-v12",
  ruleset_sha256: sha,
  validation_test_name: "independent-v12-certification",
  selected_at: "2026-10-20T09:00:00Z",
};
const receipt: v12_admission_receipt = {
  contract: "civic-genome-rosetta-v12-admission-v1",
  bill_version_id: null,
  source_document_key: "text:5:1",
  source_content_id: "11111111-1111-4111-8111-111111111111",
  source_document_id: 5,
  source_content_hash: "b".repeat(64),
  ruleset_version: target.ruleset_version,
  ruleset_sha256: target.ruleset_sha256,
  selected_at: target.selected_at,
  output_sha256: "c".repeat(64),
  certification_sha256: "d".repeat(64),
  admission_state: "admitted",
  admitted: true,
  reason: null,
  hold_receipt: null,
  failure_receipts: [],
};

describe("proposed V12 target-column mapping (fixture only)", () => {
  it("preserves exact live identity without inferring an engine from ruleset", () => {
    expect(map_v12_live_target_for_genome(target, receipt)).toEqual({
      contract: "rosetta-rule-live-detail-v1",
      engine_version: target.engine_version,
      rule_set_version: target.ruleset_version,
      rule_manifest_hash: target.ruleset_sha256,
      validation_test_name: target.validation_test_name,
      promoted_at: target.selected_at,
    });
  });

  it.each([
    ["missing engine identity", { engine_version: null }, receipt],
    ["missing validation proof", { validation_test_name: null }, receipt],
    ["mismatched ruleset", { ruleset_sha256: "f".repeat(64) }, receipt],
    ["missing selected time", { selected_at: null }, receipt],
    ["missing certification", {}, { ...receipt, certification_sha256: null }],
    ["not admitted", {}, { ...receipt, admitted: false, admission_state: "rejected" as const }],
  ])("fails closed on %s", (_name, change, observed) => {
    expect(() => map_v12_live_target_for_genome({ ...target, ...change }, observed))
      .toThrow("rosetta_v12_generation_target_identity_unattested");
  });
});
