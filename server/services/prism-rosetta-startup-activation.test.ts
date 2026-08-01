import { afterEach, describe, expect, it, vi } from "vitest";

const { activate } = vi.hoisted(() => ({
  activate: vi.fn(),
}));

vi.mock("./prism-rosetta-activation", () => ({
  activate_prism_for_rosetta_assembly: activate,
}));

import { run_prism_rosetta_activation_from_environment } from "./prism-rosetta-startup-activation";

const genome_bill_id = "f17747ae-24c6-40b3-a389-4ca24825ad0c";
const assembly_run_id = "009fd940-2ace-4f96-bbb4-4b3bf09bb63b";

afterEach(() => {
  delete process.env.PRISM_ROSETTA_ACTIVATION_GENOME_BILL_ID;
  delete process.env.PRISM_ROSETTA_ACTIVATION_ASSEMBLY_RUN_ID;
  activate.mockReset();
});

describe("Prism Rosetta startup activation", () => {
  it("does nothing when the bounded activation is not configured", async () => {
    await run_prism_rosetta_activation_from_environment();
    expect(activate).not.toHaveBeenCalled();
  });

  it("activates only the explicitly configured assembly", async () => {
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
  });
});
