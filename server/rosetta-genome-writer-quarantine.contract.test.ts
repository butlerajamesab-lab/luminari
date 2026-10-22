import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, binding, assembly, enabled } = vi.hoisted(() => ({
  query: vi.fn(), binding: vi.fn(), assembly: vi.fn(), enabled: vi.fn(() => true),
}));

vi.mock("./db", () => ({
  query_with_diagnostics: query,
  getPool: () => ({ query }),
}));
vi.mock("./civic-genome-docket-binding", () => ({
  load_queued_docket_binding: binding,
}));
vi.mock("./civic-genome-rosetta-family-orchestration", () => ({
  assemble_rosetta_and_resolve_family: assembly,
}));
vi.mock("./runtime-role", () => ({
  background_feature_enabled: enabled,
}));

import {
  GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON,
  assert_genome_rosetta_publication_admitted,
  is_genome_rosetta_publication_quarantined,
} from "./civic-genome-rosetta-publication-quarantine";
import {
  process_rosetta_generation_activation_job,
  run_rosetta_generation_activation_queue_cycle,
  start_rosetta_generation_activation_queue_worker,
  stop_rosetta_generation_activation_queue_worker,
} from "./civic-genome-rosetta-generation-queue-worker";
import {
  discover_rosetta_generation_upgrades,
  process_rosetta_generation_upgrade_job,
  run_rosetta_generation_upgrade_cycle,
  start_rosetta_generation_upgrade_worker,
  stop_rosetta_generation_upgrade_worker,
} from "./civic-genome-rosetta-generation-upgrade-worker";
import {
  start_rosetta_generation_target_sync,
  stop_rosetta_generation_target_sync,
  sync_rosetta_generation_target_once,
} from "./civic-genome-rosetta-generation-target-sync";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Lighthouse Rosetta-origin writer quarantine", () => {
  it("has no environment or legacy-version escape hatch", () => {
    expect(is_genome_rosetta_publication_quarantined()).toBe(true);
    expect(assert_genome_rosetta_publication_admitted).toThrow(
      GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON,
    );
  });

  it("never claims or replays activation queue jobs", async () => {
    await run_rosetta_generation_activation_queue_cycle();
    await expect(process_rosetta_generation_activation_job({
      activation_id: "test",
      genome_bill_id: "test",
      source_document_id: 123,
      extraction_run_id: 987,
      attempt_count: 0,
    })).rejects.toThrow(GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON);
    start_rosetta_generation_activation_queue_worker();
    stop_rosetta_generation_activation_queue_worker();
    expect(query).not.toHaveBeenCalled();
    expect(binding).not.toHaveBeenCalled();
    expect(assembly).not.toHaveBeenCalled();
  });

  it("never discovers or claims upgrades, or performs replay RPCs", async () => {
    await expect(discover_rosetta_generation_upgrades()).rejects.toThrow(
      GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON,
    );
    await run_rosetta_generation_upgrade_cycle();
    await expect(process_rosetta_generation_upgrade_job({
      upgrade_id: "test",
      genome_bill_id: "test",
      source_document_id: 123,
      source_identity_hash: "a".repeat(64),
      target_engine_version: "rosetta-v3-deterministic-sql-2.5.40",
      target_rule_set_version: "rosetta-rule-ref-v10",
      target_rule_manifest_hash: "b".repeat(64),
      attempt_count: 0,
    })).rejects.toThrow(GENOME_ROSETTA_PUBLICATION_QUARANTINE_REASON);
    start_rosetta_generation_upgrade_worker();
    stop_rosetta_generation_upgrade_worker();
    expect(query).not.toHaveBeenCalled();
    expect(binding).not.toHaveBeenCalled();
    expect(assembly).not.toHaveBeenCalled();
  });

  it("does not observe or overwrite generation target from legacy RPC", async () => {
    await sync_rosetta_generation_target_once();
    start_rosetta_generation_target_sync();
    stop_rosetta_generation_target_sync();
    expect(query).not.toHaveBeenCalled();
    expect(enabled).not.toHaveBeenCalled();
  });
});
