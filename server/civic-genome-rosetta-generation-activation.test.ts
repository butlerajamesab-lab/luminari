import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { assemble } = vi.hoisted(() => ({
  assemble: vi.fn(),
}));

vi.mock("./civic-genome-rosetta-family-orchestration", () => ({
  assemble_rosetta_and_resolve_family: assemble,
}));

import { run_rosetta_generation_activation_from_environment } from "./civic-genome-rosetta-generation-activation";

const keys = [
  "ROSETTA_GENOME_ACTIVATION_GENOME_BILL_ID",
  "ROSETTA_GENOME_ACTIVATION_SOURCE_DOCUMENT_ID",
  "ROSETTA_GENOME_ACTIVATION_EXTRACTION_RUN_ID",
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of keys) delete process.env[key];
  assemble.mockResolvedValue({
    assembly_run_id: "11111111-1111-4111-8111-111111111111",
    genome_bill_id: "22222222-2222-4222-8222-222222222222",
    source_document_id: 28,
    extraction_run_id: "32",
    input_hash: "a".repeat(64),
    output_hash: "b".repeat(64),
    verification_state: "complete",
    trait_count: 12,
    replayed: false,
    family_resolution: {
      status: "unresolved",
      family_id: null,
      score: 0,
      method_version: "weighted-confirmed-traits-v2",
      reason: "insufficient_confirmed_traits",
    },
  });
});

afterEach(() => {
  for (const key of keys) delete process.env[key];
});

describe("Rosetta generation startup activation", () => {
  it("is a no-op when no exact activation is configured", async () => {
    await expect(run_rosetta_generation_activation_from_environment()).resolves.toBeNull();
    expect(assemble).not.toHaveBeenCalled();
  });

  it("rejects a partially configured activation", async () => {
    process.env.ROSETTA_GENOME_ACTIVATION_GENOME_BILL_ID = "22222222-2222-4222-8222-222222222222";
    await expect(run_rosetta_generation_activation_from_environment())
      .rejects.toThrow("rosetta_genome_activation_configuration_incomplete");
    expect(assemble).not.toHaveBeenCalled();
  });

  it("activates only the exact supplied bill document and extraction generation", async () => {
    process.env.ROSETTA_GENOME_ACTIVATION_GENOME_BILL_ID = "22222222-2222-4222-8222-222222222222";
    process.env.ROSETTA_GENOME_ACTIVATION_SOURCE_DOCUMENT_ID = "28";
    process.env.ROSETTA_GENOME_ACTIVATION_EXTRACTION_RUN_ID = "32";

    const result = await run_rosetta_generation_activation_from_environment();

    expect(assemble).toHaveBeenCalledWith({
      genome_bill_id: "22222222-2222-4222-8222-222222222222",
      source_document_id: 28,
      extraction_run_id: 32,
    });
    expect(result).toMatchObject({
      source_document_id: 28,
      extraction_run_id: "32",
      trait_count: 12,
      verification_state: "complete",
      family_resolution_status: "unresolved",
      replayed: false,
    });
  });

  it("rejects non-positive or non-integer source identifiers", async () => {
    process.env.ROSETTA_GENOME_ACTIVATION_GENOME_BILL_ID = "22222222-2222-4222-8222-222222222222";
    process.env.ROSETTA_GENOME_ACTIVATION_SOURCE_DOCUMENT_ID = "28.5";
    process.env.ROSETTA_GENOME_ACTIVATION_EXTRACTION_RUN_ID = "32";

    await expect(run_rosetta_generation_activation_from_environment())
      .rejects.toThrow("rosetta_genome_activation_source_document_id_invalid");
    expect(assemble).not.toHaveBeenCalled();
  });
});
