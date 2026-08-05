import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, assemble } = vi.hoisted(() => ({
  query: vi.fn(),
  assemble: vi.fn(),
}));

vi.mock("./db", () => ({
  query_with_diagnostics: query,
}));

vi.mock("./civic-genome-rosetta-family-orchestration", () => ({
  assemble_rosetta_and_resolve_family: assemble,
}));

import {
  process_rosetta_generation_activation_job,
  rosetta_generation_activation_retry_delay_seconds,
} from "./civic-genome-rosetta-generation-queue-worker";

const job = {
  activation_id: "11111111-1111-4111-8111-111111111111",
  genome_bill_id: "22222222-2222-4222-8222-222222222222",
  source_document_id: 28,
  extraction_run_id: 32,
  attempt_count: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [] });
  assemble.mockResolvedValue({
    assembly_run_id: "33333333-3333-4333-8333-333333333333",
    genome_bill_id: job.genome_bill_id,
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

describe("Rosetta generation activation queue", () => {
  it("uses bounded exponential retry delays", () => {
    expect(rosetta_generation_activation_retry_delay_seconds(0)).toBe(30);
    expect(rosetta_generation_activation_retry_delay_seconds(1)).toBe(60);
    expect(rosetta_generation_activation_retry_delay_seconds(20)).toBe(3600);
  });

  it("assembles only the exact queued generation and records completion", async () => {
    await process_rosetta_generation_activation_job(job);

    expect(assemble).toHaveBeenCalledWith({
      genome_bill_id: job.genome_bill_id,
      source_document_id: 28,
      extraction_run_id: 32,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("queue_state = 'completed'");
    expect(query.mock.calls[0][1][0]).toBe(job.activation_id);
    expect(query.mock.calls[0][1][1]).toBe("33333333-3333-4333-8333-333333333333");
  });

  it("preserves a bounded failure receipt for retry", async () => {
    assemble.mockRejectedValue(new Error("rosetta_extraction_run_identity_mismatch"));

    await process_rosetta_generation_activation_job(job);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("queue_state = 'failed'");
    expect(query.mock.calls[0][1][1]).toBe("rosetta_extraction_run_identity_mismatch");
    expect(query.mock.calls[0][1][2]).toBe(30);
  });
});
