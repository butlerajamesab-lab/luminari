import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  build_kaleidoscope_civic_genome_contract,
  get_kaleidoscope_civic_genome_contract,
} from "./civic-genome-kaleidoscope-contract";

const fetch_mock = vi.fn();

const live_status = {
  platform: "kaleidoscope" as const,
  foundation_version: "kaleidoscope-foundation-v1",
  runtime_revision: "3f8af026",
  civic_genome_handoff_state:
    "authenticated_validation_mapping_and_durable_snapshot_persistence_ready_no_projection",
  civic_genome_durable_intake_state: "durable_snapshot_persistence_ready",
  civic_genome_durable_binding_count: 18,
  civic_genome_durable_snapshot_count: 18,
  civic_genome_durable_component_count: 261,
  civic_genome_projection_run_count: 0,
  civic_genome_projection_result_count: 0,
  civic_genome_replay_receipt_count: 0,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetch_mock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Civic Genome Kaleidoscope operating contract", () => {
  it("reports persisted source snapshots without claiming projection execution", () => {
    const contract = build_kaleidoscope_civic_genome_contract(live_status);
    expect(contract.state).toBe("bound_not_projected");
    expect(contract.state_label).toBe("Source bound, projection not executed");
    expect(contract.observed_count).toBe(18);
    expect(contract.bound_count).toBe(18);
    expect(contract.detail).toContain("18 durable Civic Genome source bindings");
    expect(contract.detail).toContain("18 state snapshots");
    expect(contract.detail).toContain("261 components");
    expect(contract.detail).toContain("no Civic Genome projection run or projection result has executed");
    expect(contract.boundary).toContain("does not imply that a projection ran");
  });

  it("reads the live Kaleidoscope status contract over HTTPS", async () => {
    fetch_mock.mockResolvedValue(Response.json(live_status));
    const contract = await get_kaleidoscope_civic_genome_contract();
    expect(contract.state).toBe("bound_not_projected");
    const url = new URL(String(fetch_mock.mock.calls[0][0]));
    expect(url.origin).toBe("https://kaleidoscope-zm5d.onrender.com");
    expect(url.pathname).toBe("/v1/status");
    expect(fetch_mock.mock.calls[0][1]).toMatchObject({
      method: "GET",
      redirect: "error",
    });
  });

  it("reports projection separately when Kaleidoscope actually has results", () => {
    const contract = build_kaleidoscope_civic_genome_contract({
      ...live_status,
      civic_genome_projection_run_count: 2,
      civic_genome_projection_result_count: 2,
      civic_genome_replay_receipt_count: 2,
    });
    expect(contract.state).toBe("operational");
    expect(contract.state_label).toBe("Projection results available");
    expect(contract.detail).toContain("2 projection results");
  });

  it("fails the presentation closed when the live status read is unavailable", async () => {
    fetch_mock.mockRejectedValue(new Error("network down"));
    const contract = await get_kaleidoscope_civic_genome_contract();
    expect(contract.state).toBe("unavailable");
    expect(contract.state_label).toBe("Live Kaleidoscope status unavailable");
    expect(contract.bound_count).toBe(0);
    expect(contract.boundary).toContain("does not infer binding or projection state");
  });

  it("rejects non-HTTPS status overrides", async () => {
    vi.stubEnv("KALEIDOSCOPE_STATUS_URL", "http://example.test/v1/status");
    const contract = await get_kaleidoscope_civic_genome_contract();
    expect(contract.state).toBe("unavailable");
    expect(contract.detail).toContain("invalid_kaleidoscope_status_url");
    expect(fetch_mock).not.toHaveBeenCalled();
  });
});
