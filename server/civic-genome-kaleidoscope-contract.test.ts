import { describe, expect, it } from "vitest";
import proof from "../docs/receipts/CIVIC_GENOME_EXTERNAL_SNAPSHOT_HB2487_PROOF_2026-08-03.json";
import { build_kaleidoscope_civic_genome_contract } from "./civic-genome-kaleidoscope-contract";

describe("Civic Genome Kaleidoscope operating contract", () => {
  it("reports the live producer proof as available but unbound", () => {
    const contract = build_kaleidoscope_civic_genome_contract(proof);
    expect(contract.state).toBe("available_unbound");
    expect(contract.state_label).toBe("Snapshot producer proven, consumer unbound");
    expect(contract.observed_count).toBe(1);
    expect(contract.bound_count).toBe(0);
    expect(contract.last_observed_at).toBe("2026-08-03T22:56:34.596971092Z");
    expect(contract.detail).toContain("62 bounded Civic Genome components");
    expect(contract.detail).toContain("has not received or accepted");
  });

  it("does not call an incomplete or mutating proof established", () => {
    const incomplete = structuredClone(proof);
    incomplete.proof_state = "failed";
    incomplete.write_boundary.database_write_count = 1;
    incomplete.replay.identical.snapshot_hash = false;

    const contract = build_kaleidoscope_civic_genome_contract(incomplete);
    expect(contract.state).toBe("not_established");
    expect(contract.observed_count).toBe(0);
    expect(contract.bound_count).toBe(0);
  });
});
