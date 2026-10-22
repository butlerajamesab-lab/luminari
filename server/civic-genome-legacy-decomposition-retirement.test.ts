import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const { query, legacy_process, rosetta_fetch, reconcile } = vi.hoisted(() => ({
  query: vi.fn(),
  legacy_process: vi.fn(),
  rosetta_fetch: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("./db", () => ({ query_with_diagnostics: query }));
vi.mock("./civic-genome-legislative-version-pipeline", () => ({
  LEGISLATIVE_VERSION_PROVIDER_SHARED_OUTAGE_ERROR_CODE: "shared_provider_outage",
  process_legislative_version: legacy_process,
  refresh_verified_docket_operational_authority: vi.fn(),
}));
vi.mock("./civic-genome-current-result-reconciliation", () => ({
  reconcile_awaiting_current_results: reconcile,
}));
vi.mock("./civic-genome-amendment-source-completion", () => ({
  reconcile_preserved_amendment_sources: vi.fn(),
}));

import {
  LEGACY_GENOME_DECOMPOSITION_CONVEYOR_REASON,
  assert_legacy_genome_decomposition_conveyor_available,
  is_legacy_genome_decomposition_conveyor_retired,
} from "./civic-genome-legacy-decomposition-retirement";
import {
  classify_hidden_rosetta_terminal_rejections,
  load_oldest_unbound_docket_identifiers,
  process_legislative_version_job,
  run_legislative_version_queue_cycle,
  start_legislative_version_queue_worker,
  stop_legislative_version_queue_worker,
} from "./civic-genome-legislative-version-queue-worker";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", rosetta_fetch);
  vi.stubEnv("LEGISLATIVE_VERSION_QUEUE_ENABLED", "true");
  vi.stubEnv("ROSETTA_SUPABASE_URL", "https://rosetta.example.test");
  vi.stubEnv("ROSETTA_SUPABASE_SERVICE_ROLE_KEY", "this-must-not-be-used");
});

describe("permanent old conveyor retirement, not engine-generation selection", () => {
  it("stays retired even when the temporary publication quarantine changes", () => {
    expect(is_legacy_genome_decomposition_conveyor_retired()).toBe(true);
    expect(() => assert_legacy_genome_decomposition_conveyor_available())
      .toThrow(LEGACY_GENOME_DECOMPOSITION_CONVEYOR_REASON);
  });

  it("does not claim or fetch a single job on direct queue-cycle invocation", async () => {
    await run_legislative_version_queue_cycle();
    expect(query).not.toHaveBeenCalled();
    expect(rosetta_fetch).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(legacy_process).not.toHaveBeenCalled();
  });

  it("does not start the old automatic queue even with a true enablement flag", async () => {
    start_legislative_version_queue_worker();
    await stop_legislative_version_queue_worker();
    expect(query).not.toHaveBeenCalled();
    expect(rosetta_fetch).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("rejects a direct legacy job BEFORE any provider, database or selected-engine activity", async () => {
    await expect(process_legislative_version_job({
      queue_id: "11111111-1111-4111-8111-111111111111",
      bill_version_id: "22222222-2222-4222-8222-222222222222",
    } as any)).rejects.toThrow(LEGACY_GENOME_DECOMPOSITION_CONVEYOR_REASON);
    expect(query).not.toHaveBeenCalled();
    expect(legacy_process).not.toHaveBeenCalled();
    expect(rosetta_fetch).not.toHaveBeenCalled();
  });

  it("rejects direct retired terminal-classifier and backlog selectors before HTTP", async () => {
    await expect(classify_hidden_rosetta_terminal_rejections())
      .rejects.toThrow(LEGACY_GENOME_DECOMPOSITION_CONVEYOR_REASON);
    await expect(load_oldest_unbound_docket_identifiers())
      .rejects.toThrow(LEGACY_GENOME_DECOMPOSITION_CONVEYOR_REASON);
    expect(rosetta_fetch).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("fences legacy direct processing before load_version or LegiScan fallback", () => {
    const pipeline = readFileSync(new URL("./civic-genome-legislative-version-pipeline.ts", import.meta.url), "utf8");
    const start = pipeline.indexOf("export async function process_legislative_version(");
    const end = pipeline.indexOf("  const version = await load_version(bill_version_id);", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(pipeline.slice(start, end)).toContain("assert_legacy_genome_decomposition_conveyor_available()");
  });
});
