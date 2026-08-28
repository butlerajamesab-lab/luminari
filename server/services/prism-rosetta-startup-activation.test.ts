import { afterEach, describe, expect, it, vi } from "vitest";

const { activate, reconcile_timeouts } = vi.hoisted(() => ({
  activate: vi.fn(),
  reconcile_timeouts: vi.fn(),
}));

vi.mock("./prism-rosetta-activation", () => ({
  activate_prism_for_rosetta_assembly: activate,
}));

vi.mock("../civic-genome-current-authoritative-timeout-reconciliation", () => ({
  reconcile_current_authoritative_legacy_rosetta_timeouts: reconcile_timeouts,
}));

import { run_prism_rosetta_activation_from_environment } from "./prism-rosetta-startup-activation";

const genome_bill_id = "f17747ae-24c6-40b3-a389-4ca24825ad0c";
const assembly_run_id = "009fd940-2ace-4f96-bbb4-4b3bf09bb63b";

afterEach(() => {
  delete process.env.LIGHTHOUSE_RUNTIME_ROLE;
  delete process.env.PRISM_ROSETTA_ACTIVATION_GENOME_BILL_ID;
  delete process.env.PRISM_ROSETTA_ACTIVATION_ASSEMBLY_RUN_ID;
  delete process.env.ROSETTA_LEGACY_TIMEOUT_RECONCILIATION_ENABLED;
  activate.mockReset();
  reconcile_timeouts.mockReset();
});

describe("Prism Rosetta startup activation", () => {
  it("does nothing when the bounded activation is not configured", async () => {
    await run_prism_rosetta_activation_from_environment();
    expect(activate).not.toHaveBeenCalled();
  });

  it("activates only the explicitly configured assembly", async () => {
    process.env.LIGHTHOUSE_RUNTIME_ROLE = "worker";
    process.env.PRISM_ROSETTA_ACTIVATION_GENOME_BILL_ID = genome_bill_id;
    process.env.PRISM_ROSETTA_ACTIVATION_ASSEMBLY_RUN_ID = assembly_run_id;
    activate.mockResolvedValue({
      verification_run_id: "11111111-1111-4111-8111-111111111111",
      genome_bill_id,
      assembly_run_id,
      expected_trait_count: 31,
      receipt_count: 31,
      status_counts: { supported_by_one_source: 31 },
      input_hash: "a".repeat(64),
      output_hash: "b".repeat(64),
      receipt_manifest_hash: "c".repeat(64),
      replayed: false,
    });

    await run_prism_rosetta_activation_from_environment();

    expect(activate).toHaveBeenCalledTimes(1);
    expect(activate).toHaveBeenCalledWith({
      genome_bill_id,
      assembly_run_id,
    });
    expect(reconcile_timeouts).not.toHaveBeenCalled();
  });

  it("does not reconcile legacy timeouts from a generic worker role", async () => {
    process.env.LIGHTHOUSE_RUNTIME_ROLE = "worker";

    await run_prism_rosetta_activation_from_environment();

    expect(reconcile_timeouts).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });
});
