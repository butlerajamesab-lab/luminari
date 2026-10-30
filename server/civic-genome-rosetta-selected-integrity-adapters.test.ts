import { describe, expect, it } from "vitest";
import {
  require_v12_selected_genome_adapter,
  resolve_selected_genome_integrity_adapter,
} from "./civic-genome-rosetta-selected-integrity-adapters";

describe("Civic Genome selected-generation adapter registry", () => {
  it("routes exact V12 only to its independently source-bound limited-scope producer", () => {
    const adapter = resolve_selected_genome_integrity_adapter("rosetta-rule-ref-v12");
    expect(adapter).toEqual({
      ruleset_version: "rosetta-rule-ref-v12",
      producer_material_contract: "rosetta-v12-certification-material-v1",
      receipt_contract: "rosetta-v12-certification-receipt-v1",
      attestation_type: "source_bound_output_integrity_v1",
      independently_verified_source_binding: true,
      semantic_certification: false,
      publication_authority: false,
    });
    expect(Object.isFrozen(adapter)).toBe(true);
    expect(require_v12_selected_genome_adapter("rosetta-rule-ref-v12")).toBe(adapter);
  });

  it.each([
    "rosetta-rule-ref-v13",
    "rosetta-rule-ref-v14",
    "rosetta-rule-ref-v15",
    "rosetta-rule-ref-v16",
    "rosetta-rule-ref-v11",
    "rosetta-rule-ref-v99",
    "rosetta-rule-ref-v120",
    "toString",
    "constructor",
    "rosetta-rule-ref-v12-other",
    "",
    null,
    undefined,
    12,
  ])("never downgrades unknown or unsupported selected version %s into V12", version => {
    expect(resolve_selected_genome_integrity_adapter(version)).toBeNull();
    expect(() => require_v12_selected_genome_adapter(version))
      .toThrow("rosetta_v12_selected_generation_unsupported");
  });

  it("does not expose any dynamically selected producer or publication/semantic authority", () => {
    const adapter = require_v12_selected_genome_adapter("rosetta-rule-ref-v12");
    expect(adapter.publication_authority).toBe(false);
    expect(adapter.semantic_certification).toBe(false);
    expect("fallback" in adapter).toBe(false);
    expect("engine_selection" in adapter).toBe(false);
    expect("write" in adapter).toBe(false);
  });
});
