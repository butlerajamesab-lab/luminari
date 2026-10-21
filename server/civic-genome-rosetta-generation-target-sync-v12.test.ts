import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { map_v12_live_target_for_genome } from "./civic-genome-rosetta-generation-target-sync";
import type { v12_admission_receipt } from "./civic-genome-rosetta-v12-admission";

const sha = "a".repeat(64);
const installed = sha;
const read_hash = "e".repeat(64);
// Shape verified against current_target_v1: no engine_version, no validation_test_name.
const target = {
  identity_valid: true,
  engine_identity_valid: true,
  read_identity_valid: true,
  ruleset_version: "rosetta-rule-ref-v12",
  ruleset_sha256: sha,
  installed_ruleset_sha256: installed,
  read_contract_sha256: read_hash,
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
  installed_ruleset_sha256: target.installed_ruleset_sha256,
  read_contract_sha256: target.read_contract_sha256,
  selected_at: target.selected_at,
  output_sha256: "c".repeat(64),
  certification_sha256: "d".repeat(64),
  admission_state: "admitted",
  admitted: true,
  reason: null,
  hold_receipt: null,
  failure_receipts: [],
};

describe("V12 target-column mapping — current_target_v1 fixtures", () => {
  it("maps engine_version and rule_set_version to the same V-series ruleset", () => {
    expect(map_v12_live_target_for_genome(target, receipt)).toEqual({
      contract: "rosetta-rule-live-detail-v1",
      engine_version: target.ruleset_version,
      rule_set_version: target.ruleset_version,
      rule_manifest_hash: target.ruleset_sha256,
      read_contract_sha256: target.read_contract_sha256,
      promoted_at: target.selected_at,
    });
    expect(target).not.toHaveProperty("engine_version");
    expect(target).not.toHaveProperty("validation_test_name");
  });

  it.each([
    ["identity_valid false", { identity_valid: false }, receipt],
    ["engine_identity_valid false", { engine_identity_valid: false }, receipt],
    ["read_identity_valid false", { read_identity_valid: false }, receipt],
    ["identity flag absent", { identity_valid: undefined }, receipt],
    ["engine identity flag absent", { engine_identity_valid: undefined }, receipt],
    ["read identity flag absent", { read_identity_valid: undefined }, receipt],
    ["installed SHA mismatch", { installed_ruleset_sha256: "f".repeat(64) }, receipt],
    ["installed SHA missing", { installed_ruleset_sha256: undefined }, receipt],
    ["ruleset hash missing", { ruleset_sha256: undefined }, receipt],
    ["read contract hash missing", { read_contract_sha256: undefined }, receipt],
    ["read contract hash malformed", { read_contract_sha256: "bad" }, receipt],
    ["read contract changed since admission", { read_contract_sha256: "f".repeat(64) }, receipt],
    ["selected timestamp missing", { selected_at: undefined }, receipt],
    ["ruleset mismatch", { ruleset_version: "rosetta-rule-ref-v13" }, receipt],
    ["missing certification", {}, { ...receipt, certification_sha256: null }],
    ["unadmitted", {}, { ...receipt, admitted: false, admission_state: "rejected" as const }],
    ["receipt installed hash missing", {}, { ...receipt, installed_ruleset_sha256: null }],
    ["receipt read-contract hash missing", {}, { ...receipt, read_contract_sha256: null }],
  ])("fails closed: %s", (_name, change, observed) => {
    expect(() => map_v12_live_target_for_genome({ ...target, ...change }, observed))
      .toThrow("rosetta_v12_generation_target_identity_unattested");
  });

  it("does not call the legacy six-argument observer or invent validation_test_name", () => {
    const sync = readFileSync(new URL("./civic-genome-rosetta-generation-target-sync.ts", import.meta.url), "utf8");
    expect(sync).toContain("civic_genome_observe_rosetta_generation_target_v12");
    expect(sync).not.toContain("civic_genome_observe_rosetta_generation_target_v1(");
    expect(sync).not.toContain("target.validation_test_name");
    expect(sync).not.toContain("target.engine_version");
    const quarantine = readFileSync(new URL("./civic-genome-rosetta-publication-quarantine.ts", import.meta.url), "utf8");
    expect(quarantine).toContain("return true;");
  });
});
