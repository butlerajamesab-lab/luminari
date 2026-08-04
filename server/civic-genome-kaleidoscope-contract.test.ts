import { describe, expect, it } from "vitest";
import receipt from "../docs/receipts/CIVIC_GENOME_KALEIDOSCOPE_AUTHENTICATED_HANDOFF_HB2487_2026-08-04.json";
import { build_kaleidoscope_civic_genome_contract } from "./civic-genome-kaleidoscope-contract";

describe("Civic Genome Kaleidoscope operating contract", () => {
  it("reports the authenticated live validation as available but unresolved", () => {
    const contract = build_kaleidoscope_civic_genome_contract(receipt);
    expect(contract.state).toBe("available_unbound");
    expect(contract.state_label).toBe("Authenticated snapshot validated, binding unresolved");
    expect(contract.observed_count).toBe(1);
    expect(contract.bound_count).toBe(0);
    expect(contract.last_observed_at).toBe("2026-08-04T00:08:14.383154007Z");
    expect(contract.detail).toContain("62 bounded Civic Genome components");
    expect(contract.detail).toContain("not persisted");
    expect(contract.detail).toContain("no projection executed");
  });

  it("does not call an unauthenticated, persisted, or projected handoff established", () => {
    const invalid = structuredClone(receipt);
    invalid.authentication.canonical_envelope_authenticated = false;
    invalid.write_and_execution_boundary.kaleidoscope_persisted = true;
    invalid.write_and_execution_boundary.kaleidoscope_projection_executed = true;

    const contract = build_kaleidoscope_civic_genome_contract(invalid);
    expect(contract.state).toBe("not_established");
    expect(contract.observed_count).toBe(0);
    expect(contract.bound_count).toBe(0);
  });
});
